import { useEffect, useRef } from 'react';
import { IMPORT_STATUS_LABELS, IMPORT_TYPE_LABELS, type ImportJob } from '../../types/import';
import { ImportErrorsTable } from './ImportErrorsTable';

export function ImportDetailsModal({ job, onClose }: { job: ImportJob; onClose(): void }) {
  const close = useRef<HTMLButtonElement>(null); useEffect(() => { close.current?.focus(); }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card import-details-modal" role="dialog" aria-modal="true" aria-labelledby="import-details-title"><div className="audit-modal-heading"><div><p className="eyebrow">HISTÓRICO</p><h2 id="import-details-title">Detalhes da importação</h2></div><button ref={close} type="button" className="audit-close" aria-label="Fechar detalhes" onClick={onClose}>×</button></div><dl className="audit-meta"><div><dt>Arquivo</dt><dd>{job.fileName}</dd></div><div><dt>Tipo</dt><dd>{IMPORT_TYPE_LABELS[job.type]}</dd></div><div><dt>Usuário</dt><dd>{job.createdBy.name}<small>{job.createdBy.email}</small></dd></div><div><dt>Status</dt><dd>{IMPORT_STATUS_LABELS[job.status]}</dd></div><div><dt>Total</dt><dd>{job.totalRows}</dd></div><div><dt>Importados / rejeitados</dt><dd>{job.importedRows} / {job.invalidRows}</dd></div><div className="audit-meta-wide"><dt>Data</dt><dd>{new Date(job.createdAt).toLocaleString('pt-BR')}</dd></div></dl><ImportErrorsTable errors={job.errors ?? []} /></section></div>;
}
