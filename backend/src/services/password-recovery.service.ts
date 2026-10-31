import { createHash, randomBytes } from 'node:crypto';
import { AuditAction, AuditEntity } from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { BCRYPT_ROUNDS } from '../config/security.js';
import { AppError } from '../errors/app-error.js';
import type { PasswordResetRepository } from '../repositories/password-reset.repository.js';
import type { ProfileRepository, UserRepository } from '../repositories/user.repository.js';
import type { ForgotPasswordInput, ResetPasswordInput } from '../schemas/password-recovery.schema.js';
import { noopAuditLogger, type AuditLogger } from './audit.service.js';
import type { PasswordResetMailer } from './password-reset-mailer.service.js';
import { noopAbuseProtection, type AbuseProtection } from './security-throttle.service.js';

export const PASSWORD_RESET_GENERIC_MESSAGE =
  'Se o e-mail estiver cadastrado e ativo, enviaremos instruções para redefinir a senha.';
export const PASSWORD_RESET_INVALID_MESSAGE = 'Link de redefinição inválido ou expirado.';

type PasswordRecoveryUsers = Pick<UserRepository, 'findByEmail'> & Pick<ProfileRepository, 'updatePassword'>;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class PasswordRecoveryService {
  constructor(
    private readonly users: PasswordRecoveryUsers,
    private readonly tokens: PasswordResetRepository,
    private readonly mailer: PasswordResetMailer,
    private readonly audit: AuditLogger = noopAuditLogger,
    private readonly abuse: AbuseProtection = noopAbuseProtection,
    private readonly now: () => Date = () => new Date(),
    private readonly createToken: () => string = () => randomBytes(32).toString('base64url'),
  ) {}

  async request(input: ForgotPasswordInput): Promise<void> {
    const user = await this.users.findByEmail(input.email);
    if (!user?.active) return;

    const requestedAt = this.now();
    const expiresAt = new Date(requestedAt.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);
    const rawToken = this.createToken();

    await this.audit.transaction(async (transaction) => {
      await this.tokens.lockUser(user.id, transaction);
      await this.tokens.invalidateUnusedForUser(user.id, requestedAt, transaction);
      await this.tokens.create({ userId: user.id, tokenHash: hashToken(rawToken), expiresAt }, transaction);
      await this.audit.log({
        userId: user.id,
        entityType: AuditEntity.USER,
        entityId: user.id,
        action: AuditAction.PASSWORD_RESET_REQUEST,
        newData: { userId: user.id, requested: true },
      }, transaction);
    });

    const resetUrl = new URL('/reset-password', env.FRONTEND_URL);
    resetUrl.hash = new URLSearchParams({ token: rawToken }).toString();

    try {
      await this.mailer.sendReset({
        to: user.email,
        name: user.name,
        resetUrl: resetUrl.toString(),
        expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      });
    } catch {
      // A resposta continua genérica e não inclui PII nem detalhes do provedor.
      console.error('Falha ao entregar uma mensagem de recuperação de senha.');
    }
  }

  async reset(input: ResetPasswordInput, context: { ip?: string } = {}): Promise<void> {
    const usedAt = this.now();
    const tokenHash = hashToken(input.token);
    await this.abuse.assertAllowed('PASSWORD_RECOVERY', { ip: context.ip });
    const candidate = await this.tokens.findValidByHash(tokenHash, usedAt);

    if (!candidate) {
      await this.abuse.recordFailure('PASSWORD_RECOVERY', { ip: context.ip }, 'INVALID_LINK');
      throw new AppError(PASSWORD_RESET_INVALID_MESSAGE, 400, 'PASSWORD_RESET_INVALID');
    }

    const securitySubjects = { ip: context.ip, account: candidate.userId, userId: candidate.userId };
    await this.abuse.assertAllowed('PASSWORD_RECOVERY', securitySubjects);

    if (await bcrypt.compare(input.newPassword, candidate.user.passwordHash)) {
      await this.abuse.recordFailure('PASSWORD_RECOVERY', securitySubjects, 'PASSWORD_UNCHANGED');
      throw new AppError('A nova senha deve ser diferente da senha atual.', 400, 'PASSWORD_UNCHANGED');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);

    try {
      await this.audit.transaction(async (transaction) => {
        await this.tokens.lockUser(candidate.userId, transaction);
        const current = await this.tokens.findValidByHash(tokenHash, usedAt, transaction);
        if (!current || current.id !== candidate.id || !await this.tokens.consume(current.id, usedAt, transaction)) {
          throw new AppError(PASSWORD_RESET_INVALID_MESSAGE, 400, 'PASSWORD_RESET_INVALID');
        }

        await this.users.updatePassword(current.userId, passwordHash, transaction);
        await this.tokens.invalidateUnusedForUser(current.userId, usedAt, transaction);
        await this.audit.log({
          userId: current.userId,
          entityType: AuditEntity.USER,
          entityId: current.userId,
          action: AuditAction.PASSWORD_RESET,
          newData: { userId: current.userId, reset: true },
        }, transaction);
      });
    } catch (error: unknown) {
      if (error instanceof AppError && error.code === 'PASSWORD_RESET_INVALID') {
        await this.abuse.recordFailure('PASSWORD_RECOVERY', securitySubjects, 'INVALID_LINK');
      }
      throw error;
    }
    await this.abuse.clearAccount('PASSWORD_RECOVERY', candidate.userId);
  }
}
