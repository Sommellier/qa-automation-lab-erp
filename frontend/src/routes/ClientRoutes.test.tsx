import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';
import { clientsApi } from '../services/client.service';
import type { UserRole } from '../types/auth';
import type { ClientAddress, ManagedClient } from '../types/client';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({
  authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() },
}));

vi.mock('../services/client.service', () => ({
  clientsApi: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    listAddresses: vi.fn(),
    getAddress: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    updateAddressStatus: vi.fn(),
    setPrimaryAddress: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);
const mockedClientsApi = vi.mocked(clientsApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };

const client: ManagedClient = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Carlos Silva',
  document: '12345678900',
  email: 'carlos@empresa.com',
  phone: '47999999999',
  active: true,
  createdAt: '2026-09-26T12:00:00.000Z',
  updatedAt: '2026-09-26T12:00:00.000Z',
};

const address: ClientAddress = {
  id: '22222222-2222-4222-8222-222222222222', clientId: client.id, type: 'RESIDENTIAL', zipCode: '89200-000',
  street: 'Rua das Flores', number: '221B', complement: 'Apto 402', district: 'Centro', city: 'Joinville', state: 'SC', country: 'Brasil',
  isPrimary: true, active: true, createdAt: '2026-09-28T12:00:00.000Z', updatedAt: '2026-09-28T12:00:00.000Z',
};

function authenticate(role: UserRole): void {
  window.localStorage.setItem('qa-management:access-token', `${role}-token`);
  mockedAuthApi.me.mockResolvedValue({
    id: `${role}-id`,
    name: role,
    email: `${role.toLowerCase()}@qamgmt.local`,
    role,
    ...accountDetails,
  });
}

function renderApp(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>);
}

describe('gestão de clientes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetAllMocks();
    mockedAuthApi.logout.mockResolvedValue(undefined);
    mockedClientsApi.list.mockResolvedValue({
      data: [client],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    mockedClientsApi.getById.mockResolvedValue(client);
    mockedClientsApi.listAddresses.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    mockedClientsApi.getAddress.mockResolvedValue(address);
  });

  it.each<[UserRole, boolean, boolean]>([
    ['ADMIN', true, true],
    ['ANALISTA', true, false],
    ['VISUALIZADOR', false, false],
  ])('CT001-003 e RF024: %s visualiza clientes com suas ações', async (role, canEdit, canChangeStatus) => {
    authenticate(role);
    renderApp('/clients');

    expect(await screen.findByTestId('clients-page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clientes' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Visualizar' })).toBeInTheDocument();
    expect(Boolean(screen.queryByTestId('clients-new-button'))).toBe(canEdit);
    expect(Boolean(screen.queryByRole('link', { name: 'Editar' }))).toBe(canEdit);
    expect(Boolean(screen.queryByRole('button', { name: 'Inativar' }))).toBe(canChangeStatus);
  });

  it('CT005: ANALISTA cadastra cliente e recebe feedback', async () => {
    authenticate('ANALISTA');
    mockedClientsApi.create.mockResolvedValue(client);
    renderApp('/clients/new');
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('client-name'), client.name);
    await user.type(screen.getByTestId('client-document'), client.document);
    await user.type(screen.getByTestId('client-email'), client.email);
    await user.type(screen.getByTestId('client-phone'), client.phone!);
    await user.click(screen.getByTestId('client-save'));

    await waitFor(() => expect(mockedClientsApi.create).toHaveBeenCalledWith(
      'ANALISTA-token',
      expect.objectContaining({ document: client.document, active: true }),
    ));
    expect(await screen.findByText('Cliente cadastrado com sucesso.')).toBeInTheDocument();
  });

  it('CT006 e CT011: VISUALIZADOR não acessa cadastro nem edição', async () => {
    authenticate('VISUALIZADOR');
    const first = renderApp('/clients/new');
    expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument();
    first.unmount();

    renderApp(`/clients/${client.id}/edit`);
    expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument();
    expect(mockedClientsApi.getById).not.toHaveBeenCalled();
  });

  it.each([
    'Já existe um cliente cadastrado com este e-mail.',
    'Já existe um cliente cadastrado com este documento.',
  ])('CT007-008: apresenta conflito: %s', async (message) => {
    authenticate('ADMIN');
    mockedClientsApi.create.mockRejectedValue(new ApiError(message, 409));
    renderApp('/clients/new');
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('client-name'), client.name);
    await user.type(screen.getByTestId('client-document'), client.document);
    await user.type(screen.getByTestId('client-email'), client.email);
    await user.click(screen.getByTestId('client-save'));
    expect(await screen.findByTestId('client-form-error')).toHaveTextContent(message);
  });

  it('CT009-010: carrega e edita cliente sem enviar status', async () => {
    authenticate('ANALISTA');
    mockedClientsApi.update.mockResolvedValue({ ...client, name: 'Carlos Atualizado' });
    renderApp(`/clients/${client.id}/edit`);
    const user = userEvent.setup();
    const name = await screen.findByTestId('client-name');
    expect(screen.queryByTestId('client-status')).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Carlos Atualizado');
    await user.click(screen.getByTestId('client-save'));
    await waitFor(() => expect(mockedClientsApi.update).toHaveBeenCalledWith(
      'ANALISTA-token',
      client.id,
      expect.not.objectContaining({ active: expect.anything() }),
    ));
    expect(await screen.findByText('Cliente atualizado com sucesso.')).toBeInTheDocument();
  });

  it('CT012 e CT015: ADMIN confirma mudança de status em modal próprio', async () => {
    authenticate('ADMIN');
    mockedClientsApi.updateStatus.mockResolvedValue({ ...client, active: false });
    renderApp('/clients');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Inativar' }));
    expect(screen.getByTestId('client-status-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('client-status-confirm'));
    await waitFor(() => expect(mockedClientsApi.updateStatus).toHaveBeenCalledWith('ADMIN-token', client.id, false));
    expect(await screen.findByText('Cliente inativado com sucesso.')).toBeInTheDocument();
  });

  it('CT016-021: envia pesquisa, filtro e ordenação e permite limpar', async () => {
    authenticate('VISUALIZADOR');
    renderApp('/clients');
    await screen.findByTestId('clients-table');
    mockedClientsApi.list.mockClear();
    const user = userEvent.setup();
    await user.type(screen.getByTestId('clients-search'), 'Carlos');
    await user.selectOptions(screen.getByTestId('clients-status-filter'), 'false');
    await user.selectOptions(screen.getByTestId('clients-sort-by'), 'document');
    await user.selectOptions(screen.getByTestId('clients-sort-order'), 'desc');
    await user.click(screen.getByTestId('clients-search-button'));
    await waitFor(() => expect(mockedClientsApi.list).toHaveBeenCalledWith(
      'VISUALIZADOR-token',
      expect.objectContaining({ search: 'Carlos', active: false, sortBy: 'document', sortOrder: 'desc', page: 1 }),
    ));
    await user.click(screen.getByTestId('clients-clear-button'));
    await waitFor(() => expect(mockedClientsApi.list).toHaveBeenLastCalledWith(
      'VISUALIZADOR-token',
      expect.objectContaining({ sortBy: 'name', sortOrder: 'asc', page: 1 }),
    ));
  });

  it('RF017 e CT024: VISUALIZADOR consulta detalhes e recebe tratamento de 404', async () => {
    authenticate('VISUALIZADOR');
    const first = renderApp(`/clients/${client.id}`);
    expect(await screen.findByTestId('client-details-page')).toBeInTheDocument();
    expect(screen.getByText(client.document)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar cliente' })).not.toBeInTheDocument();
    first.unmount();

    mockedClientsApi.getById.mockRejectedValue(new ApiError('Cliente não encontrado.', 404));
    renderApp(`/clients/${client.id}`);
    expect(await screen.findByTestId('client-details-error')).toHaveTextContent('Cliente não encontrado.');
  });

  it.each<[UserRole, boolean, boolean]>([['ADMIN', true, true], ['ANALISTA', true, false], ['VISUALIZADOR', false, false]])('endereços respeitam ações do perfil %s', async (role, canEdit, canStatus) => {
    authenticate(role);
    mockedClientsApi.listAddresses.mockResolvedValue({ data: [address, { ...address, id: '33333333-3333-4333-8333-333333333333', street: 'Avenida Central', isPrimary: false }], pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 } });
    renderApp(`/clients/${client.id}`);
    expect(await screen.findByTestId('client-addresses')).toBeInTheDocument();
    expect(Boolean(screen.queryByTestId('address-new-button'))).toBe(canEdit);
    expect(screen.queryAllByRole('link', { name: 'Editar' }).length > 0).toBe(canEdit);
    expect(Boolean(screen.queryByTestId('address-primary-button'))).toBe(canEdit);
    expect(screen.queryAllByRole('button', { name: 'Inativar' }).length > 0).toBe(canStatus);
  });

  it('ADMIN vê bloqueio no modal ao tentar inativar principal com outro endereço ativo', async () => {
    authenticate('ADMIN');
    mockedClientsApi.listAddresses.mockResolvedValue({ data: [address, { ...address, id: '33333333-3333-4333-8333-333333333333', street: 'Avenida Central', isPrimary: false }], pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 } });
    renderApp(`/clients/${client.id}`); const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: 'Inativar' }))[0]!);
    expect(screen.getByTestId('address-status-modal')).toHaveTextContent('Defina outro endereço como principal');
    expect(screen.getByTestId('address-status-confirm')).toBeDisabled();
  });

  it('ANALISTA cadastra endereço com campos acessíveis e número alfanumérico', async () => {
    authenticate('ANALISTA'); mockedClientsApi.createAddress.mockResolvedValue(address);
    renderApp(`/clients/${client.id}/addresses/new`); const user = userEvent.setup();
    await user.type(await screen.findByLabelText('CEP'), address.zipCode);
    await user.type(screen.getByLabelText('Logradouro'), address.street);
    await user.type(screen.getByLabelText('Número'), address.number);
    await user.type(screen.getByLabelText('Bairro'), address.district);
    await user.type(screen.getByLabelText('Cidade'), address.city);
    await user.type(screen.getByLabelText('Estado'), address.state);
    await user.click(screen.getByLabelText('Endereço principal'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mockedClientsApi.createAddress).toHaveBeenCalledWith('ANALISTA-token', client.id, expect.objectContaining({ number: '221B', city: 'Joinville', isPrimary: true })));
    expect(await screen.findByText('Endereço cadastrado com sucesso.')).toBeInTheDocument();
  });

  it('VISUALIZADOR não acessa criação ou edição de endereço', async () => {
    authenticate('VISUALIZADOR'); const first = renderApp(`/clients/${client.id}/addresses/new`); expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument(); first.unmount();
    renderApp(`/clients/${client.id}/addresses/${address.id}/edit`); expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument();
  });
});
