import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { quotesApi } from '../services/quote.service';
import type { CommissionReport } from '../types/quote';
import { formatCurrency } from '../utils/currency';

function date(value: string): string { return new Intl.DateTimeFormat('pt-BR').format(new Date(value)); }

export function SalesCommissionsPage() {
  const { token } = useAuth(); const [report, setReport] = useState<CommissionReport | null>(null); const [error, setError] = useState('');
  useEffect(() => { if (!token) return; quotesApi.commissions(token).then(setReport).catch((requestError) => setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar as comissões.')); }, [token]);
  return <main className="content-page" data-testid="sales-commissions-page"><div className="page-heading"><div><p className="eyebrow">DESEMPENHO COMERCIAL</p><h1>Comissões de vendas</h1><p className="subtitle">Valores congelados na aprovação e preservados na conversão do pedido.</p></div></div>{error && <div className="form-error" role="alert">{error}</div>}
    <section className="metric-grid">{report?.summary.map((item) => <article className="metric-card" key={item.seller.id}><span>{item.seller.name}</span><strong>{formatCurrency(item.commissionTotal)}</strong><small>{item.orders} pedido(s) · {formatCurrency(item.salesTotal)} em vendas</small></article>)}</section>
    <h2 className="section-title">Pedidos com comissão</h2><div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Orçamento</th><th>Vendedor</th><th>Data</th><th>Venda</th><th>Percentual</th><th>Comissão</th></tr></thead><tbody>{!report ? <tr><td colSpan={7} className="table-message">Carregando...</td></tr> : !report.orders.length ? <tr><td colSpan={7} className="table-message">Nenhuma comissão calculada.</td></tr> : report.orders.map((order) => <tr key={order.id}><td><Link to={`/orders/${order.id}`}>{order.number}</Link></td><td>{order.quote ? <Link to={`/quotes/${order.quote.id}`}>{order.quote.number}</Link> : 'Venda direta'}</td><td>{order.seller.name}</td><td>{date(order.createdAt)}</td><td>{formatCurrency(order.total)}</td><td>{Number(order.commissionRate).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</td><td><strong>{formatCurrency(order.commissionAmount)}</strong></td></tr>)}</tbody></table></div><div className="form-actions"><Link className="secondary-link" to="/quotes">Voltar para orçamentos</Link></div>
  </main>;
}
