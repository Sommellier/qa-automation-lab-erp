import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LoadingScreen } from '../components/LoadingScreen';
import { StatusModal } from '../components/StatusModal';
import { Toast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { clientsApi } from '../services/client.service';
import { ADDRESS_TYPE_LABELS, type ClientAddress, type ManagedClient } from '../types/client';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function addressTitle(address: ClientAddress): string { return `${address.street}, ${address.number}`; }

export function ClientDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeToast = (location.state as { toast?: string } | null)?.toast ?? '';
  const [client, setClient] = useState<ManagedClient | null>(null);
  const [addresses, setAddresses] = useState<ClientAddress[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState(routeToast);
  const [statusTarget, setStatusTarget] = useState<ClientAddress | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canEdit = (user?.role === 'ADMIN' || user?.role === 'ANALISTA') && client?.active !== false;
  const canStatus = user?.role === 'ADMIN' && client?.active !== false;

  useEffect(() => { if (routeToast) navigate(location.pathname, { replace: true, state: null }); }, [location.pathname, navigate, routeToast]);
  useEffect(() => {
    let mounted = true;
    async function load(): Promise<void> {
      if (!id || !token) return;
      try { const result = await clientsApi.getById(token, id); if (mounted) setClient(result); }
      catch (requestError) { if (mounted) setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar o cliente.'); }
      finally { if (mounted) setIsLoading(false); }
    }
    void load(); return () => { mounted = false; };
  }, [id, token]);

  useEffect(() => {
    let mounted = true;
    async function loadAddresses() {
      if (!id || !token) return;
      setAddressesLoading(true); setAddressError('');
      try {
        const result = await clientsApi.listAddresses(token, id, { page, pageSize: 10, sortBy: 'createdAt', sortOrder: 'desc' });
        if (mounted) { setAddresses(result.data); setPagination(result.pagination); }
      } catch (requestError) { if (mounted) setAddressError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar os endereços.'); }
      finally { if (mounted) setAddressesLoading(false); }
    }
    void loadAddresses(); return () => { mounted = false; };
  }, [id, page, reload, token]);

  const dismissToast = useCallback(() => setToast(''), []);

  async function changePrimary(address: ClientAddress) {
    if (!id || !token || !canEdit) return;
    setSubmitting(true);
    try { await clientsApi.setPrimaryAddress(token, id, address.id); setToast('Endereço principal atualizado com sucesso.'); setReload((value) => value + 1); }
    catch (requestError) { setToast(requestError instanceof ApiError ? requestError.message : 'Não foi possível definir o endereço principal.'); }
    finally { setSubmitting(false); }
  }

  async function confirmStatus() {
    if (!id || !token || !statusTarget || !canStatus) return;
    const active = !statusTarget.active;
    setSubmitting(true);
    try {
      await clientsApi.updateAddressStatus(token, id, statusTarget.id, active);
      setToast(`Endereço ${active ? 'ativado' : 'inativado'} com sucesso.`);
      setStatusTarget(null); setReload((value) => value + 1);
    } catch (requestError) {
      setStatusTarget(null); setToast(requestError instanceof ApiError ? requestError.message : 'Não foi possível alterar o status do endereço.');
    } finally { setSubmitting(false); }
  }

  if (isLoading) return <LoadingScreen />;
  if (error || !client) return <main className="centered-page"><section className="message-card" data-testid="client-details-error"><h1>Cliente não disponível</h1><p role="alert">{error || 'Cliente não encontrado.'}</p><Link to="/clients" className="button-link">Voltar para clientes</Link></section></main>;

  const primaryBlocked = Boolean(statusTarget?.active && statusTarget.isPrimary && addresses.some((address) => address.active && address.id !== statusTarget.id));
  return <main className="content-page form-page" data-testid="client-details-page">
    <div className="page-heading"><div><p className="eyebrow">GESTÃO DE CLIENTES</p><h1>Detalhes do cliente</h1><p className="subtitle">Visualização, endereços e histórico financeiro vinculados.</p></div><div className="heading-actions"><Link to={`/finance/clients/${client.id}/statement`} className="secondary-link">Extrato financeiro</Link>{canEdit && <Link to={`/clients/${client.id}/edit`} className="button-link">Editar cliente</Link>}</div></div>
    <section className="details-card">
      <dl className="details-grid">
        <div><dt>Nome</dt><dd data-testid="client-name">{client.name}</dd></div><div><dt>Documento</dt><dd data-testid="client-document">{client.document}</dd></div>
        <div><dt>E-mail</dt><dd data-testid="client-email">{client.email}</dd></div><div><dt>Telefone</dt><dd data-testid="client-phone">{client.phone || 'Não informado'}</dd></div>
        <div><dt>Status</dt><dd data-testid="client-status"><span className={`status-badge ${client.active ? 'status-active' : 'status-inactive'}`}>{client.active ? 'Ativo' : 'Inativo'}</span></dd></div>
        <div><dt>Data de criação</dt><dd>{formatDate(client.createdAt)}</dd></div><div><dt>Última atualização</dt><dd>{formatDate(client.updatedAt)}</dd></div>
      </dl>
      <div className="address-section" data-testid="client-addresses">
        <div className="section-heading"><div><h2 className="section-title">Endereços</h2><p>{pagination.total} endereço(s) cadastrado(s)</p></div>{canEdit && <Link to={`/clients/${client.id}/addresses/new`} className="button-link" data-testid="address-new-button">+ Novo Endereço</Link>}</div>
        {!client.active && <div className="info-message">Endereços são somente leitura enquanto o cliente estiver inativo.</div>}
        {addressError && <div className="form-error" role="alert">{addressError}</div>}
        <div className="table-scroll"><table data-testid="addresses-table"><thead><tr><th>Tipo</th><th>Endereço</th><th>Cidade</th><th>Status</th><th>Principal</th><th>Ações</th></tr></thead><tbody>
          {addressesLoading ? <tr><td colSpan={6} className="table-message">Carregando endereços...</td></tr> : addresses.length === 0 ? <tr><td colSpan={6} className="table-message">Nenhum endereço cadastrado.{canEdit && <> <Link to={`/clients/${client.id}/addresses/new`}>Cadastrar primeiro endereço</Link></>}</td></tr> : addresses.map((address) => <tr key={address.id} data-testid="address-row">
            <td>{ADDRESS_TYPE_LABELS[address.type]}</td><td><strong>{addressTitle(address)}</strong>{address.complement && <small className="table-secondary">{address.complement}</small>}<small className="table-secondary">{address.district} · {address.zipCode} · {address.country}</small></td>
            <td>{address.city} - {address.state}</td><td><span className={`status-badge ${address.active ? 'status-active' : 'status-inactive'}`}>{address.active ? 'Ativo' : 'Inativo'}</span></td>
            <td>{address.isPrimary ? <span className="primary-badge">Principal</span> : 'Não'}</td><td><div className="row-actions">
              {canEdit && <Link to={`/clients/${client.id}/addresses/${address.id}/edit`}>Editar</Link>}
              {canEdit && address.active && !address.isPrimary && <button type="button" data-testid="address-primary-button" disabled={submitting} onClick={() => void changePrimary(address)}>Definir como principal</button>}
              {canStatus && <button type="button" onClick={() => setStatusTarget(address)}>{address.active ? 'Inativar' : 'Ativar'}</button>}
            </div></td>
          </tr>)}
        </tbody></table></div>
        {pagination.totalPages > 1 && <nav className="pagination" aria-label="Paginação de endereços"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>‹ Anterior</button><span>Página {page} de {pagination.totalPages}</span><button type="button" disabled={page === pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Próximo ›</button></nav>}
      </div>
      <div className="form-actions"><Link to="/clients" className="secondary-link">Voltar para clientes</Link></div>
    </section>
    {statusTarget && <StatusModal entityLabel="endereço" entityName={`${addressTitle(statusTarget)} — ${statusTarget.city} - ${statusTarget.state}`} active={statusTarget.active} isSubmitting={submitting} testIdPrefix="address" confirmDisabled={primaryBlocked} details={primaryBlocked ? 'Este endereço é o principal. Defina outro endereço como principal antes de inativá-lo.' : undefined} onCancel={() => setStatusTarget(null)} onConfirm={() => void confirmStatus()} />}
    {toast && <Toast message={toast} type={toast.includes('sucesso') ? 'success' : 'error'} onDismiss={dismissToast} />}
  </main>;
}
