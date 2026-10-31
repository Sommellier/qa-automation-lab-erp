import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Toast } from '../components/Toast';
import { UserStatusModal } from '../components/UserStatusModal';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { usersApi } from '../services/user.service';
import type { UserRole } from '../types/auth';
import type { ListUsersParams, ManagedUser, SortOrder, UserSortField } from '../types/user';

interface FilterDraft {
  search: string;
  role: '' | UserRole;
  active: '' | 'true' | 'false';
  sortBy: UserSortField;
  sortOrder: SortOrder;
}

interface LocationState {
  toast?: string;
}

const INITIAL_FILTERS: FilterDraft = {
  search: '',
  role: '',
  active: '',
  sortBy: 'name',
  sortOrder: 'asc',
};

function toQuery(filters: FilterDraft, page = 1): ListUsersParams {
  return {
    page,
    pageSize: 10,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.active ? { active: filters.active === 'true' } : {}),
  };
}

export function UsersPage() {
  const { token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as LocationState | null;
  const [filters, setFilters] = useState<FilterDraft>(INITIAL_FILTERS);
  const [query, setQuery] = useState<ListUsersParams>(() => toQuery(INITIAL_FILTERS));
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(routeState?.toast ?? '');
  const [statusTarget, setStatusTarget] = useState<ManagedUser | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (routeState?.toast) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, routeState?.toast]);

  useEffect(() => {
    let active = true;

    async function loadUsers(): Promise<void> {
      if (!token) return;
      setIsLoading(true);
      setError('');

      try {
        const response = await usersApi.list(token, query);
        if (active) {
          setUsers(response.data);
          setPagination(response.pagination);
        }
      } catch (requestError: unknown) {
        if (active) {
          setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar os usuários.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadUsers();
    return () => {
      active = false;
    };
  }, [query, reloadKey, token]);

  const dismissToast = useCallback(() => setToast(''), []);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setQuery(toQuery(filters));
  }

  function handleClear(): void {
    setFilters(INITIAL_FILTERS);
    setQuery(toQuery(INITIAL_FILTERS));
  }

  function changePage(page: number): void {
    setQuery((current) => ({ ...current, page }));
  }

  async function confirmStatusChange(): Promise<void> {
    if (!statusTarget || !token) return;
    const newStatus = !statusTarget.active;
    setIsUpdatingStatus(true);

    try {
      await usersApi.updateStatus(token, statusTarget.id, newStatus);
      setToast(`Usuário ${newStatus ? 'ativado' : 'inativado'} com sucesso.`);
      setStatusTarget(null);
      setReloadKey((value) => value + 1);
    } catch (requestError: unknown) {
      setStatusTarget(null);
      setToast(requestError instanceof ApiError ? requestError.message : 'Não foi possível alterar o status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  return (
    <main className="content-page" data-testid="users-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Gestão de Usuários</h1>
          <p className="subtitle">Cadastre usuários e controle seus perfis de acesso.</p>
        </div>
        <Link to="/users/new" className="button-link" data-testid="users-new-button">+ Novo usuário</Link>
      </div>

      <form className="filters-card" onSubmit={handleSearch}>
        <div className="filter-field filter-search">
          <label htmlFor="users-search">Nome ou e-mail</label>
          <input
            id="users-search"
            data-testid="users-search"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </div>
        <div className="filter-field">
          <label htmlFor="users-role-filter">Perfil</label>
          <select
            id="users-role-filter"
            data-testid="users-role-filter"
            value={filters.role}
            onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value as FilterDraft['role'] }))}
          >
            <option value="">Todos</option>
            <option value="ADMIN">ADMIN</option>
            <option value="ANALISTA">ANALISTA</option>
            <option value="VISUALIZADOR">VISUALIZADOR</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="users-status-filter">Status</label>
          <select
            id="users-status-filter"
            data-testid="users-status-filter"
            value={filters.active}
            onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value as FilterDraft['active'] }))}
          >
            <option value="">Todos</option>
            <option value="true">Ativo</option>
            <option value="false">Inativo</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="users-sort-by">Ordenar por</label>
          <select
            id="users-sort-by"
            data-testid="users-sort-by"
            value={filters.sortBy}
            onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value as UserSortField }))}
          >
            <option value="name">Nome</option>
            <option value="email">E-mail</option>
            <option value="createdAt">Data de criação</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="users-sort-order">Ordem</label>
          <select
            id="users-sort-order"
            data-testid="users-sort-order"
            value={filters.sortOrder}
            onChange={(event) => setFilters((current) => ({ ...current, sortOrder: event.target.value as SortOrder }))}
          >
            <option value="asc">Crescente</option>
            <option value="desc">Decrescente</option>
          </select>
        </div>
        <div className="filter-actions">
          <button type="submit" className="primary-button compact-button" data-testid="users-search-button">Pesquisar</button>
          <button type="button" className="secondary-button" data-testid="users-clear-button" onClick={handleClear}>Limpar</button>
        </div>
      </form>

      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="table-card" aria-busy={isLoading}>
        <div className="table-summary">{pagination.total} usuário(s)</div>
        <div className="table-scroll">
          <table data-testid="users-table">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="table-message">Carregando usuários...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="table-message">Nenhum usuário encontrado.</td></tr>
              ) : users.map((listedUser) => (
                <tr key={listedUser.id} data-testid="user-row" data-user-id={listedUser.id}>
                  <td data-testid="user-name"><strong>{listedUser.name}</strong></td>
                  <td data-testid="user-email">{listedUser.email}</td>
                  <td data-testid="user-role"><span className="role-badge">{listedUser.role}</span></td>
                  <td data-testid="user-status">
                    <span className={`status-badge ${listedUser.active ? 'status-active' : 'status-inactive'}`}>
                      {listedUser.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/users/${listedUser.id}/edit`}>Editar</Link>
                      <button type="button" onClick={() => setStatusTarget(listedUser)}>
                        {listedUser.active ? 'Inativar' : 'Ativar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <nav className="pagination" aria-label="Paginação de usuários">
            <button type="button" disabled={pagination.page === 1} onClick={() => changePage(pagination.page - 1)}>
              ‹ Anterior
            </button>
            {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                className={page === pagination.page ? 'current-page' : ''}
                aria-current={page === pagination.page ? 'page' : undefined}
                onClick={() => changePage(page)}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              disabled={pagination.page === pagination.totalPages}
              onClick={() => changePage(pagination.page + 1)}
            >
              Próximo ›
            </button>
          </nav>
        )}
      </section>

      {statusTarget && (
        <UserStatusModal
          user={statusTarget}
          isSubmitting={isUpdatingStatus}
          onCancel={() => setStatusTarget(null)}
          onConfirm={() => void confirmStatusChange()}
        />
      )}
      {toast && <Toast message={toast} type={toast.includes('sucesso') ? 'success' : 'error'} onDismiss={dismissToast} />}
    </main>
  );
}

