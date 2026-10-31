import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { quotesApi } from '../services/quote.service';
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, type QuoteStatus, type QuoteSummary } from '../types/quote';
import { formatCurrency } from '../utils/currency';

function date(value: string): string { return new Intl.DateTimeFormat('pt-BR').format(new Date(value)); }

export function QuotesPage() {
  const { token, user } = useAuth();
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]); const [search, setSearch] = useState(''); const [status, setStatus] = useState<QuoteStatus | ''>('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { if (!token) return; setLoading(true); setError(''); try { const result = await quotesApi.list(token, { search: search || undefined, status: status || undefined }); setQuotes(result.data); } catch (requestError) { setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar os orçamentos.'); } finally { setLoading(false); } }, [search, status, token]);
  useEffect(() => { void load(); }, [load]);
  function filter(event: FormEvent) { event.preventDefault(); void load(); }
  return <main className="content-page" data-testid="quotes-page">
    <div className="page-heading"><div><p className="eyebrow">CICLO COMERCIAL</p><h1>Orçamentos</h1><p className="subtitle">Negociação, aprovação por alçada, reserva temporária e conversão em pedido.</p></div><div className="heading-actions">{user?.role === 'ADMIN' && <Link className="secondary-link" to="/quotes/settings">Alçadas e comissões</Link>}<Link className="secondary-link" to="/quotes/commissions">Relatório de comissões</Link>{user?.role !== 'VISUALIZADOR' && <Link className="primary-link" to="/quotes/new">Novo orçamento</Link>}</div></div>
    <form className="filters-card" onSubmit={filter}><div className="field-group"><label htmlFor="quote-search">Buscar</label><input id="quote-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número, cliente ou vendedor" /></div><div className="field-group"><label htmlFor="quote-status">Status</label><select id="quote-status" value={status} onChange={(event) => setStatus(event.target.value as QuoteStatus | '')}><option value="">Todos</option>{QUOTE_STATUSES.map((value) => <option key={value} value={value}>{QUOTE_STATUS_LABELS[value]}</option>)}</select></div><button className="secondary-button">Filtrar</button></form>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="table-scroll"><table><thead><tr><th>Orçamento</th><th>Cliente</th><th>Vendedor</th><th>Status</th><th>Validade</th><th>Desconto</th><th>Total</th><th>Pedido</th></tr></thead><tbody>{loading ? <tr><td colSpan={8} className="table-message">Carregando...</td></tr> : !quotes.length ? <tr><td colSpan={8} className="table-message">Nenhum orçamento encontrado.</td></tr> : quotes.map((quote) => <tr key={quote.id}><td><Link to={`/quotes/${quote.id}`}><strong>{quote.number}</strong></Link><small className="table-secondary">{quote.itemsCount} item(ns) · {date(quote.createdAt)}</small></td><td>{quote.client.name}</td><td>{quote.seller.name}</td><td><span className={`status-badge status-${quote.status.toLowerCase()}`}>{QUOTE_STATUS_LABELS[quote.status]}</span></td><td>{date(quote.validUntil)}</td><td>{Number(quote.discountPercent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%<small className="table-secondary">{formatCurrency(quote.discountTotal)}</small></td><td><strong>{formatCurrency(quote.total)}</strong></td><td>{quote.order ? <Link to={`/orders/${quote.order.id}`}>{quote.order.number}</Link> : '—'}</td></tr>)}</tbody></table></div>
  </main>;
}
