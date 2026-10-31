import { useState, type ChangeEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../services/api';
import { importsApi } from '../../services/import.service';
import type { ImportExecution, ImportType, ImportValidation } from '../../types/import';
import { ImportErrorsTable } from './ImportErrorsTable';

const settings = {
  CLIENTS: { title: 'Importar Clientes', required: 'name, document, email, active', optional: 'phone' },
  PRODUCTS: { title: 'Importar Produtos', required: 'name, sku, price, stock, category, active', optional: 'description' },
} as const;

export function ImportPanel({ type }: { type: ImportType }) {
  const { token } = useAuth(); const config = settings[type];
  const [file, setFile] = useState<File | null>(null); const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [result, setResult] = useState<ImportExecution | null>(null); const [busy, setBusy] = useState<'validate' | 'execute' | 'download' | null>(null); const [error, setError] = useState('');

  function chooseFile(event: ChangeEvent<HTMLInputElement>): void { setFile(event.target.files?.[0] ?? null); setValidation(null); setResult(null); setError(''); }
  function reset(): void { setFile(null); setValidation(null); setResult(null); setError(''); }
  async function validate(): Promise<void> {
    if (!token || !file) { setError('Selecione um arquivo CSV.'); return; }
    setBusy('validate'); setError('');
    try { setValidation(await importsApi.validate(type, token, file)); }
    catch (requestError: unknown) { setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível validar o arquivo.'); }
    finally { setBusy(null); }
  }
  async function execute(): Promise<void> {
    if (!token || !file || !validation) return;
    setBusy('execute'); setError('');
    try { setResult(await importsApi.execute(type, token, file, validation.jobId)); setValidation(null); }
    catch (requestError: unknown) { setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível executar a importação.'); }
    finally { setBusy(null); }
  }
  async function download(): Promise<void> {
    if (!token) return; setBusy('download'); setError('');
    try { const template = await importsApi.template(type, token); const url = URL.createObjectURL(template.blob); const link = document.createElement('a'); link.href = url; link.download = template.fileName; link.click(); URL.revokeObjectURL(url); }
    catch (requestError: unknown) { setError(requestError instanceof ApiError ? requestError.message : 'Não foi possível baixar o modelo.'); }
    finally { setBusy(null); }
  }

  return <section className="import-workspace" aria-label={config.title}>
    <div className="import-upload-card"><div className="import-card-heading"><div><p className="eyebrow">CSV EM LOTE</p><h2>{config.title}</h2></div><button type="button" className="secondary-button" data-testid="import-template-download" onClick={() => void download()} disabled={busy !== null}>{busy === 'download' ? 'Baixando...' : 'Baixar modelo CSV'}</button></div>
      <div className="import-guidance"><strong>Padrão do arquivo</strong><span>Separador: <code>;</code></span><span>Encoding: UTF-8</span><span>Obrigatórios: {config.required}</span><span>Opcional: {config.optional}</span><span>Active vazio assume <code>true</code>.</span>{type === 'PRODUCTS' && <span>A categoria deve existir e estar ativa; informe o nome humano na coluna <code>category</code>.</span>}</div>
      <div className="field-group import-file-field"><label htmlFor={`import-file-${type.toLowerCase()}`}>Arquivo CSV</label><input id={`import-file-${type.toLowerCase()}`} type="file" accept=".csv,text/csv" data-testid="import-file" onChange={chooseFile} /><small>{file ? file.name : 'Limite: 5 MB e 5.000 registros.'}</small></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!result && <div className="form-actions import-actions"><button type="button" className="secondary-button" onClick={reset} disabled={busy !== null}>Cancelar</button><button type="button" className="primary-button compact-button" data-testid="import-validate" onClick={() => void validate()} disabled={!file || busy !== null}>{busy === 'validate' ? 'Validando...' : 'Validar arquivo'}</button></div>}
    </div>

    {validation && <section className="import-summary-card" aria-live="polite"><div className="import-card-heading"><div><p className="eyebrow">ARQUIVO VALIDADO</p><h2>Resumo da validação</h2></div></div><div className="import-metrics"><article><span>Total de linhas</span><strong data-testid="import-total">{validation.totalRows}</strong></article><article className="success"><span>Válidas</span><strong data-testid="import-valid">{validation.validRows}</strong></article><article className="danger"><span>Inválidas</span><strong data-testid="import-invalid">{validation.invalidRows}</strong></article></div><ImportErrorsTable errors={validation.errors} /><div className="form-actions import-actions"><button type="button" className="secondary-button" onClick={reset}>Cancelar</button><button type="button" className="primary-button compact-button" data-testid="import-execute" onClick={() => void execute()} disabled={validation.validRows === 0 || busy !== null}>{busy === 'execute' ? 'Importando...' : `Importar ${validation.validRows} registro(s) válido(s)`}</button></div></section>}

    {result && <section className="import-summary-card import-result" data-testid="import-result" aria-live="polite"><div className="import-card-heading"><div><p className="eyebrow">IMPORTAÇÃO CONCLUÍDA</p><h2>Resultado do processamento</h2></div></div><div className="import-metrics"><article><span>Total de registros</span><strong data-testid="import-total">{result.totalRows}</strong></article><article className="success"><span>Importados</span><strong data-testid="import-valid">{result.imported}</strong></article><article className="danger"><span>Rejeitados</span><strong data-testid="import-invalid">{result.rejected}</strong></article></div><ImportErrorsTable errors={result.errors} /><div className="form-actions import-actions"><button type="button" className="primary-button compact-button" onClick={reset}>Nova importação</button></div></section>}
  </section>;
}
