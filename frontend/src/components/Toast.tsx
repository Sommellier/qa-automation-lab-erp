import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onDismiss(): void;
}

export function Toast({ message, type = 'success', onDismiss }: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timeout);
  }, [onDismiss]);

  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite" data-testid="toast">
      <span>{message}</span>
      <button type="button" aria-label="Fechar mensagem" onClick={onDismiss}>×</button>
    </div>
  );
}

