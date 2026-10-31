export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderSortField = 'number' | 'total' | 'status' | 'createdAt';
export type SortOrder = 'asc' | 'desc';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendente', CONFIRMED: 'Confirmado', PROCESSING: 'Em processamento', COMPLETED: 'Concluído', CANCELLED: 'Cancelado',
};
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'COMPLETED',
};
export interface OrderClient { id: string; name: string; document: string; email: string }
export interface OrderItem { id: string; productId: string; productName: string; productSku: string; quantity: number; unitPrice: string; subtotal: string }
export interface OrderSummary { id: string; number: string; clientId: string; client: OrderClient; status: OrderStatus; total: string; itemsCount: number; createdAt: string; updatedAt: string }
export interface OrderReceivable { id: string; number: string; installmentNumber: number; installmentCount: number; originalAmount: string; receivedAmount: string; dueDate: string; status: 'PENDING' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' }
export interface OrderShipment { id: string; number: string; shippedAt: string; createdBy: { id: string; name: string; email: string }; items: Array<{ id: string; orderItemId: string; productId: string; quantity: number; unitCost: string; totalCost: string; cogsEntry: { id: string; amount: string } | null }> }
export interface ManagedOrder extends Omit<OrderSummary, 'itemsCount'> { grossTotal: string; discountTotal: string; seller: { id: string; name: string; email: string } | null; quote: { id: string; number: string } | null; commissionRate: string; commissionAmount: string; paymentInstallments: number; firstPaymentDueDays: number; paymentIntervalDays: number; items: OrderItem[]; receivables: OrderReceivable[]; shipments?: OrderShipment[]; stockReservations?: Array<{ id: string; orderItemId: string; quantity: number; consumedQuantity: number; releasedQuantity: number; active: boolean }> }
export interface ListOrdersParams { search?: string; status?: OrderStatus; client?: string; dateStart?: string; dateEnd?: string; page: number; pageSize: number; sortBy: OrderSortField; sortOrder: SortOrder }
export interface PaginatedOrders { data: OrderSummary[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
export interface CreateOrderInput { clientId: string; paymentInstallments: number; firstPaymentDueDays: number; paymentIntervalDays: number; items: Array<{ productId: string; quantity: number }> }
