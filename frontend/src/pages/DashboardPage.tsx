import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { dashboardApi } from '../services/dashboard.service';
import type { DashboardSummary } from '../types/dashboard';
import { ORDER_STATUS_LABELS, type OrderStatus } from '../types/order';
import { decimalToCents, formatCents } from '../utils/currency';

const recentDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

interface MetricCardProps {
  label: string;
  value: ReactNode;
  testId: string;
  tone?: 'default' | 'warning' | 'success' | 'danger';
}

function MetricCard({ label, value, testId, tone = 'default' }: MetricCardProps) {
  return (
    <article className={`dashboard-metric dashboard-metric-${tone}`} data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" data-testid="dashboard-loading" aria-busy="true" aria-label="Carregando dashboard">
      {Array.from({ length: 8 }, (_, index) => <span key={index} aria-hidden="true" />)}
    </div>
  );
}

function statusClass(status: OrderStatus): string {
  return `status-badge order-status-${status.toLowerCase()}`;
}

export function DashboardPage() {
  const { user, token } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadDashboard = useCallback(async (): Promise<void> => {
    if (!token) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const data = await dashboardApi.summary(token);
      if (version === requestVersion.current) setSummary(data);
    } catch {
      if (version === requestVersion.current) {
        setSummary(null);
        setError('Não foi possível carregar os dados do dashboard.');
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDashboard();
    return () => { requestVersion.current += 1; };
  }, [loadDashboard]);

  if (!user || !token) return null;

  const maxStatus = Math.max(1, ...(summary?.orders.byStatus.map((item) => item.count) ?? []));
  const maxDaily = Math.max(1, ...(summary?.orders.last30Days.map((item) => item.count) ?? []));

  return (
    <main className="content-page dashboard-page" data-testid="dashboard-page">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">VISÃO OPERACIONAL</p>
          <h1>Dashboard</h1>
          <p className="subtitle">
            Dados reais do PostgreSQL para <span data-testid="user-name">{user.name}</span>
            {' · '}<span data-testid="user-role">{user.role}</span>
          </p>
        </div>
        <button
          type="button"
          className="secondary-button dashboard-refresh"
          data-testid="dashboard-refresh"
          onClick={() => void loadDashboard()}
          disabled={loading}
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </header>

      {loading && <DashboardSkeleton />}

      {!loading && error && (
        <section className="dashboard-error" role="alert" data-testid="dashboard-error">
          <strong>{error}</strong>
          <button type="button" className="primary-button compact-button" onClick={() => void loadDashboard()}>
            Tentar novamente
          </button>
        </section>
      )}

      {!loading && summary && (
        <>
          <section className="dashboard-metrics" aria-label="Indicadores principais">
            <MetricCard label="Clientes ativos" value={summary.clients.active} testId="dashboard-active-clients" />
            <MetricCard label="Produtos ativos" value={summary.products.active} testId="dashboard-active-products" />
            <MetricCard label="Produtos sem estoque" value={summary.products.outOfStock} testId="dashboard-out-of-stock" tone="warning" />
            <MetricCard label="Pedidos pendentes" value={summary.orders.pending} testId="dashboard-orders-pending" tone="warning" />
            <MetricCard label="Em processamento" value={summary.orders.processing} testId="dashboard-orders-processing" />
            <MetricCard label="Concluídos" value={summary.orders.completed} testId="dashboard-orders-completed" tone="success" />
            <MetricCard label="Cancelados" value={summary.orders.cancelled} testId="dashboard-orders-cancelled" tone="danger" />
            <MetricCard
              label="Receita concluída"
              value={formatCents(decimalToCents(summary.revenue.completed))}
              testId="dashboard-revenue"
              tone="success"
            />
          </section>

          <section className="dashboard-visuals" aria-label="Gráficos do dashboard">
            <article className="dashboard-panel">
              <div className="dashboard-panel-heading">
                <div><p className="eyebrow">DISTRIBUIÇÃO</p><h2>Pedidos por status</h2></div>
              </div>
              <div className="status-chart" role="img" aria-label="Quantidade de pedidos por status">
                {summary.orders.byStatus.map((item) => (
                  <div className="status-chart-row" key={item.status}>
                    <span>{ORDER_STATUS_LABELS[item.status]}</span>
                    <div className="status-chart-track">
                      <i style={{ width: `${Math.max(3, (item.count / maxStatus) * 100)}%` }} />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-panel dashboard-daily-panel">
              <div className="dashboard-panel-heading">
                <div><p className="eyebrow">ÚLTIMOS 30 DIAS</p><h2>Pedidos por dia</h2></div>
                <small>Agregação diária em UTC</small>
              </div>
              <div className="daily-chart" role="img" aria-label="Quantidade de pedidos por dia nos últimos 30 dias">
                {summary.orders.last30Days.map((item, index) => (
                  <div
                    className="daily-chart-column"
                    key={item.date}
                    aria-label={`${item.date}: ${item.count} pedido(s)`}
                    title={`${item.date}: ${item.count} pedido(s)`}
                  >
                    <i style={{ height: `${Math.max(4, (item.count / maxDaily) * 100)}%` }} />
                    {(index === 0 || index === 14 || index === 29) && (
                      <span>{dayFormatter.format(new Date(`${item.date}T00:00:00.000Z`))}</span>
                    )}
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="dashboard-tables">
            <article className="dashboard-panel" data-testid="dashboard-recent-orders">
              <div className="dashboard-panel-heading">
                <div><p className="eyebrow">ATIVIDADE</p><h2>Últimos pedidos</h2></div>
                <Link to="/orders">Ver todos</Link>
              </div>
              {summary.orders.recent.length === 0 ? (
                <p className="dashboard-empty">Nenhum pedido cadastrado.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Número</th><th>Cliente</th><th>Status</th><th>Total</th><th>Data</th></tr></thead>
                    <tbody>
                      {summary.orders.recent.map((order) => (
                        <tr key={order.id}>
                          <td><Link to={`/orders/${order.id}`}>{order.number}</Link></td>
                          <td>{order.clientName}</td>
                          <td><span className={statusClass(order.status)}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                          <td>{formatCents(decimalToCents(order.total))}</td>
                          <td>{recentDateFormatter.format(new Date(order.createdAt))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="dashboard-panel" data-testid="dashboard-low-stock">
              <div className="dashboard-panel-heading">
                <div><p className="eyebrow">ATENÇÃO</p><h2>Estoque baixo</h2></div>
                <small>Produtos ativos com até 5 unidades</small>
              </div>
              {summary.products.lowStock.length === 0 ? (
                <p className="dashboard-empty">Nenhum produto com estoque baixo.</p>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Produto</th><th>SKU</th><th>Estoque</th></tr></thead>
                    <tbody>
                      {summary.products.lowStock.map((product) => (
                        <tr key={product.id}>
                          <td>{product.name}</td>
                          <td>{product.sku}</td>
                          <td><strong className={product.stock === 0 ? 'stock-critical' : 'stock-low'}>{product.stock}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          <p className="dashboard-updated-at">
            Atualizado em {recentDateFormatter.format(new Date(summary.generatedAt))}. Dias do gráfico agrupados em {summary.timezone}.
          </p>
        </>
      )}
    </main>
  );
}
