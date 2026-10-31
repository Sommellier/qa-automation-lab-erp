import type { ReactNode } from 'react';
import type { Pagination } from '../../types/report';

export function ReportMetric({ label, value, testId, tone = 'default' }: { label: string; value: ReactNode; testId?: string; tone?: 'default' | 'warning' | 'success' | 'danger' }) {
  return <article className={`dashboard-metric dashboard-metric-${tone}`} data-testid={testId}><span>{label}</span><strong>{value}</strong></article>;
}

export function ReportPagination({ pagination, onPage }: { pagination: Pagination; onPage(page: number): void }) {
  if (pagination.totalPages <= 1) return null;
  return <nav className="pagination" aria-label="Paginação do relatório"><button type="button" disabled={pagination.page === 1} onClick={() => onPage(pagination.page - 1)}>‹ Anterior</button>{Array.from({ length: pagination.totalPages }, (_, index) => index + 1).map((page) => <button key={page} type="button" className={page === pagination.page ? 'current-page' : ''} aria-current={page === pagination.page ? 'page' : undefined} onClick={() => onPage(page)}>{page}</button>)}<button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>Próximo ›</button></nav>;
}

export function ReportLoading() {
  return <div className="dashboard-skeleton reports-loading" data-testid="reports-loading" aria-busy="true" aria-label="Carregando relatório">{Array.from({ length: 6 }, (_, index) => <span key={index} aria-hidden="true" />)}</div>;
}

export function ReportError({ onRetry }: { onRetry(): void }) {
  return <section className="dashboard-error" role="alert"><strong>Não foi possível carregar o relatório.</strong><button type="button" className="primary-button compact-button" onClick={onRetry}>Tentar novamente</button></section>;
}

export const reportDateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });

export function defaultReportPeriod(): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
}

export function validPeriod(dateFrom: string, dateTo: string): boolean { return !dateFrom || !dateTo || dateFrom <= dateTo; }
