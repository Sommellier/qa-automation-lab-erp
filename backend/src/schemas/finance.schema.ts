import {
  BankAccountType,
  ChartAccountKind,
  ChartAccountNature,
  FinancialAdjustmentKind,
  FinancialCalculationType,
  FinancialRecurrenceFrequency,
  FinancialTitleType,
  PaymentMethod,
} from '@prisma/client';
import { z } from 'zod';

const uuid = (message: string) => z.uuid(message);
const text = (label: string, max = 200) => z.string().trim().min(1, `${label} é obrigatório.`).max(max);
const optionalText = (max = 1000) => z.string().trim().max(max).optional();
const date = z.union([
  z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)),
  z.date(),
]);
const dateTime = z.union([
  z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  z.date(),
]);
const money = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim().replace(',', '.') : '';
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    context.addIssue({ code: 'custom', message: 'Informe um valor monetário positivo com até duas casas decimais.' });
    return z.NEVER;
  }
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer}.${decimals.padEnd(2, '0')}`;
});
const nonNegativeMoney = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim().replace(',', '.') : '';
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
    context.addIssue({ code: 'custom', message: 'Informe um valor monetário válido.' });
    return z.NEVER;
  }
  const [integer, decimals = ''] = normalized.split('.');
  return `${integer}.${decimals.padEnd(2, '0')}`;
});

export const financeIdSchema = uuid('Identificador financeiro inválido.');

export const createCostCenterSchema = z.object({
  code: text('Código', 30).transform((value) => value.toUpperCase()),
  name: text('Nome', 120),
  description: optionalText(500),
  parentId: uuid('Centro de custo pai inválido.').nullable().optional(),
}).strict();
export const updateCostCenterSchema = createCostCenterSchema.partial().extend({ active: z.boolean().optional() }).strict();

export const createChartAccountSchema = z.object({
  code: text('Código', 30),
  name: text('Nome', 120),
  description: optionalText(500),
  kind: z.enum(ChartAccountKind),
  nature: z.enum(ChartAccountNature),
  parentId: uuid('Conta pai inválida.').nullable().optional(),
}).strict();
export const updateChartAccountSchema = createChartAccountSchema.partial().extend({ active: z.boolean().optional() }).strict();

const bankAccountBaseSchema = z.object({
  name: text('Nome da conta', 120),
  institution: optionalText(120),
  agency: optionalText(30),
  accountNumber: optionalText(50),
  type: z.enum(BankAccountType),
  holder: optionalText(160),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Moeda deve usar o padrão ISO com três letras.'),
  initialBalance: nonNegativeMoney,
  initialBalanceDate: date,
});
export const createBankAccountSchema = bankAccountBaseSchema.extend({
  currency: bankAccountBaseSchema.shape.currency.default('BRL'),
  initialBalance: bankAccountBaseSchema.shape.initialBalance.default('0.00'),
}).strict();
export const updateBankAccountSchema = bankAccountBaseSchema.partial().extend({ active: z.boolean().optional() }).strict();

export const allocationSchema = z.object({
  costCenterId: uuid('Centro de custo inválido.'),
  percentage: z.coerce.number().positive().max(100).transform((value) => value.toFixed(4)),
}).strict();

export const createFinancialTitleSchema = z.object({
  type: z.enum(FinancialTitleType),
  description: text('Descrição', 240),
  supplierId: uuid('Fornecedor inválido.').optional(),
  clientId: uuid('Cliente inválido.').optional(),
  counterpartyName: optionalText(160),
  chartAccountId: uuid('Conta do plano de contas inválida.'),
  competenceDate: date,
  issueDate: date,
  dueDate: date,
  originalAmount: money,
  plannedMethod: z.enum(PaymentMethod).optional(),
  plannedBankAccountId: uuid('Conta financeira prevista inválida.').optional(),
  notes: optionalText(2000),
  draft: z.boolean().default(false),
  allocations: z.array(allocationSchema).min(1, 'Informe ao menos um centro de custo.').max(20),
}).strict().superRefine((value, context) => {
  if (value.type === FinancialTitleType.PAYABLE && value.clientId) context.addIssue({ code: 'custom', path: ['clientId'], message: 'Conta a pagar não pode ter cliente como pagador.' });
  if (value.type === FinancialTitleType.RECEIVABLE && value.supplierId) context.addIssue({ code: 'custom', path: ['supplierId'], message: 'Conta a receber não pode ter fornecedor como favorecido.' });
  if (value.dueDate < value.issueDate) context.addIssue({ code: 'custom', path: ['dueDate'], message: 'Vencimento não pode ser anterior à emissão.' });
});

export const updateFinancialTitleSchema = z.object({
  description: text('Descrição', 240).optional(),
  supplierId: uuid('Fornecedor inválido.').nullable().optional(),
  clientId: uuid('Cliente inválido.').nullable().optional(),
  counterpartyName: z.string().trim().max(160).nullable().optional(),
  chartAccountId: uuid('Conta do plano de contas inválida.').optional(),
  competenceDate: date.optional(),
  issueDate: date.optional(),
  dueDate: date.optional(),
  originalAmount: money.optional(),
  plannedMethod: z.enum(PaymentMethod).nullable().optional(),
  plannedBankAccountId: uuid('Conta financeira prevista inválida.').nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  allocations: z.array(allocationSchema).min(1).max(20).optional(),
  postDraft: z.boolean().optional(),
}).strict();

export const listFinancialTitlesQuerySchema = z.object({
  type: z.enum(FinancialTitleType).optional(),
  status: z.enum(['DRAFT', 'OPEN', 'PARTIALLY_SETTLED', 'SETTLED', 'OVERDUE', 'CANCELLED']).optional(),
  search: z.string().trim().max(120).optional(),
  chartAccountId: uuid('Conta contábil inválida.').optional(),
  costCenterId: uuid('Centro de custo inválido.').optional(),
  bankAccountId: uuid('Conta financeira inválida.').optional(),
  dueFrom: date.optional(), dueTo: date.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).refine((value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, { path: ['dueTo'], message: 'Período inválido.' });

export const settleFinancialTitleSchema = z.object({
  amount: money,
  method: z.enum(PaymentMethod),
  bankAccountId: uuid('Conta financeira inválida.'),
  settledAt: dateTime.optional(),
  notes: optionalText(500),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
}).strict();
export const reverseSettlementSchema = z.object({ reason: text('Motivo', 500) }).strict();
export const cancelFinancialTitleSchema = z.object({ reason: text('Motivo', 500) }).strict();

export const createFinancialAdjustmentSchema = z.object({
  kind: z.enum(FinancialAdjustmentKind),
  calculationType: z.enum(FinancialCalculationType),
  fixedAmount: money.optional(),
  rate: z.coerce.number().positive().max(100).transform((value) => value.toFixed(6)).optional(),
  periodStart: date.optional(),
  periodEnd: date.optional(),
  appliedAmount: money.optional(),
  reason: text('Justificativa', 500),
}).strict().superRefine((value, context) => {
  if (value.calculationType === FinancialCalculationType.FIXED && !value.fixedAmount) context.addIssue({ code: 'custom', path: ['fixedAmount'], message: 'Informe o valor fixo.' });
  if (value.calculationType === FinancialCalculationType.SIMPLE_PERCENTAGE && !value.rate) context.addIssue({ code: 'custom', path: ['rate'], message: 'Informe a taxa.' });
  if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) context.addIssue({ code: 'custom', path: ['periodEnd'], message: 'Período inválido.' });
});

const recurrenceBaseSchema = z.object({
  description: text('Descrição', 240), type: z.enum(FinancialTitleType), amount: money,
  chartAccountId: uuid('Conta do plano de contas inválida.'), costCenterId: uuid('Centro de custo inválido.'),
  supplierId: uuid('Fornecedor inválido.').optional(), clientId: uuid('Cliente inválido.').optional(), counterpartyName: optionalText(160),
  startDate: date, endDate: date.optional(), frequency: z.enum(FinancialRecurrenceFrequency),
  dueDay: z.coerce.number().int().min(1).max(31).optional(), maxOccurrences: z.coerce.number().int().positive().max(1000).optional(),
  plannedMethod: z.enum(PaymentMethod).optional(), plannedBankAccountId: uuid('Conta financeira inválida.').optional(), notes: optionalText(2000),
}).strict();
export const createRecurrenceSchema = recurrenceBaseSchema.superRefine((value, context) => {
  if (value.endDate && value.endDate < value.startDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Data final anterior à inicial.' });
  if (value.type === FinancialTitleType.PAYABLE && value.clientId) context.addIssue({ code: 'custom', path: ['clientId'], message: 'Recorrência a pagar não pode ter cliente.' });
  if (value.type === FinancialTitleType.RECEIVABLE && value.supplierId) context.addIssue({ code: 'custom', path: ['supplierId'], message: 'Recorrência a receber não pode ter fornecedor.' });
});
export const updateRecurrenceSchema = recurrenceBaseSchema.omit({ type: true }).partial().strict();
export const processRecurrencesSchema = z.object({ throughDate: date.default(() => new Date()) }).strict();

export const transferSchema = z.object({
  sourceBankAccountId: uuid('Conta de origem inválida.'), destinationBankAccountId: uuid('Conta de destino inválida.'),
  amount: money, transferredAt: dateTime.optional(), description: text('Descrição', 240), reference: optionalText(120),
}).strict().refine((value) => value.sourceBankAccountId !== value.destinationBankAccountId, { path: ['destinationBankAccountId'], message: 'As contas devem ser diferentes.' });

export const statementPreviewSchema = z.object({
  bankAccountId: uuid('Conta financeira inválida.'),
  format: z.enum(['OFX', 'CSV']),
  mapping: z.string().trim().max(2000).optional(),
}).strict();
export const confirmStatementImportSchema = z.object({}).strict();
export const ignoreBankTransactionSchema = z.object({ reason: text('Justificativa', 500) }).strict();
export const reconcileSchema = z.object({
  links: z.array(z.object({ bankTransactionId: uuid('Transação bancária inválida.'), bankMovementId: uuid('Movimentação interna inválida.'), amount: money }).strict()).min(1).max(50),
  notes: optionalText(500),
}).strict();

const financialReportBaseSchema = z.object({
  from: date, to: date,
  bankAccountId: uuid('Conta financeira inválida.').optional(), chartAccountId: uuid('Conta contábil inválida.').optional(),
  costCenterId: uuid('Centro de custo inválido.').optional(), groupBy: z.enum(['day', 'week', 'month']).default('month'),
});
export const financialReportQuerySchema = financialReportBaseSchema.refine((value) => value.from <= value.to, { path: ['to'], message: 'Período inválido.' });

export const snapshotSchema = financialReportBaseSchema.pick({ from: true, to: true, bankAccountId: true, chartAccountId: true, costCenterId: true }).strict();

export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>;
export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>;
export type CreateChartAccountInput = z.infer<typeof createChartAccountSchema>;
export type UpdateChartAccountInput = z.infer<typeof updateChartAccountSchema>;
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>;
export type CreateFinancialTitleInput = z.infer<typeof createFinancialTitleSchema>;
export type UpdateFinancialTitleInput = z.infer<typeof updateFinancialTitleSchema>;
export type ListFinancialTitlesQuery = z.infer<typeof listFinancialTitlesQuerySchema>;
export type SettleFinancialTitleInput = z.infer<typeof settleFinancialTitleSchema>;
export type CreateFinancialAdjustmentInput = z.infer<typeof createFinancialAdjustmentSchema>;
export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type ReconcileInput = z.infer<typeof reconcileSchema>;
export type FinancialReportQuery = z.infer<typeof financialReportQuerySchema>;
