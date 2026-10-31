import type { DashboardSummary } from '../types/dashboard';
import { apiRequest } from './api';

export const dashboardApi = {
  summary(token: string): Promise<DashboardSummary> {
    return apiRequest<DashboardSummary>('/dashboard/summary', {}, token);
  },
};
