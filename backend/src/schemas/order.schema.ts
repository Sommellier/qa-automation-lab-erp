import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { ORDER_SORT_FIELDS } from '../types/order.js';

const quantitySchema = z.number({ error: 'Informe uma quantidade válida.' })
  .int('Informe uma quantidade válida.')
  .positive('Informe uma quantidade válida.')
  .max(1_000_000, 'Informe uma quantidade válida.');

const orderItemSchema = z.object({
  productId: z.uuid('Produto inválido.'),
  quantity: quantitySchema,
});

export const createOrderSchema = z.object({
  clientId: z.uuid('Cliente inválido.'),
  paymentInstallments: z.number().int().min(1).max(24).default(1),
  firstPaymentDueDays: z.number().int().min(0).max(3650).default(30),
  paymentIntervalDays: z.number().int().min(1).max(365).default(30),
  items: z.array(orderItemSchema).min(1, 'Adicione pelo menos um produto ao pedido.').max(100, 'O pedido pode ter no máximo 100 itens.'),
}).strict().superRefine((data, context) => {
  const seen = new Set<string>();
  data.items.forEach((item, index) => {
    if (seen.has(item.productId)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'productId'], message: 'O mesmo produto não pode aparecer mais de uma vez.' });
    }
    seen.add(item.productId);
  });
});

const dateSchema = z.iso.date('Informe uma data válida.');

export const listOrdersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(OrderStatus).optional(),
  client: z.string().trim().max(120).optional(),
  dateStart: dateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dateEnd: dateSchema.transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  page: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1.').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'O tamanho da página deve ser no máximo 100.').default(10),
  sortBy: z.enum(ORDER_SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateStart || !data.dateEnd || data.dateStart <= data.dateEnd, {
  message: 'A data inicial deve ser anterior ou igual à data final.',
  path: ['dateEnd'],
});

export const orderIdSchema = z.uuid('ID de pedido inválido.');
export const updateOrderStatusSchema = z.object({ status: z.enum(OrderStatus) }).strict();

export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
