import type { UserRole } from './auth';

export type PurchaseStatus = 'PENDING' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = { PENDING: 'Pendente', PARTIALLY_RECEIVED: 'Recebido parcialmente', RECEIVED: 'Recebido', CANCELLED: 'Cancelado' };
export type PurchaseApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type PurchaseApprovalAction = 'SUBMIT' | 'APPROVE' | 'REJECT';
export const PURCHASE_APPROVAL_STATUS_LABELS: Record<PurchaseApprovalStatus, string> = { DRAFT: 'Rascunho', PENDING_APPROVAL: 'Aguardando aprovação', APPROVED: 'Aprovada', REJECTED: 'Rejeitada' };
export const PURCHASE_APPROVAL_ACTION_LABELS: Record<PurchaseApprovalAction, string> = { SUBMIT: 'Enviada para aprovação', APPROVE: 'Aprovada', REJECT: 'Rejeitada' };
export interface PurchaseItem { id: string; productId: string; productName: string; productSku: string; orderedQuantity: number; receivedQuantity: number; unitCost: string; subtotal: string; product: { stock: number; active: boolean; trackingMode: 'NONE' | 'LOT' | 'SERIAL' | 'LOT_AND_SERIAL'; expiryWarningDays: number; blockExpired: boolean } }
export interface PurchaseReceiptItem { id: string; productId: string; productName: string; productSku: string; quantity: number; unitCost: string; subtotal: string }
export interface PurchasePayable { id: string; number: string; installmentNumber: number; installmentCount: number; originalAmount: string; paidAmount: string; dueDate: string; status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' }
export interface PurchaseReceipt { id: string; number: string; notes: string | null; total: string; receivedAt: string; receivedBy: { id: string; name: string; email: string }; items: PurchaseReceiptItem[]; payables: PurchasePayable[] }
export interface PurchaseApprovalEvent { id: string; action: PurchaseApprovalAction; fromStatus: PurchaseApprovalStatus; toStatus: PurchaseApprovalStatus; comment: string | null; actorRole: UserRole; approvalLimit: string | null; actor: { id: string; name: string; email: string }; createdAt: string }
export interface PurchaseApprovalRule { id: string; role: 'ADMIN' | 'ANALISTA'; maxAmount: string | null; active: boolean; updatedBy: { id: string; name: string; email: string } | null; createdAt: string; updatedAt: string }
export interface Purchase {
  id: string; number: string; supplierId: string; supplier: { id: string; name: string; document: string; email: string; active: boolean };
  status: PurchaseStatus; approvalStatus: PurchaseApprovalStatus; submittedAt: string | null; approvedAt: string | null; approvedBy: { id: string; name: string; email: string } | null; approvalEvents: PurchaseApprovalEvent[]; total: string; notes: string | null; expectedAt: string | null; paymentInstallments: number; firstPaymentDueDays: number; paymentIntervalDays: number; items: PurchaseItem[]; receipts: PurchaseReceipt[]; payables: PurchasePayable[];
  createdBy: { id: string; name: string; email: string }; createdAt: string; updatedAt: string;
}
export interface PurchaseSummary { id: string; number: string; supplierId: string; supplier: { id: string; name: string; document: string }; status: PurchaseStatus; approvalStatus: PurchaseApprovalStatus; submittedAt: string | null; approvedAt: string | null; total: string; expectedAt: string | null; itemsCount: number; receiptsCount: number; createdAt: string; updatedAt: string }
export interface PaginatedPurchases { data: PurchaseSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface CostHistoryItem extends PurchaseReceiptItem { receipt: { id: string; number: string; receivedAt: string; purchaseOrder: { id: string; number: string; supplier: { id: string; name: string } } } }
