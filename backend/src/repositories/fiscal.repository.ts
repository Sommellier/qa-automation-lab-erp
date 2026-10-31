import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { ListFiscalDocumentsInput } from '../types/fiscal.js';

const person = { select: { id: true, name: true, email: true } } as const;
export const fiscalDocumentInclude = {
  company: { select: { id: true, legalName: true, taxId: true } }, supplier: { select: { id: true, name: true, document: true } }, client: { select: { id: true, name: true, document: true } },
  purchaseOrder: { select: { id: true, number: true, total: true, status: true } }, order: { select: { id: true, number: true, total: true, status: true } }, createdBy: person,
  importFile: { select: { id: true, fileName: true, size: true, sha256: true, createdAt: true, batchId: true } },
  items: { orderBy: { lineNumber: 'asc' as const }, include: { product: { select: { id: true, name: true, sku: true } } } },
  attachments: { orderBy: { createdAt: 'desc' as const }, include: { uploadedBy: person, removedBy: person } },
  payableLinks: { orderBy: { createdAt: 'asc' as const }, include: { payable: { include: { supplier: { select: { id: true, name: true } } } }, linkedBy: person } },
  receivableLinks: { orderBy: { createdAt: 'asc' as const }, include: { receivable: { include: { client: { select: { id: true, name: true } } } }, linkedBy: person } },
} satisfies Prisma.FiscalDocumentInclude;

export class PrismaFiscalRepository {
  async list(input: ListFiscalDocumentsInput) {
    const where: Prisma.FiscalDocumentWhereInput = {
      ...(input.search ? { OR: [
        { accessKey: { contains: input.search } }, { number: { contains: input.search, mode: 'insensitive' } },
        { issuerName: { contains: input.search, mode: 'insensitive' } }, { recipientName: { contains: input.search, mode: 'insensitive' } },
        { issuerDocument: { contains: input.search } }, { recipientDocument: { contains: input.search } },
      ] } : {}),
      ...(input.operation ? { operation: input.operation } : {}), ...(input.fiscalStatus ? { fiscalStatus: input.fiscalStatus } : {}),
      ...(input.processingStatus ? { processingStatus: input.processingStatus } : {}), ...(input.supplierId ? { supplierId: input.supplierId } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}), ...(input.purchaseOrderId ? { purchaseOrderId: input.purchaseOrderId } : {}), ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.dateFrom || input.dateTo ? { issueDate: { ...(input.dateFrom ? { gte: input.dateFrom } : {}), ...(input.dateTo ? { lte: input.dateTo } : {}) } } : {}),
    };
    const [records, total] = await prisma.$transaction([
      prisma.fiscalDocument.findMany({ where, orderBy: { issueDate: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
        include: { company: { select: { id: true, legalName: true, taxId: true } }, supplier: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, number: true } }, order: { select: { id: true, number: true } }, _count: { select: { items: true, attachments: true, payableLinks: true, receivableLinks: true } } } }),
      prisma.fiscalDocument.count({ where }),
    ]);
    return { records: records.map(({ _count, ...record }) => ({ ...record, itemsCount: _count.items, attachmentsCount: _count.attachments, financialLinksCount: _count.payableLinks + _count.receivableLinks })), total };
  }
  findById(id: string) { return prisma.fiscalDocument.findUnique({ where: { id }, include: fiscalDocumentInclude }); }
  async summary() {
    const [total, pendingLinks, inbound, outbound] = await prisma.$transaction([
      prisma.fiscalDocument.count(), prisma.fiscalDocument.count({ where: { processingStatus: 'PENDING_LINKS' } }),
      prisma.fiscalDocument.count({ where: { operation: 'INBOUND' } }), prisma.fiscalDocument.count({ where: { operation: 'OUTBOUND' } }),
    ]);
    return { total, pendingLinks, inbound, outbound };
  }
  listCompanies() { return prisma.fiscalCompany.findMany({ orderBy: { legalName: 'asc' }, include: { updatedBy: person } }); }
  findImportBatch(id: string) { return prisma.fiscalImportBatch.findUnique({ where: { id }, include: { company: true, files: { orderBy: { createdAt: 'asc' }, include: { duplicateDocument: { select: { id: true, accessKey: true, number: true } }, document: { select: { id: true } } } }, createdBy: person } }); }
  findAttachment(documentId: string, attachmentId: string) { return prisma.fiscalAttachment.findFirst({ where: { id: attachmentId, fiscalDocumentId: documentId, active: true }, include: { importFile: { select: { rawContent: true } } } }); }
  async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error: unknown) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito no processamento fiscal. Tente novamente.', 409, 'FISCAL_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito no processamento fiscal. Tente novamente.', 409, 'FISCAL_CONCURRENCY_CONFLICT');
  }
}
