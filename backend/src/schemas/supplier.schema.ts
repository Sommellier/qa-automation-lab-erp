import { z } from 'zod';
import { SUPPLIER_SORT_FIELDS } from '../types/supplier.js';

const name = z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(120);
const document = z.string().trim().min(5, 'Documento deve ter pelo menos 5 caracteres.').max(30)
  .regex(/^[\p{L}\p{N} .\-/]+$/u, 'Documento contém caracteres inválidos.');
const email = z.string().trim().email('Informe um e-mail válido.').max(254).transform((value) => value.toLowerCase());
const phone = z.string().trim().min(8, 'Informe um telefone válido.').max(20)
  .regex(/^[0-9()+\-.\s]+$/, 'Informe um telefone válido.');
const contactName = z.string().trim().min(2, 'Contato deve ter pelo menos 2 caracteres.').max(120);

export const supplierIdSchema = z.uuid('ID de fornecedor inválido.');
export const listSuppliersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(SUPPLIER_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export const createSupplierSchema = z.object({
  name, document, email,
  phone: z.union([phone, z.literal('').transform(() => undefined)]).optional(),
  contactName: z.union([contactName, z.literal('').transform(() => undefined)]).optional(),
  active: z.boolean().default(true),
}).strict();
export const updateSupplierSchema = z.object({
  name: name.optional(), document: document.optional(), email: email.optional(),
  phone: z.union([phone, z.literal('').transform(() => null), z.null()]).optional(),
  contactName: z.union([contactName, z.literal('').transform(() => null), z.null()]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualização.');
export const updateSupplierStatusSchema = z.object({ active: z.boolean() }).strict();

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type UpdateSupplierStatusInput = z.infer<typeof updateSupplierStatusSchema>;
