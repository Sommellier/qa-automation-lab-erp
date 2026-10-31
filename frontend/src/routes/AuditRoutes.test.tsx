import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { auditApi } from '../services/audit.service';
import { authApi } from '../services/auth.service';
import type { AuditLog } from '../types/audit';
import type { UserRole } from '../types/auth';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({ authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/audit.service', () => ({ auditApi: { list: vi.fn() } }));

const mockedAuth = vi.mocked(authApi);
const mockedAudit = vi.mocked(auditApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const auditLog: AuditLog = {
  id: '9f35dd91-b142-4e77-a1d7-69310d2270ac',
  userId: '11111111-1111-4111-8111-111111111111',
  user: { id: '11111111-1111-4111-8111-111111111111', name: 'Administrador', email: 'admin@qamgmt.local' },
  entityType: 'PRODUCT',
  entityId: '22222222-2222-4222-8222-222222222222',
  action: 'UPDATE',
  oldData: { name: 'Mouse Gamer', price: '299.90', stock: 10 },
  newData: { name: 'Mouse Gamer Pro', price: '349.90', stock: 8 },
  createdAt: '2026-09-27T14:30:00.000Z',
};

function authenticate(role: UserRole): void {
  window.localStorage.setItem('qa-management:access-token', `${role}-token`);
  mockedAuth.me.mockResolvedValue({ id: role, name: role, email: `${role.toLowerCase()}@qamgmt.local`, role, ...accountDetails });
}

function renderApp(): void {
  render(<MemoryRouter initialEntries={['/audit']}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>);
}

describe('página de auditoria', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetAllMocks();
    mockedAuth.logout.mockResolvedValue(undefined);
    mockedAudit.list.mockResolvedValue({ data: [auditLog], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } });
  });

  it('ADMIN visualiza menu, eventos e ordenação mais recente por padrão', async () => {
    authenticate('ADMIN'); renderApp();
    expect(await screen.findByTestId('audit-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Auditoria' })).toBeInTheDocument();
    expect(await screen.findByTestId('audit-table')).toBeInTheDocument();
    expect(await screen.findByText('Mouse Gamer Pro')).toBeInTheDocument();
    expect(mockedAudit.list).toHaveBeenCalledWith('ADMIN-token', expect.objectContaining({ page: 1, pageSize: 20, sortOrder: 'desc' }));
  });

  it.each<UserRole>(['ANALISTA', 'VISUALIZADOR'])('%s é bloqueado e não vê o menu', async (role) => {
    authenticate(role); renderApp();
    expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoria' })).not.toBeInTheDocument();
    expect(mockedAudit.list).not.toHaveBeenCalled();
  });

  it('aplica e limpa filtros estáveis', async () => {
    authenticate('ADMIN'); renderApp(); const user = userEvent.setup();
    await screen.findByTestId('audit-row');
    await user.selectOptions(screen.getByTestId('audit-entity-filter'), 'PRODUCT');
    await user.selectOptions(screen.getByTestId('audit-action-filter'), 'UPDATE');
    await user.type(screen.getByTestId('audit-user-search'), 'admin@qamgmt.local');
    await user.type(screen.getByTestId('audit-date-from'), '2026-09-01');
    await user.type(screen.getByTestId('audit-date-to'), '2026-09-27');
    await user.click(screen.getByTestId('audit-search-button'));
    await waitFor(() => expect(mockedAudit.list).toHaveBeenLastCalledWith('ADMIN-token', expect.objectContaining({ entityType: 'PRODUCT', action: 'UPDATE', search: 'admin@qamgmt.local', dateFrom: '2026-09-01', dateTo: '2026-09-27', page: 1 })));
    await user.click(screen.getByTestId('audit-clear-button'));
    await waitFor(() => expect(mockedAudit.list).toHaveBeenLastCalledWith('ADMIN-token', { page: 1, pageSize: 20, sortOrder: 'desc' }));
  });

  it('pagina e apresenta diferenças legíveis no modal', async () => {
    authenticate('ADMIN'); renderApp(); const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Próximo ›' }));
    await waitFor(() => expect(mockedAudit.list).toHaveBeenLastCalledWith('ADMIN-token', expect.objectContaining({ page: 2 })));
    await user.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    const modal = screen.getByTestId('audit-details');
    expect(within(modal).getByText('Detalhes da auditoria')).toBeInTheDocument();
    expect(within(modal).getByText('Mouse Gamer')).toBeInTheDocument();
    expect(within(modal).getByText('Mouse Gamer Pro')).toBeInTheDocument();
    expect(within(modal).getByText(/299,90/)).toBeInTheDocument();
    expect(within(modal).getByText(/349,90/)).toBeInTheDocument();
    expect(within(modal).getAllByTestId('audit-old-data')).not.toHaveLength(0);
    expect(within(modal).getAllByTestId('audit-new-data')).not.toHaveLength(0);
    await user.click(within(modal).getByRole('button', { name: 'Fechar detalhes' }));
    expect(screen.queryByTestId('audit-details')).not.toBeInTheDocument();
  });
});
