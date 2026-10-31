export type StockMovementType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'SALE' | 'ORDER_CANCELLATION' | 'INITIAL_BALANCE' | 'PURCHASE_RECEIPT';

export interface StockMovement {
  id: string; productId: string; type: StockMovementType; quantity: number;
  previousStock: number; newStock: number; reason: string | null;
  orderId: string | null; order: { id: string; number: string } | null;
  purchaseOrderId?: string | null; purchaseOrder?: { id: string; number: string } | null;
  purchaseReceiptId?: string | null; purchaseReceipt?: { id: string; number: string } | null;
  createdById: string | null; createdBy: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface StockHistoryResponse {
  product: { id: string; name: string; sku: string; stock: number; active: boolean };
  data: StockMovement[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface StockHistoryParams {
  type?: StockMovementType; dateFrom?: string; dateTo?: string; createdById?: string;
  orderId?: string; purchaseOrderId?: string; reason?: string; page: number; pageSize: number; sortOrder: 'asc' | 'desc';
}
