import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CreateSupplierInput, UpdateSupplierInput } from '../schemas/supplier.schema.js';
import type { ListSuppliersInput, ManagedSupplier } from '../types/supplier.js';

const select = { id: true, name: true, document: true, email: true, phone: true, contactName: true,
  active: true, createdAt: true, updatedAt: true } satisfies Prisma.SupplierSelect;

export interface SupplierRepository {
  findById(id: string, tx?: Prisma.TransactionClient): Promise<ManagedSupplier | null>;
  findByEmail(email: string, tx?: Prisma.TransactionClient): Promise<ManagedSupplier | null>;
  findByDocument(document: string, tx?: Prisma.TransactionClient): Promise<ManagedSupplier | null>;
  list(input: ListSuppliersInput): Promise<{ suppliers: ManagedSupplier[]; total: number }>;
  create(input: CreateSupplierInput, tx?: Prisma.TransactionClient): Promise<ManagedSupplier>;
  update(id: string, input: UpdateSupplierInput & { active?: boolean }, tx?: Prisma.TransactionClient): Promise<ManagedSupplier>;
}

export class PrismaSupplierRepository implements SupplierRepository {
  findById(id: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).supplier.findUnique({ where: { id }, select }); }
  findByEmail(email: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).supplier.findUnique({ where: { email }, select }); }
  findByDocument(document: string, tx?: Prisma.TransactionClient) { return (tx ?? prisma).supplier.findUnique({ where: { document }, select }); }
  async list(input: ListSuppliersInput) {
    const where: Prisma.SupplierWhereInput = {
      ...(input.search ? { OR: ['name', 'document', 'email', 'contactName'].map((field) => ({ [field]: { contains: input.search, mode: 'insensitive' } })) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    };
    const [suppliers, total] = await prisma.$transaction([
      prisma.supplier.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize, select }),
      prisma.supplier.count({ where }),
    ]);
    return { suppliers, total };
  }
  create(input: CreateSupplierInput, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplier.create({ data: {
      name: input.name, document: input.document, email: input.email, active: input.active,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
    }, select });
  }
  update(id: string, input: UpdateSupplierInput & { active?: boolean }, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).supplier.update({ where: { id }, data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    }, select });
  }
}
