import { AddressType } from '@prisma/client';
import { z } from 'zod';
import { ADDRESS_SORT_FIELDS } from '../types/client-address.js';

const requiredText = (label: string, minimum: number, maximum: number) => z.string().trim()
  .min(1, `${label} é obrigatório.`)
  .min(minimum, `${label} deve ter pelo menos ${minimum} caracteres.`)
  .max(maximum, `${label} deve ter no máximo ${maximum} caracteres.`);

const zipCodeSchema = z.string().trim()
  .min(1, 'CEP/Código postal é obrigatório.')
  .min(2, 'CEP/Código postal deve ter pelo menos 2 caracteres.')
  .max(20, 'CEP/Código postal deve ter no máximo 20 caracteres.')
  .regex(/^[\p{L}\p{N}\s-]+$/u, 'CEP/Código postal contém caracteres inválidos.');

const numberSchema = z.string().trim()
  .min(1, 'Número é obrigatório.')
  .max(20, 'Número deve ter no máximo 20 caracteres.')
  .regex(/^[\p{L}\p{N}\s./-]+$/u, 'Número contém caracteres inválidos.');

const addressFields = {
  type: z.enum(AddressType, { error: 'Tipo de endereço é obrigatório.' }),
  zipCode: zipCodeSchema,
  street: requiredText('Logradouro', 2, 160),
  number: numberSchema,
  complement: z.union([z.string().trim().max(120, 'Complemento deve ter no máximo 120 caracteres.'), z.null()]).optional(),
  district: requiredText('Bairro', 1, 100),
  city: requiredText('Cidade', 1, 100),
  state: requiredText('Estado', 1, 100),
  country: requiredText('País', 2, 100),
};

export const addressIdSchema = z.uuid('ID de endereço inválido.');

export const listClientAddressesQuerySchema = z.object({
  active: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  type: z.enum(AddressType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(ADDRESS_SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createClientAddressSchema = z.object({
  ...addressFields,
  isPrimary: z.boolean().default(false),
});

export const updateClientAddressSchema = z.object({
  type: addressFields.type.optional(),
  zipCode: addressFields.zipCode.optional(),
  street: addressFields.street.optional(),
  number: addressFields.number.optional(),
  complement: addressFields.complement,
  district: addressFields.district.optional(),
  city: addressFields.city.optional(),
  state: addressFields.state.optional(),
  country: addressFields.country.optional(),
  isPrimary: z.boolean().optional(),
}).refine((data) => Object.keys(data).length > 0, 'Informe ao menos um campo para atualização.')
  .transform((data) => ({ ...data, ...(data.complement === '' ? { complement: null } : {}) }));

export const updateClientAddressStatusSchema = z.object({
  active: z.boolean({ error: 'Status é obrigatório.' }),
});

export type ListClientAddressesQuery = z.infer<typeof listClientAddressesQuerySchema>;
export type CreateClientAddressInput = z.infer<typeof createClientAddressSchema>;
export type UpdateClientAddressInput = z.infer<typeof updateClientAddressSchema>;
export type UpdateClientAddressStatusInput = z.infer<typeof updateClientAddressStatusSchema>;
