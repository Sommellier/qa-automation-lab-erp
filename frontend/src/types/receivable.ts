import type { PaymentMethod } from './payable';

export type ReceivableStatus = 'DRAFT' | 'PENDING' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  DRAFT: 'Rascunho', PENDING: 'Pendente', PARTIALLY_RECEIVED: 'Recebido parcialmente', RECEIVED: 'Recebido', OVERDUE: 'Atrasado', CANCELLED: 'Cancelado',
};
export interface ReceivableCollection {
  id: string; number: string; amount: string; method: PaymentMethod; receivedAt: string; notes: string | null;
  createdBy: { id: string; name: string; email: string }; reversedAt: string | null;
  reversedBy: { id: string; name: string; email: string } | null; reversalReason: string | null; createdAt: string;
}
export interface Receivable {
  id: string; number: string; description?: string; clientId: string; client: { id: string; name: string; document: string; email: string };
  orderId: string; order: { id: string; number: string; status: string; total: string }; installmentNumber: number; installmentCount: number;
  originalAmount: string; receivedAmount: string; interestAmount?: string; penaltyAmount?: string; discountAmount?: string; dueDate: string; status: ReceivableStatus; collections: ReceivableCollection[];
  createdAt: string; updatedAt: string;
}
export interface ReceivableSummaryItem extends Omit<Receivable, 'collections' | 'client' | 'order'> {
  client: { id: string; name: string; document: string }; order: { id: string; number: string }; collectionsCount: number;
}
export interface PaginatedReceivables { data: ReceivableSummaryItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface ReceivablesSummary {
  generatedAt: string; period: { from: string; to: string; days: number };
  metrics: { billedAmount: string; receivedAmount: string; openAmount: string; openCount: number; overdueAmount: string; overdueCount: number; collectedThisMonth: string; collectedThisMonthCount: number };
  cashFlow: Array<{ date: string; entries: string; exits: string; net: string }>;
}
export interface ClientStatement {
  client: { id: string; name: string; document: string; email: string; active: boolean };
  metrics: { billedAmount: string; receivedAmount: string; openAmount: string; overdueAmount: string };
  data: ReceivableSummaryItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
