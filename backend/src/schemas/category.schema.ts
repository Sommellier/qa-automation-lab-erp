import { z } from 'zod';
import { CATEGORY_SORT_FIELDS } from '../types/category.js';
import { cleanCategoryName } from '../utils/category-name.js';

const nameSchema = z.string().transform(cleanCategoryName)
  .pipe(z.string().min(1, 'Nome da categoria é obrigatório.')
    .min(2, 'Nome da categoria deve ter pelo menos 2 caracteres.')
    .max(80, 'Nome da categoria deve ter no máximo 80 caracteres.'));
const descriptionSchema = z.string().trim().max(500, 'Descrição deve ter no máximo 500 caracteres.');

export const categoryIdSchema = z.uuid('ID de categoria inválido.');
export const listCategoriesQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(CATEGORY_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export const categoryOptionsQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  includeInactive: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
});
export const createCategorySchema = z.object({
  name: nameSchema,
  description: z.union([z.literal('').transform(() => undefined), descriptionSchema]).optional(),
  active: z.boolean().default(true),
});
export const updateCategorySchema = z.object({
  name: nameSchema.optional(),
  description: z.union([z.literal('').transform(() => null), descriptionSchema, z.null()]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualização.');
export const updateCategoryStatusSchema = z.object({ active: z.boolean({ error: 'Status é obrigatório.' }) });

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CategoryOptionsQuery = z.infer<typeof categoryOptionsQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type UpdateCategoryStatusInput = z.infer<typeof updateCategoryStatusSchema>;
