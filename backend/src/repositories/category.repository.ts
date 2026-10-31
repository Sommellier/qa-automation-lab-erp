import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CategoryOption, CreateCategoryData, ListCategoriesInput, ManagedCategory, UpdateCategoryData } from '../types/category.js';

const categorySelect = {
  id: true, name: true, description: true, active: true, createdAt: true, updatedAt: true,
  _count: { select: { products: true } },
} satisfies Prisma.CategorySelect;

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;
const mapCategory = (row: CategoryRow): ManagedCategory => ({
  id: row.id, name: row.name, description: row.description, active: row.active,
  productCount: row._count.products, createdAt: row.createdAt, updatedAt: row.updatedAt,
});

export interface CategoryRepository {
  findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedCategory | null>;
  findByNormalizedName(normalizedName: string, transaction?: Prisma.TransactionClient): Promise<ManagedCategory | null>;
  list(input: ListCategoriesInput): Promise<{ categories: ManagedCategory[]; total: number }>;
  options(search?: string, includeInactive?: boolean): Promise<CategoryOption[]>;
  create(data: CreateCategoryData, transaction?: Prisma.TransactionClient): Promise<ManagedCategory>;
  update(id: string, data: UpdateCategoryData, transaction?: Prisma.TransactionClient): Promise<ManagedCategory>;
}

export class PrismaCategoryRepository implements CategoryRepository {
  async findById(id: string, transaction?: Prisma.TransactionClient): Promise<ManagedCategory | null> {
    const row = await (transaction ?? prisma).category.findUnique({ where: { id }, select: categorySelect });
    return row ? mapCategory(row) : null;
  }

  async findByNormalizedName(normalizedName: string, transaction?: Prisma.TransactionClient): Promise<ManagedCategory | null> {
    const row = await (transaction ?? prisma).category.findUnique({ where: { normalizedName }, select: categorySelect });
    return row ? mapCategory(row) : null;
  }

  async list(input: ListCategoriesInput): Promise<{ categories: ManagedCategory[]; total: number }> {
    const where: Prisma.CategoryWhereInput = {
      ...(input.search ? { name: { contains: input.search, mode: 'insensitive' } } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.category.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder },
        skip: (input.page - 1) * input.pageSize, take: input.pageSize, select: categorySelect }),
      prisma.category.count({ where }),
    ]);
    return { categories: rows.map(mapCategory), total };
  }

  options(search?: string, includeInactive = false): Promise<CategoryOption[]> {
    const where: Prisma.CategoryWhereInput = {
      ...(includeInactive ? {} : { active: true }),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    if (includeInactive) {
      return prisma.category.findMany({
        where, orderBy: { name: 'asc' }, select: { id: true, name: true, active: true }, take: 100,
      });
    }

    return prisma.category.findMany({
      where, orderBy: { name: 'asc' }, select: { id: true, name: true }, take: 100,
    });
  }

  async create(data: CreateCategoryData, transaction?: Prisma.TransactionClient): Promise<ManagedCategory> {
    const createData: Prisma.CategoryCreateInput = {
      name: data.name, normalizedName: data.normalizedName, active: data.active,
      ...(data.description !== undefined ? { description: data.description } : {}),
    };
    const row = await (transaction ?? prisma).category.create({ data: createData, select: categorySelect });
    return mapCategory(row);
  }

  async update(id: string, data: UpdateCategoryData, transaction?: Prisma.TransactionClient): Promise<ManagedCategory> {
    const updateData: Prisma.CategoryUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.normalizedName !== undefined ? { normalizedName: data.normalizedName } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    };
    const row = await (transaction ?? prisma).category.update({ where: { id }, data: updateData, select: categorySelect });
    return mapCategory(row);
  }
}
