import { describe, expect, it } from 'vitest';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from './product.schema.js';

const valid = { name: 'Notebook Pro', sku: 'note001', price: '5999.90', stock: 10, categoryId: '11111111-1111-4111-8111-111111111111', active: true };

describe('schemas de produto', () => {
  it('normaliza SKU e preço sem usar Float', () => {
    const result = createProductSchema.parse(valid);
    expect(result.sku).toBe('NOTE001');
    expect(result.price).toBe('5999.90');
  });
  it.each([-1, 'abc', Number.NaN, Number.POSITIVE_INFINITY])('rejeita preço inválido %s', (price) => {
    const result = createProductSchema.safeParse({ ...valid, price });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Informe um preço válido.');
  });
  it('aceita preço zero e completa duas casas', () => {
    expect(createProductSchema.parse({ ...valid, price: '0' }).price).toBe('0.00');
  });
  it.each([-1, 2.5, '10'])('rejeita estoque inválido %s', (stock) => {
    expect(createProductSchema.safeParse({ ...valid, stock }).success).toBe(false);
  });
  it('aceita estoque zero sem alterar o status', () => {
    expect(createProductSchema.parse({ ...valid, stock: 0 })).toMatchObject({ stock: 0, active: true });
  });
  it('normaliza descrição vazia na criação e na edição', () => {
    expect(createProductSchema.parse({ ...valid, description: '' }).description).toBeUndefined();
    expect(updateProductSchema.parse({ description: '' }).description).toBeNull();
  });
  it('rejeita status na edição e ordenação arbitrária', () => {
    expect(updateProductSchema.safeParse({ active: false }).success).toBe(false);
    expect(listProductsQuerySchema.safeParse({ sortBy: 'description' }).success).toBe(false);
  });
  it('CT029: rejeita explicitamente alteração direta de estoque', () => {
    expect(updateProductSchema.safeParse({ stock: 20 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ name: 'Notebook', stock: 20 }).success).toBe(false);
  });
});
