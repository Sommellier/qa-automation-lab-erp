import {
  ReturnAttachmentType,
  ReturnFinancialAdjustmentType,
  ReturnFiscalDocumentRole,
  ReturnItemCondition,
  ReturnStatus,
  ReturnType,
} from '@prisma/client';
import { z } from 'zod';

export const returnIdSchema = z.uuid('Identificador de devolução inválido.');
const optionalUuid = z.union([z.uuid(), z.literal('').transform(() => undefined)]).optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();

const returnItemInputSchema = z.object({
  sourceItemId: z.uuid(),
  quantity: z.number().int().positive().max(1_000_000),
  replacementProductId: z.uuid().optional(),
  replacementQuantity: z.number().int().positive().max(1_000_000).optional(),
}).strict();

const supplierTreatments = [
  ReturnFinancialAdjustmentType.SUPPLIER_CREDIT,
  ReturnFinancialAdjustmentType.PAYABLE_REDUCTION,
  ReturnFinancialAdjustmentType.SUPPLIER_REFUND,
  ReturnFinancialAdjustmentType.FUTURE_PURCHASE_CREDIT,
] as const;
const customerTreatments = [
  ReturnFinancialAdjustmentType.CUSTOMER_REFUND,
  ReturnFinancialAdjustmentType.RECEIVABLE_REVERSAL,
  ReturnFinancialAdjustmentType.COMMERCIAL_CREDIT,
  ReturnFinancialAdjustmentType.RECEIVABLE_REDUCTION,
] as const;

export const createReturnSchema = z.object({
  type: z.enum(ReturnType),
  purchaseReceiptId: z.uuid().optional(),
  orderId: z.uuid().optional(),
  reasonId: z.uuid(),
  justification: optionalText(1000),
  notes: optionalText(2000),
  financialTreatment: z.enum(ReturnFinancialAdjustmentType).optional(),
  payableId: z.uuid().optional(),
  receivableId: z.uuid().optional(),
  items: z.array(returnItemInputSchema).min(1).max(100),
}).strict().superRefine((data, context) => {
  const ids = data.items.map((item) => item.sourceItemId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['items'], message: 'O mesmo item de origem não pode aparecer duas vezes.' });
  if (data.type === ReturnType.SUPPLIER_RETURN) {
    if (!data.purchaseReceiptId || data.orderId) context.addIssue({ code: 'custom', path: ['purchaseReceiptId'], message: 'Selecione um recebimento de compra.' });
    if (!data.financialTreatment || !supplierTreatments.includes(data.financialTreatment as typeof supplierTreatments[number])) context.addIssue({ code: 'custom', path: ['financialTreatment'], message: 'Selecione um tratamento financeiro de fornecedor.' });
    if (data.receivableId) context.addIssue({ code: 'custom', path: ['receivableId'], message: 'Uma devolução ao fornecedor não pode vincular conta a receber.' });
  } else {
    if (!data.orderId || data.purchaseReceiptId) context.addIssue({ code: 'custom', path: ['orderId'], message: 'Selecione uma venda concluída.' });
    if (data.type === ReturnType.CUSTOMER_RETURN && (!data.financialTreatment || !customerTreatments.includes(data.financialTreatment as typeof customerTreatments[number]))) context.addIssue({ code: 'custom', path: ['financialTreatment'], message: 'Selecione um tratamento financeiro do cliente.' });
    if (data.type === ReturnType.EXCHANGE && data.financialTreatment) context.addIssue({ code: 'custom', path: ['financialTreatment'], message: 'A diferença financeira da troca é calculada pelo sistema.' });
    if (data.payableId) context.addIssue({ code: 'custom', path: ['payableId'], message: 'Uma devolução de cliente não pode vincular conta a pagar.' });
  }
  for (const [index, item] of data.items.entries()) {
    const hasReplacement = Boolean(item.replacementProductId || item.replacementQuantity);
    if (data.type === ReturnType.EXCHANGE && (!item.replacementProductId || !item.replacementQuantity)) context.addIssue({ code: 'custom', path: ['items', index], message: 'Informe produto e quantidade substitutos.' });
    if (data.type !== ReturnType.EXCHANGE && hasReplacement) context.addIssue({ code: 'custom', path: ['items', index], message: 'Produto substituto é permitido somente em trocas.' });
  }
});

export const listReturnsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  type: z.enum(ReturnType).optional(),
  status: z.enum(ReturnStatus).optional(),
  supplierId: optionalUuid,
  clientId: optionalUuid,
  productId: optionalUuid,
  dateFrom: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dateTo: z.iso.date().transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, { path: ['dateTo'], message: 'Período inválido.' });

export const returnCommentSchema = z.object({ comment: z.string().trim().max(1000).optional() }).strict();
export const rejectReturnSchema = z.object({ comment: z.string().trim().min(5).max(1000) }).strict();

export const confirmReturnPhysicalSchema = z.object({
  items: z.array(z.object({ itemId: z.uuid(), condition: z.enum(ReturnItemCondition) }).strict()).max(100).default([]),
  comment: z.string().trim().max(1000).optional(),
}).strict().superRefine((data, context) => {
  const ids = data.items.map((item) => item.itemId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Item de inspeção duplicado.' });
});

export const inspectReturnItemSchema = z.object({
  condition: z.enum([ReturnItemCondition.RESALABLE, ReturnItemCondition.DAMAGED, ReturnItemCondition.DISPOSAL, ReturnItemCondition.ASSISTANCE]),
  comment: z.string().trim().max(1000).optional(),
}).strict();

export const linkReturnAdjustmentSchema = z.object({
  payableId: z.uuid().nullable().optional(),
  receivableId: z.uuid().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).strict().refine((data) => !(data.payableId && data.receivableId), { message: 'Vincule somente um título financeiro.' });

export const settleReturnAdjustmentSchema = z.object({
  settlementReference: z.string().trim().min(3).max(200),
  settledAt: z.coerce.date().max(new Date(), 'A data de liquidação não pode estar no futuro.').optional(),
  notes: z.string().trim().max(1000).optional(),
}).strict();

export const linkReturnFiscalSchema = z.object({
  fiscalDocumentId: z.uuid(),
  role: z.enum(ReturnFiscalDocumentRole),
}).strict();

export const returnReasonInputSchema = z.object({
  code: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_]+$/)),
  name: z.string().trim().min(2).max(120),
  appliesTo: z.array(z.enum(ReturnType)).min(1).max(3),
  requiresJustification: z.boolean().default(false),
  active: z.boolean().default(true),
}).strict().superRefine((data, context) => {
  if (new Set(data.appliesTo).size !== data.appliesTo.length) context.addIssue({ code: 'custom', path: ['appliesTo'], message: 'Aplicação duplicada.' });
});

export const returnAttachmentMetadataSchema = z.object({ type: z.enum(ReturnAttachmentType) }).strict();

export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type ListReturnsQuery = z.infer<typeof listReturnsQuerySchema>;
export type ReturnCommentInput = z.infer<typeof returnCommentSchema>;
export type ConfirmReturnPhysicalInput = z.infer<typeof confirmReturnPhysicalSchema>;
export type InspectReturnItemInput = z.infer<typeof inspectReturnItemSchema>;
export type LinkReturnAdjustmentInput = z.infer<typeof linkReturnAdjustmentSchema>;
export type SettleReturnAdjustmentInput = z.infer<typeof settleReturnAdjustmentSchema>;
export type LinkReturnFiscalInput = z.infer<typeof linkReturnFiscalSchema>;
export type ReturnReasonInput = z.infer<typeof returnReasonInputSchema>;
export type ReturnAttachmentMetadataInput = z.infer<typeof returnAttachmentMetadataSchema>;
