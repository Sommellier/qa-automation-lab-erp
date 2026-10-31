import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { purchasesApi } from '../services/purchase.service';
import { PURCHASE_APPROVAL_STATUS_LABELS, type PurchaseApprovalRule, type PurchaseSummary } from '../types/purchase';
import { formatCurrency } from '../utils/currency';

const formatDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function PurchaseApprovalsPage() {
  const { token, user } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [rules, setRules] = useState<PurchaseApprovalRule[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!token) return;
    try {
      const [queue, approvalRules] = await Promise.all([
        purchasesApi.list(token, { approvalStatus: 'PENDING_APPROVAL', page: 1, pageSize: 100, sortBy: 'createdAt', sortOrder: 'asc' }),
        purchasesApi.listApprovalRules(token),
      ]);
      setPurchases(queue.data);
      setRules(approvalRules);
      setAmounts(Object.fromEntries(approvalRules.map((rule) => [rule.role, rule.maxAmount ?? ''])));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar as aprovações.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function saveRule(rule: PurchaseApprovalRule) {
    if (!token || user?.role !== 'ADMIN') return;
    const rawAmount = amounts[rule.role]?.trim() ?? '';
    if (rawAmount && (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount) || Number(rawAmount) <= 0)) {
      setError('Informe um limite positivo com até duas casas decimais, ou deixe em branco para alçada ilimitada.');
      return;
    }
    setSavingRole(rule.role); setError(''); setNotice('');
    try {
      const updated = await purchasesApi.updateApprovalRule(token, rule.role, { maxAmount: rawAmount || null, active: rule.active });
      setRules((current) => current.map((item) => item.role === updated.role ? updated : item));
      setAmounts((current) => ({ ...current, [updated.role]: updated.maxAmount ?? '' }));
      setNotice(`Alçada de ${updated.role === 'ADMIN' ? 'Administrador' : 'Analista'} atualizada.`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível atualizar a alçada.');
    } finally {
      setSavingRole('');
    }
  }

  return <main className="content-page" data-testid="purchase-approvals-page">
    <div className="page-heading"><div><p className="eyebrow">GOVERNANÇA DE COMPRAS</p><h1>Aprovações e alçadas</h1><p className="subtitle">Compras aguardando decisão e limites vigentes por perfil.</p></div><Link className="secondary-link" to="/purchases">Voltar para compras</Link></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {notice && <div className="info-message" role="status">{notice}</div>}
    <section>
      <div className="section-heading"><div><h2 className="section-title">Regras de aprovação</h2><p>Limite em branco significa alçada ilimitada. Somente administradores alteram as regras.</p></div></div>
      <div className="approval-rules-grid">{rules.map((rule) => <article className="approval-rule-card" key={rule.id}>
        <h2>{rule.role === 'ADMIN' ? 'Administrador' : 'Analista'}</h2>
        <span className={`status-badge ${rule.active ? 'status-active' : 'status-inactive'}`}>{rule.active ? 'Ativa' : 'Inativa'}</span>
        {user?.role === 'ADMIN' ? <div className="approval-rule-fields"><div className="field-group"><label htmlFor={`approval-limit-${rule.role}`}>Limite por compra</label><input id={`approval-limit-${rule.role}`} inputMode="decimal" placeholder="Ilimitada" value={amounts[rule.role] ?? ''} onChange={(event) => setAmounts((current) => ({ ...current, [rule.role]: event.target.value }))} /></div><label className="checkbox-field"><input type="checkbox" checked={rule.active} onChange={(event) => setRules((current) => current.map((item) => item.role === rule.role ? { ...item, active: event.target.checked } : item))} /> Ativa</label><button className="primary-button compact-button" disabled={savingRole === rule.role} onClick={() => void saveRule(rule)}>{savingRole === rule.role ? 'Salvando...' : 'Salvar regra'}</button></div> : <p>{rule.maxAmount === null ? 'Alçada ilimitada' : `Até ${formatCurrency(rule.maxAmount)} por compra`}</p>}
        {rule.updatedBy && <small className="table-secondary">Última alteração por {rule.updatedBy.name}, em {formatDate(rule.updatedAt)}</small>}
      </article>)}</div>
    </section>
    <section className="table-card"><div className="table-summary">{purchases.length} compra(s) aguardando aprovação</div><div className="table-scroll"><table><thead><tr><th>Número</th><th>Fornecedor</th><th>Total</th><th>Solicitada em</th><th>Status</th><th>Ação</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="table-message">Carregando...</td></tr> : !purchases.length ? <tr><td colSpan={6} className="table-message">Nenhuma compra aguarda aprovação.</td></tr> : purchases.map((purchase) => <tr key={purchase.id}><td><strong>{purchase.number}</strong></td><td>{purchase.supplier.name}<small className="table-secondary">{purchase.supplier.document}</small></td><td>{formatCurrency(purchase.total)}</td><td>{purchase.submittedAt ? formatDate(purchase.submittedAt) : '—'}</td><td><span className="status-badge approval-status-pending_approval">{PURCHASE_APPROVAL_STATUS_LABELS.PENDING_APPROVAL}</span></td><td><Link to={`/purchases/${purchase.id}`}>{user?.role === 'VISUALIZADOR' ? 'Visualizar' : 'Analisar'}</Link></td></tr>)}</tbody></table></div></section>
  </main>;
}
