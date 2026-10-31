import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { CategoryRepository } from '../repositories/category.repository.js';
import type { CategoryOptionsQuery, CreateCategoryInput, ListCategoriesQuery, UpdateCategoryInput, UpdateCategoryStatusInput } from '../schemas/category.schema.js';
import type { ManagedCategory } from '../types/category.js';
import { normalizeCategoryName } from '../utils/category-name.js';
import { buildAuditDiff, noopAuditLogger, pickAuditFields, type AuditLogger, type AuditTransaction } from './audit.service.js';

const DUPLICATE_MESSAGE = 'Já existe uma categoria com este nome.';
const AUDIT_FIELDS = ['name', 'description', 'active'] as const;

export class CategoryService {
  constructor(private readonly categories: CategoryRepository, private readonly audit: AuditLogger = noopAuditLogger) {}

  async list(query: ListCategoriesQuery) {
    const { categories, total } = await this.categories.list(query);
    return { data: categories, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  options(query: CategoryOptionsQuery) {
    return this.categories.options(query.search, query.includeInactive);
  }

  async getById(id: string, transaction?: AuditTransaction): Promise<ManagedCategory> {
    const category = await this.categories.findById(id, transaction);
    if (!category) throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
    return category;
  }

  async create(input: CreateCategoryInput, actorUserId: string): Promise<ManagedCategory> {
    const normalizedName = normalizeCategoryName(input.name);
    try {
      return await this.audit.transaction(async (transaction) => {
        if (await this.categories.findByNormalizedName(normalizedName, transaction)) {
          throw new AppError(DUPLICATE_MESSAGE, 409, 'CATEGORY_NAME_ALREADY_EXISTS');
        }
        const created = await this.categories.create({ name: input.name, normalizedName, active: input.active,
          ...(input.description !== undefined ? { description: input.description } : {}) }, transaction);
        await this.audit.log({ userId: actorUserId, entityType: AuditEntity.CATEGORY, entityId: created.id,
          action: AuditAction.CREATE, newData: pickAuditFields(created, AUDIT_FIELDS) }, transaction);
        return created;
      });
    } catch (error: unknown) { this.handleUnique(error); throw error; }
  }

  async update(id: string, input: UpdateCategoryInput, actorUserId: string): Promise<ManagedCategory> {
    try {
      return await this.audit.transaction(async (transaction) => {
        const current = await this.getById(id, transaction);
        const normalizedName = input.name === undefined ? undefined : normalizeCategoryName(input.name);
        if (normalizedName !== undefined) {
          const owner = await this.categories.findByNormalizedName(normalizedName, transaction);
          if (owner && owner.id !== id) throw new AppError(DUPLICATE_MESSAGE, 409, 'CATEGORY_NAME_ALREADY_EXISTS');
        }
        const updated = await this.categories.update(id, {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(normalizedName !== undefined ? { normalizedName } : {}),
        }, transaction);
        const diff = buildAuditDiff(current, updated, AUDIT_FIELDS);
        if (Object.keys(diff.newData).length > 0) {
          await this.audit.log({ userId: actorUserId, entityType: AuditEntity.CATEGORY, entityId: id,
            action: AuditAction.UPDATE, ...diff }, transaction);
        }
        return updated;
      });
    } catch (error: unknown) { this.handleUnique(error); throw error; }
  }

  async updateStatus(id: string, input: UpdateCategoryStatusInput, actorUserId: string): Promise<ManagedCategory> {
    return this.audit.transaction(async (transaction) => {
      const current = await this.getById(id, transaction);
      if (current.active === input.active) return current;
      const updated = await this.categories.update(id, { active: input.active }, transaction);
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.CATEGORY, entityId: id,
        action: updated.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        oldData: { active: current.active }, newData: { active: updated.active } }, transaction);
      return updated;
    });
  }

  private handleUnique(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(DUPLICATE_MESSAGE, 409, 'CATEGORY_NAME_ALREADY_EXISTS');
    }
  }
}
