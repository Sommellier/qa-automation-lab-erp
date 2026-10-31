import { createHash } from 'node:crypto';
import { BankMovementNature, Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { AppError } from '../errors/app-error.js';

export interface ParsedBankTransaction {
  transactionDate: Date;
  processedAt?: Date;
  description: string;
  bankIdentifier?: string;
  amount: Prisma.Decimal;
  nature: BankMovementNature;
  reference?: string;
}

export interface CsvBankMapping {
  date: string;
  description: string;
  amount: string;
  nature?: string;
  reference?: string;
  bankIdentifier?: string;
  processedAt?: string;
  delimiter?: string;
}

const DEFAULT_MAPPING: CsvBankMapping = {
  date: 'date', description: 'description', amount: 'amount', nature: 'nature', reference: 'reference', bankIdentifier: 'bankIdentifier', processedAt: 'processedAt', delimiter: ';',
};

function validBuffer(buffer: Buffer): string {
  if (!buffer.length) throw new AppError('O extrato está vazio.', 400, 'EMPTY_BANK_STATEMENT');
  if ((buffer[0] === 0x50 && buffer[1] === 0x4b) || buffer.includes(0)) throw new AppError('Formato de extrato inválido.', 400, 'INVALID_BANK_STATEMENT');
  const value = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (value.includes('\uFFFD')) throw new AppError('Codificação do extrato inválida.', 400, 'INVALID_BANK_STATEMENT_ENCODING');
  return value;
}

function parseDate(value: string): Date {
  const compact = value.trim().replace(/[^0-9]/g, '');
  if (compact.length >= 8 && /^(19|20)\d{6}/.test(compact)) {
    const date = new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const date = new Date(`${match[3]}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  throw new AppError(`Data bancária inválida: ${value}.`, 400, 'INVALID_BANK_DATE');
}

function parseAmount(value: string): { amount: Prisma.Decimal; inferredNature: BankMovementNature } {
  let normalized = value.trim().replace(/\s|R\$/gi, '');
  if (normalized.includes(',') && normalized.includes('.')) normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  else normalized = normalized.replace(',', '.');
  let decimal: Prisma.Decimal;
  try { decimal = new Prisma.Decimal(normalized); } catch { throw new AppError(`Valor bancário inválido: ${value}.`, 400, 'INVALID_BANK_AMOUNT'); }
  if (decimal.eq(0)) throw new AppError('O extrato contém transação com valor zero.', 400, 'ZERO_BANK_AMOUNT');
  return { amount: decimal.abs().toDecimalPlaces(2), inferredNature: decimal.isNegative() ? BankMovementNature.DEBIT : BankMovementNature.CREDIT };
}

function tag(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]+)`, 'i'));
  return match?.[1]?.trim();
}

export function parseOfx(buffer: Buffer, maxRows: number): ParsedBankTransaction[] {
  const source = validBuffer(buffer);
  const blocks = source.match(/<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi) ?? [];
  if (!blocks.length) throw new AppError('Nenhuma transação foi encontrada no OFX.', 400, 'OFX_WITHOUT_TRANSACTIONS');
  if (blocks.length > maxRows) throw new AppError(`O extrato excede ${maxRows} transações.`, 413, 'BANK_STATEMENT_ROW_LIMIT');
  return blocks.map((block) => {
    const amountValue = tag(block, 'TRNAMT'); const dateValue = tag(block, 'DTPOSTED');
    if (!amountValue || !dateValue) throw new AppError('Transação OFX sem data ou valor.', 400, 'MALFORMED_OFX_TRANSACTION');
    const parsed = parseAmount(amountValue);
    return {
      transactionDate: parseDate(dateValue), amount: parsed.amount, nature: parsed.inferredNature,
      description: (tag(block, 'MEMO') ?? tag(block, 'NAME') ?? tag(block, 'TRNTYPE') ?? 'Movimentação bancária').slice(0, 500),
      ...(tag(block, 'FITID') ? { bankIdentifier: tag(block, 'FITID')!.slice(0, 200) } : {}),
      ...(tag(block, 'CHECKNUM') ? { reference: tag(block, 'CHECKNUM')!.slice(0, 200) } : {}),
    };
  });
}

export function parseBankCsv(buffer: Buffer, mapping: Partial<CsvBankMapping> | undefined, maxRows: number): ParsedBankTransaction[] {
  const source = validBuffer(buffer);
  const selected = { ...DEFAULT_MAPPING, ...mapping };
  let records: Record<string, string>[];
  try { records = parse(source, { columns: true, bom: true, delimiter: selected.delimiter ?? ';', skip_empty_lines: true, trim: true, relax_column_count: false }) as Record<string, string>[]; }
  catch { throw new AppError('Não foi possível interpretar o CSV bancário.', 400, 'MALFORMED_BANK_CSV'); }
  if (!records.length) throw new AppError('Nenhuma transação foi encontrada no CSV.', 400, 'BANK_CSV_WITHOUT_TRANSACTIONS');
  if (records.length > maxRows) throw new AppError(`O extrato excede ${maxRows} transações.`, 413, 'BANK_STATEMENT_ROW_LIMIT');
  return records.map((record, index) => {
    const rawDate = record[selected.date]; const rawDescription = record[selected.description]; const rawAmount = record[selected.amount];
    if (!rawDate || !rawDescription || !rawAmount) throw new AppError(`Linha ${index + 2} sem data, descrição ou valor.`, 400, 'BANK_CSV_REQUIRED_VALUE');
    const parsed = parseAmount(rawAmount);
    const natureValue = selected.nature ? record[selected.nature]?.trim().toUpperCase() : undefined;
    const nature = natureValue ? ['CREDIT', 'CREDITO', 'CRÉDITO', 'C'].includes(natureValue) ? BankMovementNature.CREDIT
      : ['DEBIT', 'DEBITO', 'DÉBITO', 'D'].includes(natureValue) ? BankMovementNature.DEBIT
        : (() => { throw new AppError(`Natureza inválida na linha ${index + 2}.`, 400, 'INVALID_BANK_NATURE'); })() : parsed.inferredNature;
    return {
      transactionDate: parseDate(rawDate), description: rawDescription.slice(0, 500), amount: parsed.amount, nature,
      ...(selected.reference && record[selected.reference] ? { reference: record[selected.reference]!.slice(0, 200) } : {}),
      ...(selected.bankIdentifier && record[selected.bankIdentifier] ? { bankIdentifier: record[selected.bankIdentifier]!.slice(0, 200) } : {}),
      ...(selected.processedAt && record[selected.processedAt] ? { processedAt: parseDate(record[selected.processedAt]!) } : {}),
    };
  });
}

export function bankTransactionFingerprint(bankAccountId: string, value: ParsedBankTransaction): string {
  const normalizedDescription = value.description.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const parts = [bankAccountId, value.transactionDate.toISOString().slice(0, 10), value.nature, value.amount.toFixed(2), value.bankIdentifier ?? '', value.reference ?? '', normalizedDescription];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
