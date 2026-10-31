import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CreateClientAddressData, ListClientAddressesInput, ManagedClientAddress, UpdateClientAddressData } from '../types/client-address.js';

const addressSelect = {
  id: true, clientId: true, type: true, zipCode: true, street: true, number: true,
  complement: true, district: true, city: true, state: true, country: true,
  isPrimary: true, active: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ClientAddressSelect;

export interface ClientAddressRepository {
  lockClient(clientId: string, transaction?: Prisma.TransactionClient): Promise<void>;
  list(clientId: string, input: ListClientAddressesInput): Promise<{ addresses: ManagedClientAddress[]; total: number }>;
  findByClientAndId(clientId: string, id: string, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress | null>;
  findActivePrimary(clientId: string, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress | null>;
  countActive(clientId: string, excludedId?: string, transaction?: Prisma.TransactionClient): Promise<number>;
  create(data: CreateClientAddressData, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress>;
  update(id: string, data: UpdateClientAddressData, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress>;
  clearPrimary(clientId: string, excludedId: string | undefined, transaction?: Prisma.TransactionClient): Promise<void>;
}

export class PrismaClientAddressRepository implements ClientAddressRepository {
  async lockClient(clientId: string, transaction?: Prisma.TransactionClient): Promise<void> {
    if (!transaction) return;
    await transaction.$queryRaw(Prisma.sql`
      SELECT 1 AS "locked"
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${clientId}, 0))) AS "client_lock"
    `);
  }

  async list(clientId: string, input: ListClientAddressesInput): Promise<{ addresses: ManagedClientAddress[]; total: number }> {
    const where: Prisma.ClientAddressWhereInput = {
      clientId,
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.type ? { type: input.type } : {}),
    };
    const [addresses, total] = await prisma.$transaction([
      prisma.clientAddress.findMany({
        where,
        orderBy: [{ isPrimary: 'desc' }, { [input.sortBy]: input.sortOrder }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: addressSelect,
      }),
      prisma.clientAddress.count({ where }),
    ]);
    return { addresses, total };
  }

  findByClientAndId(clientId: string, id: string, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress | null> {
    return (transaction ?? prisma).clientAddress.findFirst({ where: { id, clientId }, select: addressSelect });
  }

  findActivePrimary(clientId: string, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress | null> {
    return (transaction ?? prisma).clientAddress.findFirst({ where: { clientId, active: true, isPrimary: true }, select: addressSelect });
  }

  countActive(clientId: string, excludedId?: string, transaction?: Prisma.TransactionClient): Promise<number> {
    return (transaction ?? prisma).clientAddress.count({
      where: { clientId, active: true, ...(excludedId ? { id: { not: excludedId } } : {}) },
    });
  }

  create(data: CreateClientAddressData, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress> {
    return (transaction ?? prisma).clientAddress.create({ data, select: addressSelect });
  }

  update(id: string, data: UpdateClientAddressData, transaction?: Prisma.TransactionClient): Promise<ManagedClientAddress> {
    const updateData: Prisma.ClientAddressUpdateInput = {
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.zipCode !== undefined ? { zipCode: data.zipCode } : {}),
      ...(data.street !== undefined ? { street: data.street } : {}),
      ...(data.number !== undefined ? { number: data.number } : {}),
      ...(data.complement !== undefined ? { complement: data.complement } : {}),
      ...(data.district !== undefined ? { district: data.district } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.country !== undefined ? { country: data.country } : {}),
      ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    };
    return (transaction ?? prisma).clientAddress.update({ where: { id }, data: updateData, select: addressSelect });
  }

  async clearPrimary(clientId: string, excludedId?: string, transaction?: Prisma.TransactionClient): Promise<void> {
    await (transaction ?? prisma).clientAddress.updateMany({
      where: { clientId, isPrimary: true, ...(excludedId ? { id: { not: excludedId } } : {}) },
      data: { isPrimary: false },
    });
  }
}
