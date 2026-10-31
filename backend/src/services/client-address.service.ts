import { AuditAction, AuditEntity, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { ClientAddressRepository } from '../repositories/client-address.repository.js';
import type { ClientRepository } from '../repositories/client.repository.js';
import type { CreateClientAddressInput, ListClientAddressesQuery, UpdateClientAddressInput, UpdateClientAddressStatusInput } from '../schemas/client-address.schema.js';
import type { ManagedClientAddress, UpdateClientAddressData } from '../types/client-address.js';
import { buildAuditDiff, noopAuditLogger, pickAuditFields, type AuditLogger, type AuditTransaction } from './audit.service.js';

const ADDRESS_NOT_FOUND = 'Endereço não encontrado para este cliente.';
const INACTIVE_CLIENT = 'Não é possível alterar endereços de um cliente inativo.';
const INACTIVE_PRIMARY = 'Um endereço inativo não pode ser definido como principal.';
const PRIMARY_DEACTIVATION = 'Este endereço é o principal. Defina outro endereço como principal antes de inativá-lo.';
const AUDIT_FIELDS = ['clientId', 'type', 'zipCode', 'street', 'number', 'complement', 'district', 'city', 'state', 'country', 'isPrimary', 'active'] as const;

interface PaginatedAddresses {
  data: ManagedClientAddress[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export class ClientAddressService {
  constructor(
    private readonly addresses: ClientAddressRepository,
    private readonly clients: ClientRepository,
    private readonly audit: AuditLogger = noopAuditLogger,
  ) {}

  async list(clientId: string, query: ListClientAddressesQuery): Promise<PaginatedAddresses> {
    await this.getClient(clientId);
    const { addresses, total } = await this.addresses.list(clientId, query);
    return { data: addresses, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(clientId: string, addressId: string): Promise<ManagedClientAddress> {
    await this.getClient(clientId);
    return this.getAddress(clientId, addressId);
  }

  async create(clientId: string, input: CreateClientAddressInput, actorUserId: string): Promise<ManagedClientAddress> {
    return this.handlePrimaryConflict(() => this.audit.transaction(async (transaction) => {
      await this.addresses.lockClient(clientId, transaction);
      await this.ensureClientMutable(clientId, transaction);
      const activeCount = await this.addresses.countActive(clientId, undefined, transaction);
      const isPrimary = activeCount === 0 || input.isPrimary;
      if (isPrimary) await this.addresses.clearPrimary(clientId, undefined, transaction);
      const created = await this.addresses.create({
        clientId, type: input.type, zipCode: input.zipCode, street: input.street, number: input.number,
        ...(input.complement ? { complement: input.complement } : {}), district: input.district,
        city: input.city, state: input.state, country: input.country, isPrimary, active: true,
      }, transaction);
      await this.audit.log({
        userId: actorUserId, entityType: AuditEntity.CLIENT_ADDRESS, entityId: created.id,
        action: AuditAction.CREATE, newData: pickAuditFields(created, AUDIT_FIELDS),
      }, transaction);
      return created;
    }));
  }

  async update(clientId: string, addressId: string, input: UpdateClientAddressInput, actorUserId: string): Promise<ManagedClientAddress> {
    return this.handlePrimaryConflict(() => this.audit.transaction(async (transaction) => {
      await this.addresses.lockClient(clientId, transaction);
      await this.ensureClientMutable(clientId, transaction);
      const current = await this.getAddress(clientId, addressId, transaction);
      if (input.isPrimary === true && !current.active) throw new AppError(INACTIVE_PRIMARY, 409, 'INACTIVE_ADDRESS_PRIMARY');
      if (input.isPrimary === false && current.isPrimary) {
        throw new AppError('Defina outro endereço como principal antes de remover o principal atual.', 409, 'PRIMARY_ADDRESS_REQUIRED');
      }

      const data: UpdateClientAddressData = {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.zipCode !== undefined ? { zipCode: input.zipCode } : {}),
        ...(input.street !== undefined ? { street: input.street } : {}),
        ...(input.number !== undefined ? { number: input.number } : {}),
        ...(input.complement !== undefined ? { complement: input.complement } : {}),
        ...(input.district !== undefined ? { district: input.district } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
      };

      let updated = Object.keys(data).length > 0 ? await this.addresses.update(addressId, data, transaction) : current;
      const diff = buildAuditDiff(current, updated, AUDIT_FIELDS);
      if (Object.keys(diff.newData).length > 0) {
        await this.audit.log({ userId: actorUserId, entityType: AuditEntity.CLIENT_ADDRESS, entityId: addressId,
          action: AuditAction.UPDATE, ...diff }, transaction);
      }

      if (input.isPrimary === true && !current.isPrimary) {
        updated = await this.promote(clientId, updated, actorUserId, transaction);
      }
      return updated;
    }));
  }

  async updateStatus(clientId: string, addressId: string, input: UpdateClientAddressStatusInput, actorUserId: string): Promise<ManagedClientAddress> {
    return this.handlePrimaryConflict(() => this.audit.transaction(async (transaction) => {
      await this.addresses.lockClient(clientId, transaction);
      await this.ensureClientMutable(clientId, transaction);
      const current = await this.getAddress(clientId, addressId, transaction);
      if (current.active === input.active) return current;

      let isPrimary = current.isPrimary;
      if (!input.active && current.isPrimary) {
        if (await this.addresses.countActive(clientId, addressId, transaction) > 0) {
          throw new AppError(PRIMARY_DEACTIVATION, 409, 'PRIMARY_ADDRESS_DEACTIVATION_BLOCKED');
        }
        isPrimary = false;
      } else if (input.active) {
        isPrimary = !(await this.addresses.findActivePrimary(clientId, transaction));
      }

      const updated = await this.addresses.update(addressId, { active: input.active, isPrimary }, transaction);
      await this.audit.log({
        userId: actorUserId, entityType: AuditEntity.CLIENT_ADDRESS, entityId: addressId,
        action: input.active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        oldData: { clientId, active: current.active, isPrimary: current.isPrimary },
        newData: { clientId, active: updated.active, isPrimary: updated.isPrimary },
      }, transaction);
      return updated;
    }));
  }

  async setPrimary(clientId: string, addressId: string, actorUserId: string): Promise<ManagedClientAddress> {
    return this.handlePrimaryConflict(() => this.audit.transaction(async (transaction) => {
      await this.addresses.lockClient(clientId, transaction);
      await this.ensureClientMutable(clientId, transaction);
      const current = await this.getAddress(clientId, addressId, transaction);
      if (!current.active) throw new AppError(INACTIVE_PRIMARY, 409, 'INACTIVE_ADDRESS_PRIMARY');
      if (current.isPrimary) return current;
      return this.promote(clientId, current, actorUserId, transaction);
    }));
  }

  private async promote(clientId: string, address: ManagedClientAddress, actorUserId: string, transaction: AuditTransaction): Promise<ManagedClientAddress> {
    const previous = await this.addresses.findActivePrimary(clientId, transaction);
    await this.addresses.clearPrimary(clientId, address.id, transaction);
    const updated = await this.addresses.update(address.id, { isPrimary: true }, transaction);
    await this.audit.log({
      userId: actorUserId, entityType: AuditEntity.CLIENT_ADDRESS, entityId: address.id,
      action: AuditAction.PRIMARY_CHANGE,
      oldData: { clientId, addressId: previous?.id ?? null, isPrimary: Boolean(previous) },
      newData: { clientId, addressId: address.id, isPrimary: true },
    }, transaction);
    return updated;
  }

  private async getClient(clientId: string, transaction?: AuditTransaction) {
    const client = await this.clients.findById(clientId, transaction);
    if (!client) throw new AppError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND');
    return client;
  }

  private async ensureClientMutable(clientId: string, transaction?: AuditTransaction): Promise<void> {
    const client = await this.getClient(clientId, transaction);
    if (!client.active) throw new AppError(INACTIVE_CLIENT, 409, 'INACTIVE_CLIENT_ADDRESS_CHANGE');
  }

  private async getAddress(clientId: string, addressId: string, transaction?: AuditTransaction): Promise<ManagedClientAddress> {
    const address = await this.addresses.findByClientAndId(clientId, addressId, transaction);
    if (!address) throw new AppError(ADDRESS_NOT_FOUND, 404, 'CLIENT_ADDRESS_NOT_FOUND');
    return address;
  }

  private async handlePrimaryConflict<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('Outro endereço já foi definido como principal. Atualize a página e tente novamente.', 409, 'PRIMARY_ADDRESS_CONFLICT');
      }
      throw error;
    }
  }
}
