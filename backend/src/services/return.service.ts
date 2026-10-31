import { createHash } from 'node:crypto';
import {
  AuditAction,
  AuditEntity,
  Prisma,
  ReturnFinancialAdjustmentStatus,
  ReturnFinancialAdjustmentType,
  ReturnFinancialStatus,
  ReturnFiscalDocumentRole,
  ReturnHistoryAction,
  ReturnInspectionStatus,
  ReturnItemCondition,
  ReturnPhysicalStatus,
  ReturnStatus,
  ReturnType,
} from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { PrismaReturnRepository } from '../repositories/return.repository.js';
import { returnProcessInclude } from '../repositories/return.repository.js';
import type {
  ConfirmReturnPhysicalInput,
  CreateReturnInput,
  InspectReturnItemInput,
  LinkReturnAdjustmentInput,
  LinkReturnFiscalInput,
  ListReturnsQuery,
  ReturnAttachmentMetadataInput,
  ReturnCommentInput,
  ReturnReasonInput,
  SettleReturnAdjustmentInput,
} from '../schemas/return.schema.js';
import type { ReturnUploadFile } from '../types/return.js';
import type { AuditLogger } from './audit.service.js';
import type { StockService } from './stock.service.js';
import { eligibleReturnQuantity, exchangeDifference, resolvedOperationalStatus } from './return-rules.js';

const INACTIVE_RETURN_STATUSES = [ReturnStatus.REJECTED, ReturnStatus.CANCELLED] as const;
const SUPPLIER_FINANCIAL = new Set<ReturnFinancialAdjustmentType>([
  ReturnFinancialAdjustmentType.SUPPLIER_CREDIT,
  ReturnFinancialAdjustmentType.PAYABLE_REDUCTION,
  ReturnFinancialAdjustmentType.SUPPLIER_REFUND,
  ReturnFinancialAdjustmentType.FUTURE_PURCHASE_CREDIT,
]);
const CUSTOMER_FINANCIAL = new Set<ReturnFinancialAdjustmentType>([
  ReturnFinancialAdjustmentType.CUSTOMER_REFUND,
  ReturnFinancialAdjustmentType.RECEIVABLE_REVERSAL,
  ReturnFinancialAdjustmentType.COMMERCIAL_CREDIT,
  ReturnFinancialAdjustmentType.RECEIVABLE_REDUCTION,
]);
const FINISHED_ADJUSTMENTS = new Set<ReturnFinancialAdjustmentStatus>([ReturnFinancialAdjustmentStatus.SETTLED, ReturnFinancialAdjustmentStatus.CANCELLED]);
const EXCHANGE_FINANCIAL = new Set<ReturnFinancialAdjustmentType>([ReturnFinancialAdjustmentType.EXCHANGE_CHARGE, ReturnFinancialAdjustmentType.EXCHANGE_REFUND]);
const REFUND_LIKE = new Set<ReturnFinancialAdjustmentType>([ReturnFinancialAdjustmentType.CUSTOMER_REFUND, ReturnFinancialAdjustmentType.RECEIVABLE_REVERSAL, ReturnFinancialAdjustmentType.EXCHANGE_REFUND]);

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2);

export class ReturnService {
  constructor(
    private readonly returns: PrismaReturnRepository,
    private readonly stocks: StockService,
    private readonly audit: AuditLogger,
  ) {}

  async list(query: ListReturnsQuery) {
    const { records, total } = await this.returns.list({ page: query.page, pageSize: query.pageSize, sortOrder: query.sortOrder,
      ...(query.search ? { search: query.search } : {}), ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}), ...(query.productId ? { productId: query.productId } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}), ...(query.dateTo ? { dateTo: query.dateTo } : {}) });
    return { data: records, summary: await this.returns.summary(), pagination: {
      page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
    } };
  }

  async getById(id: string) {
    const record = await this.returns.findById(id);
    if (!record) throw new AppError('Devolução ou troca não encontrada.', 404, 'RETURN_NOT_FOUND');
    return record;
  }

  listReasons(includeInactive = false) { return this.returns.listReasons(includeInactive); }

  async createReason(input: ReturnReasonInput, actorUserId: string) {
    const reason = await this.returns.transaction(async (tx) => {
      const created = await tx.returnReason.create({ data: input });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_REASON, entityId: created.id,
        action: AuditAction.CREATE, newData: created }, tx);
      return created;
    });
    return reason;
  }

  async updateReason(id: string, input: ReturnReasonInput, actorUserId: string) {
    return this.returns.transaction(async (tx) => {
      const before = await tx.returnReason.findUnique({ where: { id } });
      if (!before) throw new AppError('Motivo não encontrado.', 404, 'RETURN_REASON_NOT_FOUND');
      const updated = await tx.returnReason.update({ where: { id }, data: input });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_REASON, entityId: id,
        action: AuditAction.UPDATE, oldData: before, newData: updated }, tx);
      return updated;
    });
  }

  async create(input: CreateReturnInput, actorUserId: string) {
    const createdId = await this.returns.transaction(async (tx) => {
      const reason = await tx.returnReason.findUnique({ where: { id: input.reasonId } });
      if (!reason || !reason.active || !reason.appliesTo.includes(input.type)) throw new AppError('Motivo inválido para esta operação.', 409, 'RETURN_REASON_INVALID');
      if (reason.requiresJustification && (!input.justification || input.justification.length < 5)) throw new AppError('Informe uma justificativa para o motivo selecionado.', 422, 'RETURN_JUSTIFICATION_REQUIRED');

      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('return_process_number_seq')::bigint AS value`;
      const number = `DEV-${String(sequence[0]?.value ?? 0).padStart(6, '0')}`;
      const prepared = input.type === ReturnType.SUPPLIER_RETURN
        ? await this.prepareSupplierReturn(tx, input)
        : await this.prepareCustomerReturn(tx, input);

      const adjustment = this.financialAdjustment(input, prepared.returnedTotal, prepared.replacementTotal, actorUserId);
      if (input.payableId) await this.validatePayableLink(tx, input.payableId, prepared.purchaseOrderId, adjustment?.type, adjustment?.amount);
      if (input.receivableId) await this.validateReceivableLink(tx, input.receivableId, prepared.orderId, adjustment?.type, adjustment?.amount);

      const created = await tx.returnProcess.create({
        data: {
          number,
          type: input.type,
          status: ReturnStatus.DRAFT,
          physicalStatus: ReturnPhysicalStatus.PENDING,
          inspectionStatus: input.type === ReturnType.SUPPLIER_RETURN ? ReturnInspectionStatus.NOT_REQUIRED : ReturnInspectionStatus.PENDING,
          financialStatus: adjustment ? ReturnFinancialStatus.PENDING : ReturnFinancialStatus.NOT_REQUIRED,
          ...prepared.origin,
          reasonId: input.reasonId,
          ...(input.justification ? { justification: input.justification } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          returnedTotal: prepared.returnedTotal,
          replacementTotal: prepared.replacementTotal,
          financialDifference: prepared.replacementTotal.minus(prepared.returnedTotal),
          createdById: actorUserId,
          items: { create: prepared.items },
          ...(adjustment ? { financialAdjustments: { create: {
            ...adjustment,
            ...(input.payableId ? { payableId: input.payableId } : {}),
            ...(input.receivableId ? { receivableId: input.receivableId } : {}),
          } } } : {}),
          history: { create: { action: ReturnHistoryAction.CREATED, toStatus: ReturnStatus.DRAFT, actorId: actorUserId,
            metadata: { type: input.type, itemCount: prepared.items.length } } },
        },
        select: { id: true, number: true, returnedTotal: true, replacementTotal: true, financialDifference: true },
      });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: created.id,
        action: AuditAction.CREATE, newData: created }, tx);
      return created.id;
    });
    return this.getById(createdId);
  }

  submit(id: string, input: ReturnCommentInput, actorUserId: string) {
    return this.transition(id, [ReturnStatus.DRAFT], ReturnStatus.REQUESTED, ReturnHistoryAction.SUBMITTED, AuditAction.SUBMIT, input.comment, actorUserId, { requestedAt: new Date() });
  }

  startReview(id: string, input: ReturnCommentInput, actorUserId: string) {
    return this.transition(id, [ReturnStatus.REQUESTED], ReturnStatus.UNDER_REVIEW, ReturnHistoryAction.REVIEW_STARTED, AuditAction.STATUS_CHANGE, input.comment, actorUserId);
  }

  approve(id: string, input: ReturnCommentInput, actorUserId: string) {
    return this.transition(id, [ReturnStatus.REQUESTED, ReturnStatus.UNDER_REVIEW], ReturnStatus.APPROVED, ReturnHistoryAction.APPROVED, AuditAction.APPROVE, input.comment, actorUserId,
      { approvedAt: new Date(), approvedById: actorUserId });
  }

  reject(id: string, input: { comment: string }, actorUserId: string) {
    return this.transition(id, [ReturnStatus.REQUESTED, ReturnStatus.UNDER_REVIEW], ReturnStatus.REJECTED, ReturnHistoryAction.REJECTED, AuditAction.REJECT, input.comment, actorUserId);
  }

  async cancel(id: string, input: ReturnCommentInput, actorUserId: string) {
    const current = await this.getById(id);
    if (current.physicalStatus !== ReturnPhysicalStatus.PENDING) throw new AppError('Operações com efeito físico exigem compensação e não podem ser canceladas.', 409, 'RETURN_HAS_PHYSICAL_EFFECTS');
    return this.transition(id, [ReturnStatus.DRAFT, ReturnStatus.REQUESTED, ReturnStatus.UNDER_REVIEW, ReturnStatus.APPROVED], ReturnStatus.CANCELLED,
      ReturnHistoryAction.CANCELLED, AuditAction.CANCEL, input.comment, actorUserId);
  }

  async confirmPhysical(id: string, input: ConfirmReturnPhysicalInput, actorUserId: string) {
    await this.returns.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "return_processes" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const process = await tx.returnProcess.findUnique({ where: { id }, include: { items: true, financialAdjustments: true } });
      if (!process) throw new AppError('Devolução ou troca não encontrada.', 404, 'RETURN_NOT_FOUND');
      if (process.physicalStatus === ReturnPhysicalStatus.CONFIRMED) throw new AppError('A movimentação física desta operação já foi confirmada.', 409, 'RETURN_PHYSICAL_ALREADY_CONFIRMED');
      if (process.status !== ReturnStatus.APPROVED) throw new AppError('A operação precisa estar aprovada antes da movimentação física.', 409, 'RETURN_NOT_APPROVED');

      const conditions = new Map(input.items.map((item) => [item.itemId, item.condition]));
      if (process.type !== ReturnType.SUPPLIER_RETURN) {
        if (conditions.size !== process.items.length) throw new AppError('Informe a condição de todos os itens recebidos.', 422, 'RETURN_CONDITION_REQUIRED');
        for (const item of process.items) {
          const condition = conditions.get(item.id);
          if (!condition || condition === ReturnItemCondition.NOT_APPLICABLE) throw new AppError('Condição de item inválida.', 422, 'RETURN_CONDITION_INVALID');
        }
      }

      for (const item of process.items) {
        const condition = process.type === ReturnType.SUPPLIER_RETURN ? ReturnItemCondition.NOT_APPLICABLE : conditions.get(item.id)!;
        if (process.type === ReturnType.SUPPLIER_RETURN) {
          await this.stocks.registerSupplierReturn(tx, item.productId, item.requestedQuantity, process.id, item.id, actorUserId);
        } else if (condition === ReturnItemCondition.RESALABLE) {
          await this.stocks.registerCustomerReturn(tx, item.productId, item.requestedQuantity, process.id, item.id, actorUserId, process.type === ReturnType.EXCHANGE);
        } else {
          await this.stocks.registerCustomerReturnQuarantine(tx, item.productId, item.requestedQuantity, process.id, item.id, actorUserId, condition);
        }
        if (process.type === ReturnType.EXCHANGE) {
          if (!item.replacementProductId || item.replacementQuantity <= 0) throw new AppError('Produto substituto inválido.', 409, 'RETURN_REPLACEMENT_INVALID');
          await this.stocks.registerExchangeShipment(tx, item.replacementProductId, item.replacementQuantity, process.id, item.id, actorUserId);
        }
        await tx.returnItem.update({ where: { id: item.id }, data: {
          processedQuantity: item.requestedQuantity,
          condition,
          ...(condition !== ReturnItemCondition.PENDING_INSPECTION && condition !== ReturnItemCondition.NOT_APPLICABLE ? { inspectedAt: new Date(), inspectedById: actorUserId } : {}),
        } });
      }

      const inspectionPending = process.type !== ReturnType.SUPPLIER_RETURN && [...conditions.values()].some((value) => value === ReturnItemCondition.PENDING_INSPECTION);
      const financialPending = process.financialAdjustments.some((adjustment) => adjustment.status !== ReturnFinancialAdjustmentStatus.SETTLED && adjustment.status !== ReturnFinancialAdjustmentStatus.CANCELLED);
      const nextStatus = resolvedOperationalStatus(inspectionPending, financialPending);
      const now = new Date();
      await tx.returnProcess.update({ where: { id }, data: {
        status: nextStatus,
        physicalStatus: ReturnPhysicalStatus.CONFIRMED,
        physicalConfirmedAt: now,
        inspectionStatus: process.type === ReturnType.SUPPLIER_RETURN ? ReturnInspectionStatus.NOT_REQUIRED : inspectionPending ? ReturnInspectionStatus.PENDING : ReturnInspectionStatus.COMPLETED,
        ...(nextStatus === ReturnStatus.COMPLETED ? { completedAt: now } : {}),
      } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.PHYSICAL_CONFIRMED,
        fromStatus: process.status, toStatus: nextStatus, ...(input.comment ? { comment: input.comment } : {}), actorId: actorUserId,
        metadata: { itemCount: process.items.length, inspectionPending, financialPending } } });
      if (nextStatus === ReturnStatus.COMPLETED) await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.COMPLETED,
        fromStatus: process.status, toStatus: ReturnStatus.COMPLETED, actorId: actorUserId } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id, action: AuditAction.PHYSICAL_CONFIRM,
        oldData: { status: process.status, physicalStatus: process.physicalStatus }, newData: { status: nextStatus, physicalStatus: ReturnPhysicalStatus.CONFIRMED, inspectionPending } }, tx);
    });
    return this.getById(id);
  }

  async inspectItem(id: string, itemId: string, input: InspectReturnItemInput, actorUserId: string) {
    await this.returns.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "return_processes" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const item = await tx.returnItem.findFirst({ where: { id: itemId, returnProcessId: id }, include: { returnProcess: { include: { financialAdjustments: true } } } });
      if (!item) throw new AppError('Item da devolução não encontrado.', 404, 'RETURN_ITEM_NOT_FOUND');
      if (item.returnProcess.physicalStatus !== ReturnPhysicalStatus.CONFIRMED) throw new AppError('Confirme o recebimento físico antes da inspeção.', 409, 'RETURN_PHYSICAL_PENDING');
      if (item.condition !== ReturnItemCondition.PENDING_INSPECTION) throw new AppError('Este item já foi inspecionado.', 409, 'RETURN_ITEM_ALREADY_INSPECTED');
      await this.stocks.resolveCustomerReturnInspection(tx, item.productId, item.requestedQuantity,
        id, item.id, actorUserId, input.condition, item.returnProcess.type === ReturnType.EXCHANGE);
      await tx.returnItem.update({ where: { id: itemId }, data: { condition: input.condition, inspectedAt: new Date(), inspectedById: actorUserId } });
      const pendingCount = await tx.returnItem.count({ where: { returnProcessId: id, condition: ReturnItemCondition.PENDING_INSPECTION } });
      const financialPending = item.returnProcess.financialAdjustments.some((adjustment) => !FINISHED_ADJUSTMENTS.has(adjustment.status));
      const nextStatus = resolvedOperationalStatus(pendingCount > 0, financialPending);
      await tx.returnProcess.update({ where: { id }, data: {
        status: nextStatus,
        inspectionStatus: pendingCount > 0 ? ReturnInspectionStatus.PENDING : ReturnInspectionStatus.COMPLETED,
        ...(nextStatus === ReturnStatus.COMPLETED ? { completedAt: new Date() } : {}),
      } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.INSPECTED,
        fromStatus: item.returnProcess.status, toStatus: nextStatus, ...(input.comment ? { comment: input.comment } : {}), actorId: actorUserId,
        metadata: { itemId, condition: input.condition } } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id, action: AuditAction.INSPECT,
        oldData: { itemId, condition: item.condition }, newData: { itemId, condition: input.condition, status: nextStatus } }, tx);
    });
    return this.getById(id);
  }

  async linkAdjustment(id: string, adjustmentId: string, input: LinkReturnAdjustmentInput, actorUserId: string) {
    await this.returns.transaction(async (tx) => {
      const adjustment = await tx.returnFinancialAdjustment.findFirst({ where: { id: adjustmentId, returnProcessId: id }, include: { returnProcess: true } });
      if (!adjustment) throw new AppError('Ajuste financeiro não encontrado.', 404, 'RETURN_ADJUSTMENT_NOT_FOUND');
      if (FINISHED_ADJUSTMENTS.has(adjustment.status)) throw new AppError('O ajuste financeiro não pode mais ser alterado.', 409, 'RETURN_ADJUSTMENT_LOCKED');
      if (input.payableId) await this.validatePayableLink(tx, input.payableId, adjustment.returnProcess.purchaseOrderId ?? undefined, adjustment.type, adjustment.amount);
      if (input.receivableId) await this.validateReceivableLink(tx, input.receivableId, adjustment.returnProcess.orderId ?? undefined, adjustment.type, adjustment.amount);
      const updated = await tx.returnFinancialAdjustment.update({ where: { id: adjustmentId }, data: {
        ...(input.payableId !== undefined ? { payableId: input.payableId } : {}),
        ...(input.receivableId !== undefined ? { receivableId: input.receivableId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.FINANCIAL_UPDATED,
        fromStatus: adjustment.returnProcess.status, toStatus: adjustment.returnProcess.status, actorId: actorUserId,
        metadata: { adjustmentId, payableId: updated.payableId, receivableId: updated.receivableId } } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id, action: AuditAction.LINK,
        oldData: { payableId: adjustment.payableId, receivableId: adjustment.receivableId }, newData: { payableId: updated.payableId, receivableId: updated.receivableId } }, tx);
    });
    return this.getById(id);
  }

  async approveAdjustment(id: string, adjustmentId: string, actorUserId: string) {
    await this.returns.transaction(async (tx) => {
      const adjustment = await tx.returnFinancialAdjustment.findFirst({ where: { id: adjustmentId, returnProcessId: id }, include: { returnProcess: true } });
      if (!adjustment) throw new AppError('Ajuste financeiro não encontrado.', 404, 'RETURN_ADJUSTMENT_NOT_FOUND');
      if (adjustment.status !== ReturnFinancialAdjustmentStatus.PLANNED) throw new AppError('Somente ajustes previstos podem ser aprovados.', 409, 'RETURN_ADJUSTMENT_NOT_PLANNED');
      await tx.returnFinancialAdjustment.update({ where: { id: adjustmentId }, data: { status: ReturnFinancialAdjustmentStatus.APPROVED, approvedAt: new Date(), approvedById: actorUserId } });
      await tx.returnProcess.update({ where: { id }, data: { financialStatus: ReturnFinancialStatus.APPROVED } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.FINANCIAL_UPDATED,
        fromStatus: adjustment.returnProcess.status, toStatus: adjustment.returnProcess.status, actorId: actorUserId,
        metadata: { adjustmentId, status: ReturnFinancialAdjustmentStatus.APPROVED } } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id, action: AuditAction.APPROVE,
        newData: { adjustmentId, financialStatus: ReturnFinancialStatus.APPROVED } }, tx);
    });
    return this.getById(id);
  }

  async settleAdjustment(id: string, adjustmentId: string, input: SettleReturnAdjustmentInput, actorUserId: string) {
    await this.returns.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "return_processes" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const adjustment = await tx.returnFinancialAdjustment.findFirst({ where: { id: adjustmentId, returnProcessId: id }, include: { returnProcess: true } });
      if (!adjustment) throw new AppError('Ajuste financeiro não encontrado.', 404, 'RETURN_ADJUSTMENT_NOT_FOUND');
      if (adjustment.returnProcess.physicalStatus !== ReturnPhysicalStatus.CONFIRMED) throw new AppError('A liquidação financeira depende da confirmação física.', 409, 'RETURN_PHYSICAL_PENDING');
      if (adjustment.status !== ReturnFinancialAdjustmentStatus.APPROVED) throw new AppError('Aprove o ajuste antes de liquidá-lo.', 409, 'RETURN_ADJUSTMENT_NOT_APPROVED');
      await tx.returnFinancialAdjustment.update({ where: { id: adjustmentId }, data: {
        status: ReturnFinancialAdjustmentStatus.SETTLED, settlementReference: input.settlementReference,
        settledAt: input.settledAt ?? new Date(), settledById: actorUserId, ...(input.notes ? { notes: input.notes } : {}),
      } });
      const unsettled = await tx.returnFinancialAdjustment.count({ where: { returnProcessId: id, status: { notIn: [ReturnFinancialAdjustmentStatus.SETTLED, ReturnFinancialAdjustmentStatus.CANCELLED] } } });
      const canComplete = unsettled === 0 && adjustment.returnProcess.inspectionStatus !== ReturnInspectionStatus.PENDING;
      const nextStatus = canComplete ? ReturnStatus.COMPLETED : adjustment.returnProcess.status;
      await tx.returnProcess.update({ where: { id }, data: { financialStatus: unsettled === 0 ? ReturnFinancialStatus.SETTLED : ReturnFinancialStatus.APPROVED,
        status: nextStatus, ...(canComplete ? { completedAt: new Date() } : {}) } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.FINANCIAL_UPDATED,
        fromStatus: adjustment.returnProcess.status, toStatus: nextStatus, actorId: actorUserId,
        metadata: { adjustmentId, status: ReturnFinancialAdjustmentStatus.SETTLED, settlementReference: input.settlementReference } } });
      if (canComplete) await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.COMPLETED,
        fromStatus: adjustment.returnProcess.status, toStatus: ReturnStatus.COMPLETED, actorId: actorUserId } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id, action: AuditAction.SETTLE,
        newData: { adjustmentId, settlementReference: input.settlementReference, status: nextStatus } }, tx);
    });
    return this.getById(id);
  }

  async linkFiscal(id: string, input: LinkReturnFiscalInput, actorUserId: string) {
    await this.returns.transaction(async (tx) => {
      const [process, document] = await Promise.all([
        tx.returnProcess.findUnique({ where: { id } }),
        tx.fiscalDocument.findUnique({ where: { id: input.fiscalDocumentId }, select: { id: true, purchaseOrderId: true, orderId: true } }),
      ]);
      if (!process) throw new AppError('Devolução ou troca não encontrada.', 404, 'RETURN_NOT_FOUND');
      if (!document) throw new AppError('Documento fiscal não encontrado.', 404, 'FISCAL_DOCUMENT_NOT_FOUND');
      if (input.role === ReturnFiscalDocumentRole.ORIGINAL && document.purchaseOrderId !== process.purchaseOrderId && document.orderId !== process.orderId) {
        throw new AppError('O documento original deve estar vinculado à compra ou venda de origem.', 409, 'RETURN_FISCAL_ORIGIN_MISMATCH');
      }
      await tx.returnFiscalLink.upsert({ where: { returnProcessId_fiscalDocumentId_role: { returnProcessId: id, fiscalDocumentId: input.fiscalDocumentId, role: input.role } },
        create: { returnProcessId: id, fiscalDocumentId: input.fiscalDocumentId, role: input.role, linkedById: actorUserId }, update: {} });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.FISCAL_LINKED,
        fromStatus: process.status, toStatus: process.status, actorId: actorUserId, metadata: input } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id,
        action: AuditAction.LINK, newData: { fiscalDocumentId: input.fiscalDocumentId, role: input.role } }, tx);
    });
    return this.getById(id);
  }

  async addAttachment(id: string, file: ReturnUploadFile | undefined, metadata: ReturnAttachmentMetadataInput, actorUserId: string) {
    if (!file) throw new AppError('Selecione um arquivo.', 422, 'RETURN_ATTACHMENT_REQUIRED');
    const attachment = await this.returns.transaction(async (tx) => {
      const process = await tx.returnProcess.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!process) throw new AppError('Devolução ou troca não encontrada.', 404, 'RETURN_NOT_FOUND');
      const created = await tx.returnAttachment.create({ data: { returnProcessId: id, type: metadata.type, fileName: file.originalname,
        contentType: file.mimetype, size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), content: file.buffer, uploadedById: actorUserId } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action: ReturnHistoryAction.ATTACHMENT_ADDED,
        fromStatus: process.status, toStatus: process.status, actorId: actorUserId, metadata: { attachmentId: created.id, type: metadata.type, fileName: file.originalname } } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_ATTACHMENT, entityId: created.id,
        action: AuditAction.ATTACH, newData: { returnProcessId: id, type: metadata.type, fileName: file.originalname, size: file.size, sha256: created.sha256 } }, tx);
      return created;
    });
    return { ...attachment, content: undefined };
  }

  async downloadAttachment(id: string, attachmentId: string) {
    const attachment = await this.returns.findAttachment(id, attachmentId);
    if (!attachment) throw new AppError('Anexo não encontrado.', 404, 'RETURN_ATTACHMENT_NOT_FOUND');
    return attachment;
  }

  async removeAttachment(id: string, attachmentId: string, actorUserId: string) {
    return this.returns.transaction(async (tx) => {
      const attachment = await tx.returnAttachment.findFirst({ where: { id: attachmentId, returnProcessId: id, active: true } });
      if (!attachment) throw new AppError('Anexo não encontrado.', 404, 'RETURN_ATTACHMENT_NOT_FOUND');
      const updated = await tx.returnAttachment.update({ where: { id: attachmentId }, data: { active: false, removedAt: new Date(), removedById: actorUserId } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_ATTACHMENT, entityId: attachmentId,
        action: AuditAction.REMOVE, oldData: { active: true }, newData: { active: false, returnProcessId: id } }, tx);
      return { ...updated, content: undefined };
    });
  }

  private async prepareSupplierReturn(tx: Prisma.TransactionClient, input: CreateReturnInput) {
    const receipt = await tx.purchaseReceipt.findUnique({ where: { id: input.purchaseReceiptId! }, include: {
      purchaseOrder: { include: { supplier: true } }, items: true,
    } });
    if (!receipt) throw new AppError('Recebimento de compra não encontrado.', 404, 'PURCHASE_RECEIPT_NOT_FOUND');
    const sourceById = new Map(receipt.items.map((item) => [item.id, item]));
    const used = await tx.returnItem.groupBy({ by: ['sourcePurchaseReceiptItemId'], where: {
      sourcePurchaseReceiptItemId: { in: input.items.map((item) => item.sourceItemId) },
      returnProcess: { status: { notIn: [...INACTIVE_RETURN_STATUSES] } },
    }, _sum: { requestedQuantity: true } });
    const usedById = new Map(used.map((item) => [item.sourcePurchaseReceiptItemId, item._sum.requestedQuantity ?? 0]));
    const items = input.items.map((requested) => {
      const source = sourceById.get(requested.sourceItemId);
      if (!source) throw new AppError('Um item não pertence ao recebimento selecionado.', 409, 'RETURN_SOURCE_ITEM_MISMATCH');
      const eligible = eligibleReturnQuantity(source.quantity, usedById.get(source.id) ?? 0);
      if (requested.quantity > eligible) throw new AppError(`Quantidade superior ao saldo elegível de ${source.productName}. Disponível: ${eligible}.`, 409, 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE');
      const total = money(source.unitCost.mul(requested.quantity));
      return { productId: source.productId, sourcePurchaseReceiptItemId: source.id, productName: source.productName,
        productSku: source.productSku, originalQuantity: source.quantity, requestedQuantity: requested.quantity,
        unitValue: source.unitCost, total, condition: ReturnItemCondition.NOT_APPLICABLE };
    });
    return { purchaseOrderId: receipt.purchaseOrderId, orderId: undefined,
      origin: { purchaseOrderId: receipt.purchaseOrderId, purchaseReceiptId: receipt.id, supplierId: receipt.purchaseOrder.supplierId },
      items, returnedTotal: items.reduce((sum, item) => sum.plus(item.total), decimal(0)), replacementTotal: decimal(0) };
  }

  private async prepareCustomerReturn(tx: Prisma.TransactionClient, input: CreateReturnInput) {
    const order = await tx.order.findUnique({ where: { id: input.orderId! }, include: { client: true, items: true } });
    if (!order) throw new AppError('Venda não encontrada.', 404, 'ORDER_NOT_FOUND');
    if (order.status !== 'COMPLETED') throw new AppError('Somente vendas concluídas são elegíveis para devolução ou troca.', 409, 'RETURN_ORDER_NOT_COMPLETED');
    const sourceById = new Map(order.items.map((item) => [item.id, item]));
    const used = await tx.returnItem.groupBy({ by: ['sourceOrderItemId'], where: {
      sourceOrderItemId: { in: input.items.map((item) => item.sourceItemId) },
      returnProcess: { status: { notIn: [...INACTIVE_RETURN_STATUSES] } },
    }, _sum: { requestedQuantity: true } });
    const usedById = new Map(used.map((item) => [item.sourceOrderItemId, item._sum.requestedQuantity ?? 0]));
    const replacementIds = input.items.flatMap((item) => item.replacementProductId ? [item.replacementProductId] : []);
    const replacements = replacementIds.length ? await tx.product.findMany({ where: { id: { in: replacementIds } }, select: { id: true, name: true, sku: true, price: true, active: true } }) : [];
    const replacementById = new Map(replacements.map((product) => [product.id, product]));
    const items = input.items.map((requested) => {
      const source = sourceById.get(requested.sourceItemId);
      if (!source) throw new AppError('Um item não pertence à venda selecionada.', 409, 'RETURN_SOURCE_ITEM_MISMATCH');
      const eligible = eligibleReturnQuantity(source.quantity, usedById.get(source.id) ?? 0);
      if (requested.quantity > eligible) throw new AppError(`Quantidade superior ao saldo elegível de ${source.productName}. Disponível: ${eligible}.`, 409, 'RETURN_QUANTITY_EXCEEDS_ELIGIBLE');
      const total = money(source.unitPrice.mul(requested.quantity));
      if (input.type !== ReturnType.EXCHANGE) return { productId: source.productId, sourceOrderItemId: source.id, productName: source.productName,
        productSku: source.productSku, originalQuantity: source.quantity, requestedQuantity: requested.quantity,
        unitValue: source.unitPrice, total, condition: ReturnItemCondition.PENDING_INSPECTION };
      const replacement = replacementById.get(requested.replacementProductId!);
      if (!replacement || !replacement.active) throw new AppError('Produto substituto inexistente ou inativo.', 409, 'RETURN_REPLACEMENT_INVALID');
      const replacementTotal = money(replacement.price.mul(requested.replacementQuantity!));
      return { productId: source.productId, sourceOrderItemId: source.id, productName: source.productName,
        productSku: source.productSku, originalQuantity: source.quantity, requestedQuantity: requested.quantity,
        unitValue: source.unitPrice, total, condition: ReturnItemCondition.PENDING_INSPECTION,
        replacementProductId: replacement.id, replacementQuantity: requested.replacementQuantity!, replacementUnitValue: replacement.price, replacementTotal };
    });
    return { purchaseOrderId: undefined, orderId: order.id,
      origin: { orderId: order.id, clientId: order.clientId }, items,
      returnedTotal: items.reduce((sum, item) => sum.plus(item.total), decimal(0)),
      replacementTotal: items.reduce((sum, item) => sum.plus('replacementTotal' in item ? item.replacementTotal : 0), decimal(0)) };
  }

  private financialAdjustment(input: CreateReturnInput, returnedTotal: Prisma.Decimal, replacementTotal: Prisma.Decimal, actorUserId: string) {
    if (input.type === ReturnType.EXCHANGE) {
      const difference = exchangeDifference(returnedTotal, replacementTotal);
      return difference ? { ...difference, createdById: actorUserId } : null;
    }
    return { type: input.financialTreatment!, amount: returnedTotal, createdById: actorUserId };
  }

  private async validatePayableLink(tx: Prisma.TransactionClient, payableId: string, purchaseOrderId: string | undefined,
    type: ReturnFinancialAdjustmentType | undefined, amount: Prisma.Decimal | undefined) {
    const payable = await tx.payable.findUnique({ where: { id: payableId } });
    if (!payable || payable.purchaseOrderId !== purchaseOrderId) throw new AppError('A conta a pagar não pertence à compra de origem.', 409, 'RETURN_PAYABLE_MISMATCH');
    if (!type || !SUPPLIER_FINANCIAL.has(type)) throw new AppError('Ajuste incompatível com conta a pagar.', 409, 'RETURN_FINANCIAL_TYPE_MISMATCH');
    const available = type === ReturnFinancialAdjustmentType.SUPPLIER_REFUND ? payable.paidAmount : payable.originalAmount.minus(payable.paidAmount);
    if (amount && amount.gt(available)) throw new AppError('O ajuste excede o valor disponível no título selecionado.', 409, 'RETURN_FINANCIAL_AMOUNT_EXCEEDED');
  }

  private async validateReceivableLink(tx: Prisma.TransactionClient, receivableId: string, orderId: string | undefined,
    type: ReturnFinancialAdjustmentType | undefined, amount: Prisma.Decimal | undefined) {
    const receivable = await tx.receivable.findUnique({ where: { id: receivableId } });
    if (!receivable || receivable.orderId !== orderId) throw new AppError('A conta a receber não pertence à venda de origem.', 409, 'RETURN_RECEIVABLE_MISMATCH');
    if (!type || (!CUSTOMER_FINANCIAL.has(type) && !EXCHANGE_FINANCIAL.has(type))) {
      throw new AppError('Ajuste incompatível com conta a receber.', 409, 'RETURN_FINANCIAL_TYPE_MISMATCH');
    }
    const refundLike = REFUND_LIKE.has(type);
    const available = refundLike ? receivable.receivedAmount : receivable.originalAmount.minus(receivable.receivedAmount);
    if (amount && amount.gt(available)) throw new AppError('O ajuste excede o valor disponível no título selecionado.', 409, 'RETURN_FINANCIAL_AMOUNT_EXCEEDED');
  }

  private async transition(id: string, allowed: ReturnStatus[], next: ReturnStatus, action: ReturnHistoryAction,
    auditAction: AuditAction, comment: string | undefined, actorUserId: string, extra: Prisma.ReturnProcessUncheckedUpdateInput = {}) {
    await this.returns.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "return_processes" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await tx.returnProcess.findUnique({ where: { id } });
      if (!current) throw new AppError('Devolução ou troca não encontrada.', 404, 'RETURN_NOT_FOUND');
      if (!allowed.includes(current.status)) throw new AppError('Transição de estado não permitida.', 409, 'RETURN_INVALID_TRANSITION');
      await tx.returnProcess.update({ where: { id }, data: { status: next, ...extra } });
      await tx.returnHistory.create({ data: { returnProcessId: id, action, fromStatus: current.status, toStatus: next,
        ...(comment ? { comment } : {}), actorId: actorUserId } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.RETURN_PROCESS, entityId: id, action: auditAction,
        oldData: { status: current.status }, newData: { status: next, comment } }, tx);
    });
    return this.getById(id);
  }
}
