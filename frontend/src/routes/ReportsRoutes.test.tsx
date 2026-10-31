import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../services/auth.service';
import { categoriesApi } from '../services/category.service';
import { reportsApi } from '../services/report.service';
import type { UserRole } from '../types/auth';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({ authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/category.service', () => ({ categoriesApi: { options: vi.fn() } }));
vi.mock('../services/report.service', () => ({ reportsApi: { clients: vi.fn(), products: vi.fn(), orders: vi.fn(), revenue: vi.fn() } }));
const auth = vi.mocked(authApi); const categories = vi.mocked(categoriesApi); const reports = vi.mocked(reportsApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const pagination = { page: 1, pageSize: 10, total: 1, totalPages: 2 };

function authenticate(role: UserRole) { window.localStorage.setItem('qa-management:access-token', `${role}-token`); auth.me.mockResolvedValue({ id: role, name: role, email: `${role.toLowerCase()}@teste.com`, role, ...accountDetails }); }
function renderReports() { render(<MemoryRouter initialEntries={['/reports']}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>); }

describe('relatórios', () => {
  beforeEach(() => {
    window.localStorage.clear(); vi.resetAllMocks(); auth.logout.mockResolvedValue(undefined);
    categories.options.mockResolvedValue([]);
    reports.clients.mockResolvedValue({ data: [{ id: 'c1', name: 'Carlos', document: '12345', email: 'carlos@teste.com', phone: null, active: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }], indicators: { total: 8, active: 7, inactive: 1, newInPeriod: 1 }, pagination, timezone: 'UTC' });
    reports.products.mockResolvedValue({ data: [{ id: 'p1', name: 'Produto', sku: 'SKU1', category: 'Teste', price: '0.10', stock: 3, active: true, createdAt: '2026-09-01T00:00:00.000Z' }], indicators: { total: 1, active: 1, inactive: 0, outOfStock: 0, lowStock: 1, stockValue: '0.30' }, pagination: { ...pagination, totalPages: 1 }, timezone: 'UTC' });
    reports.orders.mockResolvedValue({ data: [{ id: 'o1', number: 'PED-1', status: 'COMPLETED', total: '600.00', itemsCount: 5, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', client: { id: 'c1', name: 'Carlos', document: '12345' } }], indicators: { total: 3, byStatus: [{ status: 'PENDING', count: 0 }, { status: 'CONFIRMED', count: 0 }, { status: 'PROCESSING', count: 0 }, { status: 'COMPLETED', count: 3 }, { status: 'CANCELLED', count: 0 }], averageCompletedTicket: '200.00' }, pagination: { ...pagination, total: 3, totalPages: 1 }, period: { dateFrom: '2026-09-01T00:00:00.000Z', dateTo: '2026-09-30T23:59:59.999Z', timezone: 'UTC' } });
    reports.revenue.mockResolvedValue({ indicators: { totalRevenue: '600.00', completedOrders: 3, averageTicket: '200.00', largestOrder: '300.00', smallestOrder: '100.00', cancelledOrders: 1, cancelledValue: '50.00' }, daily: [{ date: '2026-09-01', revenue: '600.00', orders: 3 }], topProducts: [{ productId: 'p1', product: 'Produto', sku: 'SKU1', quantity: 6, revenue: '600.00' }], topClients: [{ clientId: 'c1', client: 'Carlos', document: '12345', orders: 3, revenue: '600.00' }], period: { dateFrom: '2026-09-01T00:00:00.000Z', dateTo: '2026-09-30T23:59:59.999Z', timezone: 'UTC' } });
  });

  it.each<UserRole>(['ADMIN', 'ANALISTA', 'VISUALIZADOR'])('%s acessa relatórios em modo leitura', async (role) => {
    authenticate(role); renderReports();
    expect(await screen.findByTestId('reports-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relatórios' })).toBeInTheDocument();
    expect(await screen.findByTestId('clients-report-table')).toBeInTheDocument();
    expect(reports.clients).toHaveBeenCalledWith(`${role}-token`, expect.objectContaining({ page: 1, pageSize: 10 }));
  });

  it('navega pelos quatro relatórios e apresenta agregações', async () => {
    authenticate('ADMIN'); renderReports(); const user = userEvent.setup(); await screen.findByTestId('clients-report-table');
    await user.click(screen.getByTestId('reports-products-tab')); expect(await screen.findByTestId('products-report-table')).toBeInTheDocument(); expect(screen.getByText(/0,30/)).toBeInTheDocument();
    await user.click(screen.getByTestId('reports-orders-tab')); expect(await screen.findByTestId('orders-report-table')).toBeInTheDocument(); expect(screen.getByText('PED-1')).toBeInTheDocument();
    await user.click(screen.getByTestId('reports-revenue-tab')); expect(await screen.findByTestId('revenue-total')).toHaveTextContent('600,00'); expect(screen.getByTestId('top-products')).toBeInTheDocument(); expect(screen.getByTestId('top-clients')).toBeInTheDocument();
  });

  it('aplica, pagina e limpa filtros de clientes sem perder o contrato', async () => {
    authenticate('ADMIN'); renderReports(); const user = userEvent.setup(); await screen.findByTestId('clients-report-table');
    await user.type(screen.getByLabelText('Nome, documento ou e-mail'), 'Carlos'); await user.selectOptions(screen.getByLabelText('Status'), 'true'); await user.click(screen.getByTestId('reports-apply'));
    await waitFor(() => expect(reports.clients).toHaveBeenLastCalledWith('ADMIN-token', expect.objectContaining({ search: 'Carlos', active: true, page: 1 })));
    await user.click(screen.getByRole('button', { name: 'Próximo ›' })); await waitFor(() => expect(reports.clients).toHaveBeenLastCalledWith('ADMIN-token', expect.objectContaining({ search: 'Carlos', active: true, page: 2 })));
    await user.click(screen.getByTestId('reports-clear')); await waitFor(() => expect(reports.clients).toHaveBeenLastCalledWith('ADMIN-token', { page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc' }));
  });

  it('rejeita período invertido antes da API', async () => {
    authenticate('ADMIN'); renderReports(); const user = userEvent.setup(); await screen.findByTestId('clients-report-table'); const calls = reports.clients.mock.calls.length;
    await user.type(screen.getByTestId('reports-date-from'), '2026-09-30'); await user.type(screen.getByTestId('reports-date-to'), '2026-09-01'); await user.click(screen.getByTestId('reports-apply'));
    expect(screen.getByRole('alert')).toHaveTextContent('A data inicial não pode ser posterior à data final.'); expect(reports.clients).toHaveBeenCalledTimes(calls);
  });

  it('mostra erro e permite tentar novamente', async () => {
    authenticate('ADMIN'); reports.clients.mockRejectedValueOnce(new Error('falha')); renderReports(); const user = userEvent.setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o relatório.'); await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByTestId('clients-report-table')).toBeInTheDocument();
  });
});
