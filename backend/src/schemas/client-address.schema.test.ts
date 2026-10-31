import { AddressType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createClientAddressSchema, listClientAddressesQuerySchema, updateClientAddressSchema } from './client-address.schema.js';

const valid = { type: AddressType.RESIDENTIAL, zipCode: ' SW1A 1AA ', street: ' Rua das Flores ', number: '221B', complement: '', district: ' Centro ', city: ' Joinville ', state: ' Santa Catarina ', country: ' Brasil ', isPrimary: false };

describe('schemas de ClientAddress', () => {
  it('aceita código postal internacional e número alfanumérico, aplicando trim', () => {
    expect(createClientAddressSchema.parse(valid)).toMatchObject({ zipCode: 'SW1A 1AA', street: 'Rua das Flores', number: '221B', city: 'Joinville', complement: '' });
  });
  it.each([['street', ''], ['zipCode', ''], ['number', ''], ['city', ''], ['state', ''], ['country', '']])('rejeita campo obrigatório %s vazio', (field, value) => {
    expect(createClientAddressSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
  it('aceita complemento vazio/nulo na edição e rejeita atualização vazia', () => {
    expect(updateClientAddressSchema.parse({ complement: '' })).toEqual({ complement: null });
    expect(updateClientAddressSchema.safeParse({}).success).toBe(false);
  });
  it('normaliza paginação e filtros', () => {
    expect(listClientAddressesQuerySchema.parse({ type: 'COMMERCIAL', active: 'false', page: '2' })).toMatchObject({ type: 'COMMERCIAL', active: false, page: 2, pageSize: 10, sortBy: 'createdAt', sortOrder: 'desc' });
  });
});
