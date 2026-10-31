import {
  AuditAction,
  AuditEntity,
  CogsEntryType,
  OrderStatus,
  Prisma,
  StockAdjustmentStatus,
  StockAdjustmentType,
  StockCostEventType,
  StockInventoryStatus,
  StockMovementType,
  StockSerialStatus,
  StockTransferStatus,
  type UserRole,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type {
  AdvancedStockQuery,
  CreateInventoryInput,
  CreateStockAdjustmentInput,
  CreateStockLocationInput,
  CreateOrderShipmentInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  InventoryCountsInput,
  ReceiveStockTransferInput,
  UpdateStockLocationInput,
  UpdateWarehouseInput,
} from '../schemas/advanced-stock.schema.js';
import type { AuditLogger } from './audit.service.js';
import { consolidatedBalance, inventoryDivergence, isExpired, stockMoney } from './advanced-stock-rules.js';
import {
  assertBalanceCapacity,
  changeAllocation,
  inventoryBalanceKey,
  lockBalance,
  lockProduct,
  recordInbound,
  recordOutbound,
  type StockDimension,
} from './stock-ledger.js';

const userSummary = { id: true, name: true, email: true } as const;
const transferInclude = {
  sourceWarehouse: { select: { id: true, code: true, name: true } },
  destinationWarehouse: { select: { id: true, code: true, name: true } },
  createdBy: { select: userSummary }, approvedBy: { select: userSummary }, shippedBy: { select: userSummary }, receivedBy: { select: userSummary },
  items: { orderBy: { createdAt: 'asc' as const }, include: {
    product: { select: { id: true, sku: true, name: true, trackingMode: true, averageCost: true } },
    sourceLocation: { select: { id: true, code: true, description: true } }, destinationLocation: { select: { id: true, code: true, description: true } },
    lot: { select: { id: true, code: true, expirationDate: true, status: true } },
    serials: { include: { serial: { select: { id: true, serialNumber: true, status: true } } } },
  } },
} satisfies Prisma.StockTransferInclude;
const inventoryInclude = {
  warehouse: { select: { id: true, code: true, name: true } }, location: { select: { id: true, code: true, description: true } },
  createdBy: { select: userSummary }, approvedBy: { select: userSummary },
  items: { orderBy: { createdAt: 'asc' as const }, include: {
    product: { select: { id: true, sku: true, name: true } }, location: { select: { id: true, code: true } }, lot: { select: { id: true, code: true } },
    counts: { orderBy: { sequence: 'asc' as const }, include: { countedBy: { select: userSummary } } },
  } },
} satisfies Prisma.StockInventoryInclude;
const adjustmentInclude = {
  warehouse: { select: { id: true, code: true, name: true } }, createdBy: { select: userSummary }, approvedBy: { select: userSummary }, appliedBy: { select: userSummary },
  items: { include: { product: { select: { id: true, sku: true, name: true } }, location: { select: { id: true, code: true } }, lot: { select: { id: true, code: true } } } },
} satisfies Prisma.StockAdjustmentInclude;

function roleCanApprove(role: UserRole): boolean { return role === 'ADMIN'; }

export class AdvancedStockService {
  constructor(private readonly audit: AuditLogger) {}

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito de estoque. Atualize os dados e tente novamente.', 409, 'STOCK_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito de estoque.', 409, 'STOCK_CONCURRENCY_CONFLICT');
  }

  async setup() {
    const [warehouses, products, expiringLots, pendingTransfers, pendingInventories, pendingAdjustments] = await prisma.$transaction([
      prisma.warehouse.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { responsible: { select: userSummary }, locations: { orderBy: [{ active: 'desc' }, { code: 'asc' }] } } }),
      prisma.product.count({ where: { active: true } }),
      prisma.stockLot.count({ where: { status: { in: ['AVAILABLE', 'QUARANTINE'] }, expirationDate: { lte: new Date(Date.now() + 30 * 86_400_000) } } }),
      prisma.stockTransfer.count({ where: { status: { in: ['PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'] } } }),
      prisma.stockInventory.count({ where: { status: { in: ['OPEN', 'COUNTING', 'PENDING_APPROVAL', 'APPROVED'] } } }),
      prisma.stockAdjustment.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } } }),
    ]);
    return { warehouses, metrics: { products, expiringLots, pendingTransfers, pendingInventories, pendingAdjustments } };
  }

  async listWarehouses() {
    return { data: await prisma.warehouse.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { responsible: { select: userSummary }, locations: { orderBy: [{ active: 'desc' }, { code: 'asc' }] }, _count: { select: { balances: true, outgoingTransfers: true, incomingTransfers: true } } } }) };
  }

  updateProductTracking(productId: string, input: { trackingMode: 'NONE' | 'LOT' | 'SERIAL' | 'LOT_AND_SERIAL'; expiryWarningDays: number; blockExpired: boolean }, actor: string) {
    return this.transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
      const updated = await tx.product.update({ where: { id: productId }, data: input });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PRODUCT, entityId: productId, action: AuditAction.UPDATE, oldData: { trackingMode: product.trackingMode, expiryWarningDays: product.expiryWarningDays, blockExpired: product.blockExpired }, newData: input }, tx);
      return updated;
    });
  }

  createWarehouse(input: CreateWarehouseInput, actor: string) {
    return this.transaction(async (tx) => {
      const duplicate = await tx.warehouse.findUnique({ where: { code: input.code } });
      if (duplicate) throw new AppError('Já existe um depósito com este código.', 409, 'WAREHOUSE_CODE_EXISTS');
      if (input.responsibleId && !await tx.user.findUnique({ where: { id: input.responsibleId }, select: { id: true } })) throw new AppError('Responsável não encontrado.', 404, 'USER_NOT_FOUND');
      const warehouseData: Prisma.WarehouseUncheckedCreateInput = {
        code: input.code, name: input.name, createdById: actor,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.responsibleId !== undefined ? { responsibleId: input.responsibleId } : {}),
      };
      const created = await tx.warehouse.create({ data: warehouseData });
      await tx.stockLocation.create({ data: { warehouseId: created.id, code: 'GERAL', description: 'Localização padrão', isDefault: true } });
      const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: created.id }, include: { locations: true, responsible: { select: userSummary } } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.WAREHOUSE, entityId: warehouse.id, action: AuditAction.CREATE, newData: warehouse }, tx);
      return warehouse;
    });
  }

  updateWarehouse(id: string, input: UpdateWarehouseInput, actor: string) {
    return this.transaction(async (tx) => {
      const existing = await tx.warehouse.findUnique({ where: { id } });
      if (!existing) throw new AppError('Depósito não encontrado.', 404, 'WAREHOUSE_NOT_FOUND');
      if (input.code && input.code !== existing.code && await tx.warehouse.findUnique({ where: { code: input.code } })) throw new AppError('Já existe um depósito com este código.', 409, 'WAREHOUSE_CODE_EXISTS');
      if (input.active === false) {
        const balances = await tx.inventoryBalance.aggregate({ where: { warehouseId: id }, _sum: { physical: true, reserved: true, blocked: true, inTransit: true } });
        const total = (balances._sum.physical ?? 0) + (balances._sum.reserved ?? 0) + (balances._sum.blocked ?? 0) + (balances._sum.inTransit ?? 0);
        if (total > 0) throw new AppError('Transfira ou ajuste todos os saldos antes de inativar o depósito.', 409, 'WAREHOUSE_HAS_STOCK');
      }
      const data: Prisma.WarehouseUncheckedUpdateInput = {
        ...(input.code !== undefined ? { code: input.code } : {}), ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}), ...(input.responsibleId !== undefined ? { responsibleId: input.responsibleId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      const warehouse = await tx.warehouse.update({ where: { id }, data, include: { locations: true, responsible: { select: userSummary } } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.WAREHOUSE, entityId: id, action: AuditAction.UPDATE, oldData: existing, newData: warehouse }, tx);
      return warehouse;
    });
  }

  createLocation(warehouseId: string, input: CreateStockLocationInput, actor: string) {
    return this.transaction(async (tx) => {
      const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
      if (!warehouse) throw new AppError('Depósito não encontrado.', 404, 'WAREHOUSE_NOT_FOUND');
      if (!warehouse.active) throw new AppError('O depósito está inativo.', 409, 'WAREHOUSE_INACTIVE');
      const duplicate = await tx.stockLocation.findUnique({ where: { warehouseId_code: { warehouseId, code: input.code } } });
      if (duplicate) throw new AppError('Já existe uma localização com este código no depósito.', 409, 'LOCATION_CODE_EXISTS');
      const location = await tx.stockLocation.create({ data: { warehouseId, code: input.code, type: input.type, ...(input.description !== undefined ? { description: input.description } : {}) } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.WAREHOUSE, entityId: warehouseId, action: AuditAction.UPDATE, newData: { location } }, tx);
      return location;
    });
  }

  updateLocation(id: string, input: UpdateStockLocationInput, actor: string) {
    return this.transaction(async (tx) => {
      const existing = await tx.stockLocation.findUnique({ where: { id } });
      if (!existing) throw new AppError('Localização não encontrada.', 404, 'LOCATION_NOT_FOUND');
      if (input.code && input.code !== existing.code && await tx.stockLocation.findUnique({ where: { warehouseId_code: { warehouseId: existing.warehouseId, code: input.code } } })) throw new AppError('Já existe uma localização com este código no depósito.', 409, 'LOCATION_CODE_EXISTS');
      if (input.active === false) {
        const sum = await tx.inventoryBalance.aggregate({ where: { locationId: id }, _sum: { physical: true, reserved: true, blocked: true, inTransit: true } });
        if ((sum._sum.physical ?? 0) + (sum._sum.reserved ?? 0) + (sum._sum.blocked ?? 0) + (sum._sum.inTransit ?? 0) > 0) throw new AppError('A localização ainda possui saldo.', 409, 'LOCATION_HAS_STOCK');
      }
      const data: Prisma.StockLocationUncheckedUpdateInput = { ...(input.code !== undefined ? { code: input.code } : {}), ...(input.description !== undefined ? { description: input.description } : {}), ...(input.type !== undefined ? { type: input.type } : {}), ...(input.active !== undefined ? { active: input.active } : {}) };
      const location = await tx.stockLocation.update({ where: { id }, data });
      await this.audit.log({ userId: actor, entityType: AuditEntity.WAREHOUSE, entityId: existing.warehouseId, action: AuditAction.UPDATE, oldData: existing, newData: location }, tx);
      return location;
    });
  }

  async balances(query: AdvancedStockQuery) {
    const where: Prisma.InventoryBalanceWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}), ...(query.lotId ? { lotId: query.lotId } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.inventoryBalance.findMany({ where, skip: (query.page - 1) * query.pageSize, take: query.pageSize, orderBy: [{ product: { name: 'asc' } }, { warehouse: { name: 'asc' } }, { location: { code: 'asc' } }], include: { product: { select: { id: true, sku: true, name: true, averageCost: true, stockValue: true } }, warehouse: { select: { id: true, code: true, name: true, active: true } }, location: { select: { id: true, code: true, type: true, active: true } }, lot: { select: { id: true, code: true, expirationDate: true, status: true } } } }),
      prisma.inventoryBalance.count({ where }),
    ]);
    const normalized = records.map((item) => ({ ...item, available: item.physical - item.reserved - item.blocked }));
    return { data: normalized, totals: consolidatedBalance(records), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async listTransfers() {
    return { data: await prisma.stockTransfer.findMany({ orderBy: { createdAt: 'desc' }, include: transferInclude }) };
  }

  createOrderShipment(orderId: string, input: CreateOrderShipmentInput, actor: string) {
    return this.transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.orderShipment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: { include: { orderItem: true, cogsEntry: true } }, createdBy: { select: userSummary } } });
        if (existing) return existing;
      }
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: { select: { trackingMode: true } }, stockReservations: { where: { active: true }, include: { lot: { select: { expirationDate: true } } } } } } } });
      if (!order) throw new AppError('Pedido não encontrado.', 404, 'ORDER_NOT_FOUND');
      if (order.status !== OrderStatus.CONFIRMED && order.status !== OrderStatus.PROCESSING) throw new AppError('O pedido precisa estar confirmado ou em processamento para expedição.', 409, 'ORDER_NOT_SHIPPABLE');
      if (new Set(input.items.map((item) => item.orderItemId)).size !== input.items.length) throw new AppError('Há itens repetidos na expedição.', 400, 'DUPLICATE_SHIPMENT_ITEM');
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('order_shipment_number_seq') AS value`;
      const shipment = await tx.orderShipment.create({ data: { number: `EXP-${sequence[0]!.value.toString().padStart(6, '0')}`, orderId, createdById: actor, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}), ...(input.notes ? { notes: input.notes } : {}) } });
      for (const requestItem of [...input.items].sort((a, b) => a.orderItemId.localeCompare(b.orderItemId))) {
        const orderItem = order.items.find((item) => item.id === requestItem.orderItemId);
        if (!orderItem) throw new AppError('Item não pertence ao pedido.', 400, 'ORDER_ITEM_NOT_FOUND');
        const shipped = await tx.orderShipmentItem.aggregate({ where: { orderItemId: orderItem.id }, _sum: { quantity: true } });
        if (requestItem.quantity > orderItem.quantity - (shipped._sum.quantity ?? 0)) throw new AppError(`A expedição excede o saldo de "${orderItem.productName}".`, 409, 'SHIPMENT_EXCEEDS_ORDER');
        if ((orderItem.product.trackingMode === 'SERIAL' || orderItem.product.trackingMode === 'LOT_AND_SERIAL') && requestItem.serialIds.length !== requestItem.quantity) throw new AppError(`Informe uma série para cada unidade de "${orderItem.productName}".`, 400, 'SHIPMENT_SERIAL_QUANTITY_MISMATCH');
        const product = await tx.product.findUniqueOrThrow({ where: { id: orderItem.productId } });
        const shipmentItem = await tx.orderShipmentItem.create({ data: { shipmentId: shipment.id, orderItemId: orderItem.id, productId: orderItem.productId, quantity: requestItem.quantity, unitCost: product.averageCost, totalCost: stockMoney(product.averageCost.mul(requestItem.quantity)) } });
        let pending = requestItem.quantity; let actualCost = new Prisma.Decimal(0);
        const reservations = [...orderItem.stockReservations].sort((left, right) => {
          const leftDate = left.lot?.expirationDate?.getTime() ?? Number.MAX_SAFE_INTEGER; const rightDate = right.lot?.expirationDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return leftDate - rightDate || left.createdAt.getTime() - right.createdAt.getTime();
        });
        for (const reservation of reservations) {
          if (pending <= 0) break;
          const remaining = reservation.quantity - reservation.consumedQuantity - reservation.releasedQuantity;
          const quantity = Math.min(pending, Math.max(remaining, 0)); if (quantity <= 0) continue;
          const dimension = { productId: orderItem.productId, warehouseId: reservation.warehouseId, locationId: reservation.locationId, lotId: reservation.lotId };
          const balance = await lockBalance(tx, dimension);
          if (balance.reserved < quantity || balance.physical < quantity) throw new AppError('Saldo reservado inconsistente para expedição.', 409, 'RESERVATION_BALANCE_INCONSISTENT');
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { decrement: quantity } } });
          const outbound = await recordOutbound(tx, { dimension, quantity, type: StockMovementType.SALE, costEventType: StockCostEventType.SALE, actorUserId: actor, reason: `Expedição ${shipment.number}`, operationKey: `shipment:${shipment.id}:${shipmentItem.id}:${reservation.id}`, orderId, shipmentId: shipment.id, shipmentItemId: shipmentItem.id });
          actualCost = actualCost.add(outbound.cost.amount);
          const consumedQuantity = reservation.consumedQuantity + quantity;
          await tx.stockReservation.update({ where: { id: reservation.id }, data: { consumedQuantity: { increment: quantity }, active: consumedQuantity + reservation.releasedQuantity < reservation.quantity } });
          pending -= quantity;
        }
        if (pending > 0) throw new AppError('Reserva insuficiente para a expedição.', 409, 'INSUFFICIENT_RESERVATION');
        const actualUnitCost = actualCost.div(requestItem.quantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
        await tx.orderShipmentItem.update({ where: { id: shipmentItem.id }, data: { unitCost: actualUnitCost, totalCost: stockMoney(actualCost) } });
        if (requestItem.serialIds.length) {
          const serials = await tx.stockSerial.findMany({ where: { id: { in: requestItem.serialIds } } });
          if (serials.length !== requestItem.serialIds.length || serials.some((serial) => serial.productId !== orderItem.productId || (serial.status !== StockSerialStatus.AVAILABLE && serial.status !== StockSerialStatus.RESERVED))) throw new AppError('Uma ou mais séries estão indisponíveis.', 409, 'SERIAL_NOT_AVAILABLE');
          await tx.stockSerial.updateMany({ where: { id: { in: requestItem.serialIds } }, data: { status: StockSerialStatus.SOLD } });
        }
        const competenceDate = new Date(); competenceDate.setUTCHours(0, 0, 0, 0);
        await tx.cogsEntry.create({ data: { type: CogsEntryType.RECOGNITION, orderId, orderItemId: orderItem.id, shipmentItemId: shipmentItem.id, productId: orderItem.productId, quantity: requestItem.quantity, unitCost: actualUnitCost, amount: stockMoney(actualCost), competenceDate, idempotencyKey: `cogs:shipment:${shipmentItem.id}`, notes: `CMV reconhecido na expedição ${shipment.number}`, createdById: actor } });
      }
      await this.audit.log({ userId: actor, entityType: AuditEntity.COGS, entityId: shipment.id, action: AuditAction.CREATE, newData: { orderId, shipmentNumber: shipment.number, items: input.items } }, tx);
      return tx.orderShipment.findUniqueOrThrow({ where: { id: shipment.id }, include: { items: { include: { orderItem: true, cogsEntry: true, movements: true } }, createdBy: { select: userSummary } } });
    });
  }
  async getTransfer(id: string) {
    const transfer = await prisma.stockTransfer.findUnique({ where: { id }, include: transferInclude });
    if (!transfer) throw new AppError('Transferência não encontrada.', 404, 'TRANSFER_NOT_FOUND');
    return transfer;
  }

  createTransfer(input: CreateStockTransferInput, actor: string) {
    return this.transaction(async (tx) => {
      if (input.idempotencyKey) {
        const existing = await tx.stockTransfer.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: transferInclude });
        if (existing) return existing;
      }
      const warehouses = await tx.warehouse.findMany({ where: { id: { in: [input.sourceWarehouseId, input.destinationWarehouseId] } }, select: { id: true, active: true } });
      if (warehouses.length !== 2) throw new AppError('Depósito de origem ou destino não encontrado.', 404, 'WAREHOUSE_NOT_FOUND');
      if (warehouses.some((item) => !item.active)) throw new AppError('Origem e destino devem estar ativos.', 409, 'WAREHOUSE_INACTIVE');
      const itemKey = (item: CreateStockTransferInput['items'][number]) => `${item.productId}:${item.sourceLocationId}:${item.destinationLocationId}:${item.lotId ?? 'none'}`;
      if (new Set(input.items.map(itemKey)).size !== input.items.length) throw new AppError('Há itens duplicados na transferência.', 400, 'DUPLICATE_TRANSFER_ITEM');
      const [locations, products, lots, serials] = await Promise.all([
        tx.stockLocation.findMany({ where: { id: { in: input.items.flatMap((item) => [item.sourceLocationId, item.destinationLocationId]) } }, select: { id: true, warehouseId: true, active: true } }),
        tx.product.findMany({ where: { id: { in: input.items.map((item) => item.productId) } }, select: { id: true, active: true, trackingMode: true } }),
        tx.stockLot.findMany({ where: { id: { in: input.items.flatMap((item) => item.lotId ? [item.lotId] : []) } }, select: { id: true, productId: true, expirationDate: true, status: true } }),
        tx.stockSerial.findMany({ where: { id: { in: input.items.flatMap((item) => item.serialIds) } }, select: { id: true, productId: true, warehouseId: true, locationId: true, lotId: true, status: true } }),
      ]);
      const locationMap = new Map(locations.map((item) => [item.id, item])); const productMap = new Map(products.map((item) => [item.id, item])); const lotMap = new Map(lots.map((item) => [item.id, item])); const serialMap = new Map(serials.map((item) => [item.id, item]));
      for (const item of input.items) {
        const source = locationMap.get(item.sourceLocationId); const destination = locationMap.get(item.destinationLocationId); const product = productMap.get(item.productId);
        if (!source || source.warehouseId !== input.sourceWarehouseId || !source.active) throw new AppError('Localização de origem inválida.', 400, 'INVALID_SOURCE_LOCATION');
        if (!destination || destination.warehouseId !== input.destinationWarehouseId || !destination.active) throw new AppError('Localização de destino inválida.', 400, 'INVALID_DESTINATION_LOCATION');
        if (!product || !product.active) throw new AppError('Produto inexistente ou inativo.', 409, 'PRODUCT_INACTIVE');
        if (item.lotId) { const lot = lotMap.get(item.lotId); if (!lot || lot.productId !== item.productId) throw new AppError('O lote não pertence ao produto.', 400, 'INVALID_PRODUCT_LOT'); if (lot.status === 'BLOCKED' || lot.status === 'EXPIRED' || isExpired(lot.expirationDate)) throw new AppError('Lote bloqueado ou vencido não pode ser transferido.', 409, 'LOT_NOT_AVAILABLE'); }
        if ((product.trackingMode === 'SERIAL' || product.trackingMode === 'LOT_AND_SERIAL') && item.serialIds.length !== item.quantity) throw new AppError('Informe uma série para cada unidade.', 400, 'SERIAL_QUANTITY_MISMATCH');
        for (const serialId of item.serialIds) { const serial = serialMap.get(serialId); if (!serial || serial.productId !== item.productId || serial.warehouseId !== input.sourceWarehouseId || serial.locationId !== item.sourceLocationId || serial.status !== StockSerialStatus.AVAILABLE || (item.lotId && serial.lotId !== item.lotId)) throw new AppError('Série indisponível ou fora da origem informada.', 409, 'SERIAL_NOT_AVAILABLE'); }
      }
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('stock_transfer_number_seq') AS value`;
      const transfer = await tx.stockTransfer.create({ data: { number: `TR-${sequence[0]!.value.toString().padStart(6, '0')}`, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, createdById: actor, ...(input.notes ? { notes: input.notes } : {}), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}), items: { create: input.items.map((item) => ({ productId: item.productId, sourceLocationId: item.sourceLocationId, destinationLocationId: item.destinationLocationId, ...(item.lotId ? { lotId: item.lotId } : {}), requestedQuantity: item.quantity, serials: { create: item.serialIds.map((serialId) => ({ serialId })) } })) } }, include: transferInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_TRANSFER, entityId: transfer.id, action: AuditAction.CREATE, newData: transfer }, tx);
      return transfer;
    });
  }

  transitionTransfer(id: string, action: 'submit' | 'approve' | 'reject', comment: string | undefined, role: UserRole, actor: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stock_transfers" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const transfer = await tx.stockTransfer.findUnique({ where: { id } });
      if (!transfer) throw new AppError('Transferência não encontrada.', 404, 'TRANSFER_NOT_FOUND');
      let status: StockTransferStatus; let auditAction: AuditAction;
      if (action === 'submit') { if (transfer.status !== StockTransferStatus.DRAFT) throw new AppError('Apenas rascunhos podem ser enviados.', 409, 'INVALID_TRANSFER_STATUS'); status = StockTransferStatus.PENDING_APPROVAL; auditAction = AuditAction.SUBMIT; }
      else { if (!roleCanApprove(role)) throw new AppError('Apenas administradores podem decidir transferências.', 403, 'TRANSFER_APPROVAL_FORBIDDEN'); if (transfer.status !== StockTransferStatus.PENDING_APPROVAL) throw new AppError('A transferência não aguarda aprovação.', 409, 'INVALID_TRANSFER_STATUS'); status = action === 'approve' ? StockTransferStatus.APPROVED : StockTransferStatus.REJECTED; auditAction = action === 'approve' ? AuditAction.APPROVE : AuditAction.REJECT; }
      const updated = await tx.stockTransfer.update({ where: { id }, data: { status, ...(action === 'approve' ? { approvedById: actor, approvedAt: new Date() } : {}), ...(comment ? { notes: [transfer.notes, comment].filter(Boolean).join('\n') } : {}) }, include: transferInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_TRANSFER, entityId: id, action: auditAction, oldData: { status: transfer.status }, newData: { status, comment } }, tx);
      return updated;
    });
  }

  shipTransfer(id: string, actor: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stock_transfers" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: { include: { serials: true } } } });
      if (!transfer) throw new AppError('Transferência não encontrada.', 404, 'TRANSFER_NOT_FOUND');
      if (transfer.status !== StockTransferStatus.APPROVED) throw new AppError('Somente transferências aprovadas podem ser expedidas.', 409, 'TRANSFER_NOT_APPROVED');
      for (const item of [...transfer.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const dimension: StockDimension = { productId: item.productId, warehouseId: transfer.sourceWarehouseId, locationId: item.sourceLocationId, lotId: item.lotId };
        const product = await lockProduct(tx, item.productId); const balance = await lockBalance(tx, dimension); assertBalanceCapacity(balance, item.requestedQuantity);
        const updatedBalance = await tx.inventoryBalance.update({ where: { id: balance.id }, data: { physical: { decrement: item.requestedQuantity }, inTransit: { increment: item.requestedQuantity } } });
        const totalCost = stockMoney(product.averageCost.mul(item.requestedQuantity));
        await tx.stockMovement.create({ data: { productId: item.productId, type: StockMovementType.TRANSFER_OUT, quantity: item.requestedQuantity, previousStock: product.stock, newStock: product.stock, warehouseId: transfer.sourceWarehouseId, locationId: item.sourceLocationId, destinationWarehouseId: transfer.destinationWarehouseId, destinationLocationId: item.destinationLocationId, ...(item.lotId ? { lotId: item.lotId } : {}), previousBalance: balance.physical, newBalance: updatedBalance.physical, previousReserved: balance.reserved, newReserved: updatedBalance.reserved, previousBlocked: balance.blocked, newBlocked: updatedBalance.blocked, unitCost: product.averageCost, totalCost, averageCostBefore: product.averageCost, averageCostAfter: product.averageCost, operationKey: `transfer:${id}:ship:${item.id}`, transferId: id, transferItemId: item.id, reason: `Expedição da transferência ${transfer.number}`, createdById: actor } });
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { shippedQuantity: item.requestedQuantity, unitCost: product.averageCost } });
        if (item.serials.length) await tx.stockSerial.updateMany({ where: { id: { in: item.serials.map((serial) => serial.serialId) } }, data: { status: StockSerialStatus.IN_TRANSIT } });
      }
      await tx.stockTransfer.update({ where: { id }, data: { status: StockTransferStatus.IN_TRANSIT, shippedAt: new Date(), shippedById: actor } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_TRANSFER, entityId: id, action: AuditAction.TRANSFER, oldData: { status: transfer.status }, newData: { status: StockTransferStatus.IN_TRANSIT } }, tx);
      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
    });
  }

  receiveTransfer(id: string, input: ReceiveStockTransferInput, actor: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stock_transfers" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: { include: { serials: true } } } });
      if (!transfer) throw new AppError('Transferência não encontrada.', 404, 'TRANSFER_NOT_FOUND');
      if (transfer.status !== StockTransferStatus.IN_TRANSIT && transfer.status !== StockTransferStatus.PARTIALLY_RECEIVED) throw new AppError('A transferência não está em trânsito.', 409, 'TRANSFER_NOT_IN_TRANSIT');
      const inputIds = new Set(input.items.map((item) => item.itemId)); if (inputIds.size !== input.items.length) throw new AppError('Item repetido no recebimento.', 400, 'DUPLICATE_TRANSFER_RECEIPT_ITEM');
      for (const received of input.items) {
        const item = transfer.items.find((candidate) => candidate.id === received.itemId);
        if (!item) throw new AppError('Item não pertence à transferência.', 400, 'TRANSFER_ITEM_NOT_FOUND');
        if (received.quantity + received.lostQuantity <= 0) throw new AppError('Informe quantidade recebida ou perdida.', 400, 'EMPTY_TRANSFER_RECEIPT');
        const pending = item.shippedQuantity - item.receivedQuantity - item.lostQuantity;
        if (received.quantity + received.lostQuantity > pending) throw new AppError('Recebimento excede a quantidade em trânsito.', 409, 'TRANSFER_RECEIPT_EXCEEDS_PENDING');
        const serialsToResolve = item.serials.filter((serial) => !serial.receivedAt);
        if (item.serials.length && serialsToResolve.length < received.quantity + received.lostQuantity) throw new AppError('Séries em trânsito insuficientes para concluir o recebimento.', 409, 'TRANSFER_SERIALS_INCONSISTENT');
        const receivedSerials = serialsToResolve.slice(0, received.quantity);
        const lostSerials = serialsToResolve.slice(received.quantity, received.quantity + received.lostQuantity);
        const sourceDimension: StockDimension = { productId: item.productId, warehouseId: transfer.sourceWarehouseId, locationId: item.sourceLocationId, lotId: item.lotId };
        const source = await lockBalance(tx, sourceDimension);
        if (source.inTransit < received.quantity + received.lostQuantity) throw new AppError('Saldo em trânsito inconsistente.', 409, 'IN_TRANSIT_BALANCE_INCONSISTENT');
        await tx.inventoryBalance.update({ where: { id: source.id }, data: { inTransit: { decrement: received.quantity + received.lostQuantity } } });
        const product = await lockProduct(tx, item.productId); const unitCost = item.unitCost ?? product.averageCost;
        if (received.quantity > 0) {
          const destinationDimension: StockDimension = { productId: item.productId, warehouseId: transfer.destinationWarehouseId, locationId: item.destinationLocationId, lotId: item.lotId };
          const destination = await lockBalance(tx, destinationDimension);
          const updatedDestination = await tx.inventoryBalance.update({ where: { id: destination.id }, data: { physical: { increment: received.quantity } } });
          await tx.stockMovement.create({ data: { productId: item.productId, type: StockMovementType.TRANSFER_IN, quantity: received.quantity, previousStock: product.stock, newStock: product.stock, warehouseId: transfer.destinationWarehouseId, locationId: item.destinationLocationId, destinationWarehouseId: transfer.destinationWarehouseId, destinationLocationId: item.destinationLocationId, ...(item.lotId ? { lotId: item.lotId } : {}), previousBalance: destination.physical, newBalance: updatedDestination.physical, previousReserved: destination.reserved, newReserved: updatedDestination.reserved, previousBlocked: destination.blocked, newBlocked: updatedDestination.blocked, unitCost, totalCost: stockMoney(unitCost.mul(received.quantity)), averageCostBefore: product.averageCost, averageCostAfter: product.averageCost, operationKey: `transfer:${id}:receive:${item.id}:${item.receivedQuantity + received.quantity}`, transferId: id, transferItemId: item.id, reason: `Recebimento da transferência ${transfer.number}`, createdById: actor } });
        }
        if (received.lostQuantity > 0) {
          if (product.stock < received.lostQuantity) throw new AppError('Estoque consolidado inconsistente para registrar a perda.', 409, 'TRANSFER_LOSS_STOCK_INCONSISTENT');
          const totalCost = stockMoney(unitCost.mul(received.lostQuantity)); const newStock = product.stock - received.lostQuantity;
          const newStockValue = stockMoney(Prisma.Decimal.max(0, product.stockValue.sub(totalCost)));
          const averageCostAfter = newStock > 0 ? newStockValue.div(newStock).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP) : new Prisma.Decimal(0);
          await tx.product.update({ where: { id: product.id }, data: { stock: newStock, stockValue: newStockValue, averageCost: averageCostAfter } });
          const lossMovement = await tx.stockMovement.create({ data: { productId: item.productId, type: StockMovementType.TRANSFER_LOSS, quantity: received.lostQuantity, previousStock: product.stock, newStock, warehouseId: transfer.sourceWarehouseId, locationId: item.sourceLocationId, ...(item.lotId ? { lotId: item.lotId } : {}), previousBalance: source.physical, newBalance: source.physical, unitCost, totalCost, averageCostBefore: product.averageCost, averageCostAfter, operationKey: `transfer:${id}:loss:${item.id}:${item.lostQuantity + received.lostQuantity}`, transferId: id, transferItemId: item.id, reason: `Perda em trânsito da transferência ${transfer.number}`, createdById: actor } });
          await tx.stockCostHistory.create({ data: { productId: item.productId, eventType: StockCostEventType.LOSS, quantity: received.lostQuantity, unitCost, totalValue: totalCost, previousQuantity: product.stock, newQuantity: newStock, averageCostBefore: product.averageCost, averageCostAfter, stockValueBefore: product.stockValue, stockValueAfter: newStockValue, stockMovementId: lossMovement.id, reference: `Perda em trânsito ${transfer.number}`, createdById: actor } });
        }
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { receivedQuantity: { increment: received.quantity }, lostQuantity: { increment: received.lostQuantity } } });
        const resolvedAt = new Date();
        if (receivedSerials.length) {
          await tx.stockSerial.updateMany({ where: { id: { in: receivedSerials.map((serial) => serial.serialId) } }, data: { warehouseId: transfer.destinationWarehouseId, locationId: item.destinationLocationId, status: StockSerialStatus.AVAILABLE } });
          await tx.stockTransferSerial.updateMany({ where: { id: { in: receivedSerials.map((serial) => serial.id) } }, data: { receivedAt: resolvedAt } });
        }
        if (lostSerials.length) {
          await tx.stockSerial.updateMany({ where: { id: { in: lostSerials.map((serial) => serial.serialId) } }, data: { status: StockSerialStatus.DISPOSED } });
          await tx.stockTransferSerial.updateMany({ where: { id: { in: lostSerials.map((serial) => serial.id) } }, data: { receivedAt: resolvedAt } });
        }
      }
      const refreshed = await tx.stockTransferItem.findMany({ where: { transferId: id } });
      const completed = refreshed.every((item) => item.receivedQuantity + item.lostQuantity === item.shippedQuantity);
      const status = completed ? StockTransferStatus.COMPLETED : StockTransferStatus.PARTIALLY_RECEIVED;
      await tx.stockTransfer.update({ where: { id }, data: { status, receivedById: actor, ...(completed ? { receivedAt: new Date() } : {}), ...(input.notes ? { notes: [transfer.notes, input.notes].filter(Boolean).join('\n') } : {}) } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_TRANSFER, entityId: id, action: AuditAction.RECEIVE, oldData: { status: transfer.status }, newData: { status, items: input.items } }, tx);
      return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
    });
  }

  async listInventories() { return { data: await prisma.stockInventory.findMany({ orderBy: { createdAt: 'desc' }, include: inventoryInclude }) }; }
  createInventory(input: CreateInventoryInput, actor: string) {
    return this.transaction(async (tx) => {
      const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId }, include: { locations: { where: { active: true } } } });
      if (!warehouse) throw new AppError('Depósito não encontrado.', 404, 'WAREHOUSE_NOT_FOUND');
      if (!warehouse.active) throw new AppError('O depósito está inativo.', 409, 'WAREHOUSE_INACTIVE');
      if (input.locationId && !warehouse.locations.some((item) => item.id === input.locationId)) throw new AppError('Localização não pertence ao depósito.', 400, 'INVALID_INVENTORY_LOCATION');
      const balanceWhere: Prisma.InventoryBalanceWhereInput = { warehouseId: input.warehouseId, ...(input.locationId ? { locationId: input.locationId } : {}), ...(input.productIds?.length ? { productId: { in: input.productIds } } : {}), ...(input.categoryId ? { product: { categoryId: input.categoryId } } : {}), ...(input.lotId ? { lotId: input.lotId } : {}) };
      const balances = await tx.inventoryBalance.findMany({ where: balanceWhere, orderBy: [{ productId: 'asc' }, { locationId: 'asc' }] });
      if (!balances.length) throw new AppError('Nenhum saldo encontrado para o escopo informado.', 409, 'EMPTY_INVENTORY_SCOPE');
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('stock_inventory_number_seq') AS value`;
      const inventory = await tx.stockInventory.create({ data: { number: `INV-${sequence[0]!.value.toString().padStart(6, '0')}`, warehouseId: input.warehouseId, ...(input.locationId ? { locationId: input.locationId } : {}), ...(input.notes ? { notes: input.notes } : {}), scope: { productIds: input.productIds ?? [], categoryId: input.categoryId ?? null, lotId: input.lotId ?? null }, createdById: actor, items: { create: balances.map((balance) => ({ productId: balance.productId, locationId: balance.locationId, ...(balance.lotId ? { lotId: balance.lotId } : {}), expectedQuantity: balance.physical })) } }, include: inventoryInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_INVENTORY, entityId: inventory.id, action: AuditAction.CREATE, newData: { number: inventory.number, warehouseId: inventory.warehouseId, items: balances.length } }, tx);
      return inventory;
    });
  }

  countInventory(id: string, input: InventoryCountsInput, actor: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stock_inventories" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const inventory = await tx.stockInventory.findUnique({ where: { id }, include: { items: { include: { counts: true } } } });
      if (!inventory) throw new AppError('Inventário não encontrado.', 404, 'INVENTORY_NOT_FOUND');
      if (inventory.status !== StockInventoryStatus.OPEN && inventory.status !== StockInventoryStatus.COUNTING) throw new AppError('O inventário não aceita novas contagens.', 409, 'INVENTORY_NOT_COUNTABLE');
      for (const count of input.items) {
        const item = inventory.items.find((candidate) => candidate.id === count.itemId);
        if (!item) throw new AppError('Item não pertence ao inventário.', 400, 'INVENTORY_ITEM_NOT_FOUND');
        const sequence = item.counts.length + 1;
        await tx.stockInventoryCount.create({ data: { inventoryItemId: item.id, sequence, countedQuantity: count.countedQuantity, ...(count.serialNumbers ? { serialNumbers: count.serialNumbers } : {}), ...(count.notes ? { notes: count.notes } : {}), countedById: actor } });
        await tx.stockInventoryItem.update({ where: { id: item.id }, data: { finalQuantity: count.countedQuantity } });
      }
      await tx.stockInventory.update({ where: { id }, data: { status: StockInventoryStatus.COUNTING } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_INVENTORY, entityId: id, action: AuditAction.ADJUST, newData: { counts: input.items } }, tx);
      return tx.stockInventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude });
    });
  }

  submitInventory(id: string, actor: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stock_inventories" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const inventory = await tx.stockInventory.findUnique({ where: { id }, include: { items: true } });
      if (!inventory) throw new AppError('Inventário não encontrado.', 404, 'INVENTORY_NOT_FOUND');
      if (inventory.status !== StockInventoryStatus.OPEN && inventory.status !== StockInventoryStatus.COUNTING) throw new AppError('Status inválido para envio.', 409, 'INVALID_INVENTORY_STATUS');
      if (inventory.items.some((item) => item.finalQuantity === null)) throw new AppError('Todos os itens precisam de uma contagem final.', 409, 'INVENTORY_COUNT_INCOMPLETE');
      const updated = await tx.stockInventory.update({ where: { id }, data: { status: StockInventoryStatus.PENDING_APPROVAL }, include: inventoryInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_INVENTORY, entityId: id, action: AuditAction.SUBMIT, oldData: { status: inventory.status }, newData: { status: updated.status } }, tx); return updated;
    });
  }

  decideInventory(id: string, approve: boolean, reason: string | undefined, role: UserRole, actor: string) {
    return this.transaction(async (tx) => {
      if (!roleCanApprove(role)) throw new AppError('Apenas administradores podem decidir inventários.', 403, 'INVENTORY_APPROVAL_FORBIDDEN');
      await tx.$queryRaw`SELECT "id" FROM "stock_inventories" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const inventory = await tx.stockInventory.findUnique({ where: { id }, include: { items: true } });
      if (!inventory) throw new AppError('Inventário não encontrado.', 404, 'INVENTORY_NOT_FOUND');
      if (inventory.status !== StockInventoryStatus.PENDING_APPROVAL) throw new AppError('O inventário não aguarda aprovação.', 409, 'INVALID_INVENTORY_STATUS');
      if (approve && inventory.createdById === actor) throw new AppError('O responsável pelo inventário não pode aprovar a própria contagem.', 409, 'INVENTORY_SELF_APPROVAL');
      if (!approve) { const rejected = await tx.stockInventory.update({ where: { id }, data: { status: StockInventoryStatus.REJECTED, rejectionReason: reason ?? 'Rejeitado' }, include: inventoryInclude }); await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_INVENTORY, entityId: id, action: AuditAction.REJECT, newData: { reason } }, tx); return rejected; }
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('stock_adjustment_number_seq') AS value`;
      const divergent = inventory.items.map((item) => ({ item, divergence: inventoryDivergence(item.expectedQuantity, item.finalQuantity!) })).filter(({ divergence }) => divergence.quantity !== 0);
      const adjustment = await tx.stockAdjustment.create({ data: { number: `AJ-${sequence[0]!.value.toString().padStart(6, '0')}`, warehouseId: inventory.warehouseId, status: StockAdjustmentStatus.APPROVED, reason: `Correção do inventário ${inventory.number}`, inventoryId: inventory.id, createdById: inventory.createdById, approvedById: actor, approvedAt: new Date(), items: { create: divergent.map(({ item, divergence }) => ({ productId: item.productId, locationId: item.locationId, ...(item.lotId ? { lotId: item.lotId } : {}), type: divergence.quantity > 0 ? StockAdjustmentType.POSITIVE : StockAdjustmentType.NEGATIVE, quantity: Math.abs(divergence.quantity) })) } } });
      const adjustmentItems = await tx.stockAdjustmentItem.findMany({ where: { adjustmentId: adjustment.id }, orderBy: { productId: 'asc' } });
      for (const item of adjustmentItems) await this.applyAdjustmentItem(tx, adjustment.id, item, actor, inventory.id, inventory.items.find((candidate) => candidate.productId === item.productId && candidate.locationId === item.locationId && candidate.lotId === item.lotId)?.id);
      await tx.stockAdjustment.update({ where: { id: adjustment.id }, data: { status: StockAdjustmentStatus.APPLIED, appliedById: actor, appliedAt: new Date() } });
      await tx.stockInventory.update({ where: { id }, data: { status: StockInventoryStatus.COMPLETED, approvedById: actor, approvedAt: new Date() } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_INVENTORY, entityId: id, action: AuditAction.APPROVE, oldData: { status: inventory.status }, newData: { status: StockInventoryStatus.COMPLETED, adjustmentId: adjustment.id } }, tx);
      return tx.stockInventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude });
    });
  }

  async listAdjustments() { return { data: await prisma.stockAdjustment.findMany({ orderBy: { createdAt: 'desc' }, include: adjustmentInclude }) }; }
  createAdjustment(input: CreateStockAdjustmentInput, actor: string) {
    return this.transaction(async (tx) => {
      const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } }); if (!warehouse) throw new AppError('Depósito não encontrado.', 404, 'WAREHOUSE_NOT_FOUND');
      const locations = await tx.stockLocation.findMany({ where: { id: { in: input.items.map((item) => item.locationId) }, warehouseId: input.warehouseId }, select: { id: true } }); if (locations.length !== new Set(input.items.map((item) => item.locationId)).size) throw new AppError('Uma localização não pertence ao depósito.', 400, 'INVALID_ADJUSTMENT_LOCATION');
      const products = await tx.product.count({ where: { id: { in: input.items.map((item) => item.productId) } } }); if (products !== new Set(input.items.map((item) => item.productId)).size) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('stock_adjustment_number_seq') AS value`;
      const adjustment = await tx.stockAdjustment.create({ data: { number: `AJ-${sequence[0]!.value.toString().padStart(6, '0')}`, warehouseId: input.warehouseId, reason: input.reason, createdById: actor, ...(input.inventoryId ? { inventoryId: input.inventoryId } : {}), items: { create: input.items.map((item) => ({ productId: item.productId, locationId: item.locationId, ...(item.lotId ? { lotId: item.lotId } : {}), type: item.type, quantity: item.quantity, ...(item.unitCost ? { unitCost: item.unitCost } : {}), ...(item.serialNumbers ? { serialNumbers: item.serialNumbers } : {}) })) } }, include: adjustmentInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_ADJUSTMENT, entityId: adjustment.id, action: AuditAction.CREATE, newData: adjustment }, tx); return adjustment;
    });
  }

  transitionAdjustment(id: string, action: 'submit' | 'approve' | 'reject' | 'reverse', reason: string | undefined, role: UserRole, actor: string) {
    return this.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "stock_adjustments" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const adjustment = await tx.stockAdjustment.findUnique({ where: { id }, include: { items: true } }); if (!adjustment) throw new AppError('Ajuste não encontrado.', 404, 'ADJUSTMENT_NOT_FOUND');
      if (action === 'submit') { if (adjustment.status !== StockAdjustmentStatus.DRAFT) throw new AppError('Apenas rascunhos podem ser enviados.', 409, 'INVALID_ADJUSTMENT_STATUS'); await tx.stockAdjustment.update({ where: { id }, data: { status: StockAdjustmentStatus.PENDING_APPROVAL } }); }
      else {
        if (!roleCanApprove(role)) throw new AppError('Apenas administradores podem decidir ajustes.', 403, 'ADJUSTMENT_APPROVAL_FORBIDDEN');
        if (action === 'approve') {
          if (adjustment.status !== StockAdjustmentStatus.PENDING_APPROVAL) throw new AppError('O ajuste não aguarda aprovação.', 409, 'INVALID_ADJUSTMENT_STATUS');
          if (adjustment.createdById === actor) throw new AppError('O solicitante não pode aprovar o próprio ajuste.', 409, 'ADJUSTMENT_SELF_APPROVAL');
          await tx.stockAdjustment.update({ where: { id }, data: { status: StockAdjustmentStatus.APPROVED, approvedById: actor, approvedAt: new Date() } });
          for (const item of [...adjustment.items].sort((a, b) => a.productId.localeCompare(b.productId))) await this.applyAdjustmentItem(tx, id, item, actor);
          await tx.stockAdjustment.update({ where: { id }, data: { status: StockAdjustmentStatus.APPLIED, appliedById: actor, appliedAt: new Date() } });
        } else if (action === 'reject') { if (adjustment.status !== StockAdjustmentStatus.PENDING_APPROVAL) throw new AppError('O ajuste não aguarda aprovação.', 409, 'INVALID_ADJUSTMENT_STATUS'); await tx.stockAdjustment.update({ where: { id }, data: { status: StockAdjustmentStatus.REJECTED, rejectionReason: reason ?? 'Rejeitado' } }); }
        else { if (adjustment.status !== StockAdjustmentStatus.APPLIED) throw new AppError('Somente ajustes aplicados podem ser revertidos.', 409, 'INVALID_ADJUSTMENT_STATUS'); for (const item of [...adjustment.items].sort((a, b) => a.productId.localeCompare(b.productId))) await this.reverseAdjustmentItem(tx, id, item, actor); await tx.stockAdjustment.update({ where: { id }, data: { status: StockAdjustmentStatus.REVERSED, reversalReason: reason ?? 'Revertido' } }); }
      }
      const updated = await tx.stockAdjustment.findUniqueOrThrow({ where: { id }, include: adjustmentInclude });
      const auditAction = action === 'submit' ? AuditAction.SUBMIT : action === 'approve' ? AuditAction.APPROVE : action === 'reject' ? AuditAction.REJECT : AuditAction.ADJUST;
      await this.audit.log({ userId: actor, entityType: AuditEntity.STOCK_ADJUSTMENT, entityId: id, action: auditAction, oldData: { status: adjustment.status }, newData: { status: updated.status, reason } }, tx); return updated;
    });
  }

  private async applyAdjustmentItem(tx: Prisma.TransactionClient, adjustmentId: string, item: { id: string; productId: string; locationId: string; lotId: string | null; type: StockAdjustmentType; quantity: number; unitCost: Prisma.Decimal | null }, actor: string, inventoryId?: string, inventoryItemId?: string) {
    const location = await tx.stockLocation.findUniqueOrThrow({ where: { id: item.locationId }, select: { warehouseId: true } }); const dimension = { productId: item.productId, warehouseId: location.warehouseId, locationId: item.locationId, lotId: item.lotId };
    if (item.type === StockAdjustmentType.POSITIVE) { const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { averageCost: true } }); await recordInbound(tx, { dimension, quantity: item.quantity, unitCost: item.unitCost ?? product.averageCost, type: StockMovementType.ADJUSTMENT_IN, costEventType: StockCostEventType.ADJUSTMENT_IN, actorUserId: actor, reason: `Aplicação do ajuste`, operationKey: `adjustment:${adjustmentId}:apply:${item.id}`, adjustmentId, adjustmentItemId: item.id, ...(inventoryId ? { inventoryId } : {}), ...(inventoryItemId ? { inventoryItemId } : {}) }); }
    else { const movementType = item.type === StockAdjustmentType.LOSS ? StockMovementType.LOSS : item.type === StockAdjustmentType.DAMAGE ? StockMovementType.DAMAGE : item.type === StockAdjustmentType.DISPOSAL ? StockMovementType.DISPOSAL : StockMovementType.ADJUSTMENT_OUT; const costType = item.type === StockAdjustmentType.LOSS ? StockCostEventType.LOSS : item.type === StockAdjustmentType.DAMAGE ? StockCostEventType.DAMAGE : item.type === StockAdjustmentType.DISPOSAL ? StockCostEventType.DISPOSAL : StockCostEventType.COST_ADJUSTMENT; await recordOutbound(tx, { dimension, quantity: item.quantity, type: movementType, costEventType: costType, actorUserId: actor, reason: `Aplicação do ajuste`, operationKey: `adjustment:${adjustmentId}:apply:${item.id}`, adjustmentId, adjustmentItemId: item.id, ...(inventoryId ? { inventoryId } : {}), ...(inventoryItemId ? { inventoryItemId } : {}) }); }
  }

  private async reverseAdjustmentItem(tx: Prisma.TransactionClient, adjustmentId: string, item: { id: string; productId: string; locationId: string; lotId: string | null; type: StockAdjustmentType; quantity: number; unitCost: Prisma.Decimal | null }, actor: string) {
    const location = await tx.stockLocation.findUniqueOrThrow({ where: { id: item.locationId }, select: { warehouseId: true } }); const dimension = { productId: item.productId, warehouseId: location.warehouseId, locationId: item.locationId, lotId: item.lotId };
    if (item.type === StockAdjustmentType.POSITIVE) await recordOutbound(tx, { dimension, quantity: item.quantity, type: StockMovementType.ADJUSTMENT_OUT, costEventType: StockCostEventType.COST_ADJUSTMENT, actorUserId: actor, reason: `Reversão do ajuste`, operationKey: `adjustment:${adjustmentId}:reverse:${item.id}`, adjustmentId, adjustmentItemId: item.id });
    else { const original = await tx.stockMovement.findUnique({ where: { operationKey: `adjustment:${adjustmentId}:apply:${item.id}` }, select: { unitCost: true } }); const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId }, select: { averageCost: true } }); await recordInbound(tx, { dimension, quantity: item.quantity, unitCost: original?.unitCost ?? item.unitCost ?? product.averageCost, type: StockMovementType.ADJUSTMENT_IN, costEventType: StockCostEventType.ADJUSTMENT_IN, actorUserId: actor, reason: `Reversão do ajuste`, operationKey: `adjustment:${adjustmentId}:reverse:${item.id}`, adjustmentId, adjustmentItemId: item.id }); }
  }

  async expiryAlerts(days: number, warehouseId?: string) {
    const through = new Date(Date.now() + days * 86_400_000);
    return { data: await prisma.stockLot.findMany({ where: { expirationDate: { lte: through }, ...(warehouseId ? { warehouseId } : {}), balances: { some: { physical: { gt: 0 } } } }, orderBy: [{ expirationDate: 'asc' }, { product: { name: 'asc' } }], include: { product: { select: { id: true, sku: true, name: true, blockExpired: true } }, warehouse: { select: { id: true, code: true, name: true } }, balances: { where: { physical: { gt: 0 } }, include: { location: { select: { id: true, code: true } } } } } }) };
  }

  async timeline(query: AdvancedStockQuery) {
    const where: Prisma.StockMovementWhereInput = { ...(query.productId ? { productId: query.productId } : {}), ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}), ...(query.locationId ? { locationId: query.locationId } : {}), ...(query.lotId ? { lotId: query.lotId } : {}), ...(query.serialId ? { serialId: query.serialId } : {}), ...(query.type ? { type: query.type } : {}), ...(query.createdById ? { createdById: query.createdById } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}), ...(query.document ? { OR: [{ documentReference: { contains: query.document, mode: 'insensitive' } }, { reason: { contains: query.document, mode: 'insensitive' } }, { order: { number: { contains: query.document, mode: 'insensitive' } } }, { purchaseOrder: { number: { contains: query.document, mode: 'insensitive' } } }, { purchaseReceipt: { number: { contains: query.document, mode: 'insensitive' } } }, { returnProcess: { number: { contains: query.document, mode: 'insensitive' } } }, { transfer: { number: { contains: query.document, mode: 'insensitive' } } }, { inventory: { number: { contains: query.document, mode: 'insensitive' } } }, { adjustment: { number: { contains: query.document, mode: 'insensitive' } } }, { shipment: { number: { contains: query.document, mode: 'insensitive' } } }] } : {}) };
    const [data, total] = await prisma.$transaction([prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, code: true, name: true } }, location: { select: { id: true, code: true } }, lot: { select: { id: true, code: true, expirationDate: true } }, serial: { select: { id: true, serialNumber: true } }, order: { select: { id: true, number: true } }, purchaseOrder: { select: { id: true, number: true } }, purchaseReceipt: { select: { id: true, number: true } }, returnProcess: { select: { id: true, number: true } }, transfer: { select: { id: true, number: true } }, inventory: { select: { id: true, number: true } }, adjustment: { select: { id: true, number: true } }, shipment: { select: { id: true, number: true } }, createdBy: { select: userSummary } } }), prisma.stockMovement.count({ where })]);
    return { data, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async valuation() {
    const products = await prisma.product.findMany({ orderBy: { name: 'asc' }, select: { id: true, sku: true, name: true, stock: true, averageCost: true, stockValue: true, inventoryBalances: { select: { physical: true, reserved: true, blocked: true, inTransit: true } } } });
    return { data: products.map(({ inventoryBalances, ...product }) => ({ ...product, balances: consolidatedBalance(inventoryBalances) })), totalValue: products.reduce((total, product) => total.add(product.stockValue), new Prisma.Decimal(0)) };
  }
}
