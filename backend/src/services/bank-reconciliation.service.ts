import { createHash } from 'node:crypto';
import {
  AuditAction,
  AuditEntity,
  BankTransactionReconciliationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { ReconcileInput } from '../schemas/finance.schema.js';
import type { AuditLogger } from './audit.service.js';
import { bankTransactionFingerprint, parseBankCsv, parseOfx, type CsvBankMapping } from './bank-statement.parser.js';
import { money, reconciliationConfidence } from './financial-rules.js';
import { financialTransaction } from './financial-transaction.js';

interface PreviewRow {
  transactionDate: string;
  processedAt?: string;
  description: string;
  bankIdentifier?: string;
  amount: string;
  nature: 'CREDIT' | 'DEBIT';
  reference?: string;
  fingerprint: string;
  duplicate: boolean;
}

export class BankReconciliationService {
  constructor(private readonly audit: AuditLogger) {}

  async preview(file: Express.Multer.File, bankAccountId: string, format: 'OFX' | 'CSV', mappingValue: string | undefined, actor: string) {
    const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, active: true } });
    if (!account) throw new AppError('Conta financeira não encontrada ou inativa.', 404, 'BANK_ACCOUNT_NOT_FOUND');
    if ((format === 'OFX' && !file.originalname.toLowerCase().endsWith('.ofx')) || (format === 'CSV' && !file.originalname.toLowerCase().endsWith('.csv'))) {
      throw new AppError('O formato informado não corresponde à extensão do arquivo.', 400, 'STATEMENT_FORMAT_MISMATCH');
    }
    let mapping: Partial<CsvBankMapping> | undefined;
    if (mappingValue) {
      try { mapping = JSON.parse(mappingValue) as Partial<CsvBankMapping>; }
      catch { throw new AppError('Mapeamento CSV inválido.', 400, 'INVALID_CSV_MAPPING'); }
    }
    const parsed = format === 'OFX' ? parseOfx(file.buffer, env.BANK_STATEMENT_MAX_ROWS) : parseBankCsv(file.buffer, mapping, env.BANK_STATEMENT_MAX_ROWS);
    const fingerprints = parsed.map((item) => bankTransactionFingerprint(bankAccountId, item));
    const existing = new Set((await prisma.bankTransaction.findMany({ where: { fingerprint: { in: fingerprints } }, select: { fingerprint: true } })).map((item) => item.fingerprint));
    const seen = new Set<string>();
    const preview: PreviewRow[] = parsed.map((item, index) => {
      const fingerprint = fingerprints[index]!; const duplicate = existing.has(fingerprint) || seen.has(fingerprint); seen.add(fingerprint);
      return { transactionDate: item.transactionDate.toISOString(), ...(item.processedAt ? { processedAt: item.processedAt.toISOString() } : {}),
        description: item.description, ...(item.bankIdentifier ? { bankIdentifier: item.bankIdentifier } : {}), amount: item.amount.toFixed(2), nature: item.nature,
        ...(item.reference ? { reference: item.reference } : {}), fingerprint, duplicate };
    });
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicateFile = await prisma.bankStatementImport.findUnique({ where: { bankAccountId_sha256: { bankAccountId, sha256 } },
      include: { bankAccount: { select: { id: true, name: true } } } });
    if (duplicateFile) return { ...duplicateFile, duplicateFile: true };
    const dates = parsed.map((item) => item.transactionDate.getTime());
    const created = await prisma.bankStatementImport.create({ data: { bankAccountId, fileName: file.originalname, contentType: file.mimetype,
      size: file.size, sha256, content: file.buffer, format, preview: preview as unknown as Prisma.InputJsonValue, totalRows: preview.length,
      duplicateRows: preview.filter((item) => item.duplicate).length, periodStart: new Date(Math.min(...dates)), periodEnd: new Date(Math.max(...dates)), createdById: actor },
      include: { bankAccount: { select: { id: true, name: true } } } });
    await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_STATEMENT_IMPORT, entityId: created.id, action: AuditAction.IMPORT,
      newData: { fileName: file.originalname, format, totalRows: preview.length, duplicateRows: created.duplicateRows, status: created.status } });
    return { ...created, duplicateFile: false };
  }

  confirm(id: string, actor: string) {
    return financialTransaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "bank_statement_imports" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const statement = await transaction.bankStatementImport.findUnique({ where: { id } });
      if (!statement) throw new AppError('Importação de extrato não encontrada.', 404, 'BANK_STATEMENT_IMPORT_NOT_FOUND');
      if (statement.status === 'COMPLETED') return statement;
      const rows = statement.preview as unknown as PreviewRow[];
      let importedRows = 0; let duplicateRows = 0;
      for (const row of rows) {
        if (row.duplicate) { duplicateRows += 1; continue; }
        try {
          await transaction.bankTransaction.create({ data: { bankAccountId: statement.bankAccountId, statementImportId: statement.id,
            transactionDate: new Date(row.transactionDate), ...(row.processedAt ? { processedAt: new Date(row.processedAt) } : {}),
            description: row.description, ...(row.bankIdentifier ? { bankIdentifier: row.bankIdentifier } : {}), amount: money(row.amount), nature: row.nature,
            ...(row.reference ? { reference: row.reference } : {}), fingerprint: row.fingerprint } });
          importedRows += 1;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') duplicateRows += 1;
          else throw error;
        }
      }
      const updated = await transaction.bankStatementImport.update({ where: { id }, data: { status: 'COMPLETED', importedRows, duplicateRows, completedAt: new Date() } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_STATEMENT_IMPORT, entityId: id, action: AuditAction.IMPORT,
        oldData: { status: statement.status }, newData: { status: updated.status, importedRows, duplicateRows } }, transaction);
      return updated;
    });
  }

  listImports() {
    return prisma.bankStatementImport.findMany({ orderBy: { createdAt: 'desc' }, take: 100,
      include: { bankAccount: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } } });
  }

  async listTransactions(bankAccountId?: string) {
    const transactions = await prisma.bankTransaction.findMany({ where: bankAccountId ? { bankAccountId } : {}, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }], take: 500,
      include: { bankAccount: { select: { id: true, name: true } }, reconciliationLinks: { where: { reconciliation: { reversedAt: null } }, include: { reconciliation: true, bankMovement: true } } } });
    return Promise.all(transactions.map(async (transaction) => {
      const from = new Date(transaction.transactionDate.getTime() - 3 * 86_400_000); const to = new Date(transaction.transactionDate.getTime() + 4 * 86_400_000);
      const candidates = await prisma.bankMovement.findMany({ where: { bankAccountId: transaction.bankAccountId, nature: transaction.nature,
        amount: transaction.amount, postedAt: { gte: from, lt: to }, reversedAt: null }, include: { reconciliationLinks: { where: { reconciliation: { reversedAt: null } } } } });
      const suggestions = candidates.map((movement) => ({ movement, ...reconciliationConfidence({ transactionAmount: transaction.amount, movementAmount: movement.amount,
        transactionDate: transaction.transactionDate, movementDate: movement.postedAt, transactionReference: transaction.reference ?? transaction.bankIdentifier,
        movementReference: movement.externalReference, description: transaction.description }) })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score).slice(0, 5);
      const reconciledAmount = transaction.reconciliationLinks.reduce((sum, link) => sum.add(link.amount), new Prisma.Decimal(0));
      return { ...transaction, reconciledAmount, remainingAmount: money(transaction.amount.sub(reconciledAmount)), suggestions };
    }));
  }

  ignoreTransaction(id: string, reason: string, actor: string) {
    return financialTransaction(async (transaction) => {
      const current = await transaction.bankTransaction.findUnique({ where: { id } });
      if (!current) throw new AppError('Transação bancária não encontrada.', 404, 'BANK_TRANSACTION_NOT_FOUND');
      const linked = await transaction.bankReconciliationLink.count({ where: { bankTransactionId: id, reconciliation: { reversedAt: null } } });
      if (linked) throw new AppError('Transação conciliada não pode ser ignorada.', 409, 'BANK_TRANSACTION_RECONCILED');
      const updated = await transaction.bankTransaction.update({ where: { id }, data: { reconciliationStatus: BankTransactionReconciliationStatus.IGNORED, ignoredReason: reason } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_RECONCILIATION, entityId: id, action: AuditAction.UPDATE, oldData: { reconciliationStatus: current.reconciliationStatus }, newData: { reconciliationStatus: updated.reconciliationStatus, reason } }, transaction);
      return updated;
    });
  }

  reconcile(input: ReconcileInput, actor: string) {
    return financialTransaction(async (transaction) => {
      const transactionIds = [...new Set(input.links.map((link) => link.bankTransactionId))];
      const movementIds = [...new Set(input.links.map((link) => link.bankMovementId))];
      await transaction.$queryRawUnsafe(`SELECT "id" FROM "bank_transactions" WHERE "id" = ANY($1::uuid[]) FOR UPDATE`, transactionIds);
      await transaction.$queryRawUnsafe(`SELECT "id" FROM "bank_movements" WHERE "id" = ANY($1::uuid[]) FOR UPDATE`, movementIds);
      const [bankTransactions, movements, existingLinks] = await Promise.all([
        transaction.bankTransaction.findMany({ where: { id: { in: transactionIds } } }),
        transaction.bankMovement.findMany({ where: { id: { in: movementIds }, reversedAt: null } }),
        transaction.bankReconciliationLink.findMany({ where: { reconciliation: { reversedAt: null }, OR: [{ bankTransactionId: { in: transactionIds } }, { bankMovementId: { in: movementIds } }] } }),
      ]);
      if (bankTransactions.length !== transactionIds.length || movements.length !== movementIds.length) throw new AppError('Transação ou movimentação não encontrada.', 404, 'RECONCILIATION_ITEM_NOT_FOUND');
      for (const link of input.links) {
        const bankTransaction = bankTransactions.find((item) => item.id === link.bankTransactionId)!;
        const movement = movements.find((item) => item.id === link.bankMovementId)!;
        if (bankTransaction.bankAccountId !== movement.bankAccountId || bankTransaction.nature !== movement.nature) throw new AppError('Transação e movimentação devem possuir conta e natureza compatíveis.', 409, 'RECONCILIATION_INCOMPATIBLE');
      }
      for (const bankTransaction of bankTransactions) {
        const oldAmount = existingLinks.filter((item) => item.bankTransactionId === bankTransaction.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const newAmount = input.links.filter((item) => item.bankTransactionId === bankTransaction.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        if (oldAmount.add(newAmount).gt(bankTransaction.amount)) throw new AppError('A conciliação excede o valor da transação bancária.', 409, 'RECONCILIATION_EXCEEDS_TRANSACTION');
      }
      for (const movement of movements) {
        const oldAmount = existingLinks.filter((item) => item.bankMovementId === movement.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const newAmount = input.links.filter((item) => item.bankMovementId === movement.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        if (oldAmount.add(newAmount).gt(movement.amount)) throw new AppError('A conciliação excede o valor da movimentação interna.', 409, 'RECONCILIATION_EXCEEDS_MOVEMENT');
      }
      const reconciliation = await transaction.bankReconciliation.create({ data: { ...(input.notes ? { notes: input.notes } : {}), createdById: actor,
        links: { create: input.links.map((link) => ({ ...link, amount: money(link.amount) })) } }, include: { links: true } });
      for (const bankTransaction of bankTransactions) {
        const oldAmount = existingLinks.filter((item) => item.bankTransactionId === bankTransaction.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const newAmount = input.links.filter((item) => item.bankTransactionId === bankTransaction.id).reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0));
        const status = oldAmount.add(newAmount).eq(bankTransaction.amount) ? BankTransactionReconciliationStatus.RECONCILED : BankTransactionReconciliationStatus.DIVERGENT;
        await transaction.bankTransaction.update({ where: { id: bankTransaction.id }, data: { reconciliationStatus: status, ignoredReason: null } });
      }
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_RECONCILIATION, entityId: reconciliation.id, action: AuditAction.RECONCILE, newData: { links: input.links } }, transaction);
      return reconciliation;
    });
  }

  reverseReconciliation(id: string, reason: string, role: UserRole, actor: string) {
    if (role !== UserRole.ADMIN) throw new AppError('Apenas administradores podem desfazer conciliações.', 403, 'RECONCILIATION_REVERSAL_FORBIDDEN');
    return financialTransaction(async (transaction) => {
      const reconciliation = await transaction.bankReconciliation.findUnique({ where: { id }, include: { links: true } });
      if (!reconciliation) throw new AppError('Conciliação não encontrada.', 404, 'BANK_RECONCILIATION_NOT_FOUND');
      if (reconciliation.reversedAt) throw new AppError('Conciliação já desfeita.', 409, 'BANK_RECONCILIATION_ALREADY_REVERSED');
      const reversedAt = new Date();
      const updated = await transaction.bankReconciliation.update({ where: { id }, data: { reversedAt, reversedById: actor, reversalReason: reason } });
      for (const transactionId of [...new Set(reconciliation.links.map((link) => link.bankTransactionId))]) {
        const bankTransaction = await transaction.bankTransaction.findUniqueOrThrow({ where: { id: transactionId } });
        const remaining = await transaction.bankReconciliationLink.aggregate({ where: { bankTransactionId: transactionId, reconciliation: { reversedAt: null, id: { not: id } } }, _sum: { amount: true } });
        const amount = remaining._sum.amount ?? new Prisma.Decimal(0);
        const status = amount.eq(0) ? BankTransactionReconciliationStatus.PENDING : amount.eq(bankTransaction.amount) ? BankTransactionReconciliationStatus.RECONCILED : BankTransactionReconciliationStatus.DIVERGENT;
        await transaction.bankTransaction.update({ where: { id: transactionId }, data: { reconciliationStatus: status } });
      }
      await this.audit.log({ userId: actor, entityType: AuditEntity.BANK_RECONCILIATION, entityId: id, action: AuditAction.RECONCILIATION_REVERSAL, oldData: { reversedAt: null }, newData: { reversedAt, reason } }, transaction);
      return updated;
    });
  }
}
