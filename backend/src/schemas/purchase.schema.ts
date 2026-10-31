import { PurchaseApprovalStatus, PurchaseOrderStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { PURCHASE_SORT_FIELDS } from '../types/purchase.js';

const quantity = z.number({ error: 'Informe uma quantidade válida.' }).int().positive().max(1_000_000);
const money = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    context.addIssue({ code: 'custom', message: 'Informe um custo unitário válido.' });
    return z.NEVER;
  }
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer}.${decimals.padEnd(2, '0')}`;
});
const approvalAmount = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    context.addIssue({ code: 'custom', message: 'Informe um limite de aprovação válido.' });
    return z.NEVER;
  }
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer}.${decimals.padEnd(2, '0')}`;
});
const uniqueProducts = <T extends { items: Array<{ productId: string }> }>(data: T, context: z.RefinementCtx) => {
  const seen = new Set<string>();
  data.items.forEach((item, index) => {
    if (seen.has(item.productId)) context.addIssue({ code: 'custom', path: ['items', index, 'productId'], message: 'O mesmo produto não pode aparecer mais de uma vez.' });
    seen.add(item.productId);
  });
};

export const purchaseIdSchema = z.uuid('ID de pedido de compra inválido.');
export const productCostHistoryIdSchema = z.uuid('ID de produto inválido.');
export const createPurchaseSchema = z.object({
  supplierId: z.uuid('Fornecedor inválido.'),
  expectedAt: z.union([z.iso.date(), z.literal('').transform(() => undefined)]).optional(),
  paymentInstallments: z.number().int().min(1).max(24).default(1),
  firstPaymentDueDays: z.number().int().min(0).max(3650).default(30),
  paymentIntervalDays: z.number().int().min(1).max(365).default(30),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(z.object({ productId: z.uuid('Produto inválido.'), quantity, unitCost: money }).strict()).min(1).max(100),
}).strict().superRefine(uniqueProducts);
export const receivePurchaseSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  items: z.array(z.object({
    productId: z.uuid('Produto inválido.'), quantity,
    locationId: z.uuid('Localização inválida.').optional(),
    lotCode: z.string().trim().min(1).max(120).optional(),
    manufactureDate: z.iso.date().optional(), expirationDate: z.iso.date().optional(),
    serialNumbers: z.array(z.string().trim().min(1).max(160)).max(1000).default([]),
  }).strict().superRefine((item, context) => {
    if (item.manufactureDate && item.expirationDate && item.expirationDate < item.manufactureDate) context.addIssue({ code: 'custom', path: ['expirationDate'], message: 'Validade anterior à fabricação.' });
    if (new Set(item.serialNumbers.map((serial) => serial.toUpperCase())).size !== item.serialNumbers.length) context.addIssue({ code: 'custom', path: ['serialNumbers'], message: 'Números de série duplicados.' });
  })).min(1).max(100),
}).strict().superRefine(uniqueProducts);
export const listPurchasesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(PurchaseOrderStatus).optional(),
  approvalStatus: z.enum(PurchaseApprovalStatus).optional(),
  supplierId: z.uuid('Fornecedor inválido.').optional(),
  dateFrom: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dateTo: z.iso.date().transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(PURCHASE_SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, { path: ['dateTo'], message: 'Período inválido.' });
export const costHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const purchaseApprovalCommentSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
}).strict();
export const rejectPurchaseSchema = z.object({
  comment: z.string().trim().min(5, 'Informe o motivo da rejeição com ao menos 5 caracteres.').max(1000),
}).strict();
export const approvalRuleRoleSchema = z.enum([UserRole.ADMIN, UserRole.ANALISTA]);
export const updateApprovalRuleSchema = z.object({
  maxAmount: z.union([approvalAmount, z.null()]),
  active: z.boolean(),
}).strict();

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type CostHistoryQuery = z.infer<typeof costHistoryQuerySchema>;
export type PurchaseApprovalCommentInput = z.infer<typeof purchaseApprovalCommentSchema>;
export type RejectPurchaseInput = z.infer<typeof rejectPurchaseSchema>;
export type UpdateApprovalRuleInput = z.infer<typeof updateApprovalRuleSchema>;
