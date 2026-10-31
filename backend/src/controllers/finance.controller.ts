import { FinancialTitleType } from '@prisma/client';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/app-error.js';
import {
  cancelFinancialTitleSchema,
  confirmStatementImportSchema,
  createBankAccountSchema,
  createChartAccountSchema,
  createCostCenterSchema,
  createFinancialAdjustmentSchema,
  createFinancialTitleSchema,
  createRecurrenceSchema,
  financeIdSchema,
  financialReportQuerySchema,
  ignoreBankTransactionSchema,
  listFinancialTitlesQuerySchema,
  processRecurrencesSchema,
  reconcileSchema,
  reverseSettlementSchema,
  settleFinancialTitleSchema,
  statementPreviewSchema,
  transferSchema,
  updateBankAccountSchema,
  updateChartAccountSchema,
  updateCostCenterSchema,
  updateFinancialTitleSchema,
  updateRecurrenceSchema,
} from '../schemas/finance.schema.js';
import type { BankReconciliationService } from '../services/bank-reconciliation.service.js';
import type { FinanceReportService } from '../services/finance-report.service.js';
import type { FinanceService } from '../services/finance.service.js';
import type { FinancialSettlementService } from '../services/financial-settlement.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

const titleTypeSchema = z.enum(FinancialTitleType);
const recurrenceActionSchema = z.enum(['suspend', 'reactivate', 'close']);
const routeValue = (value: unknown) => z.string().parse(value);
const parseType = (value: unknown) => titleTypeSchema.parse(routeValue(value).toUpperCase());
const id = (value: unknown) => financeIdSchema.parse(value);

export class FinanceController {
  constructor(private readonly finance: FinanceService, private readonly settlements: FinancialSettlementService,
    private readonly reconciliation: BankReconciliationService, private readonly reports: FinanceReportService) {}

  setup = async (_request: Request, response: Response) => response.status(200).json(await this.finance.setup());
  listCostCenters = async (_request: Request, response: Response) => response.status(200).json({ data: await this.finance.listCostCenters() });
  createCostCenter = async (request: Request, response: Response) => response.status(201).json({ costCenter: await this.finance.createCostCenter(createCostCenterSchema.parse(request.body), authenticatedUserId(request)) });
  updateCostCenter = async (request: Request, response: Response) => response.status(200).json({ costCenter: await this.finance.updateCostCenter(id(request.params.id!), updateCostCenterSchema.parse(request.body), authenticatedUserId(request)) });
  listChartAccounts = async (_request: Request, response: Response) => response.status(200).json({ data: await this.finance.listChartAccounts() });
  createChartAccount = async (request: Request, response: Response) => response.status(201).json({ chartAccount: await this.finance.createChartAccount(createChartAccountSchema.parse(request.body), authenticatedUserId(request)) });
  updateChartAccount = async (request: Request, response: Response) => response.status(200).json({ chartAccount: await this.finance.updateChartAccount(id(request.params.id!), updateChartAccountSchema.parse(request.body), authenticatedUserId(request)) });
  listBankAccounts = async (_request: Request, response: Response) => response.status(200).json({ data: await this.finance.listBankAccounts() });
  createBankAccount = async (request: Request, response: Response) => response.status(201).json({ bankAccount: await this.finance.createBankAccount(createBankAccountSchema.parse(request.body), authenticatedUserId(request)) });
  updateBankAccount = async (request: Request, response: Response) => response.status(200).json({ bankAccount: await this.finance.updateBankAccount(id(request.params.id!), updateBankAccountSchema.parse(request.body), authenticatedUserId(request)) });

  listTitles = async (request: Request, response: Response) => response.status(200).json(await this.finance.listTitles(listFinancialTitlesQuerySchema.parse(request.query)));
  getTitle = async (request: Request, response: Response) => response.status(200).json({ title: await this.finance.getTitle(parseType(request.params.type!), id(request.params.id!)) });
  createTitle = async (request: Request, response: Response) => response.status(201).json({ title: await this.finance.createTitle(createFinancialTitleSchema.parse(request.body), authenticatedUserId(request)) });
  updateTitle = async (request: Request, response: Response) => response.status(200).json({ title: await this.finance.updateTitle(parseType(request.params.type!), id(request.params.id!), updateFinancialTitleSchema.parse(request.body), authenticatedUserId(request)) });
  cancelTitle = async (request: Request, response: Response) => response.status(200).json({ title: await this.finance.cancelTitle(parseType(request.params.type!), id(request.params.id!), cancelFinancialTitleSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  settleTitle = async (request: Request, response: Response) => response.status(201).json({ title: await this.settlements.settle(parseType(request.params.type!), id(request.params.id!), settleFinancialTitleSchema.parse(request.body), authenticatedUserId(request)) });
  reverseSettlement = async (request: Request, response: Response) => response.status(200).json({ title: await this.settlements.reverse(parseType(request.params.type!), id(request.params.id!), id(request.params.settlementId!), reverseSettlementSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  applyAdjustment = async (request: Request, response: Response) => response.status(201).json({ adjustment: await this.finance.applyAdjustment(parseType(request.params.type!), id(request.params.id!), createFinancialAdjustmentSchema.parse(request.body), authenticatedUserId(request)) });
  reverseAdjustment = async (request: Request, response: Response) => response.status(200).json({ adjustment: await this.finance.reverseAdjustment(id(request.params.id!), reverseSettlementSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });

  listRecurrences = async (_request: Request, response: Response) => response.status(200).json({ data: await this.finance.listRecurrences() });
  createRecurrence = async (request: Request, response: Response) => response.status(201).json({ recurrence: await this.finance.createRecurrence(createRecurrenceSchema.parse(request.body), authenticatedUserId(request)) });
  updateRecurrence = async (request: Request, response: Response) => response.status(200).json({ recurrence: await this.finance.updateRecurrence(id(request.params.id!), updateRecurrenceSchema.parse(request.body), authenticatedUserId(request)) });
  recurrenceAction = async (request: Request, response: Response) => response.status(200).json({ recurrence: await this.finance.setRecurrenceStatus(id(request.params.id!), recurrenceActionSchema.parse(request.params.action), authenticatedUserId(request)) });
  processRecurrences = async (request: Request, response: Response) => response.status(200).json(await this.finance.processRecurrences(processRecurrencesSchema.parse(request.body).throughDate, authenticatedUserId(request)));

  transfer = async (request: Request, response: Response) => response.status(201).json(await this.finance.transfer(transferSchema.parse(request.body), authenticatedUserId(request)));
  movements = async (request: Request, response: Response) => response.status(200).json({ data: await this.finance.listBankMovements(typeof request.query.bankAccountId === 'string' ? id(request.query.bankAccountId) : undefined) });
  uploadAttachment = async (request: Request, response: Response) => {
    if (!request.file) throw new AppError('Selecione um comprovante.', 400, 'FINANCIAL_ATTACHMENT_REQUIRED');
    response.status(201).json({ attachment: await this.finance.addAttachment(parseType(request.params.type!), id(request.params.id!), request.file, authenticatedUserId(request)) });
  };
  downloadAttachment = async (request: Request, response: Response) => {
    const attachment = await this.finance.getAttachment(id(request.params.id!));
    response.setHeader('Content-Type', attachment.contentType); response.setHeader('Content-Length', attachment.size);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`); response.status(200).send(attachment.content);
  };
  removeAttachment = async (request: Request, response: Response) => response.status(200).json({ attachment: await this.finance.removeAttachment(id(request.params.id!), authenticatedUserId(request)) });

  previewStatement = async (request: Request, response: Response) => {
    if (!request.file) throw new AppError('Selecione um extrato OFX ou CSV.', 400, 'BANK_STATEMENT_REQUIRED');
    const input = statementPreviewSchema.parse(request.body);
    response.status(201).json({ statementImport: await this.reconciliation.preview(request.file, input.bankAccountId, input.format, input.mapping, authenticatedUserId(request)) });
  };
  confirmStatement = async (request: Request, response: Response) => { confirmStatementImportSchema.parse(request.body); response.status(200).json({ statementImport: await this.reconciliation.confirm(id(request.params.id!), authenticatedUserId(request)) }); };
  listStatementImports = async (_request: Request, response: Response) => response.status(200).json({ data: await this.reconciliation.listImports() });
  listBankTransactions = async (request: Request, response: Response) => response.status(200).json({ data: await this.reconciliation.listTransactions(typeof request.query.bankAccountId === 'string' ? id(request.query.bankAccountId) : undefined) });
  ignoreBankTransaction = async (request: Request, response: Response) => response.status(200).json({ transaction: await this.reconciliation.ignoreTransaction(id(request.params.id!), ignoreBankTransactionSchema.parse(request.body).reason, authenticatedUserId(request)) });
  reconcile = async (request: Request, response: Response) => response.status(201).json({ reconciliation: await this.reconciliation.reconcile(reconcileSchema.parse(request.body), authenticatedUserId(request)) });
  reverseReconciliation = async (request: Request, response: Response) => response.status(200).json({ reconciliation: await this.reconciliation.reverseReconciliation(id(request.params.id!), reverseSettlementSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });

  dre = async (request: Request, response: Response) => response.status(200).json(await this.reports.dre(financialReportQuerySchema.parse(request.query)));
  cashFlow = async (request: Request, response: Response) => response.status(200).json(await this.reports.cashFlow(financialReportQuerySchema.parse(request.query)));
  dashboard = async (request: Request, response: Response) => response.status(200).json(await this.reports.dashboard(financialReportQuerySchema.parse(request.query)));
  snapshot = async (request: Request, response: Response) => response.status(201).json({ snapshot: await this.reports.snapshot(financialReportQuerySchema.parse(request.body), authenticatedUserId(request)) });
  listSnapshots = async (_request: Request, response: Response) => response.status(200).json({ data: await this.reports.listSnapshots() });
  exportDre = async (request: Request, response: Response) => {
    const report = await this.reports.dre(financialReportQuerySchema.parse(request.query));
    const lines = ['Seção;Conta;Nome;Valor'];
    for (const section of report.sections) for (const account of section.accounts) lines.push([section.label, account.code, account.name, account.amount].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8'); response.setHeader('Content-Disposition', 'attachment; filename="dre-gerencial.csv"');
    response.status(200).send(`\uFEFF${lines.join('\r\n')}`);
  };
}
