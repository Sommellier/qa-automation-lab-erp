import type { StockMovementType } from '@prisma/client';

export interface StockProduct {
  id: string;
  name: string;
  sku: string;
  stock: number;
  active: boolean;
}

export interface StockChange {
  previousStock: number;
  newStock: number;
}

export interface StockMovementView {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string | null;
  orderId: string | null;
  order: { id: string; number: string } | null;
  purchaseOrderId?: string | null;
  purchaseOrder?: { id: string; number: string } | null;
  purchaseReceiptId?: string | null;
  purchaseReceipt?: { id: string; number: string } | null;
  returnProcessId?: string | null;
  returnProcess?: { id: string; number: string } | null;
  returnItemId?: string | null;
  createdById: string | null;
  createdBy: { id: string; name: string; email: string } | null;
  createdAt: Date;
}

export interface CreateStockMovementData {
  productId: string;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  orderId?: string;
  purchaseOrderId?: string;
  purchaseReceiptId?: string;
  returnProcessId?: string;
  returnItemId?: string;
  createdById?: string;
}

export interface ListStockMovementsInput {
  productId: string;
  type?: StockMovementType;
  dateFrom?: Date;
  dateTo?: Date;
  createdById?: string;
  orderId?: string;
  purchaseOrderId?: string;
  reason?: string;
  page: number;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
}
