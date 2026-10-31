import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { StatusModal } from '../components/StatusModal';
import { Toast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { categoriesApi } from '../services/category.service';
import { productsApi } from '../services/product.service';
import type { CategoryOption } from '../types/category';
import type { ListProductsParams, ManagedProduct, ProductSortField, SortOrder } from '../types/product';
import { formatCurrency } from '../utils/currency';

interface FilterDraft { search: string; categoryId: string; active: '' | 'true' | 'false'; sortBy: ProductSortField; sortOrder: SortOrder }
const initial: FilterDraft = { search: '', categoryId: '', active: '', sortBy: 'name', sortOrder: 'asc' };
const params = (filters: FilterDraft, page = 1): ListProductsParams => ({ page, pageSize: 10, sortBy: filters.sortBy, sortOrder: filters.sortOrder,
  ...(filters.search ? { search: filters.search } : {}), ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
  ...(filters.active ? { active: filters.active === 'true' } : {}) });

export function ProductsPage() {
  const { token, user } = useAuth(); const location = useLocation(); const navigate = useNavigate();
  const routeToast = (location.state as { toast?: string } | null)?.toast ?? '';
  const canEdit = user?.role === 'ADMIN' || user?.role === 'ANALISTA'; const canStatus = user?.role === 'ADMIN';
  const [filters, setFilters] = useState(initial); const [query, setQuery] = useState<ListProductsParams>(() => params(initial));
  const [products, setProducts] = useState<ManagedProduct[]>([]); const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [toast, setToast] = useState(routeToast);
  const [target, setTarget] = useState<ManagedProduct | null>(null); const [saving, setSaving] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => { if (routeToast) navigate(location.pathname, { replace: true, state: null }); }, [location.pathname, navigate, routeToast]);
  useEffect(() => { if (token) void categoriesApi.options(token, true).then(setCategories).catch(() => setCategories([])); }, [token]);
  useEffect(() => { let active = true; async function load() { if (!token) return; setLoading(true); setError(''); try { const response = await productsApi.list(token, query); if (active) { setProducts(response.data); setPagination(response.pagination); } } catch (requestError) { if (active) setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar os produtos.'); } finally { if (active) setLoading(false); } } void load(); return () => { active = false; }; }, [query, reload, token]);
  const dismiss = useCallback(() => setToast(''), []);
  function search(event: FormEvent) { event.preventDefault(); setQuery(params(filters)); }
  function clear() { setFilters(initial); setQuery(params(initial)); }
  async function confirm() { if (!target || !token || !canStatus) return; const active = !target.active; setSaving(true); try { await productsApi.updateStatus(token, target.id, active); setToast(`Produto ${active ? 'ativado' : 'inativado'} com sucesso.`); setTarget(null); setReload((value) => value + 1); } catch (requestError) { setTarget(null); setToast(requestError instanceof ApiError ? requestError.message : 'Não foi possível alterar o status.'); } finally { setSaving(false); } }
  return <main className="content-page" data-testid="products-page">
    <div className="page-heading"><div><p className="eyebrow">CATÁLOGO</p><h1>Gestão de Produtos</h1><p className="subtitle">Gerencie catálogo, preços e disponibilidade.</p></div>{canEdit && <Link to="/products/new" className="button-link" data-testid="products-new-button">+ Novo Produto</Link>}</div>
    <form className="filters-card product-filters" onSubmit={search}>
      <div className="filter-field filter-search"><label htmlFor="products-search">Nome ou SKU</label><input id="products-search" data-testid="products-search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></div>
      <div className="filter-field"><label htmlFor="products-category-filter">Categoria</label><select id="products-category-filter" data-testid="products-category-filter" value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Todas</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.active === false ? ' (inativa)' : ''}</option>)}</select></div>
      <div className="filter-field"><label htmlFor="products-status-filter">Status</label><select id="products-status-filter" data-testid="products-status-filter" value={filters.active} onChange={(event) => setFilters((current) => ({ ...current, active: event.target.value as FilterDraft['active'] }))}><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></div>
      <div className="filter-field"><label htmlFor="products-sort-by">Ordenar por</label><select id="products-sort-by" data-testid="products-sort-by" value={filters.sortBy} onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value as ProductSortField }))}><option value="name">Nome</option><option value="sku">SKU</option><option value="price">Preço</option><option value="stock">Estoque</option><option value="createdAt">Data de criação</option></select></div>
      <div className="filter-field"><label htmlFor="products-sort-order">Ordem</label><select id="products-sort-order" data-testid="products-sort-order" value={filters.sortOrder} onChange={(event) => setFilters((current) => ({ ...current, sortOrder: event.target.value as SortOrder }))}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></div>
      <div className="filter-actions"><button type="submit" className="primary-button compact-button" data-testid="products-search-button">Pesquisar</button><button type="button" className="secondary-button" data-testid="products-clear-button" onClick={clear}>Limpar</button></div>
    </form>
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="table-card" aria-busy={loading}><div className="table-summary">{pagination.total} produto(s)</div><div className="table-scroll"><table data-testid="products-table"><thead><tr><th>Nome</th><th>SKU</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={7} className="table-message">Carregando produtos...</td></tr> : products.length === 0 ? <tr><td colSpan={7} className="table-message">Nenhum produto encontrado.</td></tr> : products.map((product) => <tr key={product.id} data-testid="product-row"><td data-testid="product-name"><strong>{product.name}</strong></td><td data-testid="product-sku">{product.sku}</td><td data-testid="product-category">{product.category.name}</td><td data-testid="product-price">{formatCurrency(product.price)}</td><td data-testid="product-stock">{product.stock === 0 ? 'Sem estoque' : `${product.stock} unidades`}</td><td data-testid="product-status"><span className={`status-badge ${product.active ? 'status-active' : 'status-inactive'}`}>{product.active ? 'Ativo' : 'Inativo'}</span></td><td><div className="row-actions"><Link to={`/products/${product.id}`}>Visualizar</Link><Link to={`/products/${product.id}/stock`}>Estoque</Link>{canEdit && <Link to={`/products/${product.id}/edit`}>Editar</Link>}{canStatus && <button type="button" onClick={() => setTarget(product)}>{product.active ? 'Inativar' : 'Ativar'}</button>}</div></td></tr>)}</tbody></table></div>
      {pagination.totalPages > 1 && <nav className="pagination" aria-label="Paginação de produtos"><button type="button" disabled={pagination.page === 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>‹ Anterior</button>{Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => <button key={page} type="button" className={page === pagination.page ? 'current-page' : ''} onClick={() => setQuery((current) => ({ ...current, page }))}>{page}</button>)}<button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>Próximo ›</button></nav>}
    </section>
    {target && <StatusModal entityLabel="produto" entityName={target.name} active={target.active} isSubmitting={saving} testIdPrefix="product" onCancel={() => setTarget(null)} onConfirm={() => void confirm()} />}
    {toast && <Toast message={toast} type={toast.includes('sucesso') ? 'success' : 'error'} onDismiss={dismiss} />}
  </main>;
}
