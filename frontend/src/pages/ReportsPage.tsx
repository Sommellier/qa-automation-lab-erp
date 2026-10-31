import { useState } from 'react';
import { ClientsReport } from '../components/reports/ClientsReport';
import { OrdersReport } from '../components/reports/OrdersReport';
import { ProductsReport } from '../components/reports/ProductsReport';
import { RevenueReport } from '../components/reports/RevenueReport';

type ReportTab = 'clients' | 'products' | 'orders' | 'revenue';
const tabs: Array<{ id: ReportTab; label: string; testId: string }> = [
  { id: 'clients', label: 'Clientes', testId: 'reports-clients-tab' },
  { id: 'products', label: 'Produtos', testId: 'reports-products-tab' },
  { id: 'orders', label: 'Pedidos', testId: 'reports-orders-tab' },
  { id: 'revenue', label: 'Faturamento', testId: 'reports-revenue-tab' },
];

export function ReportsPage() {
  const [active, setActive] = useState<ReportTab>('clients');
  return <main className="content-page reports-page" data-testid="reports-page">
    <header className="page-heading"><div><p className="eyebrow">ANÁLISE OPERACIONAL</p><h1>Relatórios</h1><p className="subtitle">Indicadores e dados consolidados diretamente do PostgreSQL.</p></div></header>
    <div className="reports-tabs" role="tablist" aria-label="Tipos de relatório">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className={active === tab.id ? 'active' : ''} data-testid={tab.testId} onClick={() => setActive(tab.id)}>{tab.label}</button>)}</div>
    <div role="tabpanel" aria-label={`Relatório de ${tabs.find((tab) => tab.id === active)?.label}`}>
      {active === 'clients' && <ClientsReport />}
      {active === 'products' && <ProductsReport />}
      {active === 'orders' && <OrdersReport />}
      {active === 'revenue' && <RevenueReport />}
    </div>
  </main>;
}
