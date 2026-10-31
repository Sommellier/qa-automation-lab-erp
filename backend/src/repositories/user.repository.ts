import { Prisma, type User, type UserRole } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CreateUserData, ListUsersInput, ManagedUser, PrivateProfileUser, UpdateUserData } from '../types/user.js';

const managedUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const privateProfileUserSelect = {
  ...managedUserSelect,
  passwordHash: true,
  tokenVersion: true,
} satisfies Prisma.UserSelect;

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findActiveById(id: string): Promise<Pick<User, 'id' | 'name' | 'email' | 'role' | 'active' | 'tokenVersion' | 'createdAt' | 'updatedAt'> | null>;
}

export interface ProfileRepository {
  findPrivateById(id: string, transaction?: Prisma.TransactionClient): Promise<PrivateProfileUser | null>;
  updateOwnName(id: string, name: string, transaction?: Prisma.TransactionClient): Promise<ManagedUser>;
  updatePassword(id: string, passwordHash: string, transaction?: Prisma.TransactionClient): Promise<void>;
}

export interface UserManagementRepository {
  findByEmail(email: string, transaction?: Prisma.TransactionClient): Promise<User | null>;
  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedUser | null>;
  list(input: ListUsersInput): Promise<{ users: ManagedUser[]; total: number }>;
  create(data: CreateUserData, transaction?: Prisma.TransactionClient): Promise<ManagedUser>;
  update(id: string, data: UpdateUserData, transaction?: Prisma.TransactionClient): Promise<ManagedUser>;
  countActiveAdmins(transaction?: Prisma.TransactionClient): Promise<number>;
}

export class PrismaUserRepository implements UserRepository, UserManagementRepository {
  findByEmail(email: string, transaction?: Prisma.TransactionClient): Promise<User | null> {
    return (transaction ?? prisma).user.findUnique({ where: { email } });
  }

  findActiveById(
    id: string,
  ): Promise<Pick<User, 'id' | 'name' | 'email' | 'role' | 'active' | 'tokenVersion' | 'createdAt' | 'updatedAt'> | null> {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true, tokenVersion: true, createdAt: true, updatedAt: true },
    });
  }

  findPrivateById(id: string, transaction?: Prisma.TransactionClient): Promise<PrivateProfileUser | null> {
    return (transaction ?? prisma).user.findUnique({ where: { id }, select: privateProfileUserSelect });
  }

  updateOwnName(id: string, name: string, transaction?: Prisma.TransactionClient): Promise<ManagedUser> {
    return (transaction ?? prisma).user.update({
      where: { id },
      data: { name },
      select: managedUserSelect,
    });
  }

  async updatePassword(id: string, passwordHash: string, transaction?: Prisma.TransactionClient): Promise<void> {
    await (transaction ?? prisma).user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true },
    });
  }

  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedUser | null> {
    return (transaction ?? prisma).user.findUnique({
      where: { id },
      select: managedUserSelect,
    });
  }

  async list(input: ListUsersInput): Promise<{ users: ManagedUser[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { email: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    };
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [input.sortBy]: input.sortOrder,
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: managedUserSelect,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  create(data: CreateUserData, transaction?: Prisma.TransactionClient): Promise<ManagedUser> {
    return (transaction ?? prisma).user.create({ data, select: managedUserSelect });
  }

  update(id: string, data: UpdateUserData, transaction?: Prisma.TransactionClient): Promise<ManagedUser> {
    const updateData: Prisma.UserUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    };

    return (transaction ?? prisma).user.update({
      where: { id },
      data: updateData,
      select: managedUserSelect,
    });
  }

  countActiveAdmins(transaction?: Prisma.TransactionClient): Promise<number> {
    return (transaction ?? prisma).user.count({
      where: { role: 'ADMIN', active: true },
    });
  }
}
