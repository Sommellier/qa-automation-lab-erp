import { useEffect, useId, useRef, type ReactNode } from 'react';

interface StatusModalProps {
  entityLabel: string;
  entityName: string;
  active: boolean;
  isSubmitting: boolean;
  testIdPrefix: string;
  onCancel(): void;
  onConfirm(): void;
  details?: ReactNode;
  confirmDisabled?: boolean;
}

export function StatusModal({
  entityLabel,
  entityName,
  active,
  isSubmitting,
  testIdPrefix,
  onCancel,
  onConfirm,
  details,
  confirmDisabled = false,
}: StatusModalProps) {
  const titleId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const willActivate = !active;
  const action = willActivate ? 'Ativar' : 'Inativar';

  useEffect(() => {
    confirmButton.current?.focus();
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && !isSubmitting && onCancel()}
    >
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={`${testIdPrefix}-status-modal`}
      >
        <p className="eyebrow">CONFIRMAÇÃO</p>
        <h2 id={titleId}>{action} {entityLabel}</h2>
        <p>
          Deseja realmente {action.toLowerCase()} este {entityLabel}: <strong>{entityName}</strong>?
        </p>
        {details && <p>{details}</p>}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            data-testid={`${testIdPrefix}-status-cancel`}
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            ref={confirmButton}
            type="button"
            className={willActivate ? 'primary-button compact-button' : 'danger-button'}
            data-testid={`${testIdPrefix}-status-confirm`}
            disabled={isSubmitting || confirmDisabled}
            onClick={onConfirm}
          >
            {isSubmitting ? 'Salvando...' : action}
          </button>
        </div>
      </section>
    </div>
  );
}
