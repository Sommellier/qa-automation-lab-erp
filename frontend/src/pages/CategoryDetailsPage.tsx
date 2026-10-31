import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { categoriesApi } from '../services/category.service';
import type { ManagedCategory } from '../types/category';

const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function CategoryDetailsPage() {
  const { id } = useParams<{ id: string }>(); const { token, user } = useAuth(); const [category, setCategory] = useState<ManagedCategory | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const canEdit = user?.role === 'ADMIN' || user?.role === 'ANALISTA';
  useEffect(() => { let active = true; async function load() { if (!id || !token) return; try { const result = await categoriesApi.getById(token, id); if (active) setCategory(result); } catch (requestError) { if (active) setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar a categoria.'); } finally { if (active) setLoading(false); } } void load(); return () => { active = false; }; }, [id, token]);
  if (loading) return <LoadingScreen />; if (!category || error) return <main className="centered-page"><section className="message-card"><h1>Categoria não disponível</h1><p role="alert">{error || 'Categoria não encontrada.'}</p><Link to="/categories" className="button-link">Voltar para categorias</Link></section></main>;
  return <main className="content-page form-page" data-testid="category-details-page"><div className="page-heading"><div><p className="eyebrow">GESTÃO DE CATEGORIAS</p><h1>Detalhes da categoria</h1><p className="subtitle">Visualização somente leitura.</p></div>{canEdit && <Link to={`/categories/${category.id}/edit`} className="button-link">Editar categoria</Link>}</div><section className="details-card"><dl className="details-grid"><div><dt>Nome</dt><dd data-testid="category-name">{category.name}</dd></div><div><dt>Status</dt><dd data-testid="category-status"><span className={`status-badge ${category.active ? 'status-active' : 'status-inactive'}`}>{category.active ? 'Ativa' : 'Inativa'}</span></dd></div><div className="details-wide"><dt>Descrição</dt><dd data-testid="category-description">{category.description || 'Não informada'}</dd></div><div><dt>Produtos vinculados</dt><dd>{category.productCount}</dd></div><div><dt>Data de criação</dt><dd>{date(category.createdAt)}</dd></div><div><dt>Última atualização</dt><dd>{date(category.updatedAt)}</dd></div></dl><div className="form-actions"><Link to="/categories" className="secondary-link">Voltar para categorias</Link></div></section></main>;
}
