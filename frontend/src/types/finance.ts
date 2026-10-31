import type { PaymentMethod } from './payable';

export type FinancialTitleType = 'PAYABLE' | 'RECEIVABLE';
export type FinancialEffectiveStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'OVERDUE' | 'CANCELLED';
export type ChartAccountKind = 'SYNTHETIC' | 'ANALYTICAL';
export type ChartAccountNature = 'REVENUE' | 'DEDUCTION' | 'COST' | 'EXPENSE' | 'FINANCIAL_REVENUE' | 'FINANCIAL_EXPENSE' | 'INCOME_TAX' | 'ASSET' | 'LIABILITY' | 'EQUITY' | 'NONE';
export type BankAccountType = 'CHECKING' | 'SAVINGS' | 'PAYMENT' | 'CASH' | 'OTHER';
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface CostCenter { id: string; code: string; name: string; description: string | null; parentId: string | null; active: boolean; _count?: { allocations: number; children: number } }
export interface ChartAccount { id: string; code: string; name: string; description: string | null; kind: ChartAccountKind; nature: ChartAccountNature; parentId: string | null; active: boolean; _count?: { payables: number; receivables: number; children: number } }
export interface BankAccount { id: string; name: string; institution: string | null; agency: string | null; accountNumber: string | null; type: BankAccountType; holder: string | null; currency: string; initialBalance: string; initialBalanceDate: string; active: boolean; currentBalance: string }
export interface FinanceSetup { costCenters: CostCenter[]; chartAccounts: ChartAccount[]; bankAccounts: BankAccount[] }
export interface FinancialAllocation { id: string; percentage: string; amount: string; costCenter: CostCenter }
export interface FinancialParty { id: string; name: string; document?: string }
export interface FinancialTitle {
  id: string; type: FinancialTitleType; number: string; description: string; origin: string; status: string; effectiveStatus: FinancialEffectiveStatus;
  originalAmount: string; interestAmount: string; penaltyAmount: string; discountAmount: string; settledAmount: string; adjustedAmount: string; openAmount: string;
  competenceDate: string; issueDate: string; dueDate: string; notes: string | null; counterpartyName: string | null;
  supplier?: FinancialParty | null; client?: FinancialParty | null; chartAccount: ChartAccount | null; allocations: FinancialAllocation[];
  plannedBankAccount?: Pick<BankAccount, 'id' | 'name'> | null; plannedMethod?: PaymentMethod | null;
  payments?: FinancialSettlement[]; collections?: FinancialSettlement[]; adjustments?: FinancialAdjustment[]; attachments?: FinancialAttachment[]; history?: FinancialHistory[];
}
export interface FinancialSettlement { id: string; number: string; amount: string; method: PaymentMethod; paidAt?: string; receivedAt?: string; reversedAt: string | null; reversalReason: string | null; bankAccount?: { id: string; name: string } | null; createdBy: { id: string; name: string } }
export interface FinancialAdjustment { id: string; kind: 'INTEREST' | 'PENALTY' | 'DISCOUNT'; calculationType: 'FIXED' | 'SIMPLE_PERCENTAGE'; calculatedAmount: string; appliedAmount: string; reason: string; calculationMemory: Record<string, unknown>; reversedAt: string | null; createdAt: string }
export interface FinancialAttachment { id: string; fileName: string; contentType: string; size: number; sha256: string; createdAt: string }
export interface FinancialHistory { id: string; action: string; oldData: Record<string, unknown> | null; newData: Record<string, unknown> | null; createdAt: string; user: { id: string; name: string } | null }
export interface PaginatedFinancialTitles { data: FinancialTitle[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface FinancialRecurrence { id: string; description: string; type: FinancialTitleType; amount: string; frequency: RecurrenceFrequency; startDate: string; endDate: string | null; dueDay: number | null; maxOccurrences: number | null; generatedOccurrences: number; status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'; nextOccurrence: string; chartAccount: ChartAccount; costCenter: CostCenter; supplier?: FinancialParty | null; client?: FinancialParty | null; occurrences: Array<{ id: string; sequence: number; dueDate: string; status: string }> }
export interface DreReport { managerialNotice: string; totals: Record<string, string>; sections: Array<{ nature: ChartAccountNature; label: string; amount: string; accounts: Array<{ code: string; name: string; amount: string; entries: unknown[] }> }>; reviewRequired: { payables: unknown[]; receivables: unknown[]; amount: string }; comparison: { netResultDifference: string } }
export interface CashFlowReport { openingBalance: string; totals: Record<string, string>; series: Array<{ period: string; plannedIn: string; plannedOut: string; realizedIn: string; realizedOut: string; difference: string; projectedBalance: string; realizedBalance: string }> }
export interface FinancialDashboard { generatedAt: string; metrics: { availableBalance: string; receivableOpen: string; payableOpen: string; overdueReceivable: string; overduePayable: string; managerialResult: string; plannedNet: string; realizedNet: string; pendingReconciliation: number }; dre: DreReport; cash: CashFlowReport }
export interface BankTransaction { id: string; transactionDate: string; description: string; amount: string; nature: 'CREDIT' | 'DEBIT'; reference: string | null; reconciliationStatus: string; bankAccount: { id: string; name: string }; reconciledAmount: string; remainingAmount: string; suggestions: Array<{ score: number; deterministic: boolean; reasons: string[]; movement: BankMovement }> }
export interface BankMovement { id: string; number: string; postedAt: string; description: string; amount: string; nature: 'CREDIT' | 'DEBIT'; type: string; bankAccount: { id: string; name: string } }

export const FINANCIAL_STATUS_LABELS: Record<FinancialEffectiveStatus, string> = { DRAFT: 'Rascunho', OPEN: 'Em aberto', PARTIALLY_SETTLED: 'Parcialmente liquidada', SETTLED: 'Liquidada', OVERDUE: 'Vencida', CANCELLED: 'Cancelada' };
export const CHART_NATURE_LABELS: Record<ChartAccountNature, string> = { REVENUE: 'Receita', DEDUCTION: 'Dedução', COST: 'Custo', EXPENSE: 'Despesa operacional', FINANCIAL_REVENUE: 'Receita financeira', FINANCIAL_EXPENSE: 'Despesa financeira', INCOME_TAX: 'Tributos sobre lucro', ASSET: 'Ativo', LIABILITY: 'Passivo', EQUITY: 'Patrimônio', NONE: 'Fora da DRE' };
export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = { DAILY: 'Diária', WEEKLY: 'Semanal', FORTNIGHTLY: 'Quinzenal', MONTHLY: 'Mensal', BIMONTHLY: 'Bimestral', QUARTERLY: 'Trimestral', SEMIANNUAL: 'Semestral', ANNUAL: 'Anual' };
