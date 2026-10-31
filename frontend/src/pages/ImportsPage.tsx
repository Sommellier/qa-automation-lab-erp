import { useState } from 'react';
import { ImportHistory } from '../components/imports/ImportHistory';
import { ImportPanel } from '../components/imports/ImportPanel';

type Tab = 'clients' | 'products' | 'history';
export function ImportsPage() {
  const [tab, setTab] = useState<Tab>('clients');
  return <main className="content-page imports-page" data-testid="imports-page"><header className="page-heading"><div><p className="eyebrow">PROCESSAMENTO EM LOTE</p><h1>Importações</h1><p className="subtitle">Valide arquivos CSV antes de persistir clientes ou produtos.</p></div></header><div className="reports-tabs imports-tabs" role="tablist" aria-label="Tipos de importação"><button type="button" role="tab" aria-selected={tab === 'clients'} className={tab === 'clients' ? 'active' : ''} data-testid="clients-import-tab" onClick={() => setTab('clients')}>Clientes</button><button type="button" role="tab" aria-selected={tab === 'products'} className={tab === 'products' ? 'active' : ''} data-testid="products-import-tab" onClick={() => setTab('products')}>Produtos</button><button type="button" role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} data-testid="imports-history-tab" onClick={() => setTab('history')}>Histórico</button></div><div role="tabpanel" aria-label={tab === 'history' ? 'Histórico de importações' : `Importação de ${tab === 'clients' ? 'Clientes' : 'Produtos'}`}>{tab === 'clients' && <ImportPanel type="CLIENTS" />}{tab === 'products' && <ImportPanel type="PRODUCTS" />}{tab === 'history' && <ImportHistory />}</div></main>;
}
