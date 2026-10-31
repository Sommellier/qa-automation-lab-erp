import type { ImportRowError } from '../../types/import';

export function ImportErrorsTable({ errors }: { errors: ImportRowError[] }) {
  if (errors.length === 0) return null;
  const rows = errors.flatMap((row) => row.errors.map((error) => ({ line: row.line, ...error })));
  return <section className="import-errors"><h3>Erros encontrados</h3><div className="table-scroll"><table data-testid="import-errors-table"><thead><tr><th>Linha</th><th>Campo</th><th>Valor</th><th>Erro</th></tr></thead><tbody>{rows.map((error, index) => <tr key={`${error.line}-${error.field}-${error.code}-${index}`}><td>{error.line}</td><td>{error.field}</td><td className="import-error-value">{error.value || '—'}</td><td>{error.message}</td></tr>)}</tbody></table></div></section>;
}
