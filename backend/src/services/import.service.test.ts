import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, ImportStatus, ImportType, UserRole, type Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportRepository } from '../repositories/import.repository.js';
import type { CreateClientInput } from '../schemas/client.schema.js';
import type { CreateProductInput } from '../schemas/product.schema.js';
import type { AuditLogInput } from '../types/audit.js';
import type { CsvFile, ImportJobView, ImportRowError, ListImportJobsInput } from '../types/import.js';
import type { AuditLogger, AuditTransaction } from './audit.service.js';
import { ImportService } from './import.service.js';
import type { StockService } from './stock.service.js';

class MemoryImportRepository implements ImportRepository {
  clients: CreateClientInput[] = []; products: CreateProductInput[] = []; jobs = new Map<string, ImportJobView>();
  existingClientEmails = new Set<string>(); existingClientDocuments = new Set<string>(); existingProductSkus = new Set<string>();
  categories = new Map([
    ['informática', { id: '11111111-1111-4111-8111-111111111111', active: true }],
    ['cat', { id: '22222222-2222-4222-8222-222222222222', active: true }],
    ['categoria', { id: '33333333-3333-4333-8333-333333333333', active: true }],
  ]);
  existingClientQueries = 0; existingProductQueries = 0;
  async existingClients(emails: string[], documents: string[]) { this.existingClientQueries += 1; return { emails: emails.filter((email) => this.existingClientEmails.has(email)), documents: documents.filter((document) => this.existingClientDocuments.has(document)) }; }
  async existingProducts(skus: string[]) { this.existingProductQueries += 1; return skus.filter((sku) => this.existingProductSkus.has(sku)); }
  async categoriesByNormalizedNames(names: string[]) { return names.flatMap((normalizedName) => { const category = this.categories.get(normalizedName); return category ? [{ ...category, normalizedName }] : []; }); }
  async createClients(records: CreateClientInput[]) { this.clients.push(...records); records.forEach((record) => { this.existingClientEmails.add(record.email); this.existingClientDocuments.add(record.document); }); return records.length; }
  async createProducts(records: CreateProductInput[]) { this.products.push(...records); records.forEach((record) => this.existingProductSkus.add(record.sku)); return records.map((record) => ({ id: randomUUID(), stock: record.stock })); }
  async createJob(data: { type: ImportType; fileName: string; totalRows: number; validRows: number; invalidRows: number; importedRows: number; status: ImportStatus; errors: ImportRowError[]; createdById: string; completedAt?: Date }) {
    const id = randomUUID(); const job: ImportJobView = { id, ...data, errors: data.errors as unknown as Prisma.JsonValue, createdAt: new Date(), completedAt: data.completedAt ?? null, createdBy: { id: data.createdById, name: data.createdById, email: `${data.createdById}@teste.com` } }; this.jobs.set(id, job); return job;
  }
  async updateJob(id: string, data: Partial<{ totalRows: number; validRows: number; invalidRows: number; importedRows: number; status: ImportStatus; errors: ImportRowError[]; completedAt: Date }>) {
    const current = this.jobs.get(id); if (!current) throw new Error('job ausente'); const { errors, ...rest } = data; const updated: ImportJobView = { ...current, ...rest, ...(errors ? { errors: errors as unknown as Prisma.JsonValue } : {}) }; this.jobs.set(id, updated); return updated;
  }
  async findJob(id: string) { return this.jobs.get(id) ?? null; }
  async listJobs(input: ListImportJobsInput) { const all = [...this.jobs.values()].filter((job) => !input.createdById || job.createdById === input.createdById); return { jobs: all.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: all.length }; }
  snapshot() { return { clients: structuredClone(this.clients), products: structuredClone(this.products), jobs: new Map(this.jobs), emails: new Set(this.existingClientEmails), documents: new Set(this.existingClientDocuments), skus: new Set(this.existingProductSkus) }; }
  restore(snapshot: ReturnType<MemoryImportRepository['snapshot']>) { this.clients = snapshot.clients; this.products = snapshot.products; this.jobs = snapshot.jobs; this.existingClientEmails = snapshot.emails; this.existingClientDocuments = snapshot.documents; this.existingProductSkus = snapshot.skus; }
}

class TransactionalAudit implements AuditLogger {
  entries: AuditLogInput[] = []; failLog = false;
  constructor(private readonly repository: MemoryImportRepository) {}
  async transaction<T>(operation: (transaction: AuditTransaction) => Promise<T>): Promise<T> { const snapshot = this.repository.snapshot(); const entries = [...this.entries]; try { return await operation(undefined); } catch (error) { this.repository.restore(snapshot); this.entries = entries; throw error; } }
  async log(input: AuditLogInput) { if (this.failLog) throw new Error('auditoria indisponível'); this.entries.push(input); }
}

const admin = { id: 'admin', role: UserRole.ADMIN };
const analyst = { id: 'analyst', role: UserRole.ANALISTA };
function csv(name: string, content: string): CsvFile { const buffer = Buffer.from(content, 'utf8'); return { originalname: name, mimetype: 'text/csv', size: buffer.length, buffer }; }
const clientHeader = 'name;document;email;phone;active';
const productHeader = 'name;sku;description;price;stock;category;active';

describe('ImportService', () => {
  let repository: MemoryImportRepository; let audit: TransactionalAudit; let service: ImportService;
  beforeEach(() => { repository = new MemoryImportRepository(); audit = new TransactionalAudit(repository); service = new ImportService(repository, audit); });

  it('CT001, CT019 e padrão active: valida cliente, telefone vazio e active vazio como true', async () => {
    const result = await service.validate(ImportType.CLIENTS, csv('clientes.csv', `${clientHeader}\n Carlos Silva ;12345;CARLOS@TESTE.COM;;`), admin);
    expect(result).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0 }); expect(audit.entries).toHaveLength(0); expect(repository.clients).toHaveLength(0);
  });

  it('CT011-014, CT020 e CT049-050: agrega múltiplos erros e os ordena', async () => {
    const result = await service.validate(ImportType.CLIENTS, csv('clientes.csv', `${clientHeader}\n;;;x;maybe\nCarlos;12345;invalido;;true`), admin);
    expect(result.invalidRows).toBe(2); expect(result.errors.map((error) => error.line)).toEqual([2, 3]);
    expect(result.errors[0]?.errors.map((error) => error.field)).toEqual(['name', 'document', 'email', 'phone', 'active']);
    expect(result.errors[1]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email', code: 'INVALID_EMAIL' })]));
  });

  it('CT015-018: detecta duplicidades de clientes em lote no arquivo e no banco', async () => {
    repository.existingClientEmails.add('banco@teste.com'); repository.existingClientDocuments.add('99999');
    const content = `${clientHeader}\nAna;11111;ana@teste.com;;true\nBia;11111;ANA@TESTE.COM;;true\nCaio;99999;banco@teste.com;;true`;
    const result = await service.validate(ImportType.CLIENTS, csv('clientes.csv', content), admin);
    expect(result).toMatchObject({ totalRows: 3, validRows: 1, invalidRows: 2 }); expect(repository.existingClientQueries).toBe(1);
    expect(result.errors[0]?.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['DUPLICATE_DOCUMENT_IN_FILE', 'DUPLICATE_EMAIL_IN_FILE']));
    expect(result.errors[1]?.errors.map((error) => error.code)).toEqual(expect.arrayContaining(['DOCUMENT_ALREADY_EXISTS', 'EMAIL_ALREADY_EXISTS']));
  });

  it('CT002, CT030 e CT063: valida produto, estoque zero e normaliza SKU', async () => {
    const validation = await service.validate(ImportType.PRODUCTS, csv('produtos.csv', `${productHeader}\nNotebook;note001;;5999.90;0;Informática;true`), admin);
    expect(validation.validRows).toBe(1); await service.execute(ImportType.PRODUCTS, csv('produtos.csv', `${productHeader}\nNotebook;note001;;5999.90;0;Informática;true`), admin, validation.jobId);
    expect(repository.products[0]).toMatchObject({ sku: 'NOTE001', stock: 0, price: '5999.90' });
  });

  it('Fase 12 CT031-035: resolve categoria por nome normalizado e mantém importação parcial', async () => {
    repository.categories.set('inativa', { id: '44444444-4444-4444-8444-444444444444', active: false });
    const content = `${productHeader}\nVálido;SKU-V;;10.00;1;  INFORMÁTICA  ;true\nAusente;SKU-A;;10.00;1;Nova Categoria;true\nInativo;SKU-I;;10.00;1;Inativa;true`;
    const validation = await service.validate(ImportType.PRODUCTS, csv('produtos.csv', content), admin);
    expect(validation).toMatchObject({ totalRows: 3, validRows: 1, invalidRows: 2 });
    expect(validation.errors.flatMap((row) => row.errors.map((error) => error.code))).toEqual(expect.arrayContaining(['CATEGORY_NOT_FOUND', 'CATEGORY_INACTIVE']));
    const result = await service.execute(ImportType.PRODUCTS, csv('produtos.csv', content), admin, validation.jobId);
    expect(result).toMatchObject({ imported: 1, rejected: 2 });
    expect(repository.products[0]).toMatchObject({ categoryId: '11111111-1111-4111-8111-111111111111' });
  });

  it('Fase 11 CT030: produto importado com saldo cria INITIAL_BALANCE na mesma execução', async () => {
    const registerInitialBalances = vi.fn().mockResolvedValue(1);
    service = new ImportService(repository, audit, { registerInitialBalances } as unknown as StockService);
    const file = csv('produtos.csv', `${productHeader}\nNotebook;note010;;5999.90;10;Informática;true`);
    const validation = await service.validate(ImportType.PRODUCTS, file, admin);
    const result = await service.execute(ImportType.PRODUCTS, file, admin, validation.jobId);
    expect(result.imported).toBe(1);
    expect(registerInitialBalances).toHaveBeenCalledWith(undefined, [expect.objectContaining({ stock: 10 })], admin.id);
  });

  it('CT021-029: rejeita campos, preço e estoque inválidos de produtos', async () => {
    const content = `${productHeader}\n;;;R$ 5.999,90;-1;;maybe\nProduto;SKU-2;;-1;1.5;Categoria;true`;
    const result = await service.validate(ImportType.PRODUCTS, csv('produtos.csv', content), admin);
    expect(result.invalidRows).toBe(2); const fields = result.errors.flatMap((row) => row.errors.map((error) => error.field));
    expect(fields).toEqual(expect.arrayContaining(['name', 'sku', 'price', 'stock', 'category', 'active']));
  });

  it('CT023-024: detecta SKU duplicado no banco e no arquivo com uma consulta em lote', async () => {
    repository.existingProductSkus.add('BANCO-1'); const content = `${productHeader}\nProduto A;SKU-1;;1.00;1;Cat;true\nProduto B;sku-1;;2.00;1;Cat;true\nProduto C;BANCO-1;;3.00;1;Cat;true`;
    const result = await service.validate(ImportType.PRODUCTS, csv('produtos.csv', content), admin);
    expect(result.validRows).toBe(1); expect(repository.existingProductQueries).toBe(1); expect(result.errors.flatMap((row) => row.errors.map((error) => error.code))).toEqual(expect.arrayContaining(['DUPLICATE_SKU_IN_FILE', 'SKU_ALREADY_EXISTS']));
  });

  it('CT031-033: valida sem persistir, revalida e importa apenas linhas válidas', async () => {
    const file = csv('clientes.csv', `${clientHeader}\nAna;11111;ana@teste.com;;true\nInválido;;email ruim;;true\nBia;22222;bia@teste.com;;false`);
    const validation = await service.validate(ImportType.CLIENTS, file, analyst); expect(repository.clients).toHaveLength(0);
    const result = await service.execute(ImportType.CLIENTS, file, analyst, validation.jobId);
    expect(result).toMatchObject({ totalRows: 3, imported: 2, rejected: 1 }); expect(repository.clients).toHaveLength(2); expect(repository.existingClientQueries).toBe(2);
  });

  it('CT034: detecta duplicidade criada entre validação e execução', async () => {
    const file = csv('produtos.csv', `${productHeader}\nProduto;RACE-1;;10.00;1;Cat;true`); const validation = await service.validate(ImportType.PRODUCTS, file, analyst);
    repository.existingProductSkus.add('RACE-1'); const result = await service.execute(ImportType.PRODUCTS, file, analyst, validation.jobId);
    expect(result).toMatchObject({ imported: 0, rejected: 1 }); expect(repository.products).toHaveLength(0);
  });

  it('CT039, CT043 e CT045: conclui o job e cria somente auditoria agregada sem o conteúdo do CSV', async () => {
    const file = csv('clientes.csv', `${clientHeader}\nAna;11111;ana@teste.com;;true`); const validation = await service.validate(ImportType.CLIENTS, file, admin);
    const result = await service.execute(ImportType.CLIENTS, file, admin, validation.jobId); const job = repository.jobs.get(result.jobId);
    expect(job).toMatchObject({ status: ImportStatus.COMPLETED, importedRows: 1 }); expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ entityType: AuditEntity.IMPORT, action: AuditAction.IMPORT, newData: { type: 'CLIENTS', fileName: 'clientes.csv', totalRows: 1, imported: 1, rejected: 0 } });
    expect(JSON.stringify(audit.entries[0])).not.toContain('ana@teste.com');
  });

  it('faz rollback dos registros e marca o job como FAILED quando a auditoria falha', async () => {
    const file = csv('clientes.csv', `${clientHeader}\nAna;11111;ana@teste.com;;true`); const validation = await service.validate(ImportType.CLIENTS, file, admin); audit.failLog = true;
    await expect(service.execute(ImportType.CLIENTS, file, admin, validation.jobId)).rejects.toThrow('auditoria indisponível');
    expect(repository.clients).toHaveLength(0); expect(repository.jobs.get(validation.jobId)?.status).toBe(ImportStatus.FAILED);
  });

  it('CT040-041: ADMIN lista tudo e ANALISTA somente suas importações', async () => {
    await service.validate(ImportType.CLIENTS, csv('a.csv', `${clientHeader}\nAna;11111;ana@teste.com;;true`), admin);
    await service.validate(ImportType.CLIENTS, csv('b.csv', `${clientHeader}\nBia;22222;bia@teste.com;;true`), analyst);
    expect((await service.list({ page: 1, pageSize: 20 }, admin)).pagination.total).toBe(2);
    expect((await service.list({ page: 1, pageSize: 20 }, analyst)).pagination.total).toBe(1);
  });

  it('gera templates UTF-8 com BOM, cabeçalhos e exemplos', () => {
    const clients = service.template(ImportType.CLIENTS); const products = service.template(ImportType.PRODUCTS);
    expect(clients.fileName).toBe('modelo_clientes.csv'); expect(clients.content.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf])); expect(clients.content.toString()).toContain(clientHeader); expect(clients.content.toString()).toContain('Carlos Silva');
    expect(products.fileName).toBe('modelo_produtos.csv'); expect(products.content.toString()).toContain(productHeader); expect(products.content.toString()).toContain('5999.90');
  });

  it.each([10, 100, 1000, 5000])('RF058-059: valida %i linhas com uma única consulta de duplicidade', async (size) => {
    const rows = Array.from({ length: size }, (_, index) => `Produto ${index};SKU-${String(index).padStart(5, '0')};;10.00;${index};Categoria;true`);
    const startedAt = performance.now(); const result = await service.validate(ImportType.PRODUCTS, csv(`produtos-${size}.csv`, `${productHeader}\n${rows.join('\n')}`), admin); const elapsed = performance.now() - startedAt;
    expect(result).toMatchObject({ totalRows: size, validRows: size, invalidRows: 0 }); expect(repository.existingProductQueries).toBe(1); expect(elapsed).toBeLessThan(10_000);
  });
});
