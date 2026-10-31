import type { OrderStatus, Prisma } from '@prisma/client';

export const ORDER_SORT_FIELDS = ['number', 'total', 'status', 'createdAt'] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export interface OrderClientView {
  id: string;
  name: string;
  document: string;
  email: string;
}

export interface OrderItemView {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

export interface ManagedOrder {
  id: string;
  number: string;
  clientId: string;
  client: OrderClientView;
  status: OrderStatus;
  total: Prisma.Decimal;
  paymentInstallments: number;
  firstPaymentDueDays: number;
  paymentIntervalDays: number;
  items: OrderItemView[];
  receivables: Array<{ id: string; number: string; installmentNumber: number; installmentCount: number; originalAmount: Prisma.Decimal; receivedAmount: Prisma.Decimal; dueDate: Date; status: string }>;
  shipments?: Array<{ id: string; number: string; shippedAt: Date; items: Array<{ id: string; orderItemId: string; productId: string; quantity: number; unitCost: Prisma.Decimal; totalCost: Prisma.Decimal }> }>;
  stockReservations?: Array<{ id: string; orderItemId: string; quantity: number; consumedQuantity: number; releasedQuantity: number; active: boolean }>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderSummary {
  id: string;
  number: string;
  clientId: string;
  client: OrderClientView;
  status: OrderStatus;
  total: Prisma.Decimal;
  itemsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListOrdersInput {
  search?: string | undefined;
  status?: OrderStatus | undefined;
  client?: string | undefined;
  dateStart?: Date | undefined;
  dateEnd?: Date | undefined;
  page: number;
  pageSize: number;
  sortBy: OrderSortField;
  sortOrder: SortOrder;
}

export interface TransactionClient {
  id: string;
  active: boolean;
}

export interface TransactionProduct {
  id: string;
  name: string;
  sku: string;
  price: Prisma.Decimal;
  stock: number;
  active: boolean;
}

export interface CreateOrderItemData {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

export interface CreateOrderData {
  number: string;
  clientId: string;
  total: Prisma.Decimal;
  paymentInstallments: number;
  firstPaymentDueDays: number;
  paymentIntervalDays: number;
  items: CreateOrderItemData[];
}
