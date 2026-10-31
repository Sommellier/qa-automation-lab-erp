import { AuditAction, AuditEntity, Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../config/security.js';
import { AppError } from '../errors/app-error.js';
import type { UserManagementRepository } from '../repositories/user.repository.js';
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UpdateUserStatusInput,
} from '../schemas/user.schema.js';
import type { ManagedUser } from '../types/user.js';
import {
  buildAuditDiff,
  noopAuditLogger,
  pickAuditFields,
  type AuditLogger,
  type AuditTransaction,
} from './audit.service.js';

const DUPLICATE_EMAIL_MESSAGE = 'Já existe um usuário cadastrado com este e-mail.';
const LAST_ADMIN_MESSAGE = 'É necessário manter pelo menos um administrador ativo no sistema.';
const AUDIT_FIELDS = ['name', 'email', 'role', 'active'] as const;

interface PaginatedUsers {
  data: ManagedUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class UserService {
  constructor(
    private readonly users: UserManagementRepository,
    private readonly audit: AuditLogger = noopAuditLogger,
  ) {}

  async list(query: ListUsersQuery): Promise<PaginatedUsers> {
    const { users, total } = await this.users.list(query);

    return {
      data: users,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getById(id: string, transaction?: AuditTransaction): Promise<ManagedUser> {
    const user = await this.users.findById(id, transaction);
    if (!user) throw new AppError('Usuário não encontrado.', 404, 'USER_NOT_FOUND');
    return user;
  }

  async create(input: CreateUserInput, actorUserId: string): Promise<ManagedUser> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    try {
      return await this.audit.transaction(async (transaction) => {
        const existingUser = await this.users.findByEmail(input.email, transaction);
        if (existingUser) throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409, 'EMAIL_ALREADY_EXISTS');
        const created = await this.users.create({
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          active: input.active,
        }, transaction);
        await this.audit.log({
          userId: actorUserId,
          entityType: AuditEntity.USER,
          entityId: created.id,
          action: AuditAction.CREATE,
          newData: pickAuditFields(created, AUDIT_FIELDS),
        }, transaction);
        return created;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409, 'EMAIL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateUserInput, actorUserId: string): Promise<ManagedUser> {
    try {
      return await this.audit.transaction(async (transaction) => {
        const currentUser = await this.getById(id, transaction);
        if (input.email && input.email !== currentUser.email) {
          const emailOwner = await this.users.findByEmail(input.email, transaction);
          if (emailOwner && emailOwner.id !== id) {
            throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409, 'EMAIL_ALREADY_EXISTS');
          }
        }
        const removesActiveAdmin = currentUser.role === UserRole.ADMIN && currentUser.active
          && ((input.role !== undefined && input.role !== UserRole.ADMIN) || input.active === false);
        if (removesActiveAdmin) await this.ensureAnotherActiveAdmin(transaction);
        const updated = await this.users.update(id, input, transaction);
        const diff = buildAuditDiff(currentUser, updated, AUDIT_FIELDS);
        if (Object.keys(diff.newData).length > 0) {
          const action = currentUser.role !== updated.role
            ? AuditAction.ROLE_CHANGE
            : currentUser.active !== updated.active
              ? updated.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE
              : AuditAction.UPDATE;
          await this.audit.log({ userId: actorUserId, entityType: AuditEntity.USER, entityId: id, action, ...diff }, transaction);
        }
        return updated;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409, 'EMAIL_ALREADY_EXISTS');
      }
      throw error;
    }
  }

  async updateStatus(id: string, input: UpdateUserStatusInput, actorUserId: string): Promise<ManagedUser> {
    return this.audit.transaction(async (transaction) => {
      const currentUser = await this.getById(id, transaction);
      if (currentUser.active === input.active) return currentUser;
      if (currentUser.role === UserRole.ADMIN && currentUser.active && !input.active) {
        await this.ensureAnotherActiveAdmin(transaction);
      }
      const updated = await this.users.update(id, { active: input.active }, transaction);
      await this.audit.log({
        userId: actorUserId,
        entityType: AuditEntity.USER,
        entityId: id,
        action: updated.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        oldData: { active: currentUser.active },
        newData: { active: updated.active },
      }, transaction);
      return updated;
    });
  }

  private async ensureAnotherActiveAdmin(transaction?: AuditTransaction): Promise<void> {
    const activeAdmins = await this.users.countActiveAdmins(transaction);
    if (activeAdmins <= 1) {
      throw new AppError(LAST_ADMIN_MESSAGE, 409, 'LAST_ACTIVE_ADMIN');
    }
  }
}
