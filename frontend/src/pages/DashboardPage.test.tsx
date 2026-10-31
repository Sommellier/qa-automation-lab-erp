import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardApi } from '../services/dashboard.service';
import type { UserRole } from '../types/auth';
import type { DashboardSummary } from '../types/dashboard';
import { DashboardPage } from './DashboardPage';

const auth = vi.hoisted(() => ({ role: 'ADMIN' }));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-id', name: 'Usuário do teste', email: 'teste@local', role: auth.role as UserRole },
    token: 'dashboard-token', isAuthenticated: true, isLoading: false,
    login: vi.fn(), logout: vi.fn(),
  }),
}));
vi.mock('../services/dashboard.service', () => ({
  dashboardApi: { summary: vi.fn() },
}));

const mockedDashboard = vi.mocked(dashboardApi);
const summary: DashboardSummary = {
  generatedAt: '2026-09-27T18:00:00.000Z',
  timezone: 'UTC',
  clients: { active: 128 },
  products: {
    active: 64,
    outOfStock: 7,
    lowStock: [{ id: 'product-1', name: 'Mouse', sku: 'MOUSE001', stock: 0 }],
  },
  orders: {
    pending: 12,
    confirmed: 9,
    processing: 6,
    completed: 142,
    cancelled: 8,
    byStatus: [
      { status: 'PENDING', count: 12 },
      { status: 'CONFIRMED', count: 9 },
      { status: 'PROCESSING', count: 6 },
      { status: 'COMPLETED', count: 142 },
      { status: 'CANCELLED', count: 8 },
    ],
    recent: [{
      id: 'order-1', number: 'PED-000010', clientName: 'Carlos Silva', status: 'COMPLETED',
      total: '1250.90', createdAt: '2026-09-27T15:00:00.000Z',
    }],
    last30Days: Array.from({ length: 30 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      count: index % 5,
    })),
  },
  revenue: { completed: '184540.90' },
};

function renderDashboard() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.role = 'ADMIN';
    mockedDashboard.summary.mockResolvedValue(summary);
  });

  it('exibe indicadores reais, listas e os dois gráficos', async () => {
    renderDashboard();

    expect(await screen.findByTestId('dashboard-active-clients')).toHaveTextContent('128');
    expect(screen.getByTestId('dashboard-active-products')).toHaveTextContent('64');
    expect(screen.getByTestId('dashboard-out-of-stock')).toHaveTextContent('7');
    expect(screen.getByTestId('dashboard-orders-pending')).toHaveTextContent('12');
    expect(screen.getByTestId('dashboard-orders-processing')).toHaveTextContent('6');
    expect(screen.getByTestId('dashboard-orders-completed')).toHaveTextContent('142');
    expect(screen.getByTestId('dashboard-orders-cancelled')).toHaveTextContent('8');
    expect(screen.getByTestId('dashboard-revenue')).toHaveTextContent(/184\.540,90/);
    expect(screen.getByTestId('dashboard-recent-orders')).toHaveTextContent('PED-000010');
    expect(screen.getByTestId('dashboard-low-stock')).toHaveTextContent('MOUSE001');
    expect(screen.getByRole('img', { name: 'Quantidade de pedidos por status' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Quantidade de pedidos por dia nos últimos 30 dias' })).toBeInTheDocument();
    expect(mockedDashboard.summary).toHaveBeenCalledWith('dashboard-token');
  });

  it('mostra skeleton sem indicadores falsos durante o carregamento', () => {
    mockedDashboard.summary.mockReturnValue(new Promise(() => undefined));
    renderDashboard();

    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-active-clients')).not.toBeInTheDocument();
  });

  it('trata falha amigavelmente e permite tentar novamente', async () => {
    mockedDashboard.summary.mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce(summary);
    renderDashboard();

    expect(await screen.findByTestId('dashboard-error')).toHaveTextContent('Não foi possível carregar os dados do dashboard.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByTestId('dashboard-active-clients')).toHaveTextContent('128');
    expect(mockedDashboard.summary).toHaveBeenCalledTimes(2);
  });

  it('recarrega os dados pelo botão Atualizar', async () => {
    renderDashboard();
    await screen.findByTestId('dashboard-active-clients');

    await userEvent.setup().click(screen.getByTestId('dashboard-refresh'));
    await waitFor(() => expect(mockedDashboard.summary).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('dashboard-active-products')).toHaveTextContent('64');
  });

  it.each<UserRole>(['ADMIN', 'ANALISTA', 'VISUALIZADOR'])('funciona para o perfil %s', async (role) => {
    auth.role = role;
    renderDashboard();
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getByTestId('user-role')).toHaveTextContent(role);
  });
});
