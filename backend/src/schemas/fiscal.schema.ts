import { FiscalAttachmentType, FiscalDocumentStatus, FiscalOperation, FiscalProcessingStatus } from '@prisma/client';
import { z } from 'zod';

const optionalUuid = z.union([z.uuid(), z.literal('').transform(() => undefined)]).optional();
const digits = (value: string) => value.replace(/\D/g, '');

export const fiscalIdSchema = z.uuid('Identificador fiscal inválido.');
export const fiscalCompanyInputSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  taxId: z.string().transform(digits).refine((value) => value.length === 11 || value.length === 14, 'Informe um CPF ou CNPJ válido.'),
  active: z.boolean().default(true),
}).strict();
export const listFiscalDocumentsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  operation: z.enum(FiscalOperation).optional(),
  fiscalStatus: z.enum(FiscalDocumentStatus).optional(),
  processingStatus: z.enum(FiscalProcessingStatus).optional(),
  supplierId: optionalUuid,
  clientId: optionalUuid,
  purchaseOrderId: optionalUuid,
  orderId: optionalUuid,
  dateFrom: z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dateTo: z.iso.date().transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, { path: ['dateTo'], message: 'Período inválido.' });

const itemMappingSchema = z.object({ lineNumber: z.number().int().positive(), productId: z.uuid() }).strict();
const linksSchema = z.object({
  supplierId: z.uuid().nullable().optional(), clientId: z.uuid().nullable().optional(),
  purchaseOrderId: z.uuid().nullable().optional(), orderId: z.uuid().nullable().optional(),
  itemMappings: z.array(itemMappingSchema).max(500).default([]),
  payableIds: z.array(z.uuid()).max(100).default([]), receivableIds: z.array(z.uuid()).max(100).default([]),
}).strict().superRefine((data, context) => {
  if (new Set(data.itemMappings.map((item) => item.lineNumber)).size !== data.itemMappings.length) context.addIssue({ code: 'custom', path: ['itemMappings'], message: 'Não são permitidos vínculos duplicados.' });
  if (new Set(data.payableIds).size !== data.payableIds.length) context.addIssue({ code: 'custom', path: ['payableIds'], message: 'Não são permitidos vínculos duplicados.' });
  if (new Set(data.receivableIds).size !== data.receivableIds.length) context.addIssue({ code: 'custom', path: ['receivableIds'], message: 'Não são permitidos vínculos duplicados.' });
});
export const confirmFiscalImportSchema = z.object({
  companyId: z.uuid('Empresa fiscal inválida.'),
  documents: z.array(z.object({ fileId: z.uuid(), operation: z.enum(FiscalOperation), links: linksSchema }).strict()).min(1).max(100),
}).strict().superRefine((data, context) => {
  const ids = data.documents.map((document) => document.fileId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['documents'], message: 'O mesmo arquivo não pode ser confirmado duas vezes.' });
});
export const updateFiscalLinksSchema = linksSchema;
export const fiscalAttachmentMetadataSchema = z.object({
  type: z.enum([FiscalAttachmentType.DANFE_PDF, FiscalAttachmentType.RECEIPT, FiscalAttachmentType.AUXILIARY, FiscalAttachmentType.OTHER]),
}).strict();

export type FiscalCompanyInput = z.infer<typeof fiscalCompanyInputSchema>;
export type ListFiscalDocumentsQuery = z.infer<typeof listFiscalDocumentsQuerySchema>;
export type ConfirmFiscalImportInput = z.infer<typeof confirmFiscalImportSchema>;
export type UpdateFiscalLinksInput = z.infer<typeof updateFiscalLinksSchema>;
export type FiscalAttachmentMetadataInput = z.infer<typeof fiscalAttachmentMetadataSchema>;
