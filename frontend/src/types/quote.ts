import type { UserRole } from './auth';

export const QUOTE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Rascunho', PENDING_APPROVAL: 'Aguardando aprovação', APPROVED: 'Aprovado', REJECTED: 'Rejeitado',
  EXPIRED: 'Expirado', CONVERTED: 'Convertido', CANCELLED: 'Cancelado',
};
export type QuoteNegotiationAction = 'CREATE' | 'UPDATE' | 'NOTE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RESERVE' | 'RELEASE' | 'RENEW' | 'CONVERT' | 'CANCEL' | 'EXPIRE';
export const QUOTE_ACTION_LABELS: Record<QuoteNegotiationAction, string> = {
  CREATE: 'Criação', UPDATE: 'Atualização', NOTE: 'Nota', SUBMIT: 'Envio', APPROVE: 'Aprovação', REJECT: 'Rejeição',
  RESERVE: 'Reserva', RELEASE: 'Liberação', RENEW: 'Renovação', CONVERT: 'Conversão', CANCEL: 'Cancelamento', EXPIRE: 'Expiração',
};
export interface QuotePerson { id: string; name: string; email?: string; role?: UserRole }
export interface QuoteItem { id: string; productId: string; productName: string; productSku: string; quantity: number; originalUnitPrice: string; discountPercent: string; unitPrice: string; subtotal: string }
export interface QuoteReservation { id: string; quantity: number; active: boolean; expiresAt: string; releasedAt: string | null; warehouse: { id: string; code: string; name: string }; location: { id: string; code: string; description: string | null }; lot: { id: string; code: string; expirationDate: string | null } | null }
export interface QuoteNegotiation { id: string; action: QuoteNegotiationAction; comment: string | null; metadata: unknown; actorRole: UserRole; actor: QuotePerson; createdAt: string }
export interface QuoteSummary { id: string; number: string; status: QuoteStatus; clientId: string; client: { id: string; name: string }; seller: QuotePerson; grossTotal: string; discountTotal: string; discountPercent: string; total: string; commissionAmount: string; validUntil: string; itemsCount: number; order: { id: string; number: string } | null; createdAt: string }
export interface ManagedQuote extends Omit<QuoteSummary, 'itemsCount'> { createdBy: QuotePerson; approvedBy: QuotePerson | null; approvedAt: string | null; rejectionReason: string | null; commissionRate: string; paymentInstallments: number; firstPaymentDueDays: number; paymentIntervalDays: number; reservationHours: number; notes: string | null; items: QuoteItem[]; reservations: QuoteReservation[]; negotiations: QuoteNegotiation[] }
export interface QuoteSetup {
  clients: Array<{ id: string; name: string; document: string }>;
  products: Array<{ id: string; name: string; sku: string; price: string; stock: number }>;
  sellers: QuotePerson[];
  approvalRules: QuoteApprovalRule[];
  commissionRules: Array<{ id: string; userId: string; rate: string; active: boolean }>;
}
export interface QuoteApprovalRule { id: string; role: UserRole; maxDiscountPercent: string; active: boolean; updatedBy?: { id: string; name: string } | null }
export interface CommissionRuleView { id: string | null; user: QuotePerson; rate: string; active: boolean }
export interface QuoteInput { clientId: string; sellerId?: string; validUntil: string; reservationHours: number; paymentInstallments: number; firstPaymentDueDays: number; paymentIntervalDays: number; notes?: string; items: Array<{ productId: string; quantity: number; discountPercent: number }> }
export interface QuoteListResponse { data: QuoteSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface CommissionReport { summary: Array<{ seller: QuotePerson; orders: number; salesTotal: string; commissionTotal: string }>; orders: Array<{ id: string; number: string; total: string; commissionRate: string; commissionAmount: string; createdAt: string; seller: QuotePerson; quote: { id: string; number: string } | null }> }
