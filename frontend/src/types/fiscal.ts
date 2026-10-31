export type FiscalOperation = 'INBOUND' | 'OUTBOUND';
export type FiscalStatus = 'UNKNOWN' | 'AUTHORIZED' | 'CANCELLED' | 'DENIED' | 'VOIDED';
export type FiscalProcessingStatus = 'PENDING_LINKS' | 'LINKED';
export type FiscalAttachmentType = 'ORIGINAL_XML' | 'DANFE_PDF' | 'RECEIPT' | 'AUXILIARY' | 'OTHER';
export const FISCAL_OPERATION_LABELS: Record<FiscalOperation, string> = { INBOUND: 'Entrada', OUTBOUND: 'Saída' };
export const FISCAL_STATUS_LABELS: Record<FiscalStatus, string> = { UNKNOWN: 'Não verificada', AUTHORIZED: 'Autorizada no XML', CANCELLED: 'Cancelada no XML', DENIED: 'Denegada no XML', VOIDED: 'Inutilizada no XML' };
export const FISCAL_PROCESSING_LABELS: Record<FiscalProcessingStatus, string> = { PENDING_LINKS: 'Vínculos pendentes', LINKED: 'Vinculada' };
export const FISCAL_ATTACHMENT_LABELS: Record<FiscalAttachmentType, string> = { ORIGINAL_XML: 'XML original', DANFE_PDF: 'DANFE PDF', RECEIPT: 'Comprovante', AUXILIARY: 'Documento auxiliar', OTHER: 'Outro' };

export interface FiscalCompany { id: string; legalName: string; taxId: string; active: boolean; updatedBy: { id: string; name: string; email: string } | null; createdAt: string; updatedAt: string }
export interface FiscalDocumentSummary {
  id: string; operation: FiscalOperation; model: string; number: string; series: string; accessKey: string; issueDate: string;
  issuerName: string; issuerDocument: string; recipientName: string; recipientDocument: string; total: string; fiscalStatus: FiscalStatus; processingStatus: FiscalProcessingStatus;
  company: { id: string; legalName: string; taxId: string }; supplier: { id: string; name: string } | null; client: { id: string; name: string } | null;
  purchaseOrder: { id: string; number: string } | null; order: { id: string; number: string } | null; itemsCount: number; attachmentsCount: number; financialLinksCount: number; createdAt: string;
}
export interface FiscalParsedItem { lineNumber: number; fiscalCode: string; description: string; ncm?: string; cfop?: string; unit?: string; quantity: string; unitValue: string; total: string; taxes: Record<string, unknown> }
export interface FiscalParsedDocument { model: string; number: string; series: string; accessKey: string; issueDate: string; movementDate?: string; issuer: { name: string; document: string }; recipient: { name: string; document: string }; productsTotal: string; discountTotal: string; freightTotal: string; otherExpensesTotal: string; total: string; taxes: Record<string, unknown>; declaredFiscalStatus?: string; fiscalStatus: FiscalStatus; items: FiscalParsedItem[] }
export interface FiscalImportSuggestion { company: { id: string; legalName: string; taxId: string } | null; operation: FiscalOperation | null; supplier: { id: string; name: string; document: string } | null; client: { id: string; name: string; document: string } | null; items: Array<{ lineNumber: number; product: { id: string; name: string; sku: string } | null }> }
export interface FiscalImportFile { id: string; fileName: string; contentType: string; size: number; status: 'VALID' | 'INVALID' | 'DUPLICATE' | 'IMPORTED'; accessKey: string | null; errorCode: string | null; errorMessage: string | null; parsedData: { document: FiscalParsedDocument; suggestion: FiscalImportSuggestion } | null; duplicateDocument: { id: string; accessKey: string; number: string } | null; document: { id: string } | null }
export interface FiscalImportBatch { id: string; status: 'PREVIEWED' | 'COMPLETED' | 'FAILED'; totalFiles: number; validFiles: number; invalidFiles: number; importedFiles: number; company: FiscalCompany | null; files: FiscalImportFile[]; createdAt: string; completedAt: string | null }
export interface FiscalLinksInput { supplierId?: string | null; clientId?: string | null; purchaseOrderId?: string | null; orderId?: string | null; itemMappings: Array<{ lineNumber: number; productId: string }>; payableIds: string[]; receivableIds: string[] }
export interface FiscalAttachment { id: string; type: FiscalAttachmentType; fileName: string; contentType: string; size: number; sha256: string; active: boolean; uploadedBy: { id: string; name: string; email: string }; removedAt: string | null; createdAt: string }
export interface FiscalDocument extends Omit<FiscalDocumentSummary, 'itemsCount' | 'attachmentsCount' | 'financialLinksCount'> {
  movementDate: string | null; productsTotal: string; discountTotal: string; freightTotal: string; otherExpensesTotal: string; taxTotals: Record<string, unknown> | null; declaredFiscalStatus: string | null;
  createdBy: { id: string; name: string; email: string }; importFile: { id: string; fileName: string; size: number; sha256: string; createdAt: string; batchId: string }; items: Array<FiscalParsedItem & { id: string; productId: string | null; product: { id: string; name: string; sku: string } | null }>;
  attachments: FiscalAttachment[]; payableLinks: Array<{ id: string; payable: { id: string; number: string; originalAmount: string; paidAmount: string; dueDate: string; status: string; supplier: { id: string; name: string } } }>;
  receivableLinks: Array<{ id: string; receivable: { id: string; number: string; originalAmount: string; receivedAmount: string; dueDate: string; status: string; client: { id: string; name: string } } }>;
  divergences: Array<{ code: string; message: string }>;
}
export interface PaginatedFiscalDocuments { data: FiscalDocumentSummary[]; summary: { total: number; pendingLinks: number; inbound: number; outbound: number }; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
