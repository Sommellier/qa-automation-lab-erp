import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../services/auth.service';
import { stockApi } from '../services/stock.service';
import type { UserRole } from '../types/auth';
import type { StockHistoryResponse } from '../types/stock';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({ authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/stock.service', () => ({ stockApi: { history: vi.fn() } }));
const mockedAuth = vi.mocked(authApi); const mockedStock = vi.mocked(stockApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const productId = '11111111-1111-4111-8111-111111111111';
const history: StockHistoryResponse = { product: { id: productId, name: 'Notebook Pro', sku: 'NOTE001', stock: 10, active: true }, data: [{ id: 'm1', productId, type: 'INITIAL_BALANCE', quantity: 10, previousStock: 0, newStock: 10, reason: 'Saldo inicial', orderId: null, order: null, createdById: null, createdBy: null, createdAt: '2026-09-27T12:00:00.000Z' }], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };
function authenticate(role: UserRole) { localStorage.setItem('qa-management:access-token', `${role}-token`); mockedAuth.me.mockResolvedValue({ id: role, name: role, email: `${role.toLowerCase()}@teste.local`, role, ...accountDetails }); }
function open(role: UserRole) { authenticate(role); return render(<MemoryRouter initialEntries={[`/products/${productId}/stock`]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>); }

describe('histórico e ajustes controlados de estoque', () => {
  beforeEach(() => { localStorage.clear(); vi.resetAllMocks(); mockedAuth.logout.mockResolvedValue(undefined); mockedStock.history.mockResolvedValue(history); });
  it.each<UserRole>(['ADMIN', 'ANALISTA', 'VISUALIZADOR'])('CT014: %s consulta o histórico', async (role) => { open(role); expect(await screen.findByTestId('stock-page')).toBeInTheDocument(); await waitFor(() => expect(screen.getByTestId('stock-current')).toHaveTextContent('10')); expect(screen.getByTestId('stock-movement-row')).toHaveTextContent('Saldo inicial'); });
  it.each<UserRole>(['ANALISTA', 'VISUALIZADOR'])('CT012-013: %s não visualiza a ação administrativa', async (role) => { open(role); await screen.findByTestId('stock-page'); expect(screen.queryByTestId('stock-adjustment-workflow-link')).not.toBeInTheDocument(); });
  it('CT010: ADMIN é direcionado ao fluxo de ajustes aprovados', async () => { open('ADMIN'); const link = await screen.findByTestId('stock-adjustment-workflow-link'); expect(link).toHaveAttribute('href', '/stock/adjustments'); });
  it('RF027-029: aplica filtros de tipo e período', async () => { open('VISUALIZADOR'); const user = userEvent.setup(); await screen.findByTestId('stock-page'); mockedStock.history.mockClear(); await user.selectOptions(screen.getByTestId('stock-type-filter'), 'SALE'); await user.type(screen.getByTestId('stock-date-from'), '2026-09-01'); await user.type(screen.getByTestId('stock-date-to'), '2026-09-30'); await user.click(screen.getByRole('button', { name: 'Filtrar' })); await waitFor(() => expect(mockedStock.history).toHaveBeenCalledWith('VISUALIZADOR-token', productId, expect.objectContaining({ type: 'SALE', dateFrom: '2026-09-01', dateTo: '2026-09-30', sortOrder: 'desc' }))); });
});
