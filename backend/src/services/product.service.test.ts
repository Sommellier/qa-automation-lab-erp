import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryRepository } from '../repositories/category.repository.js';
import type { ProductRepository } from '../repositories/product.repository.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';
import type { CreateProductData, ListProductsInput, ManagedProduct, UpdateProductData } from '../types/product.js';
import { ProductService } from './product.service.js';
import type { StockService } from './stock.service.js';

class InMemoryProducts implements ProductRepository {
  records: ManagedProduct[] = [];
  async findById(id: string) { return this.records.find((item) => item.id === id) ?? null; }
  async findBySku(sku: string) { return this.records.find((item) => item.sku === sku) ?? null; }
  async list(input: ListProductsInput) {
    const search = input.search?.toLowerCase();
    const filtered = this.records.filter((item) => !search || item.name.toLowerCase().includes(search) || item.sku.toLowerCase().includes(search))
      .filter((item) => !input.categoryId || item.categoryId === input.categoryId)
      .filter((item) => input.active === undefined || item.active === input.active)
      .sort((left, right) => { const a = left[input.sortBy]; const b = right[input.sortBy]; const result = a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : a instanceof Prisma.Decimal && b instanceof Prisma.Decimal ? a.comparedTo(b) : String(a).localeCompare(String(b)); return input.sortOrder === 'asc' ? result : -result; });
    const start = (input.page - 1) * input.pageSize; return { products: filtered.slice(start, start + input.pageSize), total: filtered.length };
  }
  async create(data: CreateProductData): Promise<ManagedProduct> { const now = new Date(); const category = categories.get(data.categoryId)!; const product: ManagedProduct = { id: randomUUID(), name: data.name, sku: data.sku, description: data.description ?? null, price: new Prisma.Decimal(data.price), stock: data.stock, trackingMode: 'NONE', expiryWarningDays: 30, blockExpired: true, averageCost: new Prisma.Decimal(0), stockValue: new Prisma.Decimal(0), categoryId: data.categoryId, category, active: data.active, createdAt: now, updatedAt: now }; this.records.push(product); return product; }
  async update(id: string, data: UpdateProductData & { active?: boolean }): Promise<ManagedProduct> { const index = this.records.findIndex((item) => item.id === id); if (index < 0) throw new Error('Não encontrado'); const current = this.records[index]!; const category = data.categoryId ? categories.get(data.categoryId)! : current.category; const updated: ManagedProduct = { ...current, ...(data.name !== undefined ? { name: data.name } : {}), ...(data.sku !== undefined ? { sku: data.sku } : {}), ...(data.description !== undefined ? { description: data.description } : {}), ...(data.price !== undefined ? { price: new Prisma.Decimal(data.price) } : {}), ...(data.categoryId !== undefined ? { categoryId: data.categoryId, category } : {}), ...(data.active !== undefined ? { active: data.active } : {}), updatedAt: new Date() }; this.records[index] = updated; return updated; }
}

const infoId = '11111111-1111-4111-8111-111111111111';
const peripheralsId = '22222222-2222-4222-8222-222222222222';
const accessoriesId = '33333333-3333-4333-8333-333333333333';
const inactiveId = '44444444-4444-4444-8444-444444444444';
const categories = new Map([
  [infoId, { id: infoId, name: 'Informática', active: true }], [peripheralsId, { id: peripheralsId, name: 'Periféricos', active: true }],
  [accessoriesId, { id: accessoriesId, name: 'Acessórios', active: true }], [inactiveId, { id: inactiveId, name: 'Legado', active: false }],
]);

describe('ProductService', () => {
  let repository: InMemoryProducts; let service: ProductService; let notebookId: string; let mouseId: string; let actorId: string; let audit: RecordingAuditLogger;
  beforeEach(() => { repository = new InMemoryProducts(); audit = new RecordingAuditLogger(); const categoryRepository = { findById: vi.fn(async (id: string) => { const category = categories.get(id); return category ? { ...category, description: null, productCount: 0, createdAt: new Date(), updatedAt: new Date() } : null; }) } as unknown as CategoryRepository; service = new ProductService(repository, audit, undefined, categoryRepository); notebookId = randomUUID(); mouseId = randomUUID(); actorId = randomUUID(); const now = new Date(); repository.records = [
    { id: notebookId, name: 'Notebook Pro', sku: 'NOTE001', description: null, price: new Prisma.Decimal('5999.90'), stock: 10, trackingMode: 'NONE', expiryWarningDays: 30, blockExpired: true, averageCost: new Prisma.Decimal(0), stockValue: new Prisma.Decimal(0), categoryId: infoId, category: categories.get(infoId)!, active: true, createdAt: now, updatedAt: now },
    { id: mouseId, name: 'Mouse Gamer', sku: 'MOUSE001', description: null, price: new Prisma.Decimal('299.90'), stock: 0, trackingMode: 'NONE', expiryWarningDays: 30, blockExpired: true, averageCost: new Prisma.Decimal(0), stockValue: new Prisma.Decimal(0), categoryId: peripheralsId, category: categories.get(peripheralsId)!, active: false, createdAt: now, updatedAt: now },
  ]; });
  it('cria produto com categoria ativa', async () => { const product = await service.create({ name: 'Teclado', sku: 'KEY001', price: '199.90', stock: 0, categoryId: peripheralsId, active: true }, actorId); expect(product).toMatchObject({ stock: 0, category: { name: 'Periféricos' } }); expect(audit.entries[0]).toMatchObject({ entityType: AuditEntity.PRODUCT, action: AuditAction.CREATE }); });
  it('rejeita categoria inexistente ou inativa', async () => { await expect(service.create({ name: 'Teclado', sku: 'KEY001', price: '199.90', stock: 0, categoryId: randomUUID(), active: true }, actorId)).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' }); await expect(service.create({ name: 'Teclado', sku: 'KEY002', price: '199.90', stock: 0, categoryId: inactiveId, active: true }, actorId)).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' }); });
  it('cria INITIAL_BALANCE ao cadastrar saldo', async () => { const registerInitialBalance = vi.fn().mockResolvedValue({}); const categoriesRepository = { findById: vi.fn(async () => ({ id: peripheralsId, name: 'Periféricos', active: true })) } as unknown as CategoryRepository; service = new ProductService(repository, audit, { registerInitialBalance } as unknown as StockService, categoriesRepository); const created = await service.create({ name: 'Teclado', sku: 'KEY002', price: '199.90', stock: 8, categoryId: peripheralsId, active: true }, actorId); expect(registerInitialBalance).toHaveBeenCalledWith(expect.objectContaining({ id: created.id, stock: 8 }), actorId, undefined); });
  it('rejeita SKU duplicado', async () => { await expect(service.create({ name: 'Outro', sku: 'NOTE001', price: '1.00', stock: 1, categoryId: infoId, active: true }, actorId)).rejects.toMatchObject({ code: 'PRODUCT_SKU_ALREADY_EXISTS' }); });
  it('edita preço e categoria sem alterar estoque', async () => { const result = await service.update(notebookId, { price: '5499.90', categoryId: accessoriesId }, actorId); expect(result.price.toString()).toBe('5499.9'); expect(result).toMatchObject({ stock: 10, category: { name: 'Acessórios' } }); expect(audit.entries[0]).toMatchObject({ action: AuditAction.UPDATE, oldData: expect.objectContaining({ categoryId: infoId }), newData: expect.objectContaining({ categoryId: accessoriesId }) }); });
  it('mantém categoria inativa atual, mas não permite trocar para ela', async () => { categories.get(infoId)!.active = false; repository.records[0]!.category.active = false; await expect(service.update(notebookId, { name: 'Notebook Pro 2' }, actorId)).resolves.toMatchObject({ categoryId: infoId }); await expect(service.update(mouseId, { categoryId: infoId }, actorId)).rejects.toMatchObject({ code: 'CATEGORY_INACTIVE' }); categories.get(infoId)!.active = true; });
  it('inativa e reativa sem relação com estoque', async () => { expect(await service.updateStatus(mouseId, { active: true }, actorId)).toMatchObject({ stock: 0, active: true }); expect(await service.updateStatus(mouseId, { active: false }, actorId)).toMatchObject({ active: false }); });
  it('filtra por categoryId', async () => { const result = await service.list({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', categoryId: infoId }); expect(result.data.map((item) => item.id)).toEqual([notebookId]); });
  it('retorna 404 para produto inexistente', async () => { await expect(service.getById(randomUUID())).rejects.toMatchObject({ statusCode: 404 }); });
});
