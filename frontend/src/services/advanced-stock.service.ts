import { apiRequest } from './api';
import type { ExpiryLot, StockAdjustment, StockBalance, StockInventory, StockSetup, StockTimelineEntry, StockTransfer, StockValuation, Warehouse } from '../types/advanced-stock';

export const advancedStockApi = {
  setup: (token: string) => apiRequest<StockSetup>('/stock/setup', {}, token),
  warehouses: async (token: string) => (await apiRequest<{ data: Warehouse[] }>('/stock/warehouses', {}, token)).data,
  balances: (token: string) => apiRequest<{ data: StockBalance[]; totals: { physical: number; reserved: number; blocked: number; available: number; inTransit: number } }>('/stock/balances?pageSize=200', {}, token),
  expiry: async (token: string, days = 30) => (await apiRequest<{ data: ExpiryLot[] }>(`/stock/expiry-alerts?days=${days}`, {}, token)).data,
  valuation: (token: string) => apiRequest<StockValuation>('/stock/valuation', {}, token),
  timeline: (token: string, pageSize = 20) => apiRequest<{ data: StockTimelineEntry[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(`/stock/timeline?pageSize=${pageSize}`, {}, token),
  updateProductTracking: async (token: string, productId: string, input: { trackingMode: 'NONE' | 'LOT' | 'SERIAL' | 'LOT_AND_SERIAL'; expiryWarningDays: number; blockExpired: boolean }) => (await apiRequest<{ product: { trackingMode: 'NONE' | 'LOT' | 'SERIAL' | 'LOT_AND_SERIAL'; expiryWarningDays: number; blockExpired: boolean } }>(`/stock/products/${productId}/tracking`, { method: 'PATCH', body: JSON.stringify(input) }, token)).product,
  createWarehouse: async (token: string, input: unknown) => (await apiRequest<{ warehouse: Warehouse }>('/stock/warehouses', { method: 'POST', body: JSON.stringify(input) }, token)).warehouse,
  createLocation: async (token: string, warehouseId: string, input: unknown) => (await apiRequest<{ location: unknown }>(`/stock/warehouses/${warehouseId}/locations`, { method: 'POST', body: JSON.stringify(input) }, token)).location,
  transfers: async (token: string) => (await apiRequest<{ data: StockTransfer[] }>('/stock/transfers', {}, token)).data,
  createTransfer: async (token: string, input: unknown) => (await apiRequest<{ transfer: StockTransfer }>('/stock/transfers', { method: 'POST', body: JSON.stringify(input) }, token)).transfer,
  transferAction: async (token: string, id: string, action: 'submit' | 'approve' | 'reject' | 'ship' | 'receive', input?: unknown) => (await apiRequest<{ transfer: StockTransfer }>(`/stock/transfers/${id}/${action}`, { method: 'POST', ...(input ? { body: JSON.stringify(input) } : {}) }, token)).transfer,
  inventories: async (token: string) => (await apiRequest<{ data: StockInventory[] }>('/stock/inventories', {}, token)).data,
  createInventory: async (token: string, input: unknown) => (await apiRequest<{ inventory: StockInventory }>('/stock/inventories', { method: 'POST', body: JSON.stringify(input) }, token)).inventory,
  inventoryAction: async (token: string, id: string, action: 'counts' | 'submit' | 'approve' | 'reject', input?: unknown) => (await apiRequest<{ inventory: StockInventory }>(`/stock/inventories/${id}/${action}`, { method: 'POST', ...(input ? { body: JSON.stringify(input) } : {}) }, token)).inventory,
  adjustments: async (token: string) => (await apiRequest<{ data: StockAdjustment[] }>('/stock/adjustments', {}, token)).data,
  createAdjustment: async (token: string, input: unknown) => (await apiRequest<{ adjustment: StockAdjustment }>('/stock/adjustments', { method: 'POST', body: JSON.stringify(input) }, token)).adjustment,
  adjustmentAction: async (token: string, id: string, action: 'submit' | 'approve' | 'reject' | 'reverse', reason?: string) => (await apiRequest<{ adjustment: StockAdjustment }>(`/stock/adjustments/${id}/${action}`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }, token)).adjustment,
  createShipment: (token: string, orderId: string, input: unknown) => apiRequest(`/stock/orders/${orderId}/shipments`, { method: 'POST', body: JSON.stringify(input) }, token),
};
