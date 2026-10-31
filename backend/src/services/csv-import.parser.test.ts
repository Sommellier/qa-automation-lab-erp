import { ImportType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error.js';
import { parseCsvFile } from './csv-import.parser.js';

const clientsHeader = 'name;document;email;phone;active';
const productsHeader = 'name;sku;description;price;stock;category;active';

function parse(text: string, type: ImportType = ImportType.CLIENTS, maxRows = 5000) {
  return parseCsvFile(Buffer.from(text, 'utf8'), type, maxRows);
}

describe('parseCsvFile', () => {
  it('CT001: processa CSV válido de clientes', () => {
    const result = parse(`${clientsHeader}\nCarlos Silva;12345;carlos@teste.com;;true`);
    expect(result).toEqual({ totalRows: 1, rows: [{ line: 2, values: { name: 'Carlos Silva', document: '12345', email: 'carlos@teste.com', phone: '', active: 'true' } }] });
  });

  it('CT002: processa CSV válido de produtos', () => {
    const result = parse(`${productsHeader}\nNotebook;NOTE001;;5999.90;0;Informática;true`, ImportType.PRODUCTS);
    expect(result.totalRows).toBe(1); expect(result.rows[0]?.values.stock).toBe('0');
  });

  it('CT003: rejeita arquivo vazio', () => {
    expect(() => parse('')).toThrowError(expect.objectContaining({ code: 'EMPTY_CSV' }));
    expect(() => parse('\uFEFF  \r\n')).toThrowError('O arquivo CSV está vazio.');
  });

  it('CT005-007: valida cabeçalhos, rejeita extras e aceita ordem diferente e opcionais ausentes', () => {
    expect(() => parse('name;document;active\nCarlos;12345;true')).toThrowError(/email/);
    expect(() => parse(`${clientsHeader};extra\nCarlos;12345;c@t.com;;true;x`)).toThrowError(/Colunas desconhecidas: extra/);
    const reordered = parse('email;active;document;name\ncarlos@teste.com;true;12345;Carlos');
    expect(reordered.rows[0]?.values.name).toBe('Carlos');
  });

  it('rejeita cabeçalhos duplicados', () => {
    expect(() => parse('name;document;email;email;active\nCarlos;12345;a@b.com;a@b.com;true')).toThrowError(/Colunas duplicadas: email/);
  });

  it('CT008: remove BOM UTF-8 do primeiro cabeçalho', () => {
    expect(parse(`\uFEFF${clientsHeader}\nCarlos;12345;carlos@teste.com;;true`).totalRows).toBe(1);
  });

  it('CT009: ignora linhas vazias', () => {
    const result = parse(`${clientsHeader}\n\nCarlos;12345;carlos@teste.com;;true\n   \n`); expect(result.totalRows).toBe(1); expect(result.rows[0]?.line).toBe(3);
  });

  it('CT010: rejeita CSV malformado com mensagem controlada', () => {
    try { parse(`${clientsHeader}\n"Carlos;12345;carlos@teste.com;;true`); throw new Error('deveria falhar'); }
    catch (error) { expect(error).toBeInstanceOf(AppError); expect((error as AppError).code).toBe('MALFORMED_CSV'); expect((error as Error).message).toBe('Não foi possível processar o arquivo CSV.'); }
  });

  it('CT047-048: rejeita acima do limite e aceita exatamente o limite', () => {
    const rows = ['A;11111;a@t.com;;true', 'B;22222;b@t.com;;true'];
    expect(parse(`${clientsHeader}\n${rows.join('\n')}`, ImportType.CLIENTS, 2).totalRows).toBe(2);
    expect(() => parse(`${clientsHeader}\n${rows.join('\n')}`, ImportType.CLIENTS, 1)).toThrowError(/limite de 1 linhas/);
  });

  it('CT051-052: preserva acentos, separadores e quebras de linha entre aspas', () => {
    const result = parse(`${productsHeader}\n"Café; Premium";CAFE-1;"Descrição\nem duas linhas";10.50;1;Alimentação;true`, ImportType.PRODUCTS);
    expect(result.rows[0]?.values).toMatchObject({ name: 'Café; Premium', description: 'Descrição\nem duas linhas', category: 'Alimentação' });
  });

  it('rejeita binário e UTF-8 inválido', () => {
    expect(() => parseCsvFile(Buffer.from([0x50, 0x4b, 0x03, 0x04]), ImportType.CLIENTS, 10)).toThrowError(/Formato de arquivo inválido/);
    expect(() => parseCsvFile(Buffer.from([0xff, 0xfe, 0xfd]), ImportType.CLIENTS, 10)).toThrowError(/Não foi possível processar/);
  });
});
