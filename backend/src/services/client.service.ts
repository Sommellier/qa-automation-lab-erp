import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { ClientRepository } from '../repositories/client.repository.js';
import type {
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
  UpdateClientStatusInput,
} from '../schemas/client.schema.js';
import type { ManagedClient } from '../types/client.js';
import { buildAuditDiff, noopAuditLogger, pickAuditFields, type AuditLogger, type AuditTransaction } from './audit.service.js';

const DUPLICATE_EMAIL_MESSAGE = 'Já existe um cliente cadastrado com este e-mail.';
const DUPLICATE_DOCUMENT_MESSAGE = 'Já existe um cliente cadastrado com este documento.';
const AUDIT_FIELDS = ['name', 'document', 'email', 'phone', 'active'] as const;

interface PaginatedClients {
  data: ManagedClient[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

function uniqueTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

export class ClientService {
  constructor(private readonly clients: ClientRepository, private readonly audit: AuditLogger = noopAuditLogger) {}

  async list(query: ListClientsQuery): Promise<PaginatedClients> {
    const { clients, total } = await this.clients.list(query);
    return {
      data: clients,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getById(id: string, transaction?: AuditTransaction): Promise<ManagedClient> {
    const client = await this.clients.findById(id, transaction);
    if (!client) throw new AppError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND');
    return client;
  }

  async create(input: CreateClientInput, actorUserId: string): Promise<ManagedClient> {
    try {
      return await this.audit.transaction(async (transaction) => {
        await this.ensureUnique(input.email, input.document, undefined, transaction);
        const created = await this.clients.create(input, transaction);
        await this.audit.log({
          userId: actorUserId, entityType: AuditEntity.CLIENT, entityId: created.id,
          action: AuditAction.CREATE, newData: pickAuditFields(created, AUDIT_FIELDS),
        }, transaction);
        return created;
      });
    } catch (error: unknown) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async update(id: string, input: UpdateClientInput, actorUserId: string): Promise<ManagedClient> {
    try {
      return await this.audit.transaction(async (transaction) => {
        const current = await this.getById(id, transaction);
        await this.ensureUnique(input.email, input.document, current.id, transaction);
        const updated = await this.clients.update(id, input, transaction);
        const diff = buildAuditDiff(current, updated, AUDIT_FIELDS);
        if (Object.keys(diff.newData).length > 0) {
          await this.audit.log({ userId: actorUserId, entityType: AuditEntity.CLIENT, entityId: id,
            action: AuditAction.UPDATE, ...diff }, transaction);
        }
        return updated;
      });
    } catch (error: unknown) {
      this.handleUniqueConstraint(error);
      throw error;
    }
  }

  async updateStatus(id: string, input: UpdateClientStatusInput, actorUserId: string): Promise<ManagedClient> {
    return this.audit.transaction(async (transaction) => {
      const current = await this.getById(id, transaction);
      if (current.active === input.active) return current;
      const updated = await this.clients.update(id, { active: input.active }, transaction);
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.CLIENT, entityId: id,
        action: updated.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        oldData: { active: current.active }, newData: { active: updated.active } }, transaction);
      return updated;
    });
  }

  private async ensureUnique(email?: string, document?: string, ignoredId?: string, transaction?: AuditTransaction): Promise<void> {
    if (email) {
      const owner = await this.clients.findByEmail(email, transaction);
      if (owner && owner.id !== ignoredId) {
        throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409, 'CLIENT_EMAIL_ALREADY_EXISTS');
      }
    }

    if (document) {
      const owner = await this.clients.findByDocument(document, transaction);
      if (owner && owner.id !== ignoredId) {
        throw new AppError(DUPLICATE_DOCUMENT_MESSAGE, 409, 'CLIENT_DOCUMENT_ALREADY_EXISTS');
      }
    }
  }

  private handleUniqueConstraint(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return;
    if (uniqueTarget(error).includes('document')) {
      throw new AppError(DUPLICATE_DOCUMENT_MESSAGE, 409, 'CLIENT_DOCUMENT_ALREADY_EXISTS');
    }
    throw new AppError(DUPLICATE_EMAIL_MESSAGE, 409, 'CLIENT_EMAIL_ALREADY_EXISTS');
  }
}
