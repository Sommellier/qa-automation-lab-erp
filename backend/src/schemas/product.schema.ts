import { z } from 'zod';
import { PRODUCT_SORT_FIELDS } from '../types/product.js';
import { cleanCategoryName } from '../utils/category-name.js';

const nameSchema = z.string().trim().min(1, 'Nome é obrigatório.').min(2, 'Nome deve ter pelo menos 2 caracteres.')
  .max(120, 'Nome deve ter no máximo 120 caracteres.');
const skuSchema = z.string().trim().min(1, 'SKU é obrigatório.').transform((sku) => sku.toUpperCase())
  .pipe(z.string().min(3, 'SKU deve ter pelo menos 3 caracteres.').max(40, 'SKU deve ter no máximo 40 caracteres.')
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'SKU deve conter apenas letras, números e hífen.'));
const categoryIdSchema = z.uuid('Categoria é obrigatória.');
const importedCategorySchema = z.string().transform(cleanCategoryName)
  .pipe(z.string().min(1, 'Categoria é obrigatória.').max(80, 'Categoria deve ter no máximo 80 caracteres.'));
const descriptionSchema = z.string().trim().max(1000, 'Descrição deve ter no máximo 1000 caracteres.');

const priceSchema = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : '';
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized)) {
    context.addIssue({ code: 'custom', message: 'Informe um preço válido.' });
    return z.NEVER;
  }
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer}.${decimals.padEnd(2, '0')}`;
});

const stockSchema = z.number({ error: 'Informe uma quantidade de estoque válida.' })
  .int('Informe uma quantidade de estoque válida.')
  .min(0, 'Informe uma quantidade de estoque válida.');

export const productIdSchema = z.uuid('ID de produto inválido.');

export const listProductsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: z.uuid('Categoria inválida.').optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1.').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'O tamanho da página deve ser no máximo 100.').default(10),
  sortBy: z.enum(PRODUCT_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const createProductSchema = z.object({
  name: nameSchema,
  sku: skuSchema,
  description: z.union([z.literal('').transform(() => undefined), descriptionSchema]).optional(),
  price: priceSchema,
  stock: stockSchema,
  categoryId: categoryIdSchema,
  active: z.boolean().default(true),
});

export const updateProductSchema = z.object({
  name: nameSchema.optional(),
  sku: skuSchema.optional(),
  description: z.union([z.literal('').transform(() => null), descriptionSchema, z.null()]).optional(),
  price: priceSchema.optional(),
  categoryId: categoryIdSchema.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualização.');

export const updateProductStatusSchema = z.object({ active: z.boolean({ error: 'Status é obrigatório.' }) });

export const importProductRowSchema = z.object({
  name: nameSchema,
  sku: skuSchema,
  description: z.union([z.literal('').transform(() => undefined), descriptionSchema]).optional(),
  price: priceSchema,
  stock: stockSchema,
  category: importedCategorySchema,
  active: z.boolean().default(true),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UpdateProductStatusInput = z.infer<typeof updateProductStatusSchema>;
export type ImportProductRowInput = z.infer<typeof importProductRowSchema>;
