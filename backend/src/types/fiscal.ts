import type { FiscalDocumentStatus, FiscalOperation, FiscalProcessingStatus } from '@prisma/client';

export interface FiscalUploadFile { originalname: string; mimetype: string; size: number; buffer: Buffer }
export interface ParsedFiscalItem {
  lineNumber: number; fiscalCode: string; description: string; ncm?: string; cfop?: string; unit?: string;
  quantity: string; unitValue: string; total: string; taxes: Record<string, unknown>;
}
export interface ParsedFiscalDocument {
  model: string; number: string; series: string; accessKey: string; issueDate: string; movementDate?: string;
  issuer: { name: string; document: string }; recipient: { name: string; document: string };
  productsTotal: string; discountTotal: string; freightTotal: string; otherExpensesTotal: string; total: string;
  taxes: Record<string, unknown>; declaredFiscalStatus?: string; fiscalStatus: FiscalDocumentStatus; items: ParsedFiscalItem[];
}
export interface ListFiscalDocumentsInput {
  search?: string | undefined; operation?: FiscalOperation | undefined; fiscalStatus?: FiscalDocumentStatus | undefined; processingStatus?: FiscalProcessingStatus | undefined;
  supplierId?: string | undefined; clientId?: string | undefined; purchaseOrderId?: string | undefined; orderId?: string | undefined; dateFrom?: Date | undefined; dateTo?: Date | undefined;
  page: number; pageSize: number; sortOrder: 'asc' | 'desc';
}
