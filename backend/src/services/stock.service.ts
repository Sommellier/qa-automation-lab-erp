import { AuditAction, AuditEntity, CogsEntryType, Prisma, ReturnItemCondition, StockCostEventType, StockLocationType, StockMovementType } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { StockRepository } from '../repositories/stock.repository.js';
import type { AdjustStockInput, ListStockMovementsQuery, ManualStockInput } from '../schemas/stock.schema.js';
import type { AuditLogger, AuditTransaction } from './audit.service.js';
import { isExpired } from './advanced-stock-rules.js';
import { lockBalance } from './stock-ledger.js';
import { defaultStockDimension, recordInbound, recordOutbound } from './stock-ledger.js';

const INSUFFICIENT = new AppError('Estoque insuficiente para realizar esta movimentação.', 409, 'INSUFFICIENT_STOCK');

export class StockService {
  constructor(private readonly stocks: StockRepository, private readonly audit: AuditLogger) {}

  async list(productId: string, query: ListStockMovementsQuery) {
    const product = await this.stocks.findProduct(productId);
    if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    const { movements, total } = await this.stocks.list({ productId, page: query.page, pageSize: query.pageSize,
      sortOrder: query.sortOrder, ...(query.type ? { type: query.type } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}), ...(query.dateTo ? { dateTo: query.dateTo } : {}),
      ...(query.createdById ? { createdById: query.createdById } : {}), ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.purchaseOrderId ? { purchaseOrderId: query.purchaseOrderId } : {}),
      ...(query.reason ? { reason: query.reason } : {}) });
    return { product, data: movements, pagination: {
      page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
    } };
  }

  addStock(productId: string, input: ManualStockInput, actorUserId: string) {
    return this.stocks.transaction(async (transaction) => {
      const product = await this.requireProduct(productId, transaction);
      const change = await this.stocks.increase(productId, input.quantity, transaction);
      if (!change) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
      return this.persistManual(product.id, StockMovementType.ENTRY, input.quantity, change, input.reason, actorUserId, transaction);
    });
  }

  removeStock(productId: string, input: ManualStockInput, actorUserId: string) {
    return this.stocks.transaction(async (transaction) => {
      await this.requireProduct(productId, transaction);
      const change = await this.stocks.decrease(productId, input.quantity, false, transaction);
      if (!change) throw INSUFFICIENT;
      return this.persistManual(productId, StockMovementType.EXIT, input.quantity, change, input.reason, actorUserId, transaction);
    });
  }

  adjustStock(productId: string, input: AdjustStockInput, actorUserId: string) {
    return this.stocks.transaction(async (transaction) => {
      await this.requireProduct(productId, transaction);
      const change = await this.stocks.setStock(productId, input.newStock, transaction);
      if (!change) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
      if (change.previousStock === change.newStock) throw new AppError('O novo estoque deve ser diferente do estoque atual.', 409, 'STOCK_UNCHANGED');
      const type = change.newStock > change.previousStock ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT;
      const quantity = Math.abs(change.newStock - change.previousStock);
      return this.persistManual(productId, type, quantity, change, input.reason, actorUserId, transaction);
    });
  }

  async registerSale(transaction: Prisma.TransactionClient, productId: string, quantity: number, orderId: string, actorUserId: string) {
    const product = await this.requireProduct(productId, transaction);
    if (!product.active) throw new AppError('O produto selecionado está inativo.', 409, 'PRODUCT_INACTIVE');
    const change = await this.stocks.decrease(productId, quantity, true, transaction);
    if (!change) throw new AppError(`Estoque insuficiente para o produto "${product.name}".`, 409, 'INSUFFICIENT_STOCK');
    return this.stocks.createMovement({ productId, type: StockMovementType.SALE, quantity,
      ...change, orderId, createdById: actorUserId }, transaction);
  }

  async reserveSale(transaction: Prisma.TransactionClient, productId: string, quantity: number, orderId: string, orderItemId: string, actorUserId: string) {
    const product = await transaction.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    if (!product.active) throw new AppError('O produto selecionado está inativo.', 409, 'PRODUCT_INACTIVE');
    const existing = await transaction.stockReservation.findMany({ where: { orderItemId } });
    if (existing.length) return existing;
    const candidates = await transaction.inventoryBalance.findMany({
      where: { productId, warehouse: { active: true }, location: { active: true }, physical: { gt: 0 }, OR: [{ lotId: null }, { lot: { status: 'AVAILABLE' } }] },
      orderBy: [{ warehouse: { isDefault: 'desc' } }, { lot: { expirationDate: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
      include: { lot: { select: { expirationDate: true } } },
    });
    let pending = quantity; const reservations = [];
    for (const candidate of candidates) {
      if (pending <= 0) break;
      if (product.blockExpired && isExpired(candidate.lot?.expirationDate)) continue;
      const dimension = { productId, warehouseId: candidate.warehouseId, locationId: candidate.locationId, lotId: candidate.lotId };
      const balance = await lockBalance(transaction, dimension);
      const available = balance.physical - balance.reserved - balance.blocked;
      const allocated = Math.min(pending, Math.max(available, 0));
      if (allocated <= 0) continue;
      const updated = await transaction.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: allocated } } });
      const reservation = await transaction.stockReservation.create({ data: { key: `${orderId}:${orderItemId}:${balance.id}`, orderId, orderItemId, productId, warehouseId: balance.warehouseId, locationId: balance.locationId, ...(balance.lotId ? { lotId: balance.lotId } : {}), quantity: allocated } });
      await transaction.stockMovement.create({ data: { productId, type: StockMovementType.RESERVATION, quantity: allocated, previousStock: product.stock, newStock: product.stock, warehouseId: balance.warehouseId, locationId: balance.locationId, ...(balance.lotId ? { lotId: balance.lotId } : {}), previousBalance: balance.physical, newBalance: balance.physical, previousReserved: balance.reserved, newReserved: updated.reserved, previousBlocked: balance.blocked, newBlocked: balance.blocked, orderId, operationKey: `order:${orderId}:reserve:${reservation.id}`, reason: 'Reserva para pedido de venda', createdById: actorUserId } });
      reservations.push(reservation); pending -= allocated;
    }
    if (pending > 0) throw new AppError(`Estoque disponível insuficiente para o produto "${product.name}".`, 409, 'INSUFFICIENT_AVAILABLE_STOCK');
    return reservations;
  }

  async reserveQuote(transaction: Prisma.TransactionClient, input: {
    quoteId: string; quoteItemId: string; productId: string; quantity: number; expiresAt: Date; actorUserId: string;
  }) {
    const product = await transaction.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    if (!product.active) throw new AppError('O produto selecionado está inativo.', 409, 'PRODUCT_INACTIVE');
    const existing = await transaction.quoteReservation.findMany({ where: { quoteItemId: input.quoteItemId, active: true } });
    if (existing.length) return existing;
    const candidates = await transaction.inventoryBalance.findMany({
      where: { productId: input.productId, warehouse: { active: true }, location: { active: true }, physical: { gt: 0 }, OR: [{ lotId: null }, { lot: { status: 'AVAILABLE' } }] },
      orderBy: [{ warehouse: { isDefault: 'desc' } }, { lot: { expirationDate: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
      include: { lot: { select: { expirationDate: true } } },
    });
    let pending = input.quantity;
    const reservations = [];
    for (const candidate of candidates) {
      if (pending <= 0) break;
      if (product.blockExpired && isExpired(candidate.lot?.expirationDate)) continue;
      const dimension = { productId: input.productId, warehouseId: candidate.warehouseId, locationId: candidate.locationId, lotId: candidate.lotId };
      const balance = await lockBalance(transaction, dimension);
      const available = balance.physical - balance.reserved - balance.blocked;
      const allocated = Math.min(pending, Math.max(available, 0));
      if (allocated <= 0) continue;
      const updated = await transaction.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { increment: allocated } } });
      const reservation = await transaction.quoteReservation.create({ data: {
        key: `${input.quoteId}:${input.quoteItemId}:${balance.id}:${input.expiresAt.getTime()}`,
        quoteId: input.quoteId, quoteItemId: input.quoteItemId, productId: input.productId, balanceId: balance.id,
        warehouseId: balance.warehouseId, locationId: balance.locationId, ...(balance.lotId ? { lotId: balance.lotId } : {}),
        quantity: allocated, expiresAt: input.expiresAt,
      } });
      await transaction.stockMovement.create({ data: {
        productId: input.productId, type: StockMovementType.RESERVATION, quantity: allocated,
        previousStock: product.stock, newStock: product.stock, warehouseId: balance.warehouseId, locationId: balance.locationId,
        ...(balance.lotId ? { lotId: balance.lotId } : {}), previousBalance: balance.physical, newBalance: balance.physical,
        previousReserved: balance.reserved, newReserved: updated.reserved, previousBlocked: balance.blocked, newBlocked: balance.blocked,
        quoteId: input.quoteId, quoteItemId: input.quoteItemId, operationKey: `quote:${input.quoteId}:reserve:${reservation.id}`,
        reason: 'Reserva temporária para orçamento aprovado', createdById: input.actorUserId,
      } });
      reservations.push(reservation);
      pending -= allocated;
    }
    if (pending > 0) throw new AppError(`Estoque disponível insuficiente para o produto "${product.name}".`, 409, 'INSUFFICIENT_AVAILABLE_STOCK');
    return reservations;
  }

  async releaseQuoteReservations(
    transaction: Prisma.TransactionClient,
    quoteId: string,
    actorUserId: string,
    reason = 'Liberação da reserva do orçamento',
  ): Promise<number> {
    const reservations = await transaction.quoteReservation.findMany({ where: { quoteId, active: true }, orderBy: { id: 'asc' } });
    for (const reservation of reservations) {
      const dimension = { productId: reservation.productId, warehouseId: reservation.warehouseId, locationId: reservation.locationId, lotId: reservation.lotId };
      const balance = await lockBalance(transaction, dimension);
      if (balance.reserved < reservation.quantity) throw new AppError('Saldo reservado inconsistente.', 409, 'RESERVATION_BALANCE_INCONSISTENT');
      const product = await transaction.product.findUniqueOrThrow({ where: { id: reservation.productId }, select: { stock: true } });
      const updated = await transaction.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { decrement: reservation.quantity } } });
      await transaction.quoteReservation.update({ where: { id: reservation.id }, data: { active: false, releasedAt: new Date() } });
      await transaction.stockMovement.create({ data: {
        productId: reservation.productId, type: StockMovementType.RESERVATION_RELEASE, quantity: reservation.quantity,
        previousStock: product.stock, newStock: product.stock, warehouseId: reservation.warehouseId, locationId: reservation.locationId,
        ...(reservation.lotId ? { lotId: reservation.lotId } : {}), previousBalance: balance.physical, newBalance: balance.physical,
        previousReserved: balance.reserved, newReserved: updated.reserved, previousBlocked: balance.blocked, newBlocked: balance.blocked,
        quoteId, quoteItemId: reservation.quoteItemId, operationKey: `quote:${quoteId}:release:${reservation.id}`,
        reason, createdById: actorUserId,
      } });
    }
    return reservations.length;
  }

  async convertQuoteReservations(
    transaction: Prisma.TransactionClient,
    quoteId: string,
    orderId: string,
    orderItemByQuoteItem: Map<string, string>,
    actorUserId: string,
  ): Promise<number> {
    const reservations = await transaction.quoteReservation.findMany({ where: { quoteId, active: true }, orderBy: { id: 'asc' } });
    if (!reservations.length) throw new AppError('A reserva do orçamento expirou ou não está ativa.', 409, 'QUOTE_RESERVATION_UNAVAILABLE');
    const now = new Date();
    if (reservations.some((reservation) => reservation.expiresAt <= now)) {
      throw new AppError('A reserva do orçamento expirou. Renove-a antes da conversão.', 409, 'QUOTE_RESERVATION_EXPIRED');
    }
    for (const reservation of reservations) {
      const orderItemId = orderItemByQuoteItem.get(reservation.quoteItemId);
      if (!orderItemId) throw new AppError('Não foi possível relacionar os itens do orçamento ao pedido.', 409, 'QUOTE_ORDER_ITEM_MISMATCH');
      const converted = await transaction.stockReservation.create({ data: {
        key: `quote:${quoteId}:order:${orderId}:${reservation.id}`, orderId, orderItemId,
        productId: reservation.productId, warehouseId: reservation.warehouseId, locationId: reservation.locationId,
        ...(reservation.lotId ? { lotId: reservation.lotId } : {}), quantity: reservation.quantity,
      } });
      await transaction.quoteReservation.update({ where: { id: reservation.id }, data: {
        active: false, releasedAt: now, convertedReservationId: converted.id,
      } });
      const product = await transaction.product.findUniqueOrThrow({ where: { id: reservation.productId }, select: { stock: true } });
      const balance = await transaction.inventoryBalance.findUniqueOrThrow({ where: { id: reservation.balanceId } });
      await transaction.stockMovement.create({ data: {
        productId: reservation.productId, type: StockMovementType.RESERVATION, quantity: reservation.quantity,
        previousStock: product.stock, newStock: product.stock, warehouseId: reservation.warehouseId, locationId: reservation.locationId,
        ...(reservation.lotId ? { lotId: reservation.lotId } : {}), previousBalance: balance.physical, newBalance: balance.physical,
        previousReserved: balance.reserved, newReserved: balance.reserved, previousBlocked: balance.blocked, newBlocked: balance.blocked,
        quoteId, quoteItemId: reservation.quoteItemId, orderId, operationKey: `quote:${quoteId}:convert:${reservation.id}`,
        reason: 'Reserva transferida do orçamento para o pedido', createdById: actorUserId,
      } });
    }
    return reservations.length;
  }

  async releaseOrderReservations(transaction: Prisma.TransactionClient, orderId: string, actorUserId: string): Promise<boolean> {
    const reservations = await transaction.stockReservation.findMany({ where: { orderId, active: true }, orderBy: { id: 'asc' } });
    if (!reservations.length) return false;
    for (const reservation of reservations) {
      const remaining = reservation.quantity - reservation.consumedQuantity - reservation.releasedQuantity;
      if (remaining <= 0) { await transaction.stockReservation.update({ where: { id: reservation.id }, data: { active: false } }); continue; }
      const dimension = { productId: reservation.productId, warehouseId: reservation.warehouseId, locationId: reservation.locationId, lotId: reservation.lotId };
      const balance = await lockBalance(transaction, dimension);
      if (balance.reserved < remaining) throw new AppError('Saldo reservado inconsistente.', 409, 'RESERVATION_BALANCE_INCONSISTENT');
      const product = await transaction.product.findUniqueOrThrow({ where: { id: reservation.productId }, select: { stock: true } });
      const updated = await transaction.inventoryBalance.update({ where: { id: balance.id }, data: { reserved: { decrement: remaining } } });
      await transaction.stockReservation.update({ where: { id: reservation.id }, data: { releasedQuantity: { increment: remaining }, active: false } });
      await transaction.stockMovement.create({ data: { productId: reservation.productId, type: StockMovementType.RESERVATION_RELEASE, quantity: remaining, previousStock: product.stock, newStock: product.stock, warehouseId: reservation.warehouseId, locationId: reservation.locationId, ...(reservation.lotId ? { lotId: reservation.lotId } : {}), previousBalance: balance.physical, newBalance: balance.physical, previousReserved: balance.reserved, newReserved: updated.reserved, previousBlocked: balance.blocked, newBlocked: balance.blocked, orderId, operationKey: `order:${orderId}:release:${reservation.id}`, reason: 'Liberação por cancelamento do pedido', createdById: actorUserId } });
    }
    return true;
  }

  async isOrderFulfilled(transaction: Prisma.TransactionClient, orderId: string): Promise<boolean> {
    const reservations = await transaction.stockReservation.findMany({ where: { orderId }, select: { quantity: true, consumedQuantity: true } });
    if (!reservations.length) return true;
    return reservations.every((reservation) => reservation.consumedQuantity === reservation.quantity);
  }

  async registerCancellation(transaction: Prisma.TransactionClient, productId: string, quantity: number, orderId: string, actorUserId: string) {
    await this.requireProduct(productId, transaction);
    const change = await this.stocks.increase(productId, quantity, transaction);
    if (!change) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    return this.stocks.createMovement({ productId, type: StockMovementType.ORDER_CANCELLATION, quantity,
      ...change, orderId, createdById: actorUserId }, transaction);
  }

  async registerSupplierReturn(transaction: Prisma.TransactionClient, productId: string, quantity: number,
    returnProcessId: string, returnItemId: string, actorUserId: string) {
    if ('inventoryBalance' in transaction) return this.recordAvailableOutbound(transaction, {
      productId, quantity, type: StockMovementType.SUPPLIER_RETURN, costEventType: StockCostEventType.SUPPLIER_RETURN,
      reason: 'Saída por devolução ao fornecedor', operationKey: `return:${returnProcessId}:item:${returnItemId}:supplier-outbound`,
      returnProcessId, returnItemId, actorUserId,
    });
    await this.requireProduct(productId, transaction);
    const change = await this.stocks.decrease(productId, quantity, false, transaction);
    if (!change) throw INSUFFICIENT;
    return this.stocks.createMovement({ productId, type: StockMovementType.SUPPLIER_RETURN, quantity, ...change,
      reason: 'Saída por devolução ao fornecedor', returnProcessId, returnItemId, createdById: actorUserId }, transaction);
  }

  async registerCustomerReturn(transaction: Prisma.TransactionClient, productId: string, quantity: number,
    returnProcessId: string, returnItemId: string, actorUserId: string, exchange: boolean) {
    if ('inventoryBalance' in transaction) {
      const operationKey = `return:${returnProcessId}:item:${returnItemId}:inbound`;
      const existing = await transaction.stockMovement.findUnique({ where: { operationKey } });
      if (existing) return existing;
      const cogs = await this.customerReturnCost(transaction, returnItemId, quantity);
      const dimension = await defaultStockDimension(transaction, productId);
      const inbound = await recordInbound(transaction, { dimension, quantity, unitCost: cogs.unitCost,
        type: exchange ? StockMovementType.EXCHANGE_RETURN : StockMovementType.CUSTOMER_RETURN,
        costEventType: StockCostEventType.CUSTOMER_RETURN, actorUserId,
        reason: exchange ? 'Entrada revendável por troca' : 'Entrada revendável por devolução de cliente', operationKey,
        returnProcessId, returnItemId });
      await this.createReturnCogsReversal(transaction, cogs, { productId, quantity, returnProcessId, returnItemId, actorUserId });
      return inbound.movement;
    }
    await this.requireProduct(productId, transaction);
    const change = await this.stocks.increase(productId, quantity, transaction);
    if (!change) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    return this.stocks.createMovement({ productId,
      type: exchange ? StockMovementType.EXCHANGE_RETURN : StockMovementType.CUSTOMER_RETURN,
      quantity, ...change, reason: exchange ? 'Entrada revendável por troca' : 'Entrada revendável por devolução de cliente',
      returnProcessId, returnItemId, createdById: actorUserId }, transaction);
  }

  async registerCustomerReturnQuarantine(transaction: Prisma.TransactionClient, productId: string, quantity: number,
    returnProcessId: string, returnItemId: string, actorUserId: string, condition: ReturnItemCondition) {
    const operationKey = `return:${returnProcessId}:item:${returnItemId}:quarantine`;
    const existing = await transaction.stockMovement.findUnique({ where: { operationKey } });
    if (existing) return existing;
    const cogs = await this.customerReturnCost(transaction, returnItemId, quantity);
    const locationType = condition === ReturnItemCondition.DISPOSAL ? StockLocationType.DISPOSAL
      : condition === ReturnItemCondition.DAMAGED || condition === ReturnItemCondition.ASSISTANCE ? StockLocationType.DAMAGED : StockLocationType.QUARANTINE;
    const dimension = await this.returnLocationDimension(transaction, productId, locationType);
    const inbound = await recordInbound(transaction, { dimension, quantity, unitCost: cogs.unitCost, type: StockMovementType.QUARANTINE_IN,
      costEventType: StockCostEventType.CUSTOMER_RETURN, actorUserId, reason: `Recebimento de devolução em ${locationType.toLowerCase()}`,
      operationKey, returnProcessId, returnItemId });
    const blockedBalance = await transaction.inventoryBalance.update({ where: { id: inbound.balance.id }, data: { blocked: { increment: quantity } } });
    await transaction.stockMovement.update({ where: { id: inbound.movement.id }, data: { newBlocked: blockedBalance.blocked } });
    await this.createReturnCogsReversal(transaction, cogs, { productId, quantity, returnProcessId, returnItemId, actorUserId });
    return transaction.stockMovement.findUniqueOrThrow({ where: { id: inbound.movement.id } });
  }

  async resolveCustomerReturnInspection(transaction: Prisma.TransactionClient, productId: string, quantity: number,
    returnProcessId: string, returnItemId: string, actorUserId: string, condition: ReturnItemCondition, exchange: boolean) {
    const operationKey = `return:${returnProcessId}:item:${returnItemId}:inspection:${condition.toLowerCase()}`;
    const existing = await transaction.stockMovement.findUnique({ where: { operationKey } });
    if (existing) return existing;
    const quarantine = await transaction.stockMovement.findUnique({ where: { operationKey: `return:${returnProcessId}:item:${returnItemId}:quarantine` } });
    if (!quarantine?.warehouseId || !quarantine.locationId) {
      if (condition === ReturnItemCondition.RESALABLE) return this.registerCustomerReturn(transaction, productId, quantity, returnProcessId, returnItemId, actorUserId, exchange);
      throw new AppError('A entrada em quarentena da devolução não foi localizada.', 409, 'RETURN_QUARANTINE_NOT_FOUND');
    }
    const sourceDimension = { productId, warehouseId: quarantine.warehouseId, locationId: quarantine.locationId, lotId: quarantine.lotId };
    const destinationDimension = condition === ReturnItemCondition.RESALABLE ? await defaultStockDimension(transaction, productId)
      : await this.returnLocationDimension(transaction, productId, condition === ReturnItemCondition.DISPOSAL ? StockLocationType.DISPOSAL : StockLocationType.DAMAGED);
    const source = await lockBalance(transaction, sourceDimension);
    if (source.physical < quantity || source.blocked < quantity) throw new AppError('Saldo bloqueado da devolução inconsistente.', 409, 'RETURN_QUARANTINE_BALANCE_INCONSISTENT');
    const destination = await lockBalance(transaction, destinationDimension);
    const sourceAfter = await transaction.inventoryBalance.update({ where: { id: source.id }, data: { physical: { decrement: quantity }, blocked: { decrement: quantity } } });
    const keepBlocked = condition !== ReturnItemCondition.RESALABLE;
    const destinationAfter = await transaction.inventoryBalance.update({ where: { id: destination.id }, data: { physical: { increment: quantity }, ...(keepBlocked ? { blocked: { increment: quantity } } : {}) } });
    const product = await transaction.product.findUniqueOrThrow({ where: { id: productId } });
    const type = condition === ReturnItemCondition.RESALABLE ? StockMovementType.QUARANTINE_RELEASE : condition === ReturnItemCondition.DISPOSAL ? StockMovementType.DISPOSAL : StockMovementType.DAMAGE;
    return transaction.stockMovement.create({ data: { productId, type, quantity, previousStock: product.stock, newStock: product.stock,
      warehouseId: source.warehouseId, locationId: source.locationId, destinationWarehouseId: destination.warehouseId,
      destinationLocationId: destination.locationId, ...(source.lotId ? { lotId: source.lotId } : {}), previousBalance: source.physical,
      newBalance: sourceAfter.physical, previousBlocked: source.blocked, newBlocked: sourceAfter.blocked, unitCost: quarantine.unitCost,
      ...(quarantine.unitCost ? { totalCost: new Prisma.Decimal(quarantine.unitCost).mul(quantity).toDecimalPlaces(2) } : {}),
      averageCostBefore: product.averageCost, averageCostAfter: product.averageCost, operationKey, returnProcessId, returnItemId,
      reason: keepBlocked ? `Devolução classificada para ${destinationAfter.blocked > 0 ? 'tratamento segregado' : 'inspeção'}` : 'Mercadoria liberada da quarentena para revenda', createdById: actorUserId } });
  }

  async registerExchangeShipment(transaction: Prisma.TransactionClient, productId: string, quantity: number,
    returnProcessId: string, returnItemId: string, actorUserId: string) {
    if ('inventoryBalance' in transaction) return this.recordAvailableOutbound(transaction, {
      productId, quantity, type: StockMovementType.EXCHANGE_SHIPMENT, costEventType: StockCostEventType.SALE,
      reason: 'Saída de produto substituto em troca', operationKey: `return:${returnProcessId}:item:${returnItemId}:exchange-outbound`,
      returnProcessId, returnItemId, actorUserId,
    });
    const product = await this.requireProduct(productId, transaction);
    if (!product.active) throw new AppError('O produto substituto está inativo.', 409, 'PRODUCT_INACTIVE');
    const change = await this.stocks.decrease(productId, quantity, true, transaction);
    if (!change) throw new AppError(`Estoque insuficiente para o produto substituto "${product.name}".`, 409, 'INSUFFICIENT_STOCK');
    return this.stocks.createMovement({ productId, type: StockMovementType.EXCHANGE_SHIPMENT, quantity, ...change,
      reason: 'Saída de produto substituto em troca', returnProcessId, returnItemId, createdById: actorUserId }, transaction);
  }

  async registerInitialBalance(product: { id: string; stock: number }, actorUserId: string | undefined, transaction?: AuditTransaction) {
    if (product.stock <= 0) return Promise.resolve(null);
    if (transaction && 'inventoryBalance' in transaction) {
      const tx = transaction as Prisma.TransactionClient;
      const operationKey = `product:${product.id}:initial-balance`;
      const existing = await tx.stockMovement.findUnique({ where: { operationKey } });
      if (existing) return existing;
      const dimension = await defaultStockDimension(tx, product.id);
      const balance = await lockBalance(tx, dimension);
      const updated = await tx.inventoryBalance.update({ where: { id: balance.id }, data: { physical: { increment: product.stock } } });
      return tx.stockMovement.create({ data: {
        productId: product.id, type: StockMovementType.INITIAL_BALANCE, quantity: product.stock,
        previousStock: 0, newStock: product.stock, warehouseId: dimension.warehouseId, locationId: dimension.locationId,
        previousBalance: balance.physical, newBalance: updated.physical, previousReserved: balance.reserved,
        newReserved: updated.reserved, previousBlocked: balance.blocked, newBlocked: updated.blocked,
        unitCost: 0, totalCost: 0, averageCostBefore: 0, averageCostAfter: 0, operationKey,
        reason: 'Saldo inicial do produto sem custo histórico informado', ...(actorUserId ? { createdById: actorUserId } : {}),
      } });
    }
    return this.stocks.createMovement({ productId: product.id, type: StockMovementType.INITIAL_BALANCE,
      quantity: product.stock, previousStock: 0, newStock: product.stock,
      reason: 'Saldo inicial do produto', ...(actorUserId ? { createdById: actorUserId } : {}) }, transaction);
  }

  async registerInitialBalances(transaction: AuditTransaction, products: Array<{ id: string; stock: number }>, actorUserId: string) {
    if (transaction && 'inventoryBalance' in transaction) {
      let created = 0;
      for (const product of products) if (await this.registerInitialBalance(product, actorUserId, transaction)) created += 1;
      return created;
    }
    return this.stocks.createInitialBalances(products, actorUserId, transaction);
  }

  private async requireProduct(productId: string, transaction?: AuditTransaction) {
    const product = await this.stocks.findProduct(productId, transaction);
    if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    return product;
  }

  private async persistManual(productId: string, type: StockMovementType, quantity: number,
    change: { previousStock: number; newStock: number }, reason: string, actorUserId: string, transaction: Prisma.TransactionClient) {
    const movement = await this.stocks.createMovement({ productId, type, quantity, ...change, reason, createdById: actorUserId }, transaction);
    await this.audit.log({ userId: actorUserId, entityType: AuditEntity.PRODUCT, entityId: productId,
      action: AuditAction.STOCK_ADJUSTMENT, newData: { productId, type, quantity, ...change, reason } }, transaction);
    return movement;
  }

  private async customerReturnCost(transaction: Prisma.TransactionClient, returnItemId: string, quantity: number) {
    const item = await transaction.returnItem.findUnique({ where: { id: returnItemId }, include: { returnProcess: { select: { orderId: true } } } });
    if (!item?.sourceOrderItemId || !item.returnProcess.orderId) throw new AppError('A devolução não possui venda de origem.', 409, 'RETURN_ORDER_ORIGIN_REQUIRED');
    const recognitions = await transaction.cogsEntry.findMany({ where: { orderItemId: item.sourceOrderItemId, type: CogsEntryType.RECOGNITION }, orderBy: { createdAt: 'asc' } });
    const reversals = await transaction.cogsEntry.aggregate({ where: { orderItemId: item.sourceOrderItemId, type: CogsEntryType.REVERSAL }, _sum: { quantity: true } });
    const recognizedQuantity = recognitions.reduce((total, entry) => total + entry.quantity, 0);
    const recognizedAmount = recognitions.reduce((total, entry) => total.add(entry.amount), new Prisma.Decimal(0));
    const alreadyReversed = reversals._sum.quantity ?? 0;
    if (!recognizedQuantity || alreadyReversed + quantity > recognizedQuantity) throw new AppError('A devolução excede o CMV elegível da venda.', 409, 'COGS_REVERSAL_EXCEEDS_ELIGIBLE');
    const unitCost = recognizedAmount.div(recognizedQuantity).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
    return { orderId: item.returnProcess.orderId, orderItemId: item.sourceOrderItemId, originalEntryId: recognitions[0]?.id,
      unitCost, amount: unitCost.mul(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) };
  }

  private async createReturnCogsReversal(transaction: Prisma.TransactionClient,
    cogs: { orderId: string; orderItemId: string; originalEntryId: string | undefined; unitCost: Prisma.Decimal; amount: Prisma.Decimal },
    input: { productId: string; quantity: number; returnProcessId: string; returnItemId: string; actorUserId: string }) {
    const idempotencyKey = `cogs:return:${input.returnItemId}`;
    const existing = await transaction.cogsEntry.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const competenceDate = new Date(); competenceDate.setUTCHours(0, 0, 0, 0);
    return transaction.cogsEntry.create({ data: { type: CogsEntryType.REVERSAL, orderId: cogs.orderId, orderItemId: cogs.orderItemId,
      returnProcessId: input.returnProcessId, returnItemId: input.returnItemId, productId: input.productId, quantity: input.quantity,
      unitCost: cogs.unitCost, amount: cogs.amount, ...(cogs.originalEntryId ? { originalEntryId: cogs.originalEntryId } : {}), competenceDate,
      idempotencyKey, notes: 'Estorno proporcional do CMV pelo recebimento da devolução', createdById: input.actorUserId } });
  }

  private async returnLocationDimension(transaction: Prisma.TransactionClient, productId: string, type: StockLocationType) {
    const warehouse = await transaction.warehouse.findFirst({ where: { active: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
    if (!warehouse) throw new AppError('Configure um depósito ativo para receber devoluções.', 409, 'STOCK_SETUP_REQUIRED');
    const location = await transaction.stockLocation.findFirst({ where: { warehouseId: warehouse.id, active: true, type }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!location) throw new AppError(`Configure uma localização ativa do tipo ${type}.`, 409, 'RETURN_LOCATION_REQUIRED');
    return { productId, warehouseId: warehouse.id, locationId: location.id };
  }

  private async recordAvailableOutbound(transaction: Prisma.TransactionClient, input: {
    productId: string;
    quantity: number;
    type: StockMovementType;
    costEventType: StockCostEventType;
    reason: string;
    operationKey: string;
    returnProcessId: string;
    returnItemId: string;
    actorUserId: string;
  }) {
    const existing = await transaction.stockMovement.findFirst({ where: { operationKey: { startsWith: `${input.operationKey}:` } } });
    if (existing) return existing;
    const product = await transaction.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    if (!product.active && input.type === StockMovementType.EXCHANGE_SHIPMENT) throw new AppError('O produto substituto está inativo.', 409, 'PRODUCT_INACTIVE');
    if (product.trackingMode === 'SERIAL' || product.trackingMode === 'LOT_AND_SERIAL') throw new AppError('A operação exige a seleção explícita dos números de série.', 409, 'SERIAL_SELECTION_REQUIRED');
    const candidates = await transaction.inventoryBalance.findMany({
      where: { productId: input.productId, physical: { gt: 0 }, warehouse: { active: true }, location: { active: true }, OR: [{ lotId: null }, { lot: { status: 'AVAILABLE' } }] },
      orderBy: [{ lot: { expirationDate: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
      include: { lot: { select: { expirationDate: true } } },
    });
    let pending = input.quantity; let firstMovement = null;
    for (const candidate of candidates) {
      if (pending <= 0) break;
      if (product.blockExpired && isExpired(candidate.lot?.expirationDate)) continue;
      const dimension = { productId: input.productId, warehouseId: candidate.warehouseId, locationId: candidate.locationId, lotId: candidate.lotId };
      const balance = await lockBalance(transaction, dimension);
      const available = balance.physical - balance.reserved - balance.blocked;
      const quantity = Math.min(pending, Math.max(available, 0));
      if (quantity <= 0) continue;
      const result = await recordOutbound(transaction, { dimension, quantity, type: input.type, costEventType: input.costEventType,
        actorUserId: input.actorUserId, reason: input.reason, operationKey: `${input.operationKey}:${balance.id}`,
        returnProcessId: input.returnProcessId, returnItemId: input.returnItemId });
      firstMovement ??= result.movement; pending -= quantity;
    }
    if (pending > 0) throw INSUFFICIENT;
    return firstMovement;
  }
}
