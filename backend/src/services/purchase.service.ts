import { AuditAction, AuditEntity, Prisma, ProductTrackingMode, PurchaseApprovalAction, PurchaseApprovalStatus, PurchaseOrderStatus, StockCostEventType, StockMovementType, UserRole } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { purchaseInclude, PrismaPurchaseRepository } from '../repositories/purchase.repository.js';
import type { CostHistoryQuery, CreatePurchaseInput, ListPurchasesQuery, PurchaseApprovalCommentInput, ReceivePurchaseInput, RejectPurchaseInput, UpdateApprovalRuleInput } from '../schemas/purchase.schema.js';
import type { AuditLogger } from './audit.service.js';
import { buildPayableInstallments } from './payable-installments.js';
import { assertWithinApprovalLimit } from './purchase-approval.js';
import { defaultStockDimension, recordInbound } from './stock-ledger.js';

export class PurchaseService {
  constructor(private readonly purchases: PrismaPurchaseRepository, private readonly audit: AuditLogger) {}
  async list(query: ListPurchasesQuery) {
    const { records, total } = await this.purchases.list(query);
    return { data: records, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
  async getById(id: string) {
    const order = await this.purchases.findById(id);
    if (!order) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
    return order;
  }
  create(input: CreatePurchaseInput, actor: string) {
    return this.purchases.transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, active: true } });
      if (!supplier) throw new AppError('Fornecedor não encontrado.', 404, 'SUPPLIER_NOT_FOUND');
      if (!supplier.active) throw new AppError('O fornecedor selecionado está inativo.', 409, 'SUPPLIER_INACTIVE');
      const products = await tx.product.findMany({ where: { id: { in: input.items.map((item) => item.productId) } }, select: { id: true, name: true, sku: true, active: true } });
      const productMap = new Map(products.map((product) => [product.id, product]));
      const items = input.items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
        if (!product.active) throw new AppError(`O produto "${product.name}" está inativo.`, 409, 'PRODUCT_INACTIVE');
        const unitCost = new Prisma.Decimal(item.unitCost);
        return { productId: product.id, productName: product.name, productSku: product.sku, orderedQuantity: item.quantity,
          unitCost, subtotal: unitCost.mul(item.quantity) };
      });
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('purchase_order_number_seq') AS value`;
      const number = `PC-${sequence[0]!.value.toString().padStart(6, '0')}`;
      const total = items.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
      const created = await tx.purchaseOrder.create({ data: { number, supplierId: input.supplierId, total, createdById: actor,
        paymentInstallments: input.paymentInstallments, firstPaymentDueDays: input.firstPaymentDueDays, paymentIntervalDays: input.paymentIntervalDays,
        ...(input.notes ? { notes: input.notes } : {}), ...(input.expectedAt ? { expectedAt: new Date(`${input.expectedAt}T00:00:00.000Z`) } : {}), items: { create: items } }, include: purchaseInclude });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PURCHASE_ORDER, entityId: created.id, action: AuditAction.CREATE,
        newData: { number, supplierId: input.supplierId, total, status: created.status, approvalStatus: created.approvalStatus, paymentInstallments: input.paymentInstallments,
          firstPaymentDueDays: input.firstPaymentDueDays, paymentIntervalDays: input.paymentIntervalDays,
          items: items.map((item) => ({ productId: item.productId, quantity: item.orderedQuantity, unitCost: item.unitCost })) } }, tx);
      return created;
    });
  }
  receive(id: string, input: ReceivePurchaseInput, actor: string) {
    return this.purchases.transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      const order = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      if (order.approvalStatus !== PurchaseApprovalStatus.APPROVED) throw new AppError('Somente compras aprovadas podem ser recebidas.', 409, 'PURCHASE_NOT_APPROVED');
      if (order.status === PurchaseOrderStatus.CANCELLED) throw new AppError('Pedido de compra cancelado não pode ser recebido.', 409, 'PURCHASE_CANCELLED');
      if (order.status === PurchaseOrderStatus.RECEIVED) throw new AppError('Pedido de compra já foi recebido integralmente.', 409, 'PURCHASE_ALREADY_RECEIVED');
      const byProduct = new Map(order.items.map((item) => [item.productId, item]));
      const tracking = new Map((await tx.product.findMany({ where: { id: { in: input.items.map((item) => item.productId) } }, select: { id: true, trackingMode: true } })).map((product) => [product.id, product.trackingMode]));
      const receiptItems = input.items.map((inputItem) => {
        const item = byProduct.get(inputItem.productId);
        if (!item) throw new AppError('Produto não pertence ao pedido de compra.', 400, 'PRODUCT_NOT_IN_PURCHASE');
        const remaining = item.orderedQuantity - item.receivedQuantity;
        if (inputItem.quantity > remaining) throw new AppError(`Quantidade recebida de "${item.productName}" excede o saldo pendente.`, 409, 'RECEIPT_EXCEEDS_PENDING');
        const mode = tracking.get(item.productId) ?? ProductTrackingMode.NONE;
        if ((mode === ProductTrackingMode.LOT || mode === ProductTrackingMode.LOT_AND_SERIAL) && !inputItem.lotCode) throw new AppError(`Informe o lote de "${item.productName}".`, 400, 'PURCHASE_LOT_REQUIRED');
        if ((mode === ProductTrackingMode.SERIAL || mode === ProductTrackingMode.LOT_AND_SERIAL) && inputItem.serialNumbers.length !== inputItem.quantity) throw new AppError(`Informe uma série para cada unidade de "${item.productName}".`, 400, 'PURCHASE_SERIAL_QUANTITY_MISMATCH');
        return { purchaseOrderItemId: item.id, productId: item.productId, productName: item.productName, productSku: item.productSku,
          quantity: inputItem.quantity, unitCost: item.unitCost, subtotal: item.unitCost.mul(inputItem.quantity), trace: inputItem };
      }).sort((a, b) => a.productId.localeCompare(b.productId));
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('purchase_receipt_number_seq') AS value`;
      const number = `REC-${sequence[0]!.value.toString().padStart(6, '0')}`;
      const receivedAt = new Date();
      const receiptTotal = receiptItems.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
      const receipt = await tx.purchaseReceipt.create({ data: { number, purchaseOrderId: id, receivedById: actor,
        total: receiptTotal, receivedAt, ...(input.notes ? { notes: input.notes } : {}), items: { create: receiptItems } }, include: { items: true, receivedBy: { select: { id: true, name: true, email: true } } } });
      const installments = buildPayableInstallments(receiptTotal, order.paymentInstallments, order.firstPaymentDueDays, order.paymentIntervalDays, receivedAt);
      const payableDocuments: Array<{ id: string; number: string; installmentNumber: number; amount: Prisma.Decimal; dueDate: Date }> = [];
      for (const installment of installments) {
        const payableSequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('payable_number_seq') AS value`;
        const payableNumber = `CP-${payableSequence[0]!.value.toString().padStart(6, '0')}`;
        const payable = await tx.payable.create({ data: { number: payableNumber, description: `Recebimento ${receipt.number} da compra ${order.number}`,
          supplierId: order.supplierId, purchaseOrderId: id, purchaseReceiptId: receipt.id, installmentNumber: installment.number,
          installmentCount: order.paymentInstallments, originalAmount: installment.amount, competenceDate: receivedAt, issueDate: receivedAt,
          dueDate: installment.dueDate, createdById: actor } });
        payableDocuments.push({ id: payable.id, number: payableNumber, installmentNumber: installment.number, amount: installment.amount, dueDate: installment.dueDate });
      }
      const receivedNow = new Map<string, number>();
      for (const item of receiptItems) {
        await tx.purchaseOrderItem.update({ where: { id: item.purchaseOrderItemId }, data: { receivedQuantity: { increment: item.quantity } } });
        const receiptItem = receipt.items.find((candidate) => candidate.productId === item.productId)!;
        const fallback = await defaultStockDimension(tx, item.productId);
        let warehouseId = fallback.warehouseId; let locationId = fallback.locationId;
        if (item.trace.locationId) {
          const location = await tx.stockLocation.findUnique({ where: { id: item.trace.locationId }, include: { warehouse: { select: { active: true } } } });
          if (!location || !location.active || !location.warehouse.active) throw new AppError('Localização de recebimento inexistente ou inativa.', 409, 'RECEIPT_LOCATION_INACTIVE');
          warehouseId = location.warehouseId; locationId = location.id;
        }
        let lotId: string | undefined;
        if (item.trace.lotCode) {
          const lot = await tx.stockLot.upsert({ where: { productId_code: { productId: item.productId, code: item.trace.lotCode } }, update: { warehouseId, purchaseReceiptId: receipt.id, purchaseReceiptItemId: receiptItem.id, supplierId: order.supplierId, ...(item.trace.manufactureDate ? { manufactureDate: new Date(`${item.trace.manufactureDate}T00:00:00.000Z`) } : {}), ...(item.trace.expirationDate ? { expirationDate: new Date(`${item.trace.expirationDate}T00:00:00.000Z`) } : {}) }, create: { productId: item.productId, code: item.trace.lotCode, warehouseId, purchaseReceiptId: receipt.id, purchaseReceiptItemId: receiptItem.id, supplierId: order.supplierId, ...(item.trace.manufactureDate ? { manufactureDate: new Date(`${item.trace.manufactureDate}T00:00:00.000Z`) } : {}), ...(item.trace.expirationDate ? { expirationDate: new Date(`${item.trace.expirationDate}T00:00:00.000Z`) } : {}) } });
          lotId = lot.id;
        }
        const dimension = { productId: item.productId, warehouseId, locationId, ...(lotId ? { lotId } : {}) };
        await recordInbound(tx, { dimension, quantity: item.quantity, unitCost: item.unitCost, type: StockMovementType.PURCHASE_RECEIPT, costEventType: StockCostEventType.PURCHASE_RECEIPT, actorUserId: actor, reason: `Recebimento ${number}`, operationKey: `purchase-receipt:${receipt.id}:${receiptItem.id}`, purchaseOrderId: id, purchaseReceiptId: receipt.id });
        if (item.trace.serialNumbers.length) await tx.stockSerial.createMany({ data: item.trace.serialNumbers.map((serialNumber) => ({ productId: item.productId, serialNumber, ...(lotId ? { lotId } : {}), warehouseId, locationId, purchaseReceiptId: receipt.id, purchaseReceiptItemId: receiptItem.id })), skipDuplicates: false });
        receivedNow.set(item.productId, item.quantity);
      }
      const completed = order.items.every((item) => item.receivedQuantity + (receivedNow.get(item.productId) ?? 0) === item.orderedQuantity);
      const status = completed ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({ where: { id }, data: { status } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PURCHASE_ORDER, entityId: id, action: AuditAction.RECEIVE,
        oldData: { status: order.status }, newData: { status, receiptId: receipt.id, receiptNumber: number,
          receiptTotal, payables: payableDocuments, items: receiptItems.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost })) } }, tx);
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
    });
  }
  cancel(id: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem cancelar pedidos de compra.', 403, 'PURCHASE_CANCEL_FORBIDDEN');
    return this.purchases.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      if (order.status === PurchaseOrderStatus.RECEIVED) throw new AppError('Pedido recebido integralmente não pode ser cancelado.', 409, 'PURCHASE_RECEIVED_CANNOT_CANCEL');
      if (order.status === PurchaseOrderStatus.CANCELLED) return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
      await tx.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.CANCELLED } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PURCHASE_ORDER, entityId: id, action: AuditAction.CANCEL,
        oldData: { status: order.status }, newData: { status: PurchaseOrderStatus.CANCELLED } }, tx);
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
    });
  }
  async listApprovalRules() {
    return { rules: await this.purchases.listApprovalRules() };
  }
  updateApprovalRule(role: UserRole, input: UpdateApprovalRuleInput, actor: string) {
    return this.purchases.transaction(async (tx) => {
      const existing = await tx.purchaseApprovalRule.findUnique({ where: { role } });
      if (!existing) throw new AppError('Regra de aprovação não encontrada.', 404, 'APPROVAL_RULE_NOT_FOUND');
      const updated = await tx.purchaseApprovalRule.update({
        where: { role },
        data: { maxAmount: input.maxAmount === null ? null : new Prisma.Decimal(input.maxAmount), active: input.active, updatedById: actor },
        include: { updatedBy: { select: { id: true, name: true, email: true } } },
      });
      await this.audit.log({
        userId: actor, entityType: AuditEntity.PURCHASE_APPROVAL_RULE, entityId: updated.id, action: AuditAction.UPDATE,
        oldData: { role, maxAmount: existing.maxAmount, active: existing.active },
        newData: { role, maxAmount: updated.maxAmount, active: updated.active },
      }, tx);
      return updated;
    });
  }
  submitForApproval(id: string, input: PurchaseApprovalCommentInput, role: UserRole, actor: string) {
    return this.purchases.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      if (order.status !== PurchaseOrderStatus.PENDING) throw new AppError('Somente uma compra pendente pode ser enviada para aprovação.', 409, 'PURCHASE_CANNOT_SUBMIT');
      if (order.approvalStatus !== PurchaseApprovalStatus.DRAFT) throw new AppError('A compra não está em rascunho.', 409, 'PURCHASE_NOT_DRAFT');
      const submittedAt = new Date();
      await tx.purchaseOrder.update({ where: { id }, data: { approvalStatus: PurchaseApprovalStatus.PENDING_APPROVAL, submittedAt } });
      await tx.purchaseApprovalEvent.create({ data: {
        purchaseOrderId: id, action: PurchaseApprovalAction.SUBMIT, fromStatus: PurchaseApprovalStatus.DRAFT,
        toStatus: PurchaseApprovalStatus.PENDING_APPROVAL, ...(input.comment ? { comment: input.comment } : {}), actorId: actor, actorRole: role,
      } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PURCHASE_ORDER, entityId: id, action: AuditAction.SUBMIT,
        oldData: { approvalStatus: order.approvalStatus }, newData: { approvalStatus: PurchaseApprovalStatus.PENDING_APPROVAL, submittedAt, comment: input.comment } }, tx);
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
    });
  }
  approve(id: string, input: PurchaseApprovalCommentInput, role: UserRole, actor: string) {
    return this.purchases.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      if (order.status !== PurchaseOrderStatus.PENDING) throw new AppError('Esta compra não pode mais ser aprovada.', 409, 'PURCHASE_CANNOT_APPROVE');
      if (order.approvalStatus !== PurchaseApprovalStatus.PENDING_APPROVAL) throw new AppError('A compra não está aguardando aprovação.', 409, 'PURCHASE_NOT_PENDING_APPROVAL');
      const rule = await tx.purchaseApprovalRule.findUnique({ where: { role } });
      assertWithinApprovalLimit(order.total, rule);
      const approvedAt = new Date();
      await tx.purchaseOrder.update({ where: { id }, data: { approvalStatus: PurchaseApprovalStatus.APPROVED, approvedAt, approvedById: actor } });
      await tx.purchaseApprovalEvent.create({ data: {
        purchaseOrderId: id, action: PurchaseApprovalAction.APPROVE, fromStatus: PurchaseApprovalStatus.PENDING_APPROVAL,
        toStatus: PurchaseApprovalStatus.APPROVED, ...(input.comment ? { comment: input.comment } : {}), actorId: actor, actorRole: role,
        ...(rule.maxAmount !== null ? { approvalLimit: rule.maxAmount } : {}),
      } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PURCHASE_ORDER, entityId: id, action: AuditAction.APPROVE,
        oldData: { approvalStatus: order.approvalStatus }, newData: { approvalStatus: PurchaseApprovalStatus.APPROVED, approvedAt, approvedById: actor, approvalLimit: rule.maxAmount, comment: input.comment } }, tx);
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
    });
  }
  reject(id: string, input: RejectPurchaseInput, role: UserRole, actor: string) {
    return this.purchases.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "purchase_orders" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const order = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!order) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      if (order.status !== PurchaseOrderStatus.PENDING) throw new AppError('Esta compra não pode mais ser rejeitada.', 409, 'PURCHASE_CANNOT_REJECT');
      if (order.approvalStatus !== PurchaseApprovalStatus.PENDING_APPROVAL) throw new AppError('A compra não está aguardando aprovação.', 409, 'PURCHASE_NOT_PENDING_APPROVAL');
      await tx.purchaseOrder.update({ where: { id }, data: { approvalStatus: PurchaseApprovalStatus.REJECTED, approvedAt: null, approvedById: null } });
      await tx.purchaseApprovalEvent.create({ data: {
        purchaseOrderId: id, action: PurchaseApprovalAction.REJECT, fromStatus: PurchaseApprovalStatus.PENDING_APPROVAL,
        toStatus: PurchaseApprovalStatus.REJECTED, comment: input.comment, actorId: actor, actorRole: role,
      } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.PURCHASE_ORDER, entityId: id, action: AuditAction.REJECT,
        oldData: { approvalStatus: order.approvalStatus }, newData: { approvalStatus: PurchaseApprovalStatus.REJECTED, comment: input.comment } }, tx);
      return tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: purchaseInclude });
    });
  }
  async costHistory(productId: string, query: CostHistoryQuery) {
    const { records, total } = await this.purchases.costHistory(productId, query.page, query.pageSize);
    return { data: records, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }
}
