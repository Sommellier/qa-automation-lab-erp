import { describe, expect, it } from 'vitest';
import { createSupplierSchema, updateSupplierSchema } from './supplier.schema.js';

describe('schemas de fornecedores', () => {
  it('normaliza e-mail e aceita campos opcionais vazios', () => {
    expect(createSupplierSchema.parse({ name: 'Fornecedor Teste', document: 'DOC-12345', email: 'COMPRAS@TESTE.COM', phone: '', contactName: '', active: true }))
      .toEqual({ name: 'Fornecedor Teste', document: 'DOC-12345', email: 'compras@teste.com', phone: undefined, contactName: undefined, active: true });
  });
  it('impede atualização vazia', () => expect(updateSupplierSchema.safeParse({}).success).toBe(false));
});
