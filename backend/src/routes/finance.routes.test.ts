import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  setup: vi.fn(), listCostCenters: vi.fn(), createCostCenter: vi.fn(), updateCostCenter: vi.fn(),
  listChartAccounts: vi.fn(), createChartAccount: vi.fn(), updateChartAccount: vi.fn(),
  listBankAccounts: vi.fn(), createBankAccount: vi.fn(), updateBankAccount: vi.fn(),
  listTitles: vi.fn(), getTitle: vi.fn(), createTitle: vi.fn(), updateTitle: vi.fn(), cancelTitle: vi.fn(),
  applyAdjustment: vi.fn(), reverseAdjustment: vi.fn(), listRecurrences: vi.fn(), createRecurrence: vi.fn(),
  updateRecurrence: vi.fn(), setRecurrenceStatus: vi.fn(), processRecurrences: vi.fn(), transfer: vi.fn(),
  listBankMovements: vi.fn(), addAttachment: vi.fn(), getAttachment: vi.fn(), removeAttachment: vi.fn(),
  settle: vi.fn(), reverseSettlement: vi.fn(),
  preview: vi.fn(), confirm: vi.fn(), listImports: vi.fn(), listTransactions: vi.fn(), ignoreTransaction: vi.fn(),
  reconcile: vi.fn(), reverseReconciliation: vi.fn(),
  dre: vi.fn(), cashFlow: vi.fn(), dashboard: vi.fn(), snapshot: vi.fn(), listSnapshots: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({ prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() } }));
vi.mock('../services/finance.service.js', () => ({ FinanceService: class {
  setup = mock.setup; listCostCenters = mock.listCostCenters; createCostCenter = mock.createCostCenter; updateCostCenter = mock.updateCostCenter;
  listChartAccounts = mock.listChartAccounts; createChartAccount = mock.createChartAccount; updateChartAccount = mock.updateChartAccount;
  listBankAccounts = mock.listBankAccounts; createBankAccount = mock.createBankAccount; updateBankAccount = mock.updateBankAccount;
  listTitles = mock.listTitles; getTitle = mock.getTitle; createTitle = mock.createTitle; updateTitle = mock.updateTitle; cancelTitle = mock.cancelTitle;
  applyAdjustment = mock.applyAdjustment; reverseAdjustment = mock.reverseAdjustment; listRecurrences = mock.listRecurrences;
  createRecurrence = mock.createRecurrence; updateRecurrence = mock.updateRecurrence; setRecurrenceStatus = mock.setRecurrenceStatus;
  processRecurrences = mock.processRecurrences; transfer = mock.transfer; listBankMovements = mock.listBankMovements;
  addAttachment = mock.addAttachment; getAttachment = mock.getAttachment; removeAttachment = mock.removeAttachment;
} }));
vi.mock('../services/financial-settlement.service.js', () => ({ FinancialSettlementService: class {
  settle = mock.settle; reverse = mock.reverseSettlement;
} }));
vi.mock('../services/bank-reconciliation.service.js', () => ({ BankReconciliationService: class {
  preview = mock.preview; confirm = mock.confirm; listImports = mock.listImports; listTransactions = mock.listTransactions;
  ignoreTransaction = mock.ignoreTransaction; reconcile = mock.reconcile; reverseReconciliation = mock.reverseReconciliation;
} }));
vi.mock('../services/finance-report.service.js', () => ({ FinanceReportService: class {
  dre = mock.dre; cashFlow = mock.cashFlow; dashboard = mock.dashboard; snapshot = mock.snapshot; listSnapshots = mock.listSnapshots;
} }));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas do Financeiro Avançado', () => {
  let server: Server;
  let baseUrl: string;
  const actorId = randomUUID();
  const chartAccountId = randomUUID();
  const costCenterId = randomUUID();

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    Object.values(mock).forEach((entry) => entry.mockReset());
    mock.setup.mockResolvedValue({ costCenters: [], chartAccounts: [], bankAccounts: [] });
    mock.listTitles.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    mock.dashboard.mockResolvedValue({ indicators: {}, alerts: [] });
    mock.createTitle.mockResolvedValue({ id: randomUUID() });
    mock.createCostCenter.mockResolvedValue({ id: costCenterId });
  });

  function token(role: UserRole): string {
    const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = {
      id: actorId, name: role, email: `${role.toLowerCase()}@teste.com`, role, active: true,
    };
    mock.userFindUnique.mockResolvedValue(user);
    return createAccessToken(actorId, role);
  }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('%s consulta títulos, cadastros e painel', async (role) => {
    const auth = token(role);
    expect((await fetch(`${baseUrl}/api/finance/setup`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/finance/titles`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/finance/dashboard?from=2026-10-01&to=2026-10-31`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200);
  });

  it.each([UserRole.ADMIN, UserRole.ANALISTA])('%s cria lançamento manual válido', async (role) => {
    const response = await fetch(`${baseUrl}/api/finance/titles`, {
      method: 'POST', headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'PAYABLE', description: 'Aluguel', chartAccountId, competenceDate: '2026-10-01', issueDate: '2026-10-01',
        dueDate: '2026-10-10', originalAmount: '1500.00', allocations: [{ costCenterId, percentage: 100 }],
      }),
    });
    expect(response.status).toBe(201);
    expect(mock.createTitle).toHaveBeenCalledOnce();
  });

  it('bloqueia mutações financeiras para visualizador', async () => {
    const response = await fetch(`${baseUrl}/api/finance/titles`, {
      method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.VISUALIZADOR)}`, 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(response.status).toBe(403);
  });

  it('restringe configuração e ajustes ao administrador', async () => {
    const createCenter = (role: UserRole) => fetch(`${baseUrl}/api/finance/cost-centers`, {
      method: 'POST', headers: { Authorization: `Bearer ${token(role)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'ADM', name: 'Administrativo' }),
    });
    expect((await createCenter(UserRole.ANALISTA)).status).toBe(403);
    expect((await createCenter(UserRole.ADMIN)).status).toBe(201);
  });

  it('valida payload, período de relatório e autenticação', async () => {
    const auth = token(UserRole.ADMIN);
    expect((await fetch(`${baseUrl}/api/finance/titles`, { method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/finance/dashboard?from=2026-10-31&to=2026-10-01`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/finance/titles`)).status).toBe(401);
  });
});
