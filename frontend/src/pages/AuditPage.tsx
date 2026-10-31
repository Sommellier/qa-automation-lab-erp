import { useEffect, useState, type FormEvent } from 'react';
import { AuditDetailsModal } from '../components/AuditDetailsModal';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { auditApi } from '../services/audit.service';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, type AuditAction, type AuditEntity, type AuditLog, type ListAuditParams } from '../types/audit';

interface FilterDraft {
  entityType: '' | AuditEntity;
  action: '' | AuditAction;
  search: string;
  dateFrom: string;
  dateTo: string;
  sortOrder: 'asc' | 'desc';
}

const INITIAL_FILTERS: FilterDraft = { entityType: '', action: '', search: '', dateFrom: '', dateTo: '', sortOrder: 'desc' };

function toQuery(filters: FilterDraft, page = 1): ListAuditParams {
  return {
    page, pageSize: 20, sortOrder: filters.sortOrder,
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.search ? { search: filters.search.trim() } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  };
}

function recordLabel(log: AuditLog): string {
  const data = log.newData ?? log.oldData ?? {};
  const label = data.number ?? data.sku ?? data.name ?? data.email ?? data.fileName;
  return typeof label === 'string' ? label : log.entityId;
}

export function AuditPage() {
  const { token } = useAuth();
  const [filters, setFilters] = useState<FilterDraft>(INITIAL_FILTERS);
  const [query, setQuery] = useState<ListAuditParams>(() => toQuery(INITIAL_FILTERS));
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      if (!token) return;
      setIsLoading(true); setError('');
      try {
        const response = await auditApi.list(token, query);
        if (active) { setLogs(response.data); setPagination(response.pagination); }
      } catch (requestError: unknown) {
        if (active) setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar o histórico de auditoria.');
      } finally { if (active) setIsLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [query, token]);

  function search(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); setQuery(toQuery(filters)); }
  function clear(): void { setFilters(INITIAL_FILTERS); setQuery(toQuery(INITIAL_FILTERS)); }

  return <main className="content-page audit-page" data-testid="audit-page">
    <div className="page-heading"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Histórico de Auditoria</h1><p className="subtitle">Consulte ações concluídas, alterações e eventos relevantes de segurança.</p></div></div>
    <form className="filters-card audit-filters" onSubmit={search}>
      <div className="filter-field"><label htmlFor="audit-entity-filter">Entidade</label><select id="audit-entity-filter" data-testid="audit-entity-filter" value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value as FilterDraft['entityType'] }))}><option value="">Todas</option>{Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="filter-field"><label htmlFor="audit-action-filter">Ação</label><select id="audit-action-filter" data-testid="audit-action-filter" value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value as FilterDraft['action'] }))}><option value="">Todas</option>{Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className="filter-field filter-search"><label htmlFor="audit-user-search">Usuário ou ID do registro</label><input id="audit-user-search" data-testid="audit-user-search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Nome, e-mail ou ID" /></div>
      <div className="filter-field"><label htmlFor="audit-date-from">Data inicial</label><input id="audit-date-from" data-testid="audit-date-from" type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></div>
      <div className="filter-field"><label htmlFor="audit-date-to">Data final</label><input id="audit-date-to" data-testid="audit-date-to" type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /></div>
      <div className="filter-field"><label htmlFor="audit-sort-order">Ordem</label><select id="audit-sort-order" data-testid="audit-sort-order" value={filters.sortOrder} onChange={(event) => setFilters((current) => ({ ...current, sortOrder: event.target.value as FilterDraft['sortOrder'] }))}><option value="desc">Mais recentes</option><option value="asc">Mais antigos</option></select></div>
      <div className="filter-actions"><button type="submit" className="primary-button compact-button" data-testid="audit-search-button">Pesquisar</button><button type="button" className="secondary-button" data-testid="audit-clear-button" onClick={clear}>Limpar</button></div>
    </form>
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="table-card" aria-busy={isLoading}>
      <div className="table-summary">{pagination.total} evento(s)</div>
      <div className="table-scroll"><table data-testid="audit-table"><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Entidade</th><th>Ação</th><th>Registro</th><th>Ações</th></tr></thead><tbody>
        {isLoading ? <tr><td colSpan={6} className="table-message">Carregando histórico...</td></tr> : logs.length === 0 ? <tr><td colSpan={6} className="table-message">Nenhum evento encontrado.</td></tr> : logs.map((log) => <tr key={log.id} data-testid="audit-row" data-audit-id={log.id}><td>{new Date(log.createdAt).toLocaleString('pt-BR')}</td><td>{log.user?.name ?? (log.entityType === 'SECURITY' ? 'Identidade protegida' : 'Usuário removido')}{log.user && <small className="table-secondary">{log.user.email}</small>}</td><td><span className="role-badge">{AUDIT_ENTITY_LABELS[log.entityType]}</span></td><td><span className={`audit-action audit-action-${log.action.toLowerCase()}`}>{AUDIT_ACTION_LABELS[log.action]}</span></td><td><strong>{recordLabel(log)}</strong><small className="table-secondary">{log.entityId}</small></td><td><div className="row-actions"><button type="button" onClick={() => setSelected(log)}>Ver detalhes</button></div></td></tr>)}
      </tbody></table></div>
      {pagination.totalPages > 1 && <nav className="pagination" aria-label="Paginação da auditoria"><button type="button" disabled={pagination.page === 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>‹ Anterior</button>{Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => <button key={page} type="button" className={page === pagination.page ? 'current-page' : ''} aria-current={page === pagination.page ? 'page' : undefined} onClick={() => setQuery((current) => ({ ...current, page }))}>{page}</button>)}<button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Próximo ›</button></nav>}
    </section>
    {selected && <AuditDetailsModal log={selected} onClose={() => setSelected(null)} />}
  </main>;
}
