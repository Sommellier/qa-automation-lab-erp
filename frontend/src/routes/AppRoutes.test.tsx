import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';
import { dashboardApi } from '../services/dashboard.service';
import { usersApi } from '../services/user.service';
import type { UserRole } from '../types/auth';
import type { ManagedUser } from '../types/user';
import type { DashboardSummary } from '../types/dashboard';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({
  authApi: {
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('../services/user.service', () => ({
  usersApi: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
}));

vi.mock('../services/dashboard.service', () => ({
  dashboardApi: { summary: vi.fn() },
}));

const mockedAuthApi = vi.mocked(authApi);
const mockedUsersApi = vi.mocked(usersApi);
const mockedDashboardApi = vi.mocked(dashboardApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };

const dashboardSummary: DashboardSummary = {
  generatedAt: '2026-09-27T12:00:00.000Z', timezone: 'UTC',
  clients: { active: 1 },
  products: { active: 1, outOfStock: 0, lowStock: [] },
  orders: {
    pending: 0, confirmed: 0, processing: 0, completed: 0, cancelled: 0,
    byStatus: [
      { status: 'PENDING', count: 0 }, { status: 'CONFIRMED', count: 0 },
      { status: 'PROCESSING', count: 0 }, { status: 'COMPLETED', count: 0 },
      { status: 'CANCELLED', count: 0 },
    ],
    recent: [],
    last30Days: Array.from({ length: 30 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, count: 0 })),
  },
  revenue: { completed: '0.00' },
};

function managedUser(overrides: Partial<ManagedUser> = {}): ManagedUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Carlos Analista',
    email: 'carlos@empresa.com',
    role: 'ANALISTA',
    active: true,
    createdAt: '2026-09-26T12:00:00.000Z',
    updatedAt: '2026-09-26T12:00:00.000Z',
    ...overrides,
  };
}

function renderApp(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function submitLogin(email: string, password: string): Promise<void> {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByTestId('login-submit'));
}

describe('fluxo de autenticação', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetAllMocks();
    mockedAuthApi.logout.mockResolvedValue(undefined);
    mockedDashboardApi.summary.mockResolvedValue(dashboardSummary);
  });

  it.each<[UserRole, string]>([
    ['ADMIN', 'Administrador'],
    ['ANALISTA', 'Analista'],
    ['VISUALIZADOR', 'Visualizador'],
  ])('CT001-003: autentica %s e mostra seu perfil', async (role, name) => {
    mockedAuthApi.login.mockResolvedValue({
      token: `token-${role}`,
      user: { id: role, name, email: `${role.toLowerCase()}@qamgmt.local`, role, ...accountDetails },
    });
    renderApp();

    await submitLogin(`${role.toLowerCase()}@qamgmt.local`, 'Senha@123');

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getByTestId('user-role')).toHaveTextContent(role);
  });

  it('impede múltiplos envios enquanto o login está em andamento', async () => {
    mockedAuthApi.login.mockReturnValue(new Promise(() => undefined));
    renderApp();

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('E-mail'), 'admin@qamgmt.local');
    await user.type(screen.getByLabelText('Senha'), 'Senha@123');
    await user.click(screen.getByTestId('login-submit'));

    expect(screen.getByTestId('login-submit')).toBeDisabled();
    expect(screen.getByTestId('login-submit')).toHaveTextContent('Entrando...');
  });

  it('CT004: apresenta erro genérico para senha incorreta', async () => {
    mockedAuthApi.login.mockRejectedValue(new ApiError('E-mail ou senha inválidos.', 401));
    renderApp();

    await submitLogin('admin@qamgmt.local', 'incorreta');

    expect(await screen.findByTestId('login-error')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('CT005 e CT006: exige e-mail e senha', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByTestId('login-submit'));

    expect(screen.getByText('E-mail é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('Senha é obrigatória.')).toBeInTheDocument();
    expect(mockedAuthApi.login).not.toHaveBeenCalled();
  });

  it('valida o formato do e-mail', async () => {
    renderApp();
    await submitLogin('email-invalido', 'Senha@123');
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
  });

  it('CT007: redireciona acesso anônimo ao dashboard para o login', async () => {
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
  });

  it('CT008: encerra a sessão, limpa o token e volta ao login', async () => {
    window.localStorage.setItem('qa-management:access-token', 'valid-token');
    mockedAuthApi.me.mockResolvedValue({
      id: '1',
      name: 'Administrador',
      email: 'admin@qamgmt.local',
      role: 'ADMIN',
      ...accountDetails,
    });
    renderApp('/dashboard');

    const user = userEvent.setup();
    await user.click(await screen.findByTestId('logout-button'));

    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(window.localStorage.getItem('qa-management:access-token')).toBeNull();
    await waitFor(() => expect(mockedAuthApi.logout).toHaveBeenCalledWith('valid-token'));
  });
});

describe('gestão de usuários', () => {
  const admin = { id: 'admin-id', name: 'Administrador', email: 'admin@qamgmt.local', role: 'ADMIN' as const, ...accountDetails };

  beforeEach(() => {
    window.localStorage.clear();
    vi.resetAllMocks();
    window.localStorage.setItem('qa-management:access-token', 'admin-token');
    mockedAuthApi.me.mockResolvedValue(admin);
    mockedAuthApi.logout.mockResolvedValue(undefined);
    mockedUsersApi.list.mockResolvedValue({
      data: [managedUser()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
  });

  it('CT001: ADMIN acessa a gestão e visualiza o menu Usuários', async () => {
    renderApp('/users');

    expect(await screen.findByTestId('users-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuários' })).toBeInTheDocument();
    expect(await screen.findByTestId('users-table')).toBeInTheDocument();
  });

  it.each<UserRole>(['ANALISTA', 'VISUALIZADOR'])(
    'CT002-003: %s acessando /users visualiza acesso negado e não vê o menu',
    async (role) => {
      mockedAuthApi.me.mockResolvedValue({ ...admin, role });
      renderApp('/users');

      expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Acesso negado' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
      expect(mockedUsersApi.list).not.toHaveBeenCalled();
    },
  );

  it.each<UserRole>(['ANALISTA', 'VISUALIZADOR'])(
    'CT004-005: cria um usuário %s',
    async (role) => {
      mockedUsersApi.create.mockResolvedValue(managedUser({ role }));
      renderApp('/users/new');
      const user = userEvent.setup();

      await user.type(await screen.findByTestId('user-name'), `Novo ${role}`);
      await user.type(screen.getByTestId('user-email'), `${role.toLowerCase()}@empresa.com`);
      await user.type(screen.getByTestId('user-password'), 'Senha@123');
      await user.selectOptions(screen.getByTestId('user-role'), role);
      await user.click(screen.getByTestId('user-save'));

      await waitFor(() => expect(mockedUsersApi.create).toHaveBeenCalledWith(
        'admin-token',
        expect.objectContaining({ role, active: true }),
      ));
      expect(await screen.findByText('Usuário criado com sucesso.')).toBeInTheDocument();
    },
  );

  it('CT006: apresenta a mensagem de e-mail duplicado', async () => {
    mockedUsersApi.create.mockRejectedValue(
      new ApiError('Já existe um usuário cadastrado com este e-mail.', 409, 'EMAIL_ALREADY_EXISTS'),
    );
    renderApp('/users/new');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('user-name'), 'Usuário duplicado');
    await user.type(screen.getByTestId('user-email'), 'admin@qamgmt.local');
    await user.type(screen.getByTestId('user-password'), 'Senha@123');
    await user.click(screen.getByTestId('user-save'));

    expect(await screen.findByTestId('user-form-error')).toHaveTextContent(
      'Já existe um usuário cadastrado com este e-mail.',
    );
  });

  it('CT007: carrega e edita nome e perfil do usuário', async () => {
    const existing = managedUser();
    mockedUsersApi.getById.mockResolvedValue(existing);
    mockedUsersApi.update.mockResolvedValue(managedUser({ name: 'Carlos Atualizado', role: 'VISUALIZADOR' }));
    renderApp(`/users/${existing.id}/edit`);
    const user = userEvent.setup();

    const nameInput = await screen.findByTestId('user-name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Carlos Atualizado');
    await user.selectOptions(screen.getByTestId('user-role'), 'VISUALIZADOR');
    await user.click(screen.getByTestId('user-save'));

    await waitFor(() => expect(mockedUsersApi.update).toHaveBeenCalledWith(
      'admin-token',
      existing.id,
      expect.objectContaining({ name: 'Carlos Atualizado', role: 'VISUALIZADOR' }),
    ));
    expect(await screen.findByText('Usuário atualizado com sucesso.')).toBeInTheDocument();
  });

  it('CT008-009: confirma a alteração de status em modal próprio', async () => {
    const existing = managedUser({ active: true });
    mockedUsersApi.list.mockResolvedValue({
      data: [existing],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    mockedUsersApi.updateStatus.mockResolvedValue({ ...existing, active: false });
    renderApp('/users');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Inativar' }));
    expect(screen.getByTestId('user-status-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('user-status-confirm'));

    await waitFor(() => expect(mockedUsersApi.updateStatus).toHaveBeenCalledWith('admin-token', existing.id, false));
    expect(await screen.findByText('Usuário inativado com sucesso.')).toBeInTheDocument();
  });

  it('CT010-012: envia pesquisa, perfil e status como filtros', async () => {
    renderApp('/users');
    await screen.findByTestId('users-table');
    mockedUsersApi.list.mockClear();
    const user = userEvent.setup();

    await user.type(screen.getByTestId('users-search'), 'carlos');
    await user.selectOptions(screen.getByTestId('users-role-filter'), 'ANALISTA');
    await user.selectOptions(screen.getByTestId('users-status-filter'), 'false');
    await user.click(screen.getByTestId('users-search-button'));

    await waitFor(() => expect(mockedUsersApi.list).toHaveBeenCalledWith(
      'admin-token',
      expect.objectContaining({ search: 'carlos', role: 'ANALISTA', active: false, page: 1 }),
    ));
  });
});
