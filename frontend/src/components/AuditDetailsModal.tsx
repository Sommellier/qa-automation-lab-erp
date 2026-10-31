import { useEffect, useId, useMemo, useRef } from 'react';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, type AuditLog } from '../types/audit';
import { formatCurrency } from '../utils/currency';

interface Props { log: AuditLog; onClose(): void }

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', email: 'E-mail', role: 'Perfil', active: 'Status', document: 'Documento', phone: 'Telefone',
  sku: 'SKU', description: 'Descrição', price: 'Preço', stock: 'Estoque', category: 'Categoria', categoryId: 'Categoria ID',
  number: 'Número', clientId: 'Cliente ID', total: 'Total', status: 'Status',
  type: 'Tipo', fileName: 'Arquivo', totalRows: 'Total de registros', imported: 'Importados', rejected: 'Rejeitados',
  addressId: 'Endereço ID', zipCode: 'CEP/Código postal', street: 'Logradouro', complement: 'Complemento',
  district: 'Bairro', city: 'Cidade', state: 'Estado', country: 'País', isPrimary: 'Principal',
};

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'price' || field === 'total') return formatCurrency(String(value));
  if (field === 'active' && typeof value === 'boolean') return value ? 'Ativo' : 'Inativo';
  if (field === 'isPrimary' && typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function AuditDetailsModal({ log, onClose }: Props) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const fields = useMemo(() => [...new Set([...Object.keys(log.oldData ?? {}), ...Object.keys(log.newData ?? {})])], [log.newData, log.oldData]);

  useEffect(() => {
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card audit-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="audit-details">
        <div className="audit-modal-heading">
          <div><p className="eyebrow">RASTREABILIDADE</p><h2 id={titleId}>Detalhes da auditoria</h2></div>
          <button ref={closeButton} type="button" className="audit-close" aria-label="Fechar detalhes" onClick={onClose}>×</button>
        </div>
        <dl className="audit-meta">
          <div><dt>Data e hora</dt><dd>{new Date(log.createdAt).toLocaleString('pt-BR')}</dd></div>
          <div><dt>Usuário</dt><dd>{log.user ? <>{log.user.name}<small>{log.user.email}</small></> : 'Usuário removido'}</dd></div>
          <div><dt>Entidade</dt><dd>{AUDIT_ENTITY_LABELS[log.entityType]}</dd></div>
          <div><dt>Ação</dt><dd>{AUDIT_ACTION_LABELS[log.action]}</dd></div>
          <div className="audit-meta-wide"><dt>ID</dt><dd>{log.entityId}</dd></div>
        </dl>
        <h3>Alterações</h3>
        {fields.length === 0 ? <p className="audit-empty-diff">Este evento não possui valores comparativos.</p> : (
          <div className="audit-diff-scroll">
            <table className="audit-diff-table">
              <thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
              <tbody>{fields.map((field) => <tr key={field}>
                <th scope="row">{FIELD_LABELS[field] ?? field}</th>
                <td data-testid="audit-old-data"><pre>{formatValue(field, log.oldData?.[field])}</pre></td>
                <td data-testid="audit-new-data"><pre>{formatValue(field, log.newData?.[field])}</pre></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
