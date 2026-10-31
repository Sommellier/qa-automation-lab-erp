import { randomUUID } from 'node:crypto';
import { AddressType } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../config/prisma.js';
import { PrismaClientAddressRepository } from '../repositories/client-address.repository.js';
import { PrismaClientRepository } from '../repositories/client.repository.js';
import { auditLogger } from './audit.service.js';
import { ClientAddressService } from './client-address.service.js';

const run = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;
run('ClientAddress concorrência real com PostgreSQL', () => {
  const clientId = randomUUID(); const firstId = randomUUID(); const secondId = randomUUID(); let actorId = '';
  const service = new ClientAddressService(new PrismaClientAddressRepository(), new PrismaClientRepository(), auditLogger);
  beforeAll(async () => {
    actorId = (await prisma.user.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
    await prisma.client.create({ data: { id: clientId, name: 'Cliente Concorrência', document: `CONC-${clientId}`, email: `${clientId}@example.test`, active: true } });
    const common = { clientId, type: AddressType.RESIDENTIAL, zipCode: '12345', number: '10', district: 'Centro', city: 'Miami', state: 'FL', country: 'Estados Unidos', active: true };
    await prisma.clientAddress.createMany({ data: [{ id: firstId, ...common, street: 'Rua A', isPrimary: true }, { id: secondId, ...common, street: 'Rua B', isPrimary: false }] });
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [firstId, secondId] } } });
    await prisma.clientAddress.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
  });
  it('duas promoções simultâneas terminam com exatamente um principal ativo', async () => {
    const results = await Promise.allSettled([service.setPrimary(clientId, secondId, actorId), service.setPrimary(clientId, firstId, actorId)]);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([]);
    expect(await prisma.clientAddress.count({ where: { clientId, active: true, isPrimary: true } })).toBe(1);
  });
  it('constraint parcial rejeita dois principais ativos fora do service', async () => {
    const current = await prisma.clientAddress.findFirstOrThrow({ where: { clientId, isPrimary: true }, select: { id: true } });
    const otherId = current.id === firstId ? secondId : firstId;
    await expect(prisma.clientAddress.update({ where: { id: otherId }, data: { isPrimary: true } })).rejects.toMatchObject({ code: 'P2002' });
  });
});
