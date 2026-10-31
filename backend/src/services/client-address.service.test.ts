import { randomUUID } from 'node:crypto';
import { AddressType, AuditAction, AuditEntity, type Client } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClientAddressRepository } from '../repositories/client-address.repository.js';
import type { ClientRepository } from '../repositories/client.repository.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';
import type { CreateClientAddressData, ListClientAddressesInput, ManagedClientAddress, UpdateClientAddressData } from '../types/client-address.js';
import type { CreateClientData, ListClientsInput, ManagedClient, UpdateClientData } from '../types/client.js';
import { ClientAddressService } from './client-address.service.js';

class Clients implements ClientRepository {
  records: Client[] = [];
  async findById(id: string) { return this.records.find((item) => item.id === id) ?? null; }
  async findByEmail(email: string) { return this.records.find((item) => item.email === email) ?? null; }
  async findByDocument(document: string) { return this.records.find((item) => item.document === document) ?? null; }
  async list(_input: ListClientsInput) { return { clients: this.records, total: this.records.length }; }
  async create(_data: CreateClientData): Promise<ManagedClient> { throw new Error('not used'); }
  async update(_id: string, _data: UpdateClientData & { active?: boolean }): Promise<ManagedClient> { throw new Error('not used'); }
}

class Addresses implements ClientAddressRepository {
  records: ManagedClientAddress[] = [];
  async lockClient() {}
  async list(clientId: string, input: ListClientAddressesInput) {
    const all = this.records.filter((item) => item.clientId === clientId)
      .filter((item) => input.active === undefined || item.active === input.active)
      .filter((item) => !input.type || item.type === input.type)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.createdAt.getTime() - a.createdAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { addresses: all.slice(start, start + input.pageSize), total: all.length };
  }
  async findByClientAndId(clientId: string, id: string) { return this.records.find((item) => item.clientId === clientId && item.id === id) ?? null; }
  async findActivePrimary(clientId: string) { return this.records.find((item) => item.clientId === clientId && item.active && item.isPrimary) ?? null; }
  async countActive(clientId: string, excludedId?: string) { return this.records.filter((item) => item.clientId === clientId && item.active && item.id !== excludedId).length; }
  async create(data: CreateClientAddressData) { const now = new Date(); const row = { id: randomUUID(), ...data, complement: data.complement ?? null, createdAt: now, updatedAt: now }; this.records.push(row); return row; }
  async update(id: string, data: UpdateClientAddressData) { const index = this.records.findIndex((item) => item.id === id); const current = this.records[index]!; const row: ManagedClientAddress = { ...current, ...(data.type !== undefined ? { type: data.type } : {}), ...(data.zipCode !== undefined ? { zipCode: data.zipCode } : {}), ...(data.street !== undefined ? { street: data.street } : {}), ...(data.number !== undefined ? { number: data.number } : {}), ...(data.complement !== undefined ? { complement: data.complement } : {}), ...(data.district !== undefined ? { district: data.district } : {}), ...(data.city !== undefined ? { city: data.city } : {}), ...(data.state !== undefined ? { state: data.state } : {}), ...(data.country !== undefined ? { country: data.country } : {}), ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}), ...(data.active !== undefined ? { active: data.active } : {}), updatedAt: new Date() }; this.records[index] = row; return row; }
  async clearPrimary(clientId: string, excludedId?: string) { this.records = this.records.map((item) => item.clientId === clientId && item.id !== excludedId ? { ...item, isPrimary: false } : item); }
}

const input = { type: AddressType.RESIDENTIAL, zipCode: '89200-000', street: 'Rua das Flores', number: '221B', district: 'Centro', city: 'Joinville', state: 'SC', country: 'Brasil', isPrimary: false };

describe('ClientAddressService', () => {
  let clients: Clients; let addresses: Addresses; let audit: RecordingAuditLogger; let service: ClientAddressService; let clientId: string; let actorId: string;
  beforeEach(() => {
    clients = new Clients(); addresses = new Addresses(); audit = new RecordingAuditLogger(); service = new ClientAddressService(addresses, clients, audit);
    clientId = randomUUID(); actorId = randomUUID(); const now = new Date();
    clients.records = [{ id: clientId, name: 'Carlos', document: 'DOC-1', email: 'carlos@example.com', phone: null, active: true, createdAt: now, updatedAt: now }];
  });

  it('torna o primeiro endereço principal mesmo quando recebe false e audita CREATE', async () => {
    const created = await service.create(clientId, input, actorId);
    expect(created.isPrimary).toBe(true);
    expect(audit.entries).toContainEqual(expect.objectContaining({ entityType: AuditEntity.CLIENT_ADDRESS, action: AuditAction.CREATE, entityId: created.id }));
  });

  it('cria segundo endereço e promove em transação lógica, deixando somente um principal', async () => {
    const first = await service.create(clientId, input, actorId);
    const second = await service.create(clientId, { ...input, type: AddressType.COMMERCIAL, street: 'Avenida B', isPrimary: false }, actorId);
    expect(second.isPrimary).toBe(false);
    await service.setPrimary(clientId, second.id, actorId);
    expect(addresses.records.filter((item) => item.isPrimary && item.active)).toHaveLength(1);
    expect(addresses.records.find((item) => item.id === first.id)?.isPrimary).toBe(false);
    expect(audit.entries.at(-1)?.action).toBe(AuditAction.PRIMARY_CHANGE);
  });

  it('edita dados, aceita complemento vazio normalizado e audita UPDATE', async () => {
    const created = await service.create(clientId, input, actorId);
    const updated = await service.update(clientId, created.id, { city: 'Curitiba', complement: null }, actorId);
    expect(updated).toMatchObject({ city: 'Curitiba', complement: null });
    expect(audit.entries.at(-1)?.action).toBe(AuditAction.UPDATE);
  });

  it('impede inativar principal quando existe outro ativo', async () => {
    const primary = await service.create(clientId, input, actorId);
    await service.create(clientId, { ...input, street: 'Rua B' }, actorId);
    await expect(service.updateStatus(clientId, primary.id, { active: false }, actorId)).rejects.toMatchObject({ code: 'PRIMARY_ADDRESS_DEACTIVATION_BLOCKED' });
  });

  it('permite inativar único endereço e o torna principal ao reativar', async () => {
    const address = await service.create(clientId, input, actorId);
    expect(await service.updateStatus(clientId, address.id, { active: false }, actorId)).toMatchObject({ active: false, isPrimary: false });
    expect(await service.updateStatus(clientId, address.id, { active: true }, actorId)).toMatchObject({ active: true, isPrimary: true });
    expect(audit.entries.map((entry) => entry.action)).toContain(AuditAction.DEACTIVATE);
    expect(audit.entries.map((entry) => entry.action)).toContain(AuditAction.ACTIVATE);
  });

  it('rejeita endereço inativo como principal e vínculo com outro cliente', async () => {
    const address = await service.create(clientId, input, actorId);
    await service.updateStatus(clientId, address.id, { active: false }, actorId);
    await expect(service.setPrimary(clientId, address.id, actorId)).rejects.toMatchObject({ code: 'INACTIVE_ADDRESS_PRIMARY' });
    await expect(service.getById(randomUUID(), address.id)).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    const otherClientId = randomUUID(); const now = new Date(); clients.records.push({ ...clients.records[0]!, id: otherClientId, document: 'DOC-2', email: 'other@example.com', createdAt: now, updatedAt: now });
    await expect(service.getById(otherClientId, address.id)).rejects.toMatchObject({ code: 'CLIENT_ADDRESS_NOT_FOUND' });
  });

  it('permite consulta e bloqueia mutação de cliente inativo', async () => {
    clients.records[0]!.active = false;
    await expect(service.list(clientId, { page: 1, pageSize: 10, sortBy: 'createdAt', sortOrder: 'desc' })).resolves.toMatchObject({ data: [] });
    await expect(service.create(clientId, input, actorId)).rejects.toMatchObject({ code: 'INACTIVE_CLIENT_ADDRESS_CHANGE' });
  });

  it('pagina e mantém principal primeiro', async () => {
    await service.create(clientId, input, actorId); await service.create(clientId, { ...input, street: 'Rua B' }, actorId);
    const result = await service.list(clientId, { page: 1, pageSize: 1, sortBy: 'createdAt', sortOrder: 'desc' });
    expect(result.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
    expect(result.data[0]?.isPrimary).toBe(true);
  });
});
