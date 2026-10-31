import {
  AuditAction,
  AuditEntity,
  BankMovementNature,
  BankMovementType,
  FinancialTitleType,
  PayableStatus,
  Prisma,
  ReceivableStatus,
  UserRole,
} from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { SettleFinancialTitleInput } from '../schemas/finance.schema.js';
import type { AuditLogger } from './audit.service.js';
import { adjustedTitleAmount, money } from './financial-rules.js';
import { financialTransaction, nextBankMovementNumber } from './financial-transaction.js';

export const payableFinanceInclude = {
  supplier: { select: { id: true, name: true, document: true } },
  purchaseOrder: { select: { id: true, number: true } },
  purchaseReceipt: { select: { id: true, number: true } },
  chartAccount: true,
  plannedBankAccount: { select: { id: true, name: true } },
  allocations: { include: { costCenter: true }, orderBy: { amount: 'desc' as const } },
  adjustments: { include: { createdBy: { select: { id: true, name: true } }, reversedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' as const } },
  attachments: { where: { active: true }, select: { id: true, fileName: true, contentType: true, size: true, sha256: true, createdAt: true } },
  payments: { orderBy: { paidAt: 'desc' as const }, include: {
    bankAccount: { select: { id: true, name: true } }, bankMovement: true,
    createdBy: { select: { id: true, name: true, email: true } }, reversedBy: { select: { id: true, name: true, email: true } },
  } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PayableInclude;

export const receivableFinanceInclude = {
  client: { select: { id: true, name: true, document: true } },
  order: { select: { id: true, number: true } },
  chartAccount: true,
  plannedBankAccount: { select: { id: true, name: true } },
  allocations: { include: { costCenter: true }, orderBy: { amount: 'desc' as const } },
  adjustments: { include: { createdBy: { select: { id: true, name: true } }, reversedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' as const } },
  attachments: { where: { active: true }, select: { id: true, fileName: true, contentType: true, size: true, sha256: true, createdAt: true } },
  collections: { orderBy: { receivedAt: 'desc' as const }, include: {
    bankAccount: { select: { id: true, name: true } }, bankMovement: true,
    createdBy: { select: { id: true, name: true, email: true } }, reversedBy: { select: { id: true, name: true, email: true } },
  } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ReceivableInclude;

async function activeBankAccount(transaction: Prisma.TransactionClient, id: string) {
  const account = await transaction.bankAccount.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
  if (!account) throw new AppError('Conta financeira não encontrada.', 404, 'BANK_ACCOUNT_NOT_FOUND');
  if (!account.active) throw new AppError('Conta financeira inativa não pode receber movimentações.', 409, 'BANK_ACCOUNT_INACTIVE');
  return account;
}

export class FinancialSettlementService {
  constructor(private readonly audit: AuditLogger) {}

  settle(type: FinancialTitleType, id: string, input: SettleFinancialTitleInput, actor: string) {
    return type === FinancialTitleType.PAYABLE ? this.settlePayable(id, input, actor) : this.settleReceivable(id, input, actor);
  }

  settlePayable(id: string, input: SettleFinancialTitleInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "payables" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new AppError('Conta a pagar não encontrada.', 404, 'PAYABLE_NOT_FOUND');
      const payable = await transaction.payable.findUniqueOrThrow({ where: { id } });
      if (payable.status === PayableStatus.DRAFT) throw new AppError('Publique o rascunho antes de liquidar.', 409, 'FINANCIAL_TITLE_DRAFT');
      if (payable.status === PayableStatus.CANCELLED) throw new AppError('Conta cancelada não pode ser liquidada.', 409, 'PAYABLE_CANCELLED');
      if (payable.status === PayableStatus.PAID) throw new AppError('Conta já está integralmente paga.', 409, 'PAYABLE_ALREADY_PAID');
      if (input.idempotencyKey) {
        const existing = await transaction.payablePayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          if (existing.payableId !== id || !existing.amount.eq(input.amount)) throw new AppError('Chave de idempotência já utilizada em outra liquidação.', 409, 'IDEMPOTENCY_KEY_CONFLICT');
          return transaction.payable.findUniqueOrThrow({ where: { id }, include: payableFinanceInclude });
        }
      }
      await activeBankAccount(transaction, input.bankAccountId);
      const amount = money(input.amount);
      const adjusted = adjustedTitleAmount(payable);
      const remaining = adjusted.sub(payable.paidAmount);
      if (amount.gt(remaining)) throw new AppError('O pagamento excede o saldo exigível da conta.', 409, 'PAYMENT_EXCEEDS_REMAINING');
      const paidAt = input.settledAt ?? new Date();
      if (paidAt.getTime() > Date.now() + 60_000) throw new AppError('A data da liquidação não pode estar no futuro.', 400, 'SETTLEMENT_DATE_IN_FUTURE');
      const sequence = await transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('payable_payment_number_seq') AS value`;
      const paymentNumber = `PAG-${sequence[0]!.value.toString().padStart(6, '0')}`;
      const payment = await transaction.payablePayment.create({ data: {
        number: paymentNumber, payableId: id, amount, method: input.method, bankAccountId: input.bankAccountId, paidAt, createdById: actor,
        ...(input.notes ? { notes: input.notes } : {}), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      } });
      const movementNumber = await nextBankMovementNumber(transaction);
      const movement = await transaction.bankMovement.create({ data: {
        number: movementNumber, bankAccountId: input.bankAccountId, nature: BankMovementNature.DEBIT, type: BankMovementType.SETTLEMENT,
        amount, postedAt: paidAt, description: `Pagamento ${paymentNumber} — ${payable.description}`,
        externalReference: paymentNumber, payablePaymentId: payment.id, createdById: actor,
      } });
      const paidAmount = payable.paidAmount.add(amount);
      const status = paidAmount.eq(adjusted) ? PayableStatus.PAID : PayableStatus.PARTIALLY_PAID;
      await transaction.payable.update({ where: { id }, data: { paidAmount, status } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.SETTLE,
        oldData: { paidAmount: payable.paidAmount, status: payable.status }, newData: { type: FinancialTitleType.PAYABLE, paymentId: payment.id, movementId: movement.id, amount, paidAmount, status } }, transaction);
      return transaction.payable.findUniqueOrThrow({ where: { id }, include: payableFinanceInclude });
    });
  }

  settleReceivable(id: string, input: SettleFinancialTitleInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "receivables" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw new AppError('Conta a receber não encontrada.', 404, 'RECEIVABLE_NOT_FOUND');
      const receivable = await transaction.receivable.findUniqueOrThrow({ where: { id } });
      if (receivable.status === ReceivableStatus.DRAFT) throw new AppError('Publique o rascunho antes de liquidar.', 409, 'FINANCIAL_TITLE_DRAFT');
      if (receivable.status === ReceivableStatus.CANCELLED) throw new AppError('Conta cancelada não pode ser liquidada.', 409, 'RECEIVABLE_CANCELLED');
      if (receivable.status === ReceivableStatus.RECEIVED) throw new AppError('Conta já está integralmente recebida.', 409, 'RECEIVABLE_ALREADY_RECEIVED');
      if (input.idempotencyKey) {
        const existing = await transaction.receivableCollection.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (existing) {
          if (existing.receivableId !== id || !existing.amount.eq(input.amount)) throw new AppError('Chave de idempotência já utilizada em outra liquidação.', 409, 'IDEMPOTENCY_KEY_CONFLICT');
          return transaction.receivable.findUniqueOrThrow({ where: { id }, include: receivableFinanceInclude });
        }
      }
      await activeBankAccount(transaction, input.bankAccountId);
      const amount = money(input.amount);
      const adjusted = adjustedTitleAmount(receivable);
      const remaining = adjusted.sub(receivable.receivedAmount);
      if (amount.gt(remaining)) throw new AppError('O recebimento excede o saldo exigível da conta.', 409, 'COLLECTION_EXCEEDS_REMAINING');
      const receivedAt = input.settledAt ?? new Date();
      if (receivedAt.getTime() > Date.now() + 60_000) throw new AppError('A data da liquidação não pode estar no futuro.', 400, 'SETTLEMENT_DATE_IN_FUTURE');
      const sequence = await transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('receivable_collection_number_seq') AS value`;
      const collectionNumber = `RCB-${sequence[0]!.value.toString().padStart(6, '0')}`;
      const collection = await transaction.receivableCollection.create({ data: {
        number: collectionNumber, receivableId: id, amount, method: input.method, bankAccountId: input.bankAccountId, receivedAt, createdById: actor,
        ...(input.notes ? { notes: input.notes } : {}), ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      } });
      const movementNumber = await nextBankMovementNumber(transaction);
      const movement = await transaction.bankMovement.create({ data: {
        number: movementNumber, bankAccountId: input.bankAccountId, nature: BankMovementNature.CREDIT, type: BankMovementType.SETTLEMENT,
        amount, postedAt: receivedAt, description: `Recebimento ${collectionNumber} — ${receivable.description}`,
        externalReference: collectionNumber, receivableCollectionId: collection.id, createdById: actor,
      } });
      const receivedAmount = receivable.receivedAmount.add(amount);
      const status = receivedAmount.eq(adjusted) ? ReceivableStatus.RECEIVED : ReceivableStatus.PARTIALLY_RECEIVED;
      await transaction.receivable.update({ where: { id }, data: { receivedAmount, status } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.SETTLE,
        oldData: { receivedAmount: receivable.receivedAmount, status: receivable.status }, newData: { type: FinancialTitleType.RECEIVABLE, collectionId: collection.id, movementId: movement.id, amount, receivedAmount, status } }, transaction);
      return transaction.receivable.findUniqueOrThrow({ where: { id }, include: receivableFinanceInclude });
    });
  }

  reverse(type: FinancialTitleType, titleId: string, settlementId: string, reason: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem estornar liquidações.', 403, 'SETTLEMENT_REVERSAL_FORBIDDEN');
    return type === FinancialTitleType.PAYABLE
      ? this.reversePayment(titleId, settlementId, reason, actor)
      : this.reverseCollection(titleId, settlementId, reason, actor);
  }

  private reversePayment(id: string, paymentId: string, reason: string, actor: string) {
    return financialTransaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "payables" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const payable = await transaction.payable.findUnique({ where: { id } });
      if (!payable) throw new AppError('Conta a pagar não encontrada.', 404, 'PAYABLE_NOT_FOUND');
      const payment = await transaction.payablePayment.findFirst({ where: { id: paymentId, payableId: id }, include: { bankMovement: true } });
      if (!payment) throw new AppError('Pagamento não encontrado.', 404, 'PAYMENT_NOT_FOUND');
      if (payment.reversedAt) throw new AppError('Pagamento já estornado.', 409, 'PAYMENT_ALREADY_REVERSED');
      const reversedAt = new Date();
      await transaction.payablePayment.update({ where: { id: paymentId }, data: { reversedAt, reversedById: actor, reversalReason: reason } });
      if (payment.bankMovement) {
        await transaction.bankMovement.update({ where: { id: payment.bankMovement.id }, data: { reversedAt, reversedById: actor, reversalReason: reason } });
        await transaction.bankMovement.create({ data: { number: await nextBankMovementNumber(transaction), bankAccountId: payment.bankMovement.bankAccountId,
          nature: BankMovementNature.CREDIT, type: BankMovementType.ADJUSTMENT, amount: payment.amount, postedAt: reversedAt,
          description: `Estorno do pagamento ${payment.number}`, externalReference: payment.bankMovement.number, createdById: actor } });
      }
      const paidAmount = payable.paidAmount.sub(payment.amount);
      const status = paidAmount.eq(0) ? PayableStatus.PENDING : PayableStatus.PARTIALLY_PAID;
      await transaction.payable.update({ where: { id }, data: { paidAmount, status } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.PAYMENT_REVERSAL,
        oldData: { paidAmount: payable.paidAmount, status: payable.status }, newData: { paymentId, amount: payment.amount, reason, paidAmount, status } }, transaction);
      return transaction.payable.findUniqueOrThrow({ where: { id }, include: payableFinanceInclude });
    });
  }

  private reverseCollection(id: string, collectionId: string, reason: string, actor: string) {
    return financialTransaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "receivables" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const receivable = await transaction.receivable.findUnique({ where: { id } });
      if (!receivable) throw new AppError('Conta a receber não encontrada.', 404, 'RECEIVABLE_NOT_FOUND');
      const collection = await transaction.receivableCollection.findFirst({ where: { id: collectionId, receivableId: id }, include: { bankMovement: true } });
      if (!collection) throw new AppError('Recebimento não encontrado.', 404, 'COLLECTION_NOT_FOUND');
      if (collection.reversedAt) throw new AppError('Recebimento já estornado.', 409, 'COLLECTION_ALREADY_REVERSED');
      const reversedAt = new Date();
      await transaction.receivableCollection.update({ where: { id: collectionId }, data: { reversedAt, reversedById: actor, reversalReason: reason } });
      if (collection.bankMovement) {
        await transaction.bankMovement.update({ where: { id: collection.bankMovement.id }, data: { reversedAt, reversedById: actor, reversalReason: reason } });
        await transaction.bankMovement.create({ data: { number: await nextBankMovementNumber(transaction), bankAccountId: collection.bankMovement.bankAccountId,
          nature: BankMovementNature.DEBIT, type: BankMovementType.ADJUSTMENT, amount: collection.amount, postedAt: reversedAt,
          description: `Estorno do recebimento ${collection.number}`, externalReference: collection.bankMovement.number, createdById: actor } });
      }
      const receivedAmount = receivable.receivedAmount.sub(collection.amount);
      const status = receivedAmount.eq(0) ? ReceivableStatus.PENDING : ReceivableStatus.PARTIALLY_RECEIVED;
      await transaction.receivable.update({ where: { id }, data: { receivedAmount, status } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FINANCIAL_TITLE, entityId: id, action: AuditAction.COLLECTION_REVERSAL,
        oldData: { receivedAmount: receivable.receivedAmount, status: receivable.status }, newData: { collectionId, amount: collection.amount, reason, receivedAmount, status } }, transaction);
      return transaction.receivable.findUniqueOrThrow({ where: { id }, include: receivableFinanceInclude });
    });
  }
}
