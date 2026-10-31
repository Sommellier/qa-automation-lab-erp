import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CategoryRepository } from '../repositories/category.repository.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';
import type { CreateCategoryData, ListCategoriesInput, ManagedCategory, UpdateCategoryData } from '../types/category.js';
import { CategoryService } from './category.service.js';

class MemoryCategories implements CategoryRepository {
  records: Array<ManagedCategory & { normalizedName: string }> = [];
  async findById(id: string) { return this.records.find((record) => record.id === id) ?? null; }
  async findByNormalizedName(normalizedName: string) { return this.records.find((record) => record.normalizedName === normalizedName) ?? null; }
  async list(input: ListCategoriesInput) { const filtered = this.records.filter((record) => !input.search || record.name.toLowerCase().includes(input.search.toLowerCase())).filter((record) => input.active === undefined || record.active === input.active); return { categories: filtered, total: filtered.length }; }
  async options(search?: string, includeInactive = false) { return this.records.filter((record) => includeInactive || record.active).filter((record) => !search || record.name.toLowerCase().includes(search.toLowerCase())).map(({ id, name, active }) => ({ id, name, active })); }
  async create(data: CreateCategoryData) { const now = new Date(); const record = { id: randomUUID(), name: data.name, normalizedName: data.normalizedName, description: data.description ?? null, active: data.active, productCount: 0, createdAt: now, updatedAt: now }; this.records.push(record); return record; }
  async update(id: string, data: UpdateCategoryData) { const index = this.records.findIndex((record) => record.id === id); if (index < 0) throw new Error('ausente'); const current = this.records[index]!; const updated: ManagedCategory & { normalizedName: string } = { ...current, ...(data.name !== undefined ? { name: data.name } : {}), ...(data.normalizedName !== undefined ? { normalizedName: data.normalizedName } : {}), ...(data.description !== undefined ? { description: data.description } : {}), ...(data.active !== undefined ? { active: data.active } : {}), updatedAt: new Date() }; this.records[index] = updated; return updated; }
}

describe('CategoryService', () => {
  let repository: MemoryCategories; let audit: RecordingAuditLogger; let service: CategoryService; let actor: string;
  beforeEach(() => { repository = new MemoryCategories(); audit = new RecordingAuditLogger(); service = new CategoryService(repository, audit); actor = randomUUID(); });
  it('cria com chave lógica normalizada e auditoria', async () => { const category = await service.create({ name: 'Informática', description: 'Equipamentos', active: true }, actor); expect(category.name).toBe('Informática'); expect(repository.records[0]?.normalizedName).toBe('informática'); expect(audit.entries[0]).toMatchObject({ entityType: AuditEntity.CATEGORY, action: AuditAction.CREATE, newData: { name: 'Informática', description: 'Equipamentos', active: true } }); });
  it('rejeita duplicidade por case e espaços', async () => { await service.create({ name: 'Informática', active: true }, actor); await expect(service.create({ name: '  INFORMÁTICA  ', active: true }, actor)).rejects.toMatchObject({ statusCode: 409, code: 'CATEGORY_NAME_ALREADY_EXISTS' }); });
  it('edita e registra apenas campos alterados', async () => { const category = await service.create({ name: 'Escritório', active: true }, actor); audit.entries.splice(0); const result = await service.update(category.id, { description: 'Uso interno' }, actor); expect(result.description).toBe('Uso interno'); expect(audit.entries[0]).toMatchObject({ action: AuditAction.UPDATE, oldData: { description: null }, newData: { description: 'Uso interno' } }); });
  it('inativa e reativa mesmo com produtos vinculados', async () => { const category = await service.create({ name: 'Legado', active: true }, actor); repository.records[0]!.productCount = 15; audit.entries.splice(0); await service.updateStatus(category.id, { active: false }, actor); await service.updateStatus(category.id, { active: true }, actor); expect(audit.entries.map((entry) => entry.action)).toEqual([AuditAction.DEACTIVATE, AuditAction.ACTIVATE]); });
  it('retorna 404 para categoria inexistente', async () => { await expect(service.getById(randomUUID())).rejects.toMatchObject({ statusCode: 404, message: 'Categoria não encontrada.' }); });
  it('options retorna apenas ativas por padrão', async () => { await service.create({ name: 'Ativa', active: true }, actor); await service.create({ name: 'Inativa', active: false }, actor); expect(await service.options({ includeInactive: false })).toEqual([expect.objectContaining({ name: 'Ativa' })]); });
});
