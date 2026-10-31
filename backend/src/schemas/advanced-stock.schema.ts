import { ProductTrackingMode, StockAdjustmentType, StockLocationType, StockMovementType } from '@prisma/client';
import { z } from 'zod';

const uuid = (message: string) => z.uuid(message);
const text = (label: string, max = 240) => z.string().trim().min(1, `${label} é obrigatório.`).max(max);
const optionalText = (max = 1000) => z.string().trim().max(max).optional();
const quantity = z.coerce.number().int().positive().max(1_000_000);
const nonNegativeQuantity = z.coerce.number().int().min(0).max(1_000_000);
const date = z.union([z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)), z.date()]);
const nonNegativeCost = z.unknown().transform((value, context): string => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim().replace(',', '.') : '';
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(normalized)) { context.addIssue({ code: 'custom', message: 'Informe um custo válido.' }); return z.NEVER; }
  const [integer, decimals = ''] = normalized.split('.'); return `${integer}.${decimals.padEnd(6, '0')}`;
});

export const advancedStockIdSchema = uuid('Identificador de estoque inválido.');

export const createWarehouseSchema = z.object({
  code: text('Código', 30).transform((value) => value.toUpperCase()), name: text('Nome', 120), description: optionalText(500),
  companyName: optionalText(160), address: optionalText(500), responsibleId: uuid('Responsável inválido.').nullable().optional(),
}).strict();
export const updateWarehouseSchema = createWarehouseSchema.partial().extend({ active: z.boolean().optional() }).strict();

export const createStockLocationSchema = z.object({
  code: text('Código', 40).transform((value) => value.toUpperCase()), description: optionalText(240), type: z.enum(StockLocationType).default(StockLocationType.STORAGE),
}).strict();
export const updateStockLocationSchema = createStockLocationSchema.partial().extend({ active: z.boolean().optional() }).strict();

export const updateProductTrackingSchema = z.object({
  trackingMode: z.enum(ProductTrackingMode), expiryWarningDays: z.coerce.number().int().min(0).max(3650).default(30), blockExpired: z.boolean().default(true),
}).strict();

const traceSchema = z.object({
  lotCode: z.string().trim().min(1).max(120).optional(), manufactureDate: date.optional(), expirationDate: date.optional(),
  serialNumbers: z.array(z.string().trim().min(1).max(160)).max(1000).default([]),
}).strict().superRefine((value, context) => {
  if (value.manufactureDate && value.expirationDate && value.expirationDate < value.manufactureDate) context.addIssue({ code: 'custom', path: ['expirationDate'], message: 'Validade anterior à fabricação.' });
  if (new Set(value.serialNumbers.map((item) => item.toUpperCase())).size !== value.serialNumbers.length) context.addIssue({ code: 'custom', path: ['serialNumbers'], message: 'Números de série duplicados.' });
});
export const purchaseTraceSchema = traceSchema;

const transferItemSchema = z.object({
  productId: uuid('Produto inválido.'), sourceLocationId: uuid('Localização de origem inválida.'), destinationLocationId: uuid('Localização de destino inválida.'),
  lotId: uuid('Lote inválido.').optional(), quantity, serialIds: z.array(uuid('Número de série inválido.')).max(1000).default([]),
}).strict();
export const createStockTransferSchema = z.object({
  sourceWarehouseId: uuid('Depósito de origem inválido.'), destinationWarehouseId: uuid('Depósito de destino inválido.'), notes: optionalText(1000),
  idempotencyKey: z.string().trim().min(8).max(120).optional(), items: z.array(transferItemSchema).min(1).max(100),
}).strict().refine((value) => value.sourceWarehouseId !== value.destinationWarehouseId, { path: ['destinationWarehouseId'], message: 'Origem e destino devem ser diferentes.' });
export const transferCommentSchema = z.object({ comment: optionalText(1000) }).strict();
export const rejectTransferSchema = z.object({ reason: text('Justificativa', 1000) }).strict();
export const receiveTransferSchema = z.object({
  items: z.array(z.object({ itemId: uuid('Item inválido.'), quantity: nonNegativeQuantity, lostQuantity: nonNegativeQuantity.default(0) }).strict()
    .refine((value) => value.quantity + value.lostQuantity > 0, { message: 'Informe quantidade recebida ou perdida.' })).min(1).max(100),
  notes: optionalText(1000),
}).strict();

export const createInventorySchema = z.object({
  warehouseId: uuid('Depósito inválido.'), locationId: uuid('Localização inválida.').optional(), productIds: z.array(uuid('Produto inválido.')).max(500).optional(),
  categoryId: uuid('Categoria inválida.').optional(), lotId: uuid('Lote inválido.').optional(), notes: optionalText(1000),
}).strict();
export const inventoryCountsSchema = z.object({
  items: z.array(z.object({ itemId: uuid('Item de inventário inválido.'), countedQuantity: nonNegativeQuantity, serialNumbers: z.array(z.string().trim().min(1).max(160)).max(1000).optional(), notes: optionalText(500) }).strict()).min(1).max(1000),
}).strict();
export const inventoryDecisionSchema = z.object({ reason: optionalText(1000) }).strict();

export const createStockAdjustmentSchema = z.object({
  warehouseId: uuid('Depósito inválido.'), reason: text('Justificativa', 1000), inventoryId: uuid('Inventário inválido.').optional(),
  items: z.array(z.object({ productId: uuid('Produto inválido.'), locationId: uuid('Localização inválida.'), lotId: uuid('Lote inválido.').optional(),
    type: z.enum(StockAdjustmentType), quantity, unitCost: nonNegativeCost.optional(), serialNumbers: z.array(z.string().trim().min(1).max(160)).max(1000).optional() }).strict()).min(1).max(500),
}).strict();
export const stockAdjustmentDecisionSchema = z.object({ reason: optionalText(1000) }).strict();
export const reverseStockAdjustmentSchema = z.object({ reason: text('Justificativa', 1000) }).strict();

export const createOrderShipmentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120).optional(), notes: optionalText(1000),
  items: z.array(z.object({ orderItemId: uuid('Item do pedido inválido.'), quantity, serialIds: z.array(uuid('Série inválida.')).max(1000).default([]) }).strict()).min(1).max(100),
}).strict();

export const advancedStockQuerySchema = z.object({
  productId: uuid('Produto inválido.').optional(), warehouseId: uuid('Depósito inválido.').optional(), locationId: uuid('Localização inválida.').optional(),
  lotId: uuid('Lote inválido.').optional(), serialId: uuid('Série inválida.').optional(), type: z.enum(StockMovementType).optional(),
  document: z.string().trim().max(160).optional(), createdById: uuid('Usuário inválido.').optional(), from: date.optional(), to: date.optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50),
}).refine((value) => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'Período inválido.' });

export const expiryQuerySchema = z.object({ days: z.coerce.number().int().min(0).max(3650).default(30), warehouseId: uuid('Depósito inválido.').optional() });

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type CreateStockLocationInput = z.infer<typeof createStockLocationSchema>;
export type UpdateStockLocationInput = z.infer<typeof updateStockLocationSchema>;
export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type ReceiveStockTransferInput = z.infer<typeof receiveTransferSchema>;
export type CreateInventoryInput = z.infer<typeof createInventorySchema>;
export type InventoryCountsInput = z.infer<typeof inventoryCountsSchema>;
export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
export type CreateOrderShipmentInput = z.infer<typeof createOrderShipmentSchema>;
export type AdvancedStockQuery = z.infer<typeof advancedStockQuerySchema>;
