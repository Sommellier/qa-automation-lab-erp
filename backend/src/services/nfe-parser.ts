import { FiscalDocumentStatus } from '@prisma/client';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { AppError } from '../errors/app-error.js';
import type { ParsedFiscalDocument, ParsedFiscalItem } from '../types/fiscal.js';

type XmlRecord = Record<string, unknown>;
const record = (value: unknown): XmlRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as XmlRecord : {};
const array = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const string = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const decimal = (value: unknown): string => {
  const normalized = string(value);
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized : '0';
};
const document = (party: XmlRecord): string => (string(party.CNPJ) || string(party.CPF)).replace(/\D/g, '');

export function isValidNfeAccessKey(value: string): boolean {
  if (!/^\d{44}$/.test(value)) return false;
  const base = value.slice(0, 43).split('').map(Number);
  let weight = 2; let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) { sum += base[index]! * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = sum % 11;
  const expected = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return expected === Number(value[43]);
}

function fiscalStatus(code: string): FiscalDocumentStatus {
  if (code === '100') return FiscalDocumentStatus.AUTHORIZED;
  if (['101', '135', '155'].includes(code)) return FiscalDocumentStatus.CANCELLED;
  if (['110', '301', '302', '303'].includes(code)) return FiscalDocumentStatus.DENIED;
  if (['102', '206'].includes(code)) return FiscalDocumentStatus.VOIDED;
  return FiscalDocumentStatus.UNKNOWN;
}

function cleanJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record(value))) as Record<string, unknown>;
}

export function parseNfeXml(buffer: Buffer): ParsedFiscalDocument {
  const xml = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!xml.trim()) throw new AppError('O XML está vazio.', 400, 'EMPTY_FISCAL_XML');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new AppError('XML com DTD ou entidades não é permitido.', 400, 'UNSAFE_FISCAL_XML');
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true) throw new AppError('O arquivo não contém um XML bem-formado.', 400, 'INVALID_FISCAL_XML');
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, trimValues: true, parseTagValue: false, parseAttributeValue: false, processEntities: false }).parse(xml) as XmlRecord;
  const process = record(parsed.nfeProc);
  const nfe = record(process.NFe ?? parsed.NFe);
  const info = record(nfe.infNFe);
  const identification = record(info.ide);
  const issuer = record(info.emit);
  const recipient = record(info.dest);
  const totals = record(record(info.total).ICMSTot);
  const protocol = record(record(process.protNFe).infProt);
  if (!Object.keys(info).length) throw new AppError('Estrutura NF-e não encontrada no XML.', 400, 'UNSUPPORTED_FISCAL_XML');
  const model = string(identification.mod);
  if (model !== '55') throw new AppError(`Modelo fiscal ${model || 'não informado'} ainda não é suportado.`, 400, 'UNSUPPORTED_FISCAL_MODEL');
  const accessKey = (string(protocol.chNFe) || string(info['@_Id']).replace(/^NFe/i, '')).replace(/\D/g, '');
  if (!isValidNfeAccessKey(accessKey)) throw new AppError('A chave de acesso da NF-e é inválida.', 400, 'INVALID_NFE_ACCESS_KEY');
  const issueDate = string(identification.dhEmi) || string(identification.dEmi);
  if (!issueDate || Number.isNaN(new Date(issueDate).getTime())) throw new AppError('Data de emissão inválida ou ausente.', 400, 'INVALID_NFE_ISSUE_DATE');
  const issuerDocument = document(issuer); const recipientDocument = document(recipient);
  if (![11, 14].includes(issuerDocument.length) || ![11, 14].includes(recipientDocument.length)) throw new AppError('CPF/CNPJ do emitente ou destinatário é inválido.', 400, 'INVALID_NFE_PARTY_DOCUMENT');
  const items: ParsedFiscalItem[] = array(info.det).map((raw, index) => {
    const detail = record(raw); const product = record(detail.prod);
    const lineNumber = Number(string(detail['@_nItem']) || index + 1);
    const quantity = decimal(product.qCom); const unitValue = decimal(product.vUnCom); const total = decimal(product.vProd);
    if (!string(product.cProd) || !string(product.xProd) || Number(quantity) <= 0 || Number(unitValue) < 0 || Number(total) < 0) throw new AppError(`Item ${lineNumber} da NF-e possui dados inválidos.`, 400, 'INVALID_NFE_ITEM');
    return { lineNumber, fiscalCode: string(product.cProd), description: string(product.xProd), ...(string(product.NCM) ? { ncm: string(product.NCM) } : {}), ...(string(product.CFOP) ? { cfop: string(product.CFOP) } : {}), ...(string(product.uCom) ? { unit: string(product.uCom) } : {}), quantity, unitValue, total, taxes: cleanJson(detail.imposto) };
  });
  if (!items.length) throw new AppError('A NF-e não possui itens.', 400, 'NFE_ITEMS_REQUIRED');
  const statusCode = string(protocol.cStat);
  const movement = string(identification.dhSaiEnt) || string(identification.dSaiEnt);
  return {
    model, number: string(identification.nNF), series: string(identification.serie), accessKey,
    issueDate: new Date(issueDate).toISOString(), ...(movement && !Number.isNaN(new Date(movement).getTime()) ? { movementDate: new Date(movement).toISOString() } : {}),
    issuer: { name: string(issuer.xNome), document: issuerDocument }, recipient: { name: string(recipient.xNome), document: recipientDocument },
    productsTotal: decimal(totals.vProd), discountTotal: decimal(totals.vDesc), freightTotal: decimal(totals.vFrete), otherExpensesTotal: decimal(totals.vOutro), total: decimal(totals.vNF),
    taxes: cleanJson(totals), ...(statusCode ? { declaredFiscalStatus: `${statusCode}${string(protocol.xMotivo) ? ` - ${string(protocol.xMotivo)}` : ''}` } : {}), fiscalStatus: fiscalStatus(statusCode), items,
  };
}
