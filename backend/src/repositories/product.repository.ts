import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CreateProductData, ListProductsInput, ManagedProduct, UpdateProductData } from '../types/product.js';

const managedProductSelect = {
  id: true, name: true, sku: true, description: true, price: true, stock: true,
  trackingMode: true, expiryWarningDays: true, blockExpired: true, averageCost: true, stockValue: true,
  categoryId: true, category: { select: { id: true, name: true, active: true } },
  active: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ProductSelect;

export interface ProductRepository {
  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedProduct | null>;
  findBySku(sku: string, transaction?: Prisma.TransactionClient): Promise<ManagedProduct | null>;
  list(input: ListProductsInput): Promise<{ products: ManagedProduct[]; total: number }>;
  create(data: CreateProductData, transaction?: Prisma.TransactionClient): Promise<ManagedProduct>;
  update(id: string, data: UpdateProductData & { active?: boolean }, transaction?: Prisma.TransactionClient): Promise<ManagedProduct>;
}

export class PrismaProductRepository implements ProductRepository {
  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedProduct | null> {
    return (transaction ?? prisma).product.findUnique({ where: { id }, select: managedProductSelect });
  }
  findBySku(sku: string, transaction?: Prisma.TransactionClient): Promise<ManagedProduct | null> {
    return (transaction ?? prisma).product.findUnique({ where: { sku }, select: managedProductSelect });
  }
  async list(input: ListProductsInput): Promise<{ products: ManagedProduct[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      ...(input.search ? { OR: [
        { name: { contains: input.search, mode: 'insensitive' } },
        { sku: { contains: input.search, mode: 'insensitive' } },
      ] } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    };
    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder },
        skip: (input.page - 1) * input.pageSize, take: input.pageSize, select: managedProductSelect }),
      prisma.product.count({ where }),
    ]);
    return { products, total };
  }
  create(data: CreateProductData, transaction?: Prisma.TransactionClient): Promise<ManagedProduct> {
    const createData: Prisma.ProductCreateInput = {
      name: data.name, sku: data.sku, price: new Prisma.Decimal(data.price), stock: data.stock,
      category: { connect: { id: data.categoryId } }, active: data.active,
      ...(data.description !== undefined ? { description: data.description } : {}),
    };
    return (transaction ?? prisma).product.create({ data: createData, select: managedProductSelect });
  }
  update(id: string, data: UpdateProductData & { active?: boolean }, transaction?: Prisma.TransactionClient): Promise<ManagedProduct> {
    const updateData: Prisma.ProductUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.sku !== undefined ? { sku: data.sku } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.price !== undefined ? { price: new Prisma.Decimal(data.price) } : {}),
      ...(data.categoryId !== undefined ? { category: { connect: { id: data.categoryId } } } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    };
    return (transaction ?? prisma).product.update({ where: { id }, data: updateData, select: managedProductSelect });
  }
}
