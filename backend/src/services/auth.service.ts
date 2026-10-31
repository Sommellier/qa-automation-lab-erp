import bcrypt from 'bcrypt';
import { AppError } from '../errors/app-error.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { LoginInput } from '../schemas/auth.schema.js';
import type { PublicUser } from '../types/auth.js';
import type { SessionTokens } from '../utils/session-cookie.js';
import { createCsrfToken } from './csrf.service.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from './token.service.js';

interface LoginResult {
  user: PublicUser;
  session: SessionTokens;
}

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

export class AuthService {
  constructor(private readonly users: UserRepository) {}

  private createSession(user: { id: string; role: PublicUser['role']; tokenVersion: number }): SessionTokens {
    return {
      accessToken: createAccessToken(user.id, user.role, user.tokenVersion),
      refreshToken: createRefreshToken(user.id, user.role, user.tokenVersion),
      csrfToken: createCsrfToken(user.id),
    };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.users.findByEmail(input.email.toLowerCase());

    if (!user || !user.active) {
      throw new AppError('E-mail ou senha inválidos.', 401, 'INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      throw new AppError('E-mail ou senha inválidos.', 401, 'INVALID_CREDENTIALS');
    }

    return {
      user: toPublicUser(user),
      session: this.createSession(user),
    };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const tokenUser = verifyRefreshToken(refreshToken);
    const user = await this.users.findActiveById(tokenUser.userId);

    if (!user || !user.active) {
      throw new AppError('Usuário não encontrado ou inativo.', 401, 'USER_UNAVAILABLE');
    }

    if ((user.tokenVersion ?? 0) !== tokenUser.tokenVersion) {
      throw new AppError('Sessão inválida. Entre novamente.', 401, 'SESSION_INVALIDATED');
    }

    return { user: toPublicUser(user), session: this.createSession(user) };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findActiveById(userId);

    if (!user || !user.active) {
      throw new AppError('Usuário não encontrado ou inativo.', 401, 'USER_UNAVAILABLE');
    }

    return toPublicUser(user);
  }
}

