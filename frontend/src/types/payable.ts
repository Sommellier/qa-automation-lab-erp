export type PayableStatus = 'DRAFT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type PaymentMethod = 'PIX' | 'BANK_TRANSFER' | 'BOLETO' | 'CASH' | 'CARD' | 'OTHER';

export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  DRAFT: 'Rascunho', PENDING: 'Pendente', PARTIALLY_PAID: 'Pago parcialmente', PAID: 'Pago', OVERDUE: 'Atrasado', CANCELLED: 'Cancelado',
};
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX', BANK_TRANSFER: 'Transferência bancária', BOLETO: 'Boleto', CASH: 'Dinheiro', CARD: 'Cartão', OTHER: 'Outro',
};

export interface PayablePayment {
  id: string; number: string; amount: string; method: PaymentMethod; paidAt: string; notes: string | null;
  createdBy: { id: string; name: string; email: string }; reversedAt: string | null;
  reversedBy: { id: string; name: string; email: string } | null; reversalReason: string | null; createdAt: string;
}
export interface Payable {
  id: string; number: string; description?: string; supplierId: string; supplier: { id: string; name: string; document: string; email: string };
  purchaseOrderId: string; purchaseOrder: { id: string; number: string }; purchaseReceiptId: string;
  purchaseReceipt: { id: string; number: string; receivedAt: string }; installmentNumber: number; installmentCount: number;
  originalAmount: string; paidAmount: string; interestAmount?: string; penaltyAmount?: string; discountAmount?: string; dueDate: string; status: PayableStatus; payments: PayablePayment[];
  createdAt: string; updatedAt: string;
}
export interface PayableSummaryItem extends Omit<Payable, 'payments' | 'supplier' | 'purchaseReceipt'> {
  supplier: { id: string; name: string; document: string }; purchaseReceipt: { id: string; number: string };
  paymentsCount: number;
}
export interface PaginatedPayables { data: PayableSummaryItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface PayablesSummary {
  generatedAt: string; period: { from: string; to: string; days: number };
  metrics: { openAmount: string; openCount: number; overdueAmount: string; overdueCount: number; dueSoonAmount: string; dueSoonCount: number; paidThisMonth: string; paidThisMonthCount: number };
  cashFlow: Array<{ date: string; amount: string }>;
}
