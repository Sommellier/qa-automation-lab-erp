import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { StatusModal } from '../components/StatusModal';
import { Toast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { categoriesApi } from '../services/category.service';
import type { CategorySortField, ListCategoriesParams, ManagedCategory } from '../types/category';

interface Draft { search: string; active: '' | 'true' | 'false'; sortBy: CategorySortField; sortOrder: 'asc' | 'desc' }
const initial: Draft = { search: '', active: '', sortBy: 'name', sortOrder: 'asc' };
const params = (draft: Draft, page = 1): ListCategoriesParams => ({ page, pageSize: 10, sortBy: draft.sortBy, sortOrder: draft.sortOrder, ...(draft.search ? { search: draft.search.trim() } : {}), ...(draft.active ? { active: draft.active === 'true' } : {}) });

export function CategoriesPage() {
  const { token, user } = useAuth(); const location = useLocation(); const navigate = useNavigate();
  const routeToast = (location.state as { toast?: string } | null)?.toast ?? '';
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ANALISTA'; const canStatus = user?.role === 'ADMIN';
  const [draft, setDraft] = useState(initial); const [query, setQuery] = useState<ListCategoriesParams>(() => params(initial));
  const [categories, setCategories] = useState<ManagedCategory[]>([]); const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [toast, setToast] = useState(routeToast);
  const [target, setTarget] = useState<ManagedCategory | null>(null); const [saving, setSaving] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => { if (routeToast) navigate(location.pathname, { replace: true, state: null }); }, [location.pathname, navigate, routeToast]);
  useEffect(() => { let active = true; async function load() { if (!token) return; setLoading(true); setError(''); try { const response = await categoriesApi.list(token, query); if (active) { setCategories(response.data); setPagination(response.pagination); } } catch (requestError) { if (active) setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar as categorias.'); } finally { if (active) setLoading(false); } } void load(); return () => { active = false; }; }, [query, reload, token]);
  const dismiss = useCallback(() => setToast(''), []);
  function search(event: FormEvent) { event.preventDefault(); setQuery(params(draft)); }
  function clear() { setDraft(initial); setQuery(params(initial)); }
  async function confirm() { if (!target || !token || !canStatus) return; const active = !target.active; setSaving(true); try { await categoriesApi.updateStatus(token, target.id, active); setToast(`Categoria ${active ? 'ativada' : 'inativada'} com sucesso.`); setTarget(null); setReload((value) => value + 1); } catch (requestError) { setTarget(null); setToast(requestError instanceof ApiError ? requestError.message : 'Não foi possível alterar o status.'); } finally { setSaving(false); } }
  return <main className="content-page" data-testid="categories-page">
    <div className="page-heading"><div><p className="eyebrow">CATÁLOGO</p><h1>Gestão de Categorias</h1><p className="subtitle">Organize o catálogo de produtos.</p></div>{canEdit && <Link to="/categories/new" className="button-link" data-testid="categories-new-button">+ Nova Categoria</Link>}</div>
    <form className="filters-card" onSubmit={search}><div className="filter-field filter-search"><label htmlFor="categories-search">Nome da categoria</label><input id="categories-search" data-testid="categories-search" value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} /></div><div className="filter-field"><label htmlFor="categories-status-filter">Status</label><select id="categories-status-filter" data-testid="categories-status-filter" value={draft.active} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.value as Draft['active'] }))}><option value="">Todos</option><option value="true">Ativas</option><option value="false">Inativas</option></select></div><div className="filter-field"><label htmlFor="categories-sort">Ordenar por</label><select id="categories-sort" value={draft.sortBy} onChange={(event) => setDraft((current) => ({ ...current, sortBy: event.target.value as CategorySortField }))}><option value="name">Nome</option><option value="createdAt">Criação</option><option value="updatedAt">Atualização</option></select></div><div className="filter-actions"><button type="submit" className="primary-button compact-button" data-testid="categories-search-button">Pesquisar</button><button type="button" className="secondary-button" data-testid="categories-clear-button" onClick={clear}>Limpar</button></div></form>
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="table-card" aria-busy={loading}><div className="table-summary">{pagination.total} categoria(s)</div><div className="table-scroll"><table data-testid="categories-table"><thead><tr><th>Nome</th><th>Produtos</th><th>Status</th><th>Ações</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="table-message">Carregando categorias...</td></tr> : categories.length === 0 ? <tr><td colSpan={4} className="table-message">Nenhuma categoria encontrada.</td></tr> : categories.map((category) => <tr key={category.id} data-testid="category-row"><td data-testid="category-name"><strong>{category.name}</strong></td><td>{category.productCount}</td><td data-testid="category-status"><span className={`status-badge ${category.active ? 'status-active' : 'status-inactive'}`}>{category.active ? 'Ativa' : 'Inativa'}</span></td><td><div className="row-actions"><Link to={`/categories/${category.id}`}>Visualizar</Link>{canEdit && <Link to={`/categories/${category.id}/edit`}>Editar</Link>}{canStatus && <button type="button" onClick={() => setTarget(category)}>{category.active ? 'Inativar' : 'Ativar'}</button>}</div></td></tr>)}</tbody></table></div>
      {pagination.totalPages > 1 && <nav className="pagination" aria-label="Paginação de categorias"><button type="button" disabled={pagination.page === 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>‹ Anterior</button>{Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => <button key={page} type="button" className={page === pagination.page ? 'current-page' : ''} onClick={() => setQuery((current) => ({ ...current, page }))}>{page}</button>)}<button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Próximo ›</button></nav>}
    </section>
    {target && <StatusModal entityLabel="categoria" entityName={target.name} active={target.active} isSubmitting={saving} testIdPrefix="category" onCancel={() => setTarget(null)} onConfirm={() => void confirm()} details={!target.active ? undefined : <>Esta categoria possui <strong>{target.productCount} produto(s)</strong> vinculado(s). Os produtos não serão inativados, mas ela não poderá ser selecionada para novos produtos.</>} />}
    {toast && <Toast message={toast} type={toast.includes('sucesso') ? 'success' : 'error'} onDismiss={dismiss} />}
  </main>;
}
