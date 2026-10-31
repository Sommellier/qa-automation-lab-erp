import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, type Client } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClientRepository } from '../repositories/client.repository.js';
import type { CreateClientData, ListClientsInput, ManagedClient, UpdateClientData } from '../types/client.js';
import { ClientService } from './client.service.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';

class InMemoryClients implements ClientRepository {
  private records: Client[] = [];

  seed(entries: Client[]): void { this.records = entries; }
  async findById(id: string): Promise<ManagedClient | null> { return this.records.find((item) => item.id === id) ?? null; }
  async findByEmail(email: string): Promise<ManagedClient | null> { return this.records.find((item) => item.email === email) ?? null; }
  async findByDocument(document: string): Promise<ManagedClient | null> { return this.records.find((item) => item.document === document) ?? null; }

  async list(input: ListClientsInput): Promise<{ clients: ManagedClient[]; total: number }> {
    const search = input.search?.toLowerCase();
    const filtered = this.records
      .filter((client) => !search || client.name.toLowerCase().includes(search)
        || client.document.toLowerCase().includes(search) || client.email.toLowerCase().includes(search))
      .filter((client) => input.active === undefined || client.active === input.active)
      .sort((left, right) => {
        const leftValue = left[input.sortBy];
        const rightValue = right[input.sortBy];
        const result = leftValue instanceof Date && rightValue instanceof Date
          ? leftValue.getTime() - rightValue.getTime()
          : String(leftValue).localeCompare(String(rightValue));
        return input.sortOrder === 'asc' ? result : -result;
      });
    const start = (input.page - 1) * input.pageSize;
    return { clients: filtered.slice(start, start + input.pageSize), total: filtered.length };
  }

  async create(data: CreateClientData): Promise<ManagedClient> {
    const now = new Date();
    const client: Client = {
      id: randomUUID(),
      name: data.name,
      document: data.document,
      email: data.email,
      phone: data.phone ?? null,
      active: data.active,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(client);
    return client;
  }

  async update(id: string, data: UpdateClientData & { active?: boolean }): Promise<ManagedClient> {
    const index = this.records.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Cliente não encontrado.');
    const current = this.records[index]!;
    const updated: Client = {
      ...current,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.document !== undefined ? { document: data.document } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    };
    this.records[index] = updated;
    return updated;
  }
}

describe('ClientService', () => {
  let repository: InMemoryClients;
  let service: ClientService;
  let carlosId: string;
  let mariaId: string;
  let actorId: string;
  let audit: RecordingAuditLogger;

  beforeEach(() => {
    repository = new InMemoryClients();
    audit = new RecordingAuditLogger();
    service = new ClientService(repository, audit);
    carlosId = randomUUID();
    mariaId = randomUUID();
    actorId = randomUUID();
    const now = new Date('2026-09-26T12:00:00.000Z');
    repository.seed([
      { id: carlosId, name: 'Carlos Silva', document: '12345678900', email: 'carlos@empresa.com', phone: '47999999999', active: true, createdAt: now, updatedAt: now },
      { id: mariaId, name: 'Maria Souza', document: '98765432100', email: 'maria@empresa.com', phone: null, active: false, createdAt: now, updatedAt: now },
    ]);
  });

  it('cria cliente e normaliza os dados recebidos pelo schema', async () => {
    const created = await service.create({ name: 'Ana Pereira', document: 'CLIENTE-ANA', email: 'ana@empresa.com', active: true }, actorId);
    expect(created).toMatchObject({ name: 'Ana Pereira', active: true, phone: null });
    expect(audit.entries).toContainEqual(expect.objectContaining({ userId: actorId, entityType: AuditEntity.CLIENT, entityId: created.id, action: AuditAction.CREATE }));
  });

  it('rejeita e-mail e documento duplicados com conflito', async () => {
    await expect(service.create({ name: 'Outro', document: 'NOVO-001', email: 'carlos@empresa.com', active: true }, actorId))
      .rejects.toMatchObject({ statusCode: 409, code: 'CLIENT_EMAIL_ALREADY_EXISTS' });
    await expect(service.create({ name: 'Outro', document: '12345678900', email: 'outro@empresa.com', active: true }, actorId))
      .rejects.toMatchObject({ statusCode: 409, code: 'CLIENT_DOCUMENT_ALREADY_EXISTS' });
  });

  it('edita os dados cadastrais sem misturar a operação de status', async () => {
    const updated = await service.update(carlosId, { name: 'Carlos Atualizado', phone: null }, actorId);
    expect(updated).toMatchObject({ name: 'Carlos Atualizado', active: true, phone: null });
    expect(audit.entries[0]).toMatchObject({ action: AuditAction.UPDATE, oldData: { name: 'Carlos Silva', phone: '47999999999' }, newData: { name: 'Carlos Atualizado', phone: null } });
  });

  it('inativa e reativa por operação separada', async () => {
    expect(await service.updateStatus(carlosId, { active: false }, actorId)).toMatchObject({ active: false });
    expect(await service.updateStatus(carlosId, { active: true }, actorId)).toMatchObject({ active: true });
    expect(audit.entries.map((entry) => entry.action)).toEqual([AuditAction.DEACTIVATE, AuditAction.ACTIVATE]);
  });

  it.each(['Carlos', '123456', 'carlos@empresa'])('pesquisa parcialmente por %s', async (search) => {
    const result = await service.list({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', search });
    expect(result.data.map((client) => client.id)).toEqual([carlosId]);
  });

  it('filtra status, ordena e pagina no padrão existente', async () => {
    const inactive = await service.list({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', active: false });
    const page = await service.list({ page: 2, pageSize: 1, sortBy: 'email', sortOrder: 'asc' });
    expect(inactive.data.map((client) => client.id)).toEqual([mariaId]);
    expect(page.pagination).toEqual({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
    expect(page.data).toHaveLength(1);
  });

  it('retorna 404 para cliente inexistente', async () => {
    await expect(service.getById(randomUUID())).rejects.toMatchObject({
      statusCode: 404,
      code: 'CLIENT_NOT_FOUND',
      message: 'Cliente não encontrado.',
    });
  });
});
