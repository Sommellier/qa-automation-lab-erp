import { useEffect, useId, useRef } from 'react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '../types/order';

interface Props { orderNumber: string; targetStatus: OrderStatus; isSubmitting: boolean; onCancel(): void; onConfirm(): void }
export function OrderStatusModal({ orderNumber, targetStatus, isSubmitting, onCancel, onConfirm }: Props) {
  const titleId = useId(); const confirmButton = useRef<HTMLButtonElement>(null); const isCancellation = targetStatus === 'CANCELLED';
  useEffect(() => { confirmButton.current?.focus(); }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !isSubmitting && onCancel()}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="order-status-modal"><p className="eyebrow">CONFIRMAÇÃO</p><h2 id={titleId}>{isCancellation ? 'Cancelar pedido' : 'Atualizar status'}</h2><p>{isCancellation ? <>Deseja realmente cancelar o pedido <strong>{orderNumber}</strong>? Os itens serão devolvidos ao estoque.</> : <>Deseja alterar o pedido <strong>{orderNumber}</strong> para <strong>{ORDER_STATUS_LABELS[targetStatus]}</strong>?</>}</p><div className="modal-actions"><button type="button" className="secondary-button" data-testid="order-status-cancel" disabled={isSubmitting} onClick={onCancel}>Voltar</button><button ref={confirmButton} type="button" className={isCancellation ? 'danger-button' : 'primary-button compact-button'} data-testid="order-status-confirm" disabled={isSubmitting} onClick={onConfirm}>{isSubmitting ? 'Salvando...' : isCancellation ? 'Cancelar pedido' : 'Confirmar'}</button></div></section></div>;
}
