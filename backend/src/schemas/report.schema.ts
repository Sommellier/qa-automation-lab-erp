import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';

const dateTextSchema = z.iso.date('Informe uma data válida.');
const fromDate = dateTextSchema.transform((value) => new Date(`${value}T00:00:00.000Z`));
const toDate = dateTextSchema.transform((value) => new Date(`${value}T23:59:59.999Z`));
const optionalBoolean = z.enum(['true', 'false']).transform((value) => value === 'true').optional();
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'O tamanho da página deve ser no máximo 100.').default(10),
};
const periodMessage = 'A data inicial não pode ser posterior à data final.';

function moneySchema(label: string) {
  return z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, `Informe ${label} válido.`)
    .transform((value) => new Prisma.Decimal(value)).optional();
}

export const clientReportQuerySchema = z.object({
  search: z.string().trim().max(120).optional(), active: optionalBoolean,
  createdFrom: fromDate.optional(), createdTo: toDate.optional(), ...pagination,
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'), sortOrder: z.enum(['asc', 'desc']).default('asc'),
}).refine((data) => !data.createdFrom || !data.createdTo || data.createdFrom <= data.createdTo, { message: periodMessage, path: ['createdTo'] });

export const productReportQuerySchema = z.object({
  search: z.string().trim().max(120).optional(), categoryId: z.uuid('Categoria inválida.').optional(), active: optionalBoolean,
  stockStatus: z.enum(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).default('ALL'),
  createdFrom: fromDate.optional(), createdTo: toDate.optional(), ...pagination,
  sortBy: z.enum(['name', 'sku', 'price', 'stock', 'createdAt']).default('name'), sortOrder: z.enum(['asc', 'desc']).default('asc'),
}).refine((data) => !data.createdFrom || !data.createdTo || data.createdFrom <= data.createdTo, { message: periodMessage, path: ['createdTo'] });

export const orderReportQuerySchema = z.object({
  search: z.string().trim().max(120).optional(), status: z.enum(OrderStatus).optional(), clientId: z.uuid('Cliente inválido.').optional(),
  dateFrom: fromDate.optional(), dateTo: toDate.optional(), minTotal: moneySchema('um total mínimo'), maxTotal: moneySchema('um total máximo'),
  ...pagination, sortBy: z.enum(['number', 'total', 'status', 'createdAt']).default('createdAt'), sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, { message: periodMessage, path: ['dateTo'] })
  .refine((data) => !data.minTotal || !data.maxTotal || data.minTotal.lte(data.maxTotal), { message: 'O total mínimo não pode ser maior que o total máximo.', path: ['maxTotal'] });

export const revenueReportQuerySchema = z.object({ dateFrom: fromDate.optional(), dateTo: toDate.optional() })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, { message: periodMessage, path: ['dateTo'] });

export type ClientReportQuery = z.infer<typeof clientReportQuerySchema>;
export type ProductReportQuery = z.infer<typeof productReportQuerySchema>;
export type OrderReportQuery = z.infer<typeof orderReportQuerySchema>;
export type RevenueReportQuery = z.infer<typeof revenueReportQuerySchema>;
