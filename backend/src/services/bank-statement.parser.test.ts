import { describe, expect, it } from 'vitest';
import { bankTransactionFingerprint, parseBankCsv, parseOfx } from './bank-statement.parser.js';

describe('importação segura de extratos', () => {
  it('extrai transações OFX e normaliza natureza', () => {
    const rows = parseOfx(Buffer.from(`<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261027120000<TRNAMT>-15.90<FITID>abc<MEMO>Tarifa</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261028<TRNAMT>100.00<FITID>def<NAME>Recebimento</STMTTRN></BANKTRANLIST></OFX>`), 10);
    expect(rows).toHaveLength(2); expect(rows[0]?.nature).toBe('DEBIT'); expect(rows[0]?.amount.toFixed(2)).toBe('15.90'); expect(rows[1]?.nature).toBe('CREDIT');
  });
  it('interpreta CSV mapeado e decimal brasileiro', () => {
    const rows = parseBankCsv(Buffer.from('Data;Historico;Valor;Tipo\n27/10/2026;Pagamento;1.234,56;DÉBITO'), { date: 'Data', description: 'Historico', amount: 'Valor', nature: 'Tipo', delimiter: ';' }, 10);
    expect(rows[0]?.amount.toFixed(2)).toBe('1234.56'); expect(rows[0]?.nature).toBe('DEBIT');
  });
  it('produz impressão estável para impedir reimportação', () => {
    const row = parseOfx(Buffer.from('<STMTTRN><DTPOSTED>20261027<TRNAMT>10<FITID>x<MEMO>Crédito</STMTTRN>'), 10)[0]!;
    expect(bankTransactionFingerprint('conta', row)).toBe(bankTransactionFingerprint('conta', row));
  });
  it('rejeita conteúdo binário disfarçado', () => {
    expect(() => parseOfx(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 10)).toThrow('Formato de extrato inválido');
  });
});
