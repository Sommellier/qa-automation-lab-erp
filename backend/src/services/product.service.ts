import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { ProductRepository } from '../repositories/product.repository.js';
import type { CategoryRepository } from '../repositories/category.repository.js';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput, UpdateProductStatusInput } from '../schemas/product.schema.js';
import type { ManagedProduct } from '../types/product.js';
import { buildAuditDiff, noopAuditLogger, pickAuditFields, type AuditLogger, type AuditTransaction } from './audit.service.js';
import type { StockService } from './stock.service.js';

const DUPLICATE_SKU_MESSAGE = 'Já existe um produto cadastrado com este SKU.';
const AUDIT_FIELDS = ['name', 'sku', 'description', 'price', 'categoryId', 'active'] as const;

export class ProductService {
  constructor(private readonly products: ProductRepository, private readonly audit: AuditLogger = noopAuditLogger,
    private readonly stock?: StockService, private readonly categories?: CategoryRepository) {}

  async list(query: ListProductsQuery) {
    const { products, total } = await this.products.list(query);
    return { data: products, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
  async getById(id: string, transaction?: AuditTransaction): Promise<ManagedProduct> {
    const product = await this.products.findById(id, transaction);
    if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    return product;
  }
  async create(input: CreateProductInput, actorUserId: string): Promise<ManagedProduct> {
    try {
      return await this.audit.transaction(async (transaction) => {
        if (await this.products.findBySku(input.sku, transaction)) throw new AppError(DUPLICATE_SKU_MESSAGE, 409, 'PRODUCT_SKU_ALREADY_EXISTS');
        await this.ensureActiveCategory(input.categoryId, transaction);
        const created = await this.products.create(input, transaction);
        await this.stock?.registerInitialBalance(created, actorUserId, transaction);
        await this.audit.log({ userId: actorUserId, entityType: AuditEntity.PRODUCT, entityId: created.id,
          action: AuditAction.CREATE, newData: pickAuditFields(created, AUDIT_FIELDS) }, transaction);
        return created;
      });
    } catch (error: unknown) { this.handleUnique(error); throw error; }
  }
  async update(id: string, input: UpdateProductInput, actorUserId: string): Promise<ManagedProduct> {
    try {
      return await this.audit.transaction(async (transaction) => {
        const current = await this.getById(id, transaction);
        if (input.sku && input.sku !== current.sku) {
          const owner = await this.products.findBySku(input.sku, transaction);
          if (owner && owner.id !== id) throw new AppError(DUPLICATE_SKU_MESSAGE, 409, 'PRODUCT_SKU_ALREADY_EXISTS');
        }
        if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
          await this.ensureActiveCategory(input.categoryId, transaction);
        }
        const updated = await this.products.update(id, input, transaction);
        const diff = buildAuditDiff(current, updated, AUDIT_FIELDS);
        if (Object.keys(diff.newData).length > 0) {
          await this.audit.log({ userId: actorUserId, entityType: AuditEntity.PRODUCT, entityId: id,
            action: AuditAction.UPDATE, ...diff }, transaction);
        }
        return updated;
      });
    } catch (error: unknown) { this.handleUnique(error); throw error; }
  }
  async updateStatus(id: string, input: UpdateProductStatusInput, actorUserId: string): Promise<ManagedProduct> {
    return this.audit.transaction(async (transaction) => {
      const current = await this.getById(id, transaction);
      if (current.active === input.active) return current;
      const updated = await this.products.update(id, { active: input.active }, transaction);
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.PRODUCT, entityId: id,
        action: updated.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        oldData: { active: current.active }, newData: { active: updated.active } }, transaction);
      return updated;
    });
  }
  private async ensureActiveCategory(categoryId: string, transaction: AuditTransaction): Promise<void> {
    if (!this.categories) return;
    const category = await this.categories.findById(categoryId, transaction);
    if (!category) throw new AppError('Categoria não encontrada.', 404, 'CATEGORY_NOT_FOUND');
    if (!category.active) throw new AppError('A categoria selecionada está inativa.', 409, 'CATEGORY_INACTIVE');
  }
  private handleUnique(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(DUPLICATE_SKU_MESSAGE, 409, 'PRODUCT_SKU_ALREADY_EXISTS');
    }
  }
}
