import { FiscalDocumentStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { isValidNfeAccessKey, parseNfeXml } from './nfe-parser.js';

function accessKey(base = '3526101234567800019555001000000123112345678'): string {
  let weight = 2; let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) { sum += Number(base[index]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = sum % 11; const digit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return `${base}${digit}`;
}

function xml(options: { model?: string; key?: string; doctype?: string } = {}): Buffer {
  const key = options.key ?? accessKey(); const model = options.model ?? '55';
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${options.doctype ?? ''}<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key}"><ide><mod>${model}</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-10-27T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor Teste</xNome></emit><dest><CNPJ>98765432000100</CNPJ><xNome>Empresa Destino</xNome></dest><det nItem="1"><prod><cProd>SKU-1</cProd><xProd>Produto fiscal</xProd><NCM>84713012</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>50.0000</vUnCom><vProd>100.00</vProd></prod><imposto><ICMS><ICMS00><vICMS>18.00</vICMS></ICMS00></ICMS></imposto></det><total><ICMSTot><vProd>100.00</vProd><vDesc>0.00</vDesc><vFrete>10.00</vFrete><vOutro>0.00</vOutro><vNF>110.00</vNF><vICMS>18.00</vICMS></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${key}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`, 'utf8');
}

describe('parser seguro de NF-e', () => {
  it('valida o dígito verificador da chave', () => {
    const key = accessKey();
    expect(key).toHaveLength(44); expect(isValidNfeAccessKey(key)).toBe(true);
    expect(isValidNfeAccessKey(`${key.slice(0, 43)}${key[43] === '0' ? '1' : '0'}`)).toBe(false);
  });
  it('extrai dados, itens, totais, tributos e protocolo de uma NF-e 55', () => {
    const parsed = parseNfeXml(xml());
    expect(parsed).toMatchObject({ model: '55', number: '123', series: '1', issuer: { document: '12345678000195' }, recipient: { document: '98765432000100' }, productsTotal: '100.00', freightTotal: '10.00', total: '110.00', fiscalStatus: FiscalDocumentStatus.AUTHORIZED });
    expect(parsed.items).toHaveLength(1); expect(parsed.items[0]).toMatchObject({ lineNumber: 1, fiscalCode: 'SKU-1', quantity: '2.0000', unitValue: '50.0000', total: '100.00' });
  });
  it('rejeita DTD e entidades antes do parser', () => {
    expect(() => parseNfeXml(xml({ doctype: '<!DOCTYPE nfeProc [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' }))).toThrow(expect.objectContaining({ code: 'UNSAFE_FISCAL_XML' }));
  });
  it('rejeita XML malformado, modelo diferente de 55 e chave inválida', () => {
    expect(() => parseNfeXml(Buffer.from('<NFe>'))).toThrow(expect.objectContaining({ code: 'INVALID_FISCAL_XML' }));
    expect(() => parseNfeXml(xml({ model: '65' }))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FISCAL_MODEL' }));
    expect(() => parseNfeXml(xml({ key: '1'.repeat(44) }))).toThrow(expect.objectContaining({ code: 'INVALID_NFE_ACCESS_KEY' }));
  });
});
