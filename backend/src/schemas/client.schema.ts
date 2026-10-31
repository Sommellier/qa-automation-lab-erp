import { z } from 'zod';
import { CLIENT_SORT_FIELDS } from '../types/client.js';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Nome é obrigatório.')
  .min(2, 'Nome deve ter pelo menos 2 caracteres.')
  .max(120, 'Nome deve ter no máximo 120 caracteres.');

const documentSchema = z
  .string()
  .trim()
  .min(1, 'Documento é obrigatório.')
  .min(5, 'Documento deve ter pelo menos 5 caracteres.')
  .max(30, 'Documento deve ter no máximo 30 caracteres.')
  .regex(/^[\p{L}\p{N} .\-/]+$/u, 'Documento contém caracteres inválidos.');

const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-mail é obrigatório.')
  .email('Informe um e-mail válido.')
  .max(254, 'E-mail deve ter no máximo 254 caracteres.')
  .transform((email) => email.toLowerCase());

const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Informe um telefone válido.')
  .max(20, 'Informe um telefone válido.')
  .regex(/^[0-9()+\-.\s]+$/, 'Informe um telefone válido.');

export const clientIdSchema = z.uuid('ID de cliente inválido.');

export const listClientsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1.').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'O tamanho da página deve ser no máximo 100.').default(10),
  sortBy: z.enum(CLIENT_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const createClientSchema = z.object({
  name: nameSchema,
  document: documentSchema,
  email: emailSchema,
  phone: z.union([phoneSchema, z.literal('').transform(() => undefined)]).optional(),
  active: z.boolean().default(true),
});

export const updateClientSchema = z
  .object({
    name: nameSchema.optional(),
    document: documentSchema.optional(),
    email: emailSchema.optional(),
    phone: z.union([phoneSchema, z.literal('').transform(() => null), z.null()]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualização.');

export const updateClientStatusSchema = z.object({
  active: z.boolean({ error: 'Status é obrigatório.' }),
});

export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type UpdateClientStatusInput = z.infer<typeof updateClientStatusSchema>;
