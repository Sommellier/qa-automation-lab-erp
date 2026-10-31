import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { reportsApi } from '../../services/report.service';
import type { RevenueReportParams, RevenueReportResponse } from '../../types/report';
import { formatCurrency } from '../../utils/currency';
import { defaultReportPeriod, ReportError, ReportLoading, ReportMetric, validPeriod } from './ReportUi';

const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const initial = defaultReportPeriod();

export function RevenueReport() {
  const { token } = useAuth(); const [draft, setDraft] = useState(initial); const [query, setQuery] = useState<RevenueReportParams>(initial); const [response, setResponse] = useState<RevenueReportResponse | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [validation, setValidation] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; async function load() { if (!token) return; setLoading(true); setError(false); try { const data = await reportsApi.revenue(token, query); if (active) setResponse(data); } catch { if (active) { setResponse(null); setError(true); } } finally { if (active) setLoading(false); } } void load(); return () => { active = false; }; }, [query, retry, token]);
  function apply(event: FormEvent) { event.preventDefault(); if (!validPeriod(draft.dateFrom, draft.dateTo)) { setValidation('A data inicial não pode ser posterior à data final.'); return; } setValidation(''); setQuery(draft); }
  function clear() { const defaults = defaultReportPeriod(); setDraft(defaults); setValidation(''); setQuery(defaults); }
  if (loading) return <ReportLoading />; if (error || !response) return <ReportError onRetry={() => setRetry((value) => value + 1)} />;
  const maxRevenue = Math.max(1, ...response.daily.map((entry) => Number(entry.revenue)));
  return <section data-testid="revenue-report">
    <form className="filters-card revenue-filters" onSubmit={apply}>
      <div className="filter-field"><label htmlFor="revenue-report-from">Data inicial</label><input id="revenue-report-from" data-testid="reports-date-from" type="date" value={draft.dateFrom} onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} /></div>
      <div className="filter-field"><label htmlFor="revenue-report-to">Data final</label><input id="revenue-report-to" data-testid="reports-date-to" type="date" value={draft.dateTo} onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} /></div>
      {validation && <div className="form-error report-filter-error" role="alert">{validation}</div>}<div className="filter-actions"><button type="submit" className="primary-button compact-button" data-testid="reports-apply">Aplicar filtros</button><button type="button" className="secondary-button" data-testid="reports-clear" onClick={clear}>Limpar</button></div>
    </form>
    <div className="reports-metrics"><ReportMetric label="Faturamento total" value={formatCurrency(response.indicators.totalRevenue)} testId="revenue-total" tone="success" /><ReportMetric label="Pedidos concluídos" value={response.indicators.completedOrders} tone="success" /><ReportMetric label="Ticket médio" value={formatCurrency(response.indicators.averageTicket)} testId="revenue-average-ticket" /><ReportMetric label="Maior pedido" value={formatCurrency(response.indicators.largestOrder)} testId="revenue-largest-order" /><ReportMetric label="Menor pedido" value={formatCurrency(response.indicators.smallestOrder)} testId="revenue-smallest-order" /><ReportMetric label="Cancelados no período" value={response.indicators.cancelledOrders} tone="danger" /><ReportMetric label="Valor cancelado*" value={formatCurrency(response.indicators.cancelledValue)} tone="warning" /></div>
    <p className="report-note">* Valor operacional dos pedidos cancelados; não representa faturamento perdido contabilmente.</p>
    <article className="dashboard-panel report-revenue-chart"><div className="dashboard-panel-heading"><div><p className="eyebrow">REALIZADO</p><h2>Faturamento por dia</h2></div><small>Somente pedidos concluídos · UTC</small></div>{response.daily.length === 0 ? <p className="dashboard-empty">Nenhum faturamento no período selecionado.</p> : <div className="daily-chart revenue-chart" role="img" aria-label="Faturamento concluído por dia">{response.daily.map((entry) => <div className="daily-chart-column" key={entry.date} title={`${entry.date}: ${formatCurrency(entry.revenue)}`} aria-label={`${entry.date}: ${formatCurrency(entry.revenue)}`}><i style={{ height: `${Math.max(4, (Number(entry.revenue) / maxRevenue) * 100)}%` }} /><span>{dateLabel.format(new Date(`${entry.date}T00:00:00.000Z`))}</span></div>)}</div>}</article>
    <section className="reports-rankings">
      <article className="dashboard-panel" data-testid="top-products"><div className="dashboard-panel-heading"><div><p className="eyebrow">TOP 10</p><h2>Produtos mais vendidos</h2></div></div>{response.topProducts.length === 0 ? <p className="dashboard-empty">Nenhum produto vendido no período.</p> : <div className="table-scroll"><table><thead><tr><th>Produto</th><th>SKU</th><th>Quantidade</th><th>Faturamento</th></tr></thead><tbody>{response.topProducts.map((product) => <tr key={`${product.productId}-${product.sku}`}><td>{product.product}</td><td>{product.sku}</td><td>{product.quantity}</td><td>{formatCurrency(product.revenue)}</td></tr>)}</tbody></table></div>}</article>
      <article className="dashboard-panel" data-testid="top-clients"><div className="dashboard-panel-heading"><div><p className="eyebrow">TOP 10</p><h2>Clientes com maior faturamento</h2></div></div>{response.topClients.length === 0 ? <p className="dashboard-empty">Nenhum cliente com faturamento no período.</p> : <div className="table-scroll"><table><thead><tr><th>Cliente</th><th>Documento</th><th>Pedidos</th><th>Valor total</th></tr></thead><tbody>{response.topClients.map((client) => <tr key={client.clientId}><td>{client.client}</td><td>{client.document}</td><td>{client.orders}</td><td>{formatCurrency(client.revenue)}</td></tr>)}</tbody></table></div>}</article>
    </section>
  </section>;
}
