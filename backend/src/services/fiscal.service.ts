import { createHash } from 'node:crypto';
import { AuditAction, AuditEntity, FiscalAttachmentType, FiscalImportFileStatus, FiscalImportStatus, FiscalOperation, FiscalProcessingStatus, Prisma } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import { fiscalDocumentInclude, PrismaFiscalRepository } from '../repositories/fiscal.repository.js';
import type { ConfirmFiscalImportInput, FiscalAttachmentMetadataInput, FiscalCompanyInput, ListFiscalDocumentsQuery, UpdateFiscalLinksInput } from '../schemas/fiscal.schema.js';
import type { FiscalUploadFile, ParsedFiscalDocument } from '../types/fiscal.js';
import type { AuditLogger } from './audit.service.js';
import { parseNfeXml } from './nfe-parser.js';

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const normalizedDocument = (value: string) => value.replace(/\D/g, '');
type LinkInput = UpdateFiscalLinksInput;

function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

export class FiscalService {
  constructor(private readonly fiscal: PrismaFiscalRepository, private readonly audit: AuditLogger) {}

  async list(query: ListFiscalDocumentsQuery) {
    const [{ records, total }, summary] = await Promise.all([this.fiscal.list(query), this.fiscal.summary()]);
    return { data: records, summary, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(id: string) {
    const document = await this.fiscal.findById(id);
    if (!document) throw new AppError('Documento fiscal não encontrado.', 404, 'FISCAL_DOCUMENT_NOT_FOUND');
    const expectedTotal = document.operation === FiscalOperation.INBOUND ? document.purchaseOrder?.total : document.order?.total;
    const financialTotal = document.operation === FiscalOperation.INBOUND
      ? document.payableLinks.reduce((sum, link) => sum.add(link.payable.originalAmount), new Prisma.Decimal(0))
      : document.receivableLinks.reduce((sum, link) => sum.add(link.receivable.originalAmount), new Prisma.Decimal(0));
    const divergences: Array<{ code: string; message: string }> = [];
    if (expectedTotal && !document.total.eq(expectedTotal)) divergences.push({ code: 'SOURCE_TOTAL_MISMATCH', message: `Total fiscal (${document.total.toFixed(2)}) difere da origem (${expectedTotal.toFixed(2)}).` });
    if ((document.payableLinks.length || document.receivableLinks.length) && !document.total.eq(financialTotal)) divergences.push({ code: 'FINANCIAL_TOTAL_MISMATCH', message: `Total fiscal (${document.total.toFixed(2)}) difere dos títulos vinculados (${financialTotal.toFixed(2)}).` });
    const unmapped = document.items.filter((item) => !item.productId).length;
    if (unmapped) divergences.push({ code: 'UNMAPPED_ITEMS', message: `${unmapped} item(ns) fiscal(is) ainda não possuem produto associado.` });
    return { ...document, divergences };
  }

  listCompanies() { return this.fiscal.listCompanies(); }

  createCompany(input: FiscalCompanyInput, actor: string) {
    return this.fiscal.transaction(async (tx) => {
      const taxId = normalizedDocument(input.taxId);
      if (await tx.fiscalCompany.findUnique({ where: { taxId }, select: { id: true } })) throw new AppError('Já existe uma empresa fiscal com este CPF/CNPJ.', 409, 'FISCAL_COMPANY_DUPLICATE');
      const company = await tx.fiscalCompany.create({ data: { legalName: input.legalName, taxId, active: input.active, updatedById: actor }, include: { updatedBy: { select: { id: true, name: true, email: true } } } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_COMPANY, entityId: company.id, action: AuditAction.CREATE, newData: { legalName: company.legalName, taxId: company.taxId, active: company.active } }, tx);
      return company;
    });
  }

  updateCompany(id: string, input: FiscalCompanyInput, actor: string) {
    return this.fiscal.transaction(async (tx) => {
      const current = await tx.fiscalCompany.findUnique({ where: { id } });
      if (!current) throw new AppError('Empresa fiscal não encontrada.', 404, 'FISCAL_COMPANY_NOT_FOUND');
      const taxId = normalizedDocument(input.taxId);
      const duplicate = await tx.fiscalCompany.findFirst({ where: { taxId, id: { not: id } }, select: { id: true } });
      if (duplicate) throw new AppError('Já existe uma empresa fiscal com este CPF/CNPJ.', 409, 'FISCAL_COMPANY_DUPLICATE');
      const company = await tx.fiscalCompany.update({ where: { id }, data: { legalName: input.legalName, taxId, active: input.active, updatedById: actor }, include: { updatedBy: { select: { id: true, name: true, email: true } } } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_COMPANY, entityId: id, action: AuditAction.UPDATE, oldData: { legalName: current.legalName, taxId: current.taxId, active: current.active }, newData: { legalName: company.legalName, taxId: company.taxId, active: company.active } }, tx);
      return company;
    });
  }

  preview(files: FiscalUploadFile[], actor: string) {
    if (!files.length) throw new AppError('Selecione ao menos um arquivo XML.', 400, 'FISCAL_XML_FILES_REQUIRED');
    const parsed = files.map((file) => {
      try { return { file, digest: sha256(file.buffer), document: parseNfeXml(file.buffer) } as const; }
      catch (error) { return { file, digest: sha256(file.buffer), error: error instanceof AppError ? error : new AppError('Não foi possível processar o XML.', 400, 'INVALID_FISCAL_XML') } as const; }
    });
    const seen = new Set<string>();
    return this.fiscal.transaction(async (tx) => {
      const companies = await tx.fiscalCompany.findMany({ where: { active: true } });
      const issuerDocuments = parsed.flatMap((item) => 'document' in item ? [item.document.issuer.document] : []);
      const recipientDocuments = parsed.flatMap((item) => 'document' in item ? [item.document.recipient.document] : []);
      const productCodes = parsed.flatMap((item) => 'document' in item ? item.document.items.map((line) => line.fiscalCode) : []);
      const [suppliers, clients, products] = await Promise.all([
        tx.supplier.findMany({ where: { document: { in: issuerDocuments } }, select: { id: true, name: true, document: true } }),
        tx.client.findMany({ where: { document: { in: recipientDocuments } }, select: { id: true, name: true, document: true } }),
        tx.product.findMany({ where: { sku: { in: productCodes } }, select: { id: true, name: true, sku: true } }),
      ]);
      const fileRecords: Prisma.FiscalImportFileCreateWithoutBatchInput[] = [];
      const matchedCompanyIds = new Set<string>();
      let validFiles = 0;
      for (const item of parsed) {
        if ('error' in item) {
          fileRecords.push({ fileName: item.file.originalname, contentType: item.file.mimetype || 'application/xml', size: item.file.size, sha256: item.digest, rawContent: item.file.buffer, status: FiscalImportFileStatus.INVALID, errorCode: item.error.code, errorMessage: item.error.message });
          continue;
        }
        const internalDuplicate = seen.has(item.document.accessKey); seen.add(item.document.accessKey);
        const company = companies.find((candidate) => [item.document.issuer.document, item.document.recipient.document].includes(candidate.taxId));
        const suggestedOperation = company?.taxId === item.document.recipient.document ? FiscalOperation.INBOUND : company?.taxId === item.document.issuer.document ? FiscalOperation.OUTBOUND : undefined;
        if (company) matchedCompanyIds.add(company.id);
        const duplicate = company ? await tx.fiscalDocument.findUnique({ where: { companyId_accessKey: { companyId: company.id, accessKey: item.document.accessKey } }, select: { id: true } }) : null;
        const status = internalDuplicate || duplicate ? FiscalImportFileStatus.DUPLICATE : FiscalImportFileStatus.VALID;
        if (status === FiscalImportFileStatus.VALID) validFiles += 1;
        const suggestedSupplier = suggestedOperation === FiscalOperation.INBOUND ? suppliers.find((candidate) => candidate.document === item.document.issuer.document) : undefined;
        const suggestedClient = suggestedOperation === FiscalOperation.OUTBOUND ? clients.find((candidate) => candidate.document === item.document.recipient.document) : undefined;
        const itemSuggestions = item.document.items.map((line) => ({ lineNumber: line.lineNumber, product: products.find((product) => product.sku.toLowerCase() === line.fiscalCode.toLowerCase()) ?? null }));
        const parsedData = { document: item.document, suggestion: { company: company ? { id: company.id, legalName: company.legalName, taxId: company.taxId } : null, operation: suggestedOperation ?? null, supplier: suggestedSupplier ?? null, client: suggestedClient ?? null, items: itemSuggestions } };
        fileRecords.push({ fileName: item.file.originalname, contentType: item.file.mimetype || 'application/xml', size: item.file.size, sha256: item.digest, rawContent: item.file.buffer, status, accessKey: item.document.accessKey, parsedData: json(parsedData), ...(duplicate ? { duplicateDocument: { connect: { id: duplicate.id } } } : {}), ...(internalDuplicate ? { errorCode: 'DUPLICATE_IN_BATCH', errorMessage: 'A chave de acesso está repetida neste lote.' } : duplicate ? { errorCode: 'FISCAL_DOCUMENT_DUPLICATE', errorMessage: 'Este documento fiscal já foi importado.' } : {}) });
      }
      const batch = await tx.fiscalImportBatch.create({ data: {
        ...(matchedCompanyIds.size === 1 ? { companyId: [...matchedCompanyIds][0] } : {}), status: FiscalImportStatus.PREVIEWED,
        totalFiles: files.length, validFiles, invalidFiles: files.length - validFiles, createdById: actor, files: { create: fileRecords },
      }, select: { id: true } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_IMPORT, entityId: batch.id, action: AuditAction.CREATE, newData: { totalFiles: files.length, validFiles, invalidFiles: files.length - validFiles, fileNames: files.map((file) => file.originalname) } }, tx);
      return batch.id;
    }).then((id) => this.getImportBatch(id));
  }

  async getImportBatch(id: string) {
    const batch = await this.fiscal.findImportBatch(id);
    if (!batch) throw new AppError('Lote de importação fiscal não encontrado.', 404, 'FISCAL_IMPORT_NOT_FOUND');
    return batch;
  }

  confirm(batchId: string, input: ConfirmFiscalImportInput, actor: string) {
    return this.fiscal.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "fiscal_import_batches" WHERE "id" = ${batchId}::uuid FOR UPDATE`;
      const batch = await tx.fiscalImportBatch.findUnique({ where: { id: batchId }, include: { files: true } });
      if (!batch) throw new AppError('Lote de importação fiscal não encontrado.', 404, 'FISCAL_IMPORT_NOT_FOUND');
      if (batch.status !== FiscalImportStatus.PREVIEWED) throw new AppError('Este lote já foi confirmado.', 409, 'FISCAL_IMPORT_ALREADY_CONFIRMED');
      const valid = batch.files.filter((file) => file.status === FiscalImportFileStatus.VALID);
      if (input.documents.length !== valid.length || input.documents.some((decision) => !valid.some((file) => file.id === decision.fileId))) throw new AppError('Confirme todos e somente os arquivos válidos do lote.', 400, 'FISCAL_IMPORT_SELECTION_MISMATCH');
      const company = await tx.fiscalCompany.findFirst({ where: { id: input.companyId, active: true } });
      if (!company) throw new AppError('Empresa fiscal ativa não encontrada.', 404, 'FISCAL_COMPANY_NOT_FOUND');
      const createdIds: string[] = [];
      for (const decision of input.documents) {
        const file = valid.find((candidate) => candidate.id === decision.fileId)!;
        const payload = file.parsedData as unknown as { document: ParsedFiscalDocument };
        const parsed = payload.document;
        const companyParty = decision.operation === FiscalOperation.INBOUND ? parsed.recipient.document : parsed.issuer.document;
        if (companyParty !== company.taxId) throw new AppError(`A empresa não corresponde à ${decision.operation === FiscalOperation.INBOUND ? 'destinatária' : 'emitente'} do arquivo ${file.fileName}.`, 409, 'FISCAL_COMPANY_OPERATION_MISMATCH');
        if (await tx.fiscalDocument.findUnique({ where: { companyId_accessKey: { companyId: company.id, accessKey: parsed.accessKey } }, select: { id: true } })) throw new AppError(`O documento ${parsed.accessKey} já foi importado.`, 409, 'FISCAL_DOCUMENT_DUPLICATE');
        const links = await this.validateLinks(tx, decision.operation, decision.links, parsed.items.map((item) => item.lineNumber));
        const allItemsMapped = links.itemMappings.length === parsed.items.length;
        const processingStatus = decision.operation === FiscalOperation.INBOUND
          ? links.supplierId && links.purchaseOrderId && allItemsMapped ? FiscalProcessingStatus.LINKED : FiscalProcessingStatus.PENDING_LINKS
          : links.clientId && links.orderId && allItemsMapped ? FiscalProcessingStatus.LINKED : FiscalProcessingStatus.PENDING_LINKS;
        const document = await tx.fiscalDocument.create({ data: {
          companyId: company.id, operation: decision.operation, model: parsed.model, number: parsed.number, series: parsed.series, accessKey: parsed.accessKey,
          issueDate: new Date(parsed.issueDate), ...(parsed.movementDate ? { movementDate: new Date(parsed.movementDate) } : {}),
          issuerName: parsed.issuer.name, issuerDocument: parsed.issuer.document, recipientName: parsed.recipient.name, recipientDocument: parsed.recipient.document,
          productsTotal: new Prisma.Decimal(parsed.productsTotal), discountTotal: new Prisma.Decimal(parsed.discountTotal), freightTotal: new Prisma.Decimal(parsed.freightTotal), otherExpensesTotal: new Prisma.Decimal(parsed.otherExpensesTotal), total: new Prisma.Decimal(parsed.total),
          taxTotals: json(parsed.taxes), ...(parsed.declaredFiscalStatus ? { declaredFiscalStatus: parsed.declaredFiscalStatus } : {}), fiscalStatus: parsed.fiscalStatus, processingStatus,
          supplierId: links.supplierId, clientId: links.clientId, purchaseOrderId: links.purchaseOrderId, orderId: links.orderId, importFileId: file.id, createdById: actor,
          items: { create: parsed.items.map((item) => ({ lineNumber: item.lineNumber, fiscalCode: item.fiscalCode, description: item.description, ...(item.ncm ? { ncm: item.ncm } : {}), ...(item.cfop ? { cfop: item.cfop } : {}), ...(item.unit ? { unit: item.unit } : {}), quantity: new Prisma.Decimal(item.quantity), unitValue: new Prisma.Decimal(item.unitValue), total: new Prisma.Decimal(item.total), taxes: json(item.taxes), productId: links.itemMappings.find((mapping) => mapping.lineNumber === item.lineNumber)?.productId })), },
          attachments: { create: { type: FiscalAttachmentType.ORIGINAL_XML, fileName: file.fileName, contentType: file.contentType, size: file.size, sha256: file.sha256, importFileId: file.id, uploadedById: actor } },
          ...(links.payableIds.length ? { payableLinks: { create: links.payableIds.map((payableId) => ({ payableId, linkedById: actor })) } } : {}),
          ...(links.receivableIds.length ? { receivableLinks: { create: links.receivableIds.map((receivableId) => ({ receivableId, linkedById: actor })) } } : {}),
        }, select: { id: true } });
        await tx.fiscalImportFile.update({ where: { id: file.id }, data: { status: FiscalImportFileStatus.IMPORTED } });
        await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_DOCUMENT, entityId: document.id, action: AuditAction.IMPORT, newData: { batchId, fileId: file.id, accessKey: parsed.accessKey, operation: decision.operation, fiscalStatus: parsed.fiscalStatus, processingStatus, links } }, tx);
        createdIds.push(document.id);
      }
      await tx.fiscalImportBatch.update({ where: { id: batchId }, data: { companyId: company.id, status: FiscalImportStatus.COMPLETED, importedFiles: createdIds.length, completedAt: new Date() } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_IMPORT, entityId: batchId, action: AuditAction.IMPORT, newData: { companyId: company.id, importedFiles: createdIds.length, documentIds: createdIds } }, tx);
      return { batchId, imported: createdIds.length, documentIds: createdIds };
    });
  }

  updateLinks(id: string, input: UpdateFiscalLinksInput, actor: string) {
    return this.fiscal.transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "fiscal_documents" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const current = await tx.fiscalDocument.findUnique({ where: { id }, include: { items: true, payableLinks: true, receivableLinks: true } });
      if (!current) throw new AppError('Documento fiscal não encontrado.', 404, 'FISCAL_DOCUMENT_NOT_FOUND');
      const links = await this.validateLinks(tx, current.operation, input, current.items.map((item) => item.lineNumber));
      await tx.fiscalDocumentItem.updateMany({ where: { fiscalDocumentId: id }, data: { productId: null } });
      for (const mapping of links.itemMappings) await tx.fiscalDocumentItem.update({ where: { fiscalDocumentId_lineNumber: { fiscalDocumentId: id, lineNumber: mapping.lineNumber } }, data: { productId: mapping.productId } });
      await tx.fiscalPayableLink.deleteMany({ where: { fiscalDocumentId: id } }); await tx.fiscalReceivableLink.deleteMany({ where: { fiscalDocumentId: id } });
      if (links.payableIds.length) await tx.fiscalPayableLink.createMany({ data: links.payableIds.map((payableId) => ({ fiscalDocumentId: id, payableId, linkedById: actor })) });
      if (links.receivableIds.length) await tx.fiscalReceivableLink.createMany({ data: links.receivableIds.map((receivableId) => ({ fiscalDocumentId: id, receivableId, linkedById: actor })) });
      const allItemsMapped = links.itemMappings.length === current.items.length;
      const processingStatus = current.operation === FiscalOperation.INBOUND ? links.supplierId && links.purchaseOrderId && allItemsMapped ? FiscalProcessingStatus.LINKED : FiscalProcessingStatus.PENDING_LINKS : links.clientId && links.orderId && allItemsMapped ? FiscalProcessingStatus.LINKED : FiscalProcessingStatus.PENDING_LINKS;
      await tx.fiscalDocument.update({ where: { id }, data: { supplierId: links.supplierId, clientId: links.clientId, purchaseOrderId: links.purchaseOrderId, orderId: links.orderId, processingStatus } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_DOCUMENT, entityId: id, action: AuditAction.LINK, oldData: { supplierId: current.supplierId, clientId: current.clientId, purchaseOrderId: current.purchaseOrderId, orderId: current.orderId, itemMappings: current.items.filter((item) => item.productId).map((item) => ({ lineNumber: item.lineNumber, productId: item.productId })), payableIds: current.payableLinks.map((link) => link.payableId), receivableIds: current.receivableLinks.map((link) => link.receivableId) }, newData: { ...links, processingStatus } }, tx);
      return tx.fiscalDocument.findUniqueOrThrow({ where: { id }, include: fiscalDocumentInclude });
    });
  }

  addAttachment(documentId: string, file: FiscalUploadFile | undefined, metadata: FiscalAttachmentMetadataInput, actor: string) {
    if (!file) throw new AppError('Selecione um arquivo para anexar.', 400, 'FISCAL_ATTACHMENT_REQUIRED');
    return this.fiscal.transaction(async (tx) => {
      if (!await tx.fiscalDocument.findUnique({ where: { id: documentId }, select: { id: true } })) throw new AppError('Documento fiscal não encontrado.', 404, 'FISCAL_DOCUMENT_NOT_FOUND');
      const attachment = await tx.fiscalAttachment.create({ data: { fiscalDocumentId: documentId, type: metadata.type, fileName: file.originalname, contentType: file.mimetype || 'application/octet-stream', size: file.size, sha256: sha256(file.buffer), content: file.buffer, uploadedById: actor }, include: { uploadedBy: { select: { id: true, name: true, email: true } } } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_ATTACHMENT, entityId: attachment.id, action: AuditAction.ATTACH, newData: { fiscalDocumentId: documentId, type: attachment.type, fileName: attachment.fileName, size: attachment.size, sha256: attachment.sha256 } }, tx);
      return attachment;
    });
  }

  async downloadAttachment(documentId: string, attachmentId: string) {
    const attachment = await this.fiscal.findAttachment(documentId, attachmentId);
    if (!attachment) throw new AppError('Anexo fiscal não encontrado.', 404, 'FISCAL_ATTACHMENT_NOT_FOUND');
    const content = attachment.content ?? attachment.importFile?.rawContent;
    if (!content) throw new AppError('Conteúdo do anexo fiscal indisponível.', 500, 'FISCAL_ATTACHMENT_CONTENT_MISSING');
    return { content: Buffer.from(content), fileName: attachment.fileName, contentType: attachment.contentType };
  }

  removeAttachment(documentId: string, attachmentId: string, actor: string) {
    return this.fiscal.transaction(async (tx) => {
      const attachment = await tx.fiscalAttachment.findFirst({ where: { id: attachmentId, fiscalDocumentId: documentId, active: true } });
      if (!attachment) throw new AppError('Anexo fiscal não encontrado.', 404, 'FISCAL_ATTACHMENT_NOT_FOUND');
      if (attachment.type === FiscalAttachmentType.ORIGINAL_XML) throw new AppError('O XML fiscal original não pode ser removido.', 409, 'ORIGINAL_FISCAL_XML_IMMUTABLE');
      const removedAt = new Date();
      const removed = await tx.fiscalAttachment.update({ where: { id: attachmentId }, data: { active: false, removedAt, removedById: actor } });
      await this.audit.log({ userId: actor, entityType: AuditEntity.FISCAL_ATTACHMENT, entityId: attachmentId, action: AuditAction.REMOVE, oldData: { active: true }, newData: { active: false, removedAt, fiscalDocumentId: documentId } }, tx);
      return removed;
    });
  }

  private async validateLinks(tx: Prisma.TransactionClient, operation: FiscalOperation, input: LinkInput, itemLines: number[]) {
    const supplierId = operation === FiscalOperation.INBOUND ? input.supplierId ?? null : null;
    const clientId = operation === FiscalOperation.OUTBOUND ? input.clientId ?? null : null;
    const purchaseOrderId = operation === FiscalOperation.INBOUND ? input.purchaseOrderId ?? null : null;
    const orderId = operation === FiscalOperation.OUTBOUND ? input.orderId ?? null : null;
    const payableIds = operation === FiscalOperation.INBOUND ? input.payableIds : [];
    const receivableIds = operation === FiscalOperation.OUTBOUND ? input.receivableIds : [];
    if (input.itemMappings.some((mapping) => !itemLines.includes(mapping.lineNumber))) throw new AppError('Um item informado não pertence ao documento fiscal.', 400, 'FISCAL_ITEM_NOT_FOUND');
    const productIds = [...new Set(input.itemMappings.map((mapping) => mapping.productId))];
    if (productIds.length && await tx.product.count({ where: { id: { in: productIds } } }) !== productIds.length) throw new AppError('Um produto associado não foi encontrado.', 404, 'PRODUCT_NOT_FOUND');
    if (supplierId && !await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true } })) throw new AppError('Fornecedor não encontrado.', 404, 'SUPPLIER_NOT_FOUND');
    if (clientId && !await tx.client.findUnique({ where: { id: clientId }, select: { id: true } })) throw new AppError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND');
    if (purchaseOrderId) {
      const purchase = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { supplierId: true } });
      if (!purchase) throw new AppError('Pedido de compra não encontrado.', 404, 'PURCHASE_NOT_FOUND');
      if (supplierId && purchase.supplierId !== supplierId) throw new AppError('O pedido de compra pertence a outro fornecedor.', 409, 'FISCAL_PURCHASE_SUPPLIER_MISMATCH');
    }
    if (orderId) {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { clientId: true } });
      if (!order) throw new AppError('Pedido de venda não encontrado.', 404, 'ORDER_NOT_FOUND');
      if (clientId && order.clientId !== clientId) throw new AppError('O pedido de venda pertence a outro cliente.', 409, 'FISCAL_ORDER_CLIENT_MISMATCH');
    }
    if (payableIds.length) {
      const payables = await tx.payable.findMany({ where: { id: { in: payableIds } }, select: { id: true, supplierId: true, purchaseOrderId: true } });
      if (payables.length !== payableIds.length) throw new AppError('Uma conta a pagar não foi encontrada.', 404, 'PAYABLE_NOT_FOUND');
      if (supplierId && payables.some((payable) => payable.supplierId !== supplierId)) throw new AppError('Uma conta a pagar pertence a outro fornecedor.', 409, 'FISCAL_PAYABLE_SUPPLIER_MISMATCH');
      if (purchaseOrderId && payables.some((payable) => payable.purchaseOrderId !== purchaseOrderId)) throw new AppError('Uma conta a pagar não pertence à compra vinculada.', 409, 'FISCAL_PAYABLE_PURCHASE_MISMATCH');
    }
    if (receivableIds.length) {
      const receivables = await tx.receivable.findMany({ where: { id: { in: receivableIds } }, select: { id: true, clientId: true, orderId: true } });
      if (receivables.length !== receivableIds.length) throw new AppError('Uma conta a receber não foi encontrada.', 404, 'RECEIVABLE_NOT_FOUND');
      if (clientId && receivables.some((receivable) => receivable.clientId !== clientId)) throw new AppError('Uma conta a receber pertence a outro cliente.', 409, 'FISCAL_RECEIVABLE_CLIENT_MISMATCH');
      if (orderId && receivables.some((receivable) => receivable.orderId !== orderId)) throw new AppError('Uma conta a receber não pertence à venda vinculada.', 409, 'FISCAL_RECEIVABLE_ORDER_MISMATCH');
    }
    return { supplierId, clientId, purchaseOrderId, orderId, itemMappings: input.itemMappings, payableIds, receivableIds };
  }
}
