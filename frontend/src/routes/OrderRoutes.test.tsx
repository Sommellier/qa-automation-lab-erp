import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';
import { clientsApi } from '../services/client.service';
import { ordersApi } from '../services/order.service';
import { productsApi } from '../services/product.service';
import type { UserRole } from '../types/auth';
import type { ManagedClient } from '../types/client';
import type { ManagedOrder, OrderSummary } from '../types/order';
import type { ManagedProduct } from '../types/product';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({ authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/client.service', () => ({ clientsApi: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() } }));
vi.mock('../services/product.service', () => ({ productsApi: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() } }));
vi.mock('../services/order.service', () => ({ ordersApi: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), updateStatus: vi.fn() } }));
const mockedAuth = vi.mocked(authApi); const mockedClients = vi.mocked(clientsApi); const mockedProducts = vi.mocked(productsApi); const mockedOrders = vi.mocked(ordersApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const client: ManagedClient = { id: '11111111-1111-4111-8111-111111111111', name: 'Carlos Silva', document: '12345678900', email: 'carlos@teste.local', phone: null, active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const product: ManagedProduct = { id: '22222222-2222-4222-8222-222222222222', name: 'Notebook Pro', sku: 'NOTE001', description: null, price: '100.10', stock: 5, trackingMode: 'NONE', expiryWarningDays: 30, blockExpired: true, averageCost: '0', stockValue: '0', categoryId: '55555555-5555-4555-8555-555555555555', category: { id: '55555555-5555-4555-8555-555555555555', name: 'Informática', active: true }, active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const summary: OrderSummary = { id: '33333333-3333-4333-8333-333333333333', number: 'PED-000006', clientId: client.id, client: { id: client.id, name: client.name, document: client.document, email: client.email }, status: 'PENDING', total: '200.20', itemsCount: 1, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const order: ManagedOrder = { ...summary, grossTotal: '200.20', discountTotal: '0.00', seller: null, quote: null, commissionRate: '0.00', commissionAmount: '0.00', paymentInstallments: 1, firstPaymentDueDays: 30, paymentIntervalDays: 30, receivables: [], items: [{ id: '44444444-4444-4444-8444-444444444444', productId: product.id, productName: product.name, productSku: product.sku, quantity: 2, unitPrice: product.price, subtotal: '200.20' }] };
function authenticate(role: UserRole) { window.localStorage.setItem('qa-management:access-token', `${role}-token`); mockedAuth.me.mockResolvedValue({ id: role, name: role, email: `${role.toLowerCase()}@qamgmt.local`, role, ...accountDetails }); }
function renderApp(path: string) { return render(<MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>); }

describe('gestão de pedidos', () => {
  beforeEach(() => {
    window.localStorage.clear(); vi.resetAllMocks(); mockedAuth.logout.mockResolvedValue(undefined);
    mockedOrders.list.mockResolvedValue({ data: [summary], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }); mockedOrders.getById.mockResolvedValue(order); mockedOrders.create.mockResolvedValue(order); mockedOrders.updateStatus.mockResolvedValue({ ...order, status: 'CANCELLED' });
    mockedClients.list.mockResolvedValue({ data: [client], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }); mockedProducts.list.mockResolvedValue({ data: [product], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } });
  });

  it.each<[UserRole, boolean]>([['ADMIN', true], ['ANALISTA', true], ['VISUALIZADOR', false]])('%s visualiza pedidos com ações permitidas', async (role, canCreate) => { authenticate(role); renderApp('/orders'); expect(await screen.findByText('PED-000006')).toBeInTheDocument(); expect(screen.getByTestId('order-row')).toHaveTextContent('200,20'); expect(Boolean(screen.queryByTestId('orders-new-button'))).toBe(canCreate); });

  it('VISUALIZADOR não acessa novo pedido', async () => { authenticate('VISUALIZADOR'); renderApp('/orders/new'); expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument(); });

  it('ANALISTA busca entidades, incrementa produto duplicado e cria pedido', async () => { authenticate('ANALISTA'); renderApp('/orders/new'); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Buscar clientes' })); await user.click(screen.getByTestId('order-product-search-button')); await waitFor(() => expect(screen.getByTestId('order-client')).toHaveValue(client.id)); await user.click(screen.getByTestId('order-add-product')); await user.click(screen.getByTestId('order-add-product')); expect(screen.getByTestId('order-item-quantity')).toHaveValue(2); expect(screen.getByTestId('order-total')).toHaveTextContent('200,20'); await user.click(screen.getByTestId('order-save')); await waitFor(() => expect(mockedOrders.create).toHaveBeenCalledWith('ANALISTA-token', { clientId: client.id, paymentInstallments: 1, firstPaymentDueDays: 30, paymentIntervalDays: 30, items: [{ productId: product.id, quantity: 2 }] })); expect(await screen.findByText('Pedido criado com sucesso.')).toBeInTheDocument(); });

  it('remove item e impede pedido vazio', async () => { authenticate('ADMIN'); renderApp('/orders/new'); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Buscar clientes' })); await user.click(screen.getByTestId('order-product-search-button')); await user.click(await screen.findByTestId('order-add-product')); await user.click(screen.getByTestId('order-item-remove')); await user.click(screen.getByTestId('order-save')); expect(await screen.findByText('Adicione pelo menos um produto ao pedido.')).toBeInTheDocument(); expect(mockedOrders.create).not.toHaveBeenCalled(); });

  it('ADMIN avança ou cancela em modal', async () => { authenticate('ADMIN'); mockedOrders.updateStatus.mockResolvedValue({ ...order, status: 'CANCELLED' }); renderApp(`/orders/${order.id}`); const user = userEvent.setup(); expect(await screen.findByRole('button', { name: 'Avançar para Confirmado' })).toBeInTheDocument(); await user.click(screen.getByRole('button', { name: 'Cancelar pedido' })); expect(screen.getByTestId('order-status-modal')).toBeInTheDocument(); await user.click(screen.getByTestId('order-status-confirm')); await waitFor(() => expect(mockedOrders.updateStatus).toHaveBeenCalledWith('ADMIN-token', order.id, 'CANCELLED')); expect(await screen.findByText('Pedido cancelado com sucesso.')).toBeInTheDocument(); });

  it('ANALISTA avança, mas não cancela; VISUALIZADOR é somente leitura', async () => { authenticate('ANALISTA'); const analyst = renderApp(`/orders/${order.id}`); expect(await screen.findByRole('button', { name: 'Avançar para Confirmado' })).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument(); analyst.unmount(); window.localStorage.clear(); vi.resetAllMocks(); authenticate('VISUALIZADOR'); mockedOrders.getById.mockResolvedValue(order); renderApp(`/orders/${order.id}`); expect(await screen.findByTestId('order-details-page')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Avançar para Confirmado' })).not.toBeInTheDocument(); });

  it('aplica filtros, período, ordenação, limpeza e paginação', async () => { authenticate('VISUALIZADOR'); mockedOrders.list.mockResolvedValue({ data: [summary], pagination: { page: 1, pageSize: 10, total: 25, totalPages: 3 } }); renderApp('/orders'); const user = userEvent.setup(); await screen.findByTestId('orders-table'); mockedOrders.list.mockClear(); await user.type(screen.getByTestId('orders-search'), 'PED-000006'); await user.selectOptions(screen.getByTestId('orders-status-filter'), 'PENDING'); await user.type(screen.getByTestId('orders-client-filter'), 'Carlos'); await user.type(screen.getByTestId('orders-date-start'), '2026-09-01'); await user.type(screen.getByTestId('orders-date-end'), '2026-09-30'); await user.click(screen.getByTestId('orders-search-button')); await waitFor(() => expect(mockedOrders.list).toHaveBeenCalledWith('VISUALIZADOR-token', expect.objectContaining({ search: 'PED-000006', status: 'PENDING', client: 'Carlos', dateStart: '2026-09-01', dateEnd: '2026-09-30' }))); await user.click(screen.getByTestId('orders-clear-button')); await user.click(screen.getByRole('button', { name: /Próximo/ })); await waitFor(() => expect(mockedOrders.list).toHaveBeenLastCalledWith('VISUALIZADOR-token', expect.objectContaining({ page: 2 }))); });

  it('trata pedido inexistente', async () => { authenticate('VISUALIZADOR'); mockedOrders.getById.mockRejectedValue(new ApiError('Pedido não encontrado.', 404)); renderApp(`/orders/${order.id}`); expect(await screen.findByTestId('order-details-error')).toHaveTextContent('Pedido não encontrado.'); });
});
