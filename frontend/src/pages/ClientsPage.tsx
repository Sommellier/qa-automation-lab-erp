import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { StatusModal } from '../components/StatusModal';
import { Toast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { clientsApi } from '../services/client.service';
import type { ClientSortField, ListClientsParams, ManagedClient, SortOrder } from '../types/client';

interface FilterDraft {
  search: string;
  active: '' | 'true' | 'false';
  sortBy: ClientSortField;
  sortOrder: SortOrder;
}

interface LocationState { toast?: string }

const INITIAL_FILTERS: FilterDraft = { search: '', active: '', sortBy: 'name', sortOrder: 'asc' };

function toQuery(filters: FilterDraft, page = 1): ListClientsParams {
  return {
    page,
    pageSize: 10,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.active ? { active: filters.active === 'true' } : {}),
  };
}

export function ClientsPage() {
  const { token, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as LocationState | null;
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ANALISTA';
  const canChangeStatus = user?.role === 'ADMIN';
  const [filters, setFilters] = useState<FilterDraft>(INITIAL_FILTERS);
  const [query, setQuery] = useState<ListClientsParams>(() => toQuery(INITIAL_FILTERS));
  const [clients, setClients] = useState<ManagedClient[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(routeState?.toast ?? '');
  const [statusTarget, setStatusTarget] = useState<ManagedClient | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (routeState?.toast) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, navigate, routeState?.toast]);

  useEffect(() => {
    let mounted = true;
    async function loadClients(): Promise<void> {
      if (!token) return;
      setIsLoading(true);
      setError('');
      try {
        const response = await clientsApi.list(token, query);
        if (mounted) {
          setClients(response.data);
          setPagination(response.pagination);
        }
      } catch (requestError: unknown) {
        if (mounted) setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar os clientes.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void loadClients();
    return () => { mounted = false; };
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

  async function confirmStatusChange(): Promise<void> {
    if (!statusTarget || !token || !canChangeStatus) return;
    const newStatus = !statusTarget.active;
    setIsUpdatingStatus(true);
    try {
      await clientsApi.updateStatus(token, statusTarget.id, newStatus);
      setToast(`Cliente ${newStatus ? 'ativado' : 'inativado'} com sucesso.`);
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
    <main className="content-page" data-testid="clients-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RELACIONAMENTO</p>
          <h1>Gestão de Clientes</h1>
          <p className="subtitle">Consulte e mantenha os clientes da operação.</p>
        </div>
        {canEdit && <Link to="/clients/new" className="button-link" data-testid="clients-new-button">+ Novo Cliente</Link>}
      </div>

      <form className="filters-card client-filters" onSubmit={handleSearch}>
        <div className="filter-field filter-search">
          <label htmlFor="clients-search">Nome, documento ou e-mail</label>
          <input id="clients-search" data-testid="clients-search" value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
        </div>
        <div className="filter-field">
          <label htmlFor="clients-status-filter">Status</label>
          <select id="clients-status-filter" data-testid="clients-status-filter" value={filters.active}
            onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value as FilterDraft['active'] }))}>
            <option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="clients-sort-by">Ordenar por</label>
          <select id="clients-sort-by" data-testid="clients-sort-by" value={filters.sortBy}
            onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value as ClientSortField }))}>
            <option value="name">Nome</option><option value="document">Documento</option>
            <option value="email">E-mail</option><option value="createdAt">Data de criação</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="clients-sort-order">Ordem</label>
          <select id="clients-sort-order" data-testid="clients-sort-order" value={filters.sortOrder}
            onChange={(event) => setFilters((current) => ({ ...current, sortOrder: event.target.value as SortOrder }))}>
            <option value="asc">Crescente</option><option value="desc">Decrescente</option>
          </select>
        </div>
        <div className="filter-actions">
          <button type="submit" className="primary-button compact-button" data-testid="clients-search-button">Pesquisar</button>
          <button type="button" className="secondary-button" data-testid="clients-clear-button" onClick={handleClear}>Limpar</button>
        </div>
      </form>

      {error && <div className="form-error" role="alert">{error}</div>}
      <section className="table-card" aria-busy={isLoading}>
        <div className="table-summary">{pagination.total} cliente(s)</div>
        <div className="table-scroll">
          <table data-testid="clients-table">
            <thead><tr><th>Nome</th><th>Documento</th><th>E-mail</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="table-message">Carregando clientes...</td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={5} className="table-message">Nenhum cliente encontrado.</td></tr>
              ) : clients.map((client) => (
                <tr key={client.id} data-testid="client-row" data-client-id={client.id}>
                  <td data-testid="client-name"><strong>{client.name}</strong></td>
                  <td data-testid="client-document">{client.document}</td>
                  <td data-testid="client-email">{client.email}</td>
                  <td data-testid="client-status"><span className={`status-badge ${client.active ? 'status-active' : 'status-inactive'}`}>{client.active ? 'Ativo' : 'Inativo'}</span></td>
                  <td><div className="row-actions">
                    <Link to={`/clients/${client.id}`}>Visualizar</Link>
                    {canEdit && <Link to={`/clients/${client.id}/edit`}>Editar</Link>}
                    {canChangeStatus && <button type="button" onClick={() => setStatusTarget(client)}>{client.active ? 'Inativar' : 'Ativar'}</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.totalPages > 1 && <nav className="pagination" aria-label="Paginação de clientes">
          <button type="button" disabled={pagination.page === 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>‹ Anterior</button>
          {Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => (
            <button key={page} type="button" className={page === pagination.page ? 'current-page' : ''}
              aria-current={page === pagination.page ? 'page' : undefined}
              onClick={() => setQuery((current) => ({ ...current, page }))}>{page}</button>
          ))}
          <button type="button" disabled={pagination.page === pagination.totalPages}
            onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Próximo ›</button>
        </nav>}
      </section>

      {statusTarget && <StatusModal entityLabel="cliente" entityName={statusTarget.name} active={statusTarget.active}
        isSubmitting={isUpdatingStatus} testIdPrefix="client" onCancel={() => setStatusTarget(null)}
        onConfirm={() => void confirmStatusChange()} />}
      {toast && <Toast message={toast} type={toast.includes('sucesso') ? 'success' : 'error'} onDismiss={dismissToast} />}
    </main>
  );
}
