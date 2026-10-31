import { describe, expect, it } from 'vitest';
import { confirmFiscalImportSchema, fiscalCompanyInputSchema, listFiscalDocumentsQuerySchema, updateFiscalLinksSchema } from './fiscal.schema.js';

const id = (value: string) => `${value.repeat(8)}-${value.repeat(4)}-4${value.repeat(3)}-8${value.repeat(3)}-${value.repeat(12)}`;

describe('schemas fiscais', () => {
  it('normaliza a empresa e os filtros', () => {
    expect(fiscalCompanyInputSchema.parse({ legalName: ' Empresa Teste ', taxId: '12.345.678/0001-95' })).toEqual({ legalName: 'Empresa Teste', taxId: '12345678000195', active: true });
    expect(listFiscalDocumentsQuerySchema.parse({ operation: 'INBOUND', page: '2' })).toMatchObject({ operation: 'INBOUND', page: 2, pageSize: 10 });
  });
  it('rejeita campos extras e vínculos duplicados', () => {
    expect(fiscalCompanyInputSchema.safeParse({ legalName: 'Empresa', taxId: '12345678000195', emissionEnabled: true }).success).toBe(false);
    expect(updateFiscalLinksSchema.safeParse({ itemMappings: [{ lineNumber: 1, productId: id('1') }, { lineNumber: 1, productId: id('2') }] }).success).toBe(false);
  });
  it('exige seleção única dos arquivos confirmados', () => {
    const fileId = id('1'); const companyId = id('2');
    expect(confirmFiscalImportSchema.safeParse({ companyId, documents: [{ fileId, operation: 'INBOUND', links: {} }, { fileId, operation: 'INBOUND', links: {} }] }).success).toBe(false);
    expect(confirmFiscalImportSchema.parse({ companyId, documents: [{ fileId, operation: 'OUTBOUND', links: {} }] }).documents[0]?.links).toMatchObject({ itemMappings: [], payableIds: [], receivableIds: [] });
  });
});
