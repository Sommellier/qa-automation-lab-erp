import { UserRole } from '@prisma/client';
import { z } from 'zod';
import { USER_SORT_FIELDS } from '../types/user.js';
import { passwordSchema } from './password.schema.js';

export const nameSchema = z.string().trim().min(1, 'Nome é obrigatório.').max(120, 'Nome deve ter no máximo 120 caracteres.');
const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-mail é obrigatório.')
  .email('Informe um e-mail válido.')
  .transform((email) => email.toLowerCase());
const roleSchema = z.enum(UserRole, { error: 'Informe um perfil válido.' });

export const userIdSchema = z.uuid('ID de usuário inválido.');

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1.').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'O tamanho da página deve ser no máximo 100.').default(10),
  sortBy: z.enum(USER_SORT_FIELDS).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z.string().min(1, 'Senha é obrigatória.').pipe(passwordSchema),
  role: roleSchema,
  active: z.boolean().default(true),
});

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualização.');

export const updateUserStatusSchema = z.object({
  active: z.boolean({ error: 'Status é obrigatório.' }),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

