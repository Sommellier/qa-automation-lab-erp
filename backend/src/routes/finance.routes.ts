import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { FinanceController } from '../controllers/finance.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { uploadBankStatement, uploadFinancialAttachment } from '../middlewares/finance-upload.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { cancelFinancialTitleSchema, createBankAccountSchema, createChartAccountSchema, createCostCenterSchema, createFinancialAdjustmentSchema, createFinancialTitleSchema, createRecurrenceSchema, processRecurrencesSchema, reconcileSchema, reverseSettlementSchema, settleFinancialTitleSchema, transferSchema, updateBankAccountSchema, updateChartAccountSchema, updateCostCenterSchema, updateFinancialTitleSchema, updateRecurrenceSchema } from '../schemas/finance.schema.js';
import { BankReconciliationService } from '../services/bank-reconciliation.service.js';
import { auditLogger } from '../services/audit.service.js';
import { FinanceReportService } from '../services/finance-report.service.js';
import { FinanceService } from '../services/finance.service.js';
import { FinancialSettlementService } from '../services/financial-settlement.service.js';

const controller = new FinanceController(new FinanceService(auditLogger), new FinancialSettlementService(auditLogger), new BankReconciliationService(auditLogger), new FinanceReportService(auditLogger));
export const financeRouter = Router();
financeRouter.use(authenticate);
const view = authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR);
const operate = authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA);
const admin = authorizeRoles(UserRole.ADMIN);

financeRouter.get('/setup', view, controller.setup);
financeRouter.get('/cost-centers', view, controller.listCostCenters);
financeRouter.post('/cost-centers', admin, validateBody(createCostCenterSchema), controller.createCostCenter);
financeRouter.patch('/cost-centers/:id', admin, validateBody(updateCostCenterSchema), controller.updateCostCenter);
financeRouter.get('/chart-accounts', view, controller.listChartAccounts);
financeRouter.post('/chart-accounts', admin, validateBody(createChartAccountSchema), controller.createChartAccount);
financeRouter.patch('/chart-accounts/:id', admin, validateBody(updateChartAccountSchema), controller.updateChartAccount);
financeRouter.get('/bank-accounts', view, controller.listBankAccounts);
financeRouter.post('/bank-accounts', admin, validateBody(createBankAccountSchema), controller.createBankAccount);
financeRouter.patch('/bank-accounts/:id', admin, validateBody(updateBankAccountSchema), controller.updateBankAccount);

financeRouter.get('/titles', view, controller.listTitles);
financeRouter.post('/titles', operate, validateBody(createFinancialTitleSchema), controller.createTitle);
financeRouter.get('/titles/:type/:id', view, controller.getTitle);
financeRouter.patch('/titles/:type/:id', operate, validateBody(updateFinancialTitleSchema), controller.updateTitle);
financeRouter.post('/titles/:type/:id/cancel', admin, validateBody(cancelFinancialTitleSchema), controller.cancelTitle);
financeRouter.post('/titles/:type/:id/settlements', operate, validateBody(settleFinancialTitleSchema), controller.settleTitle);
financeRouter.post('/titles/:type/:id/settlements/:settlementId/reverse', admin, validateBody(reverseSettlementSchema), controller.reverseSettlement);
financeRouter.post('/titles/:type/:id/adjustments', admin, validateBody(createFinancialAdjustmentSchema), controller.applyAdjustment);
financeRouter.post('/adjustments/:id/reverse', admin, validateBody(reverseSettlementSchema), controller.reverseAdjustment);
financeRouter.post('/titles/:type/:id/attachments', operate, uploadFinancialAttachment, controller.uploadAttachment);
financeRouter.get('/attachments/:id', view, controller.downloadAttachment);
financeRouter.delete('/attachments/:id', operate, controller.removeAttachment);

financeRouter.get('/recurrences', view, controller.listRecurrences);
financeRouter.post('/recurrences', operate, validateBody(createRecurrenceSchema), controller.createRecurrence);
financeRouter.patch('/recurrences/:id', operate, validateBody(updateRecurrenceSchema), controller.updateRecurrence);
financeRouter.post('/recurrences/:id/:action', operate, controller.recurrenceAction);
financeRouter.post('/recurrences/process', admin, validateBody(processRecurrencesSchema), controller.processRecurrences);

financeRouter.get('/bank-movements', view, controller.movements);
financeRouter.post('/bank-transfers', operate, validateBody(transferSchema), controller.transfer);
financeRouter.get('/statement-imports', view, controller.listStatementImports);
financeRouter.post('/statement-imports/preview', operate, uploadBankStatement, controller.previewStatement);
financeRouter.post('/statement-imports/:id/confirm', operate, controller.confirmStatement);
financeRouter.get('/bank-transactions', view, controller.listBankTransactions);
financeRouter.post('/bank-transactions/:id/ignore', operate, controller.ignoreBankTransaction);
financeRouter.post('/reconciliations', operate, validateBody(reconcileSchema), controller.reconcile);
financeRouter.post('/reconciliations/:id/reverse', admin, validateBody(reverseSettlementSchema), controller.reverseReconciliation);

financeRouter.get('/reports/dre', view, controller.dre);
financeRouter.get('/reports/dre/export', view, controller.exportDre);
financeRouter.get('/reports/cash-flow', view, controller.cashFlow);
financeRouter.get('/dashboard', view, controller.dashboard);
financeRouter.get('/snapshots', view, controller.listSnapshots);
financeRouter.post('/snapshots', operate, controller.snapshot);
