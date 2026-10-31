import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { RECEIVABLE_EFFECTIVE_STATUSES, RECEIVABLE_SORT_FIELDS } from '../types/receivable.js';

const money = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    context.addIssue({ code: 'custom', message: 'Informe um valor positivo válido.' });
    return z.NEVER;
  }
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer}.${decimals.padEnd(2, '0')}`;
});

export const receivableIdSchema = z.uuid('ID de conta a receber inválido.');
export const collectionIdSchema = z.uuid('ID de recebimento inválido.');
export const statementClientIdSchema = z.uuid('ID de cliente inválido.');
export const registerCollectionSchema = z.object({
  amount: money,
  method: z.enum(PaymentMethod),
  bankAccountId: z.uuid('Conta financeira inválida.'),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  receivedAt: z.union([z.iso.date().transform((value) => new Date(`${value}T12:00:00.000Z`)), z.literal('').transform(() => undefined)]).optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();
export const reverseCollectionSchema = z.object({ reason: z.string().trim().min(5, 'Informe o motivo do estorno.').max(500) }).strict();
export const listReceivablesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(RECEIVABLE_EFFECTIVE_STATUSES).optional(),
  clientId: z.uuid('Cliente inválido.').optional(),
  dueFrom: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dueTo: z.iso.date().transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(RECEIVABLE_SORT_FIELDS).default('dueDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
}).refine((data) => !data.dueFrom || !data.dueTo || data.dueFrom <= data.dueTo, { path: ['dueTo'], message: 'Período inválido.' });
export const receivableSummaryQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
export const statementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RegisterCollectionInput = z.infer<typeof registerCollectionSchema>;
export type ReverseCollectionInput = z.infer<typeof reverseCollectionSchema>;
export type ListReceivablesQuery = z.infer<typeof listReceivablesQuerySchema>;
export type ReceivableSummaryQuery = z.infer<typeof receivableSummaryQuerySchema>;
export type StatementQuery = z.infer<typeof statementQuerySchema>;
