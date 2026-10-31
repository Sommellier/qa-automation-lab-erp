import {
  Prisma,
  StockCostEventType,
  StockMovementType,
  type InventoryBalance,
} from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { movingAverageCost, outboundCost, stockCost, stockMoney } from './advanced-stock-rules.js';

export type StockTransaction = Prisma.TransactionClient;

export interface StockDimension {
  productId: string;
  warehouseId: string;
  locationId: string;
  lotId?: string | null;
}

export const DEFAULT_WAREHOUSE_ID = '00000000-0000-4000-8000-000000000100';
export const DEFAULT_LOCATION_ID = '00000000-0000-4000-8000-000000000101';

export function inventoryBalanceKey(dimension: StockDimension): string {
  return `${dimension.productId}:${dimension.warehouseId}:${dimension.locationId}:${dimension.lotId ?? 'none'}`;
}

export async function defaultStockDimension(tx: StockTransaction, productId: string): Promise<StockDimension> {
  const warehouse = await tx.warehouse.findFirst({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, locations: { where: { active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], take: 1, select: { id: true } } },
  });
  const location = warehouse?.locations[0];
  if (!warehouse || !location) throw new AppError('Configure um depósito e uma localização ativos.', 409, 'STOCK_SETUP_REQUIRED');
  return { productId, warehouseId: warehouse.id, locationId: location.id };
}

export async function ensureBalance(tx: StockTransaction, dimension: StockDimension): Promise<InventoryBalance> {
  const key = inventoryBalanceKey(dimension);
  return tx.inventoryBalance.upsert({
    where: { key },
    update: {},
    create: {
      key,
      productId: dimension.productId,
      warehouseId: dimension.warehouseId,
      locationId: dimension.locationId,
      ...(dimension.lotId ? { lotId: dimension.lotId } : {}),
    },
  });
}

export async function lockBalance(tx: StockTransaction, dimension: StockDimension): Promise<InventoryBalance> {
  const balance = await ensureBalance(tx, dimension);
  await tx.$queryRaw`SELECT "id" FROM "inventory_balances" WHERE "id" = ${balance.id}::uuid FOR UPDATE`;
  return tx.inventoryBalance.findUniqueOrThrow({ where: { id: balance.id } });
}

export async function lockProduct(tx: StockTransaction, productId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "products" WHERE "id" = ${productId}::uuid FOR UPDATE`;
  if (!rows.length) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
  return tx.product.findUniqueOrThrow({ where: { id: productId } });
}

export function assertBalanceCapacity(balance: Pick<InventoryBalance, 'physical' | 'reserved' | 'blocked'>, quantity: number): void {
  if (quantity <= 0 || balance.physical - balance.reserved - balance.blocked < quantity) {
    throw new AppError('Saldo disponível insuficiente na localização selecionada.', 409, 'INSUFFICIENT_AVAILABLE_STOCK');
  }
}

export async function recordInbound(tx: StockTransaction, input: {
  dimension: StockDimension;
  quantity: number;
  unitCost: Prisma.Decimal.Value;
  type: StockMovementType;
  costEventType: StockCostEventType;
  actorUserId?: string;
  reason?: string;
  operationKey?: string;
  purchaseOrderId?: string;
  purchaseReceiptId?: string;
  returnProcessId?: string;
  returnItemId?: string;
  adjustmentId?: string;
  adjustmentItemId?: string;
  inventoryId?: string;
  inventoryItemId?: string;
  updateGlobalStock?: boolean;
}) {
  if (input.quantity <= 0) throw new AppError('A quantidade deve ser positiva.', 400, 'INVALID_STOCK_QUANTITY');
  const product = await lockProduct(tx, input.dimension.productId);
  const balance = await lockBalance(tx, input.dimension);
  const calculated = movingAverageCost({
    previousQuantity: product.stock,
    previousAverageCost: product.averageCost,
    inboundQuantity: input.quantity,
    inboundUnitCost: input.unitCost,
  });
  const updateGlobal = input.updateGlobalStock !== false;
  const newGlobalStock = product.stock + (updateGlobal ? input.quantity : 0);
  const newAverageCost = updateGlobal ? calculated.averageCost : product.averageCost;
  const newStockValue = updateGlobal ? calculated.newValue : product.stockValue;
  await tx.product.update({ where: { id: product.id }, data: {
    stock: newGlobalStock,
    averageCost: newAverageCost,
    stockValue: newStockValue,
  } });
  const updatedBalance = await tx.inventoryBalance.update({
    where: { id: balance.id },
    data: { physical: { increment: input.quantity } },
  });
  const unitCost = stockCost(input.unitCost);
  const totalCost = stockMoney(unitCost.mul(input.quantity));
  const movement = await tx.stockMovement.create({ data: {
    productId: product.id,
    type: input.type,
    quantity: input.quantity,
    previousStock: product.stock,
    newStock: newGlobalStock,
    warehouseId: input.dimension.warehouseId,
    locationId: input.dimension.locationId,
    ...(input.dimension.lotId ? { lotId: input.dimension.lotId } : {}),
    previousBalance: balance.physical,
    newBalance: updatedBalance.physical,
    previousReserved: balance.reserved,
    newReserved: updatedBalance.reserved,
    previousBlocked: balance.blocked,
    newBlocked: updatedBalance.blocked,
    unitCost,
    totalCost,
    averageCostBefore: product.averageCost,
    averageCostAfter: newAverageCost,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.operationKey ? { operationKey: input.operationKey } : {}),
    ...(input.actorUserId ? { createdById: input.actorUserId } : {}),
    ...(input.purchaseOrderId ? { purchaseOrderId: input.purchaseOrderId } : {}),
    ...(input.purchaseReceiptId ? { purchaseReceiptId: input.purchaseReceiptId } : {}),
    ...(input.returnProcessId ? { returnProcessId: input.returnProcessId } : {}),
    ...(input.returnItemId ? { returnItemId: input.returnItemId } : {}),
    ...(input.adjustmentId ? { adjustmentId: input.adjustmentId } : {}),
    ...(input.adjustmentItemId ? { adjustmentItemId: input.adjustmentItemId } : {}),
    ...(input.inventoryId ? { inventoryId: input.inventoryId } : {}),
    ...(input.inventoryItemId ? { inventoryItemId: input.inventoryItemId } : {}),
  } });
  if (updateGlobal) await tx.stockCostHistory.create({ data: {
    productId: product.id,
    eventType: input.costEventType,
    quantity: input.quantity,
    unitCost,
    totalValue: totalCost,
    previousQuantity: product.stock,
    newQuantity: newGlobalStock,
    averageCostBefore: product.averageCost,
    averageCostAfter: newAverageCost,
    stockValueBefore: product.stockValue,
    stockValueAfter: newStockValue,
    stockMovementId: movement.id,
    ...(input.purchaseReceiptId ? { purchaseReceiptId: input.purchaseReceiptId } : {}),
    ...(input.reason ? { reference: input.reason } : {}),
    ...(input.actorUserId ? { createdById: input.actorUserId } : {}),
  } });
  return { movement, balance: updatedBalance, product: { ...product, stock: newGlobalStock, averageCost: newAverageCost, stockValue: newStockValue } };
}

export async function recordOutbound(tx: StockTransaction, input: {
  dimension: StockDimension;
  quantity: number;
  type: StockMovementType;
  costEventType: StockCostEventType;
  actorUserId?: string;
  reason?: string;
  operationKey?: string;
  orderId?: string;
  returnProcessId?: string;
  returnItemId?: string;
  adjustmentId?: string;
  adjustmentItemId?: string;
  inventoryId?: string;
  inventoryItemId?: string;
  shipmentId?: string;
  shipmentItemId?: string;
  updateGlobalStock?: boolean;
}) {
  if (input.quantity <= 0) throw new AppError('A quantidade deve ser positiva.', 400, 'INVALID_STOCK_QUANTITY');
  const product = await lockProduct(tx, input.dimension.productId);
  const balance = await lockBalance(tx, input.dimension);
  assertBalanceCapacity(balance, input.quantity);
  const updateGlobal = input.updateGlobalStock !== false;
  const newGlobalStock = product.stock - (updateGlobal ? input.quantity : 0);
  if (newGlobalStock < 0) throw new AppError('Estoque consolidado insuficiente.', 409, 'INSUFFICIENT_STOCK');
  const cost = outboundCost(input.quantity, product.averageCost);
  const newStockValue = updateGlobal ? stockMoney(Prisma.Decimal.max(0, new Prisma.Decimal(product.stockValue).sub(cost.amount))) : product.stockValue;
  await tx.product.update({ where: { id: product.id }, data: { stock: newGlobalStock, stockValue: newStockValue } });
  const updatedBalance = await tx.inventoryBalance.update({ where: { id: balance.id }, data: { physical: { decrement: input.quantity } } });
  const movement = await tx.stockMovement.create({ data: {
    productId: product.id,
    type: input.type,
    quantity: input.quantity,
    previousStock: product.stock,
    newStock: newGlobalStock,
    warehouseId: input.dimension.warehouseId,
    locationId: input.dimension.locationId,
    ...(input.dimension.lotId ? { lotId: input.dimension.lotId } : {}),
    previousBalance: balance.physical,
    newBalance: updatedBalance.physical,
    previousReserved: balance.reserved,
    newReserved: updatedBalance.reserved,
    previousBlocked: balance.blocked,
    newBlocked: updatedBalance.blocked,
    unitCost: cost.unitCost,
    totalCost: cost.amount,
    averageCostBefore: product.averageCost,
    averageCostAfter: product.averageCost,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.operationKey ? { operationKey: input.operationKey } : {}),
    ...(input.actorUserId ? { createdById: input.actorUserId } : {}),
    ...(input.orderId ? { orderId: input.orderId } : {}),
    ...(input.returnProcessId ? { returnProcessId: input.returnProcessId } : {}),
    ...(input.returnItemId ? { returnItemId: input.returnItemId } : {}),
    ...(input.adjustmentId ? { adjustmentId: input.adjustmentId } : {}),
    ...(input.adjustmentItemId ? { adjustmentItemId: input.adjustmentItemId } : {}),
    ...(input.inventoryId ? { inventoryId: input.inventoryId } : {}),
    ...(input.inventoryItemId ? { inventoryItemId: input.inventoryItemId } : {}),
    ...(input.shipmentId ? { shipmentId: input.shipmentId } : {}),
    ...(input.shipmentItemId ? { shipmentItemId: input.shipmentItemId } : {}),
  } });
  if (updateGlobal) await tx.stockCostHistory.create({ data: {
    productId: product.id,
    eventType: input.costEventType,
    quantity: input.quantity,
    unitCost: cost.unitCost,
    totalValue: cost.amount,
    previousQuantity: product.stock,
    newQuantity: newGlobalStock,
    averageCostBefore: product.averageCost,
    averageCostAfter: product.averageCost,
    stockValueBefore: product.stockValue,
    stockValueAfter: newStockValue,
    stockMovementId: movement.id,
    ...(input.reason ? { reference: input.reason } : {}),
    ...(input.actorUserId ? { createdById: input.actorUserId } : {}),
  } });
  return { movement, balance: updatedBalance, product: { ...product, stock: newGlobalStock, stockValue: newStockValue }, cost };
}

export async function changeAllocation(tx: StockTransaction, dimension: StockDimension, input: {
  reservedDelta?: number;
  blockedDelta?: number;
  inTransitDelta?: number;
}) {
  const balance = await lockBalance(tx, dimension);
  const reserved = balance.reserved + (input.reservedDelta ?? 0);
  const blocked = balance.blocked + (input.blockedDelta ?? 0);
  const inTransit = balance.inTransit + (input.inTransitDelta ?? 0);
  if (reserved < 0 || blocked < 0 || inTransit < 0 || reserved + blocked > balance.physical) {
    throw new AppError('A alocação deixaria o saldo inconsistente.', 409, 'INVALID_STOCK_ALLOCATION');
  }
  return tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved, blocked, inTransit } });
}
