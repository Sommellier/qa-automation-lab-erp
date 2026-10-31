import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CreateClientData, ListClientsInput, ManagedClient, UpdateClientData } from '../types/client.js';

const managedClientSelect = {
  id: true,
  name: true,
  document: true,
  email: true,
  phone: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

export interface ClientRepository {
  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedClient | null>;
  findByEmail(email: string, transaction?: Prisma.TransactionClient): Promise<ManagedClient | null>;
  findByDocument(document: string, transaction?: Prisma.TransactionClient): Promise<ManagedClient | null>;
  list(input: ListClientsInput): Promise<{ clients: ManagedClient[]; total: number }>;
  create(data: CreateClientData, transaction?: Prisma.TransactionClient): Promise<ManagedClient>;
  update(id: string, data: UpdateClientData & { active?: boolean }, transaction?: Prisma.TransactionClient): Promise<ManagedClient>;
}

export class PrismaClientRepository implements ClientRepository {
  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedClient | null> {
    return (transaction ?? prisma).client.findUnique({ where: { id }, select: managedClientSelect });
  }

  findByEmail(email: string, transaction?: Prisma.TransactionClient): Promise<ManagedClient | null> {
    return (transaction ?? prisma).client.findUnique({ where: { email }, select: managedClientSelect });
  }

  findByDocument(document: string, transaction?: Prisma.TransactionClient): Promise<ManagedClient | null> {
    return (transaction ?? prisma).client.findUnique({ where: { document }, select: managedClientSelect });
  }

  async list(input: ListClientsInput): Promise<{ clients: ManagedClient[]; total: number }> {
    const where: Prisma.ClientWhereInput = {
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { document: { contains: input.search, mode: 'insensitive' } },
              { email: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    };

    const [clients, total] = await prisma.$transaction([
      prisma.client.findMany({
        where,
        orderBy: { [input.sortBy]: input.sortOrder },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: managedClientSelect,
      }),
      prisma.client.count({ where }),
    ]);

    return { clients, total };
  }

  create(data: CreateClientData, transaction?: Prisma.TransactionClient): Promise<ManagedClient> {
    const createData: Prisma.ClientCreateInput = {
      name: data.name,
      document: data.document,
      email: data.email,
      active: data.active,
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
    };
    return (transaction ?? prisma).client.create({ data: createData, select: managedClientSelect });
  }

  update(id: string, data: UpdateClientData & { active?: boolean }, transaction?: Prisma.TransactionClient): Promise<ManagedClient> {
    const updateData: Prisma.ClientUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.document !== undefined ? { document: data.document } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    };
    return (transaction ?? prisma).client.update({ where: { id }, data: updateData, select: managedClientSelect });
  }
}
