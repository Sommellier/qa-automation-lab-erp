import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../services/auth.service';
import { categoriesApi } from '../services/category.service';
import type { UserRole } from '../types/auth';
import type { ManagedCategory } from '../types/category';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({ authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/category.service', () => ({ categoriesApi: { list: vi.fn(), options: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() } }));
const mockedAuth = vi.mocked(authApi); const mockedCategories = vi.mocked(categoriesApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const category: ManagedCategory = { id: '11111111-1111-4111-8111-111111111111', name: 'Informática', description: 'Equipamentos', active: true, productCount: 15, createdAt: '2026-09-27T12:00:00.000Z', updatedAt: '2026-09-27T12:00:00.000Z' };
function authenticate(role: UserRole) { window.localStorage.setItem('qa-management:access-token', `${role}-token`); mockedAuth.me.mockResolvedValue({ id: role, name: role, email: `${role.toLowerCase()}@teste.local`, role, ...accountDetails }); }
function renderApp(path: string) { return render(<MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>); }

describe('gestão de categorias', () => {
  beforeEach(() => { window.localStorage.clear(); vi.resetAllMocks(); mockedAuth.logout.mockResolvedValue(undefined); mockedCategories.list.mockResolvedValue({ data: [category], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }); mockedCategories.getById.mockResolvedValue(category); });
  it.each<[UserRole, boolean, boolean]>([['ADMIN', true, true], ['ANALISTA', true, false], ['VISUALIZADOR', false, false]])('%s visualiza apenas ações permitidas', async (role, canEdit, canStatus) => { authenticate(role); renderApp('/categories'); expect(await screen.findByTestId('category-row')).toHaveTextContent('Informática'); expect(Boolean(screen.queryByTestId('categories-new-button'))).toBe(canEdit); expect(Boolean(screen.queryByRole('link', { name: 'Editar' }))).toBe(canEdit); expect(Boolean(screen.queryByRole('button', { name: 'Inativar' }))).toBe(canStatus); });
  it('VISUALIZADOR recebe tela proibida ao criar ou editar', async () => { authenticate('VISUALIZADOR'); const first = renderApp('/categories/new'); expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument(); first.unmount(); renderApp(`/categories/${category.id}/edit`); expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument(); });
  it('ANALISTA cadastra categoria', async () => { authenticate('ANALISTA'); mockedCategories.create.mockResolvedValue(category); renderApp('/categories/new'); const user = userEvent.setup(); await user.type(await screen.findByTestId('category-name'), 'Informática'); await user.type(screen.getByTestId('category-description'), 'Equipamentos'); await user.click(screen.getByTestId('category-save')); await waitFor(() => expect(mockedCategories.create).toHaveBeenCalledWith('ANALISTA-token', expect.objectContaining({ name: 'Informática', description: 'Equipamentos', active: true }))); expect(await screen.findByText('Categoria cadastrada com sucesso.')).toBeInTheDocument(); });
  it('ADMIN confirma inativação com contagem de produtos', async () => { authenticate('ADMIN'); mockedCategories.updateStatus.mockResolvedValue({ ...category, active: false }); renderApp('/categories'); const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: 'Inativar' })); expect(screen.getByTestId('category-status-modal')).toHaveTextContent('15 produto(s)'); await user.click(screen.getByTestId('category-status-confirm')); await waitFor(() => expect(mockedCategories.updateStatus).toHaveBeenCalledWith('ADMIN-token', category.id, false)); expect(await screen.findByText('Categoria inativada com sucesso.')).toBeInTheDocument(); });
  it('detalhes exibem dados e contagem', async () => { authenticate('VISUALIZADOR'); renderApp(`/categories/${category.id}`); expect(await screen.findByTestId('category-details-page')).toHaveTextContent('15'); expect(screen.getByTestId('category-description')).toHaveTextContent('Equipamentos'); });
});
