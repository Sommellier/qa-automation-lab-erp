import { parse } from 'csv-parse/sync';
import type { ImportType } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { ParsedCsv, ParsedCsvRow } from '../types/import.js';

export const CSV_DELIMITER = ';';
export const CLIENT_HEADERS = ['name', 'document', 'email', 'phone', 'active'] as const;
export const PRODUCT_HEADERS = ['name', 'sku', 'description', 'price', 'stock', 'category', 'active'] as const;
export const CLIENT_REQUIRED_HEADERS = ['name', 'document', 'email', 'active'] as const;
export const PRODUCT_REQUIRED_HEADERS = ['name', 'sku', 'price', 'stock', 'category', 'active'] as const;

interface CsvRecordWithInfo { record: string[]; info: { lines: number } }

function structuralError(message: string, code = 'INVALID_CSV_HEADER'): never {
  throw new AppError(message, 400, code);
}

function validateHeaders(headers: string[], type: ImportType): void {
  const supported = type === 'CLIENTS' ? CLIENT_HEADERS : PRODUCT_HEADERS;
  const required = type === 'CLIENTS' ? CLIENT_REQUIRED_HEADERS : PRODUCT_REQUIRED_HEADERS;
  const duplicated = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicated.length > 0) structuralError(`Cabeçalho inválido. Colunas duplicadas: ${[...new Set(duplicated)].join(', ')}.`);
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) structuralError(`Cabeçalho inválido. Colunas obrigatórias ausentes: ${missing.join(', ')}.`);
  const unknown = headers.filter((header) => !supported.includes(header as never));
  if (unknown.length > 0) structuralError(`Cabeçalho inválido. Colunas desconhecidas: ${unknown.join(', ')}.`);
}

export function parseCsvFile(buffer: Buffer, type: ImportType, maxRows: number): ParsedCsv {
  if (buffer.length === 0) throw new AppError('O arquivo CSV está vazio.', 400, 'EMPTY_CSV');
  if ((buffer[0] === 0x50 && buffer[1] === 0x4b) || buffer.includes(0)) {
    throw new AppError('Formato de arquivo inválido. Envie um arquivo CSV.', 400, 'INVALID_CSV_FORMAT');
  }
  const text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) throw new AppError('Não foi possível processar o arquivo CSV.', 400, 'INVALID_CSV_ENCODING');
  if (text.replace(/^\uFEFF/, '').trim() === '') throw new AppError('O arquivo CSV está vazio.', 400, 'EMPTY_CSV');

  let records: CsvRecordWithInfo[];
  try {
    records = parse(text, {
      bom: true,
      delimiter: CSV_DELIMITER,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
      info: true,
    }) as unknown as CsvRecordWithInfo[];
  } catch {
    throw new AppError('Não foi possível processar o arquivo CSV.', 400, 'MALFORMED_CSV');
  }

  if (records.length === 0) throw new AppError('O arquivo CSV está vazio.', 400, 'EMPTY_CSV');
  const headerRecord = records[0]?.record;
  if (!headerRecord || headerRecord.length === 0) structuralError('Cabeçalho inválido.');
  const headers = headerRecord.map((header) => header.trim().replace(/^\uFEFF/, ''));
  validateHeaders(headers, type);

  const rows: ParsedCsvRow[] = [];
  for (let index = 1; index < records.length; index += 1) {
    const entry = records[index];
    const record = entry?.record ?? [];
    if (record.every((value) => value.trim() === '')) continue;
    const values = Object.fromEntries(headers.map((header, column) => [header, (record[column] ?? '').trim()]));
    rows.push({ line: entry?.info.lines ?? index + 1, values });
  }
  if (rows.length > maxRows) {
    throw new AppError(`O arquivo excede o limite de ${maxRows} linhas.`, 413, 'CSV_ROW_LIMIT_EXCEEDED');
  }
  return { totalRows: rows.length, rows };
}
