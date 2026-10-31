import { AuditAction, AuditEntity } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../config/security.js';
import { AppError } from '../errors/app-error.js';
import type { ProfileRepository } from '../repositories/user.repository.js';
import type { ChangePasswordInput, UpdateProfileInput } from '../schemas/profile.schema.js';
import type { PublicUser } from '../types/auth.js';
import {
  noopAuditLogger,
  type AuditLogger,
} from './audit.service.js';

function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export class ProfileService {
  constructor(
    private readonly users: ProfileRepository,
    private readonly audit: AuditLogger = noopAuditLogger,
  ) {}

  async update(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    return this.audit.transaction(async (transaction) => {
      const current = await this.users.findPrivateById(userId, transaction);
      if (!current || !current.active) {
        throw new AppError('Usuário não encontrado ou inativo.', 401, 'USER_UNAVAILABLE');
      }

      if (current.name === input.name) return toPublicUser(current);

      const updated = await this.users.updateOwnName(userId, input.name, transaction);
      await this.audit.log({
        userId,
        entityType: AuditEntity.USER,
        entityId: userId,
        action: AuditAction.UPDATE,
        oldData: { name: current.name },
        newData: { name: updated.name },
      }, transaction);
      return toPublicUser(updated);
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const current = await this.users.findPrivateById(userId);
    if (!current || !current.active) {
      throw new AppError('Usuário não encontrado ou inativo.', 401, 'USER_UNAVAILABLE');
    }

    if (!await bcrypt.compare(input.currentPassword, current.passwordHash)) {
      throw new AppError('Senha atual incorreta.', 400, 'CURRENT_PASSWORD_INCORRECT');
    }

    if (await bcrypt.compare(input.newPassword, current.passwordHash)) {
      throw new AppError('A nova senha deve ser diferente da senha atual.', 400, 'PASSWORD_UNCHANGED');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.audit.transaction(async (transaction) => {
      await this.users.updatePassword(userId, passwordHash, transaction);
      await this.audit.log({
        userId,
        entityType: AuditEntity.USER,
        entityId: userId,
        action: AuditAction.PASSWORD_CHANGE,
        newData: { userId, changed: true },
      }, transaction);
    });
  }
}
