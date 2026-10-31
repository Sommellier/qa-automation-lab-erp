import { describe, expect, it } from 'vitest';
import {
  clientIdSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from './client.schema.js';

describe('schemas de cliente', () => {
  it('valida campos obrigatórios com mensagens de domínio', () => {
    const result = createClientSchema.safeParse({ name: '', document: '', email: '', active: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
        'Nome é obrigatório.',
        'Documento é obrigatório.',
        'E-mail é obrigatório.',
      ]));
    }
  });

  it('rejeita documento com tamanho ou caracteres inválidos', () => {
    expect(createClientSchema.safeParse({ name: 'Cliente', document: '12', email: 'cliente@empresa.com' }).success).toBe(false);
    expect(createClientSchema.safeParse({ name: 'Cliente', document: 'ABC@123', email: 'cliente@empresa.com' }).success).toBe(false);
  });

  it('valida telefone somente quando preenchido', () => {
    expect(createClientSchema.safeParse({ name: 'Cliente', document: 'ABC-123', email: 'cliente@empresa.com', phone: '' }).success).toBe(true);
    expect(createClientSchema.safeParse({ name: 'Cliente', document: 'ABC-123', email: 'cliente@empresa.com', phone: 'telefone' }).success).toBe(false);
  });

  it('rejeita status na edição e corpo vazio', () => {
    expect(updateClientSchema.safeParse({ active: false }).success).toBe(false);
    expect(updateClientSchema.safeParse({}).success).toBe(false);
  });

  it('rejeita ID e ordenação arbitrários e normaliza query', () => {
    expect(clientIdSchema.safeParse('id-invalido').success).toBe(false);
    expect(listClientsQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false);
    expect(listClientsQuerySchema.parse({ page: '2', pageSize: '20', active: 'false' })).toMatchObject({
      page: 2,
      pageSize: 20,
      active: false,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });
});
