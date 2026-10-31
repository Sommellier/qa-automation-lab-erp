import { QuoteStatus, UserRole } from '@prisma/client';
import { z } from 'zod';

const quantity = z.number().int().min(1).max(1_000_000);
const percentage = z.number().min(0).max(100);
const quoteItemSchema = z.object({
  productId: z.uuid('Produto inválido.'),
  quantity,
  discountPercent: percentage.default(0),
}).strict();

const commercialFields = {
  clientId: z.uuid('Cliente inválido.'),
  sellerId: z.uuid('Vendedor inválido.').optional(),
  validUntil: z.iso.date('Informe uma validade válida.').transform((value) => new Date(`${value}T00:00:00.000Z`)),
  reservationHours: z.number().int().min(1).max(720).default(24),
  paymentInstallments: z.number().int().min(1).max(24).default(1),
  firstPaymentDueDays: z.number().int().min(0).max(3650).default(30),
  paymentIntervalDays: z.number().int().min(1).max(365).default(30),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(quoteItemSchema).min(1, 'Adicione pelo menos um produto.').max(100),
};

function uniqueProducts<T extends { items: Array<{ productId: string }> }>(data: T, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  data.items.forEach((item, index) => {
    if (seen.has(item.productId)) context.addIssue({ code: 'custom', path: ['items', index, 'productId'], message: 'O produto está duplicado.' });
    seen.add(item.productId);
  });
}

export const createQuoteSchema = z.object(commercialFields).strict().superRefine(uniqueProducts);
export const updateQuoteSchema = z.object(commercialFields).strict().superRefine(uniqueProducts);

export const listQuotesQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(QuoteStatus).optional(),
  clientId: z.uuid().optional(),
  sellerId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const quoteIdSchema = z.uuid('Orçamento inválido.');
export const quoteRoleSchema = z.enum(UserRole);
export const quoteCommentSchema = z.object({ comment: z.string().trim().min(1).max(1000) }).strict();
export const quoteOptionalCommentSchema = z.object({ comment: z.string().trim().max(1000).optional() }).strict();
export const rejectQuoteSchema = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
export const renewQuoteSchema = z.object({ reservationHours: z.number().int().min(1).max(720).optional() }).strict();
export const updateQuoteApprovalRuleSchema = z.object({ maxDiscountPercent: percentage, active: z.boolean() }).strict();
export const updateCommissionRuleSchema = z.object({ rate: percentage, active: z.boolean() }).strict();

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;
export type ListQuotesQuery = z.infer<typeof listQuotesQuerySchema>;
export type UpdateQuoteApprovalRuleInput = z.infer<typeof updateQuoteApprovalRuleSchema>;
export type UpdateCommissionRuleInput = z.infer<typeof updateCommissionRuleSchema>;
