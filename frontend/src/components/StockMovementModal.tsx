import { useState, type FormEvent } from 'react';

export type StockModalMode = 'entry' | 'exit' | 'adjust';
interface Props { mode: StockModalMode; productName: string; currentStock: number; submitting: boolean;
  requestError: string; onCancel(): void; onConfirm(value: number, reason: string): void; }
const COPY = {
  entry: { title: 'Adicionar estoque', value: 'Quantidade', confirm: 'Confirmar entrada' },
  exit: { title: 'Remover estoque', value: 'Quantidade', confirm: 'Confirmar saída' },
  adjust: { title: 'Ajustar estoque', value: 'Novo estoque', confirm: 'Confirmar ajuste' },
} as const;

export function StockMovementModal({ mode, productName, currentStock, submitting, requestError, onCancel, onConfirm }: Props) {
  const [value, setValue] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState('');
  const copy = COPY[mode];
  function submit(event: FormEvent) {
    event.preventDefault(); const parsed = Number(value);
    if (!Number.isInteger(parsed) || (mode === 'adjust' ? parsed < 0 : parsed <= 0)) { setError(mode === 'adjust' ? 'Informe o novo estoque.' : 'Informe uma quantidade válida.'); return; }
    if (reason.trim().length < 3) { setError('Informe o motivo da movimentação.'); return; }
    setError(''); onConfirm(parsed, reason.trim());
  }
  return <div className="modal-backdrop" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title">
    <p className="eyebrow">MOVIMENTAÇÃO DE ESTOQUE</p><h2 id="stock-modal-title">{copy.title}</h2>
    <p><strong>{productName}</strong><br />Estoque atual: {currentStock}</p>
    <form onSubmit={submit} noValidate>
      <div className="field-group"><label htmlFor="stock-value">{copy.value}</label><input id="stock-value" type="number" min={mode === 'adjust' ? 0 : 1} step="1" value={value} onChange={(event) => setValue(event.target.value)} data-testid={mode === 'adjust' ? 'stock-new-value' : 'stock-quantity'} disabled={submitting} autoFocus /></div>
      <div className="field-group"><label htmlFor="stock-reason">Motivo</label><textarea id="stock-reason" value={reason} onChange={(event) => setReason(event.target.value)} data-testid="stock-reason" disabled={submitting} /></div>
      {(error || requestError) && <div className="form-error" role="alert">{error || requestError}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" data-testid="stock-cancel" onClick={onCancel} disabled={submitting}>Cancelar</button><button type="submit" className="primary-button compact-button" data-testid="stock-confirm" disabled={submitting}>{submitting ? 'Salvando...' : copy.confirm}</button></div>
    </form>
  </section></div>;
}
