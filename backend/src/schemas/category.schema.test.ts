import { describe, expect, it } from 'vitest';
import { createCategorySchema, listCategoriesQuerySchema, updateCategorySchema } from './category.schema.js';

describe('schemas de categoria', () => {
  it('normaliza bordas e espaços internos preservando acentos', () => {
    expect(createCategorySchema.parse({ name: '  Informática   e Acessórios  ' })).toMatchObject({ name: 'Informática e Acessórios', active: true });
  });
  it('rejeita nome ausente, curto ou longo', () => {
    expect(createCategorySchema.safeParse({ name: '' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'A'.repeat(81) }).success).toBe(false);
  });
  it('limita descrição e mantém status fora da edição comum', () => {
    expect(createCategorySchema.safeParse({ name: 'Válida', description: 'x'.repeat(501) }).success).toBe(false);
    expect(updateCategorySchema.safeParse({ active: false }).success).toBe(false);
  });
  it('aplica paginação e ordenação segura', () => {
    expect(listCategoriesQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc' });
    expect(listCategoriesQuerySchema.safeParse({ sortBy: 'productCount' }).success).toBe(false);
  });
});
