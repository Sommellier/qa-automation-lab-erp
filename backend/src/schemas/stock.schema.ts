import { StockMovementType } from '@prisma/client';
import { z } from 'zod';

const positiveQuantity = z.number({ error: 'Informe uma quantidade válida.' })
  .int('Informe uma quantidade válida.')
  .positive('Informe uma quantidade válida.')
  .max(1_000_000, 'Informe uma quantidade válida.');

const reason = z.string({ error: 'Informe o motivo da movimentação.' }).trim()
  .min(3, 'Informe o motivo da movimentação.')
  .max(500, 'O motivo deve ter no máximo 500 caracteres.');

export const manualStockSchema = z.object({ quantity: positiveQuantity, reason }).strict();
export const adjustStockSchema = z.object({
  newStock: z.number({ error: 'Informe o novo estoque.' }).int('Informe o novo estoque.').min(0, 'O estoque não pode ser negativo.').max(1_000_000),
  reason,
}).strict();

const dateSchema = z.iso.date('Informe uma data válida.');
export const listStockMovementsSchema = z.object({
  type: z.enum(StockMovementType).optional(),
  dateFrom: dateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dateTo: dateSchema.transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  createdById: z.uuid('Usuário inválido.').optional(),
  orderId: z.uuid('Pedido inválido.').optional(),
  purchaseOrderId: z.uuid('Pedido de compra inválido.').optional(),
  reason: z.string().trim().max(500).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
  message: 'A data inicial deve ser anterior ou igual à data final.', path: ['dateTo'],
});

export type ManualStockInput = z.infer<typeof manualStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListStockMovementsQuery = z.infer<typeof listStockMovementsSchema>;
