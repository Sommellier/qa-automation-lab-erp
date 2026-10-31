import type { StockHistoryParams, StockHistoryResponse } from '../types/stock';
import { apiRequest } from './api';

function queryString(params: StockHistoryParams): string {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), sortOrder: params.sortOrder });
  for (const key of ['type', 'dateFrom', 'dateTo', 'createdById', 'orderId', 'purchaseOrderId', 'reason'] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  return query.toString();
}

export const stockApi = {
  history(token: string, productId: string, params: StockHistoryParams): Promise<StockHistoryResponse> {
    return apiRequest(`/products/${productId}/stock/movements?${queryString(params)}`, {}, token);
  },
};
