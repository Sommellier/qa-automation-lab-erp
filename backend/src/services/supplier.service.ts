import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { SupplierRepository } from '../repositories/supplier.repository.js';
import type { CreateSupplierInput, ListSuppliersQuery, UpdateSupplierInput, UpdateSupplierStatusInput } from '../schemas/supplier.schema.js';
import { buildAuditDiff, pickAuditFields, type AuditLogger } from './audit.service.js';

const fields = ['name', 'document', 'email', 'phone', 'contactName', 'active'] as const;
export class SupplierService {
  constructor(private readonly suppliers: SupplierRepository, private readonly audit: AuditLogger) {}
  async list(query: ListSuppliersQuery) {
    const { suppliers, total } = await this.suppliers.list(query);
    return { data: suppliers, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
  async getById(id: string, tx?: Prisma.TransactionClient) {
    const supplier = await this.suppliers.findById(id, tx);
    if (!supplier) throw new AppError('Fornecedor não encontrado.', 404, 'SUPPLIER_NOT_FOUND');
    return supplier;
  }
  async create(input: CreateSupplierInput, actor: string) {
    return this.audit.transaction(async (tx) => {
      await this.ensureUnique(input.email, input.document, undefined, tx);
      const created = await this.suppliers.create(input, tx);
      await this.audit.log({ userId: actor, entityType: AuditEntity.SUPPLIER, entityId: created.id,
        action: AuditAction.CREATE, newData: pickAuditFields(created, fields) }, tx);
      return created;
    });
  }
  async update(id: string, input: UpdateSupplierInput, actor: string) {
    return this.audit.transaction(async (tx) => {
      const current = await this.getById(id, tx);
      await this.ensureUnique(input.email, input.document, id, tx);
      const updated = await this.suppliers.update(id, input, tx);
      const diff = buildAuditDiff(current, updated, fields);
      if (Object.keys(diff.newData).length) await this.audit.log({ userId: actor, entityType: AuditEntity.SUPPLIER,
        entityId: id, action: AuditAction.UPDATE, ...diff }, tx);
      return updated;
    });
  }
  async updateStatus(id: string, input: UpdateSupplierStatusInput, actor: string) {
    return this.audit.transaction(async (tx) => {
      const current = await this.getById(id, tx);
      if (current.active === input.active) return current;
      const updated = await this.suppliers.update(id, { active: input.active }, tx);
      await this.audit.log({ userId: actor, entityType: AuditEntity.SUPPLIER, entityId: id,
        action: input.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        oldData: { active: current.active }, newData: { active: input.active } }, tx);
      return updated;
    });
  }
  private async ensureUnique(email?: string, document?: string, ignored?: string, tx?: Prisma.TransactionClient) {
    const [byEmail, byDocument] = await Promise.all([
      email ? this.suppliers.findByEmail(email, tx) : null,
      document ? this.suppliers.findByDocument(document, tx) : null,
    ]);
    if (byEmail && byEmail.id !== ignored) throw new AppError('Já existe um fornecedor com este e-mail.', 409, 'SUPPLIER_EMAIL_EXISTS');
    if (byDocument && byDocument.id !== ignored) throw new AppError('Já existe um fornecedor com este documento.', 409, 'SUPPLIER_DOCUMENT_EXISTS');
  }
}
