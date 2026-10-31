import type { Request, Response } from 'express';
import { confirmFiscalImportSchema, fiscalAttachmentMetadataSchema, fiscalCompanyInputSchema, fiscalIdSchema, listFiscalDocumentsQuerySchema, updateFiscalLinksSchema } from '../schemas/fiscal.schema.js';
import type { FiscalService } from '../services/fiscal.service.js';
import type { FiscalUploadFile } from '../types/fiscal.js';
import { authenticatedUserId } from '../utils/request-auth.js';

const files = (request: Request): FiscalUploadFile[] => Array.isArray(request.files) ? request.files as FiscalUploadFile[] : [];
const file = (request: Request): FiscalUploadFile | undefined => request.file;

export class FiscalController {
  constructor(private readonly service: FiscalService) {}
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listFiscalDocumentsQuerySchema.parse(request.query)));
  getById = async (request: Request, response: Response) => response.status(200).json({ document: await this.service.getById(fiscalIdSchema.parse(request.params.id)) });
  listCompanies = async (_request: Request, response: Response) => response.status(200).json({ companies: await this.service.listCompanies() });
  createCompany = async (request: Request, response: Response) => response.status(201).json({ company: await this.service.createCompany(fiscalCompanyInputSchema.parse(request.body), authenticatedUserId(request)) });
  updateCompany = async (request: Request, response: Response) => response.status(200).json({ company: await this.service.updateCompany(fiscalIdSchema.parse(request.params.id), fiscalCompanyInputSchema.parse(request.body), authenticatedUserId(request)) });
  preview = async (request: Request, response: Response) => response.status(201).json({ batch: await this.service.preview(files(request), authenticatedUserId(request)) });
  getImportBatch = async (request: Request, response: Response) => response.status(200).json({ batch: await this.service.getImportBatch(fiscalIdSchema.parse(request.params.id)) });
  confirm = async (request: Request, response: Response) => response.status(201).json(await this.service.confirm(fiscalIdSchema.parse(request.params.id), confirmFiscalImportSchema.parse(request.body), authenticatedUserId(request)));
  updateLinks = async (request: Request, response: Response) => response.status(200).json({ document: await this.service.updateLinks(fiscalIdSchema.parse(request.params.id), updateFiscalLinksSchema.parse(request.body), authenticatedUserId(request)) });
  addAttachment = async (request: Request, response: Response) => response.status(201).json({ attachment: await this.service.addAttachment(fiscalIdSchema.parse(request.params.id), file(request), fiscalAttachmentMetadataSchema.parse(request.body), authenticatedUserId(request)) });
  downloadAttachment = async (request: Request, response: Response) => {
    const attachment = await this.service.downloadAttachment(fiscalIdSchema.parse(request.params.id), fiscalIdSchema.parse(request.params.attachmentId));
    response.setHeader('Content-Type', attachment.contentType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    response.status(200).send(attachment.content);
  };
  removeAttachment = async (request: Request, response: Response) => response.status(200).json({ attachment: await this.service.removeAttachment(fiscalIdSchema.parse(request.params.id), fiscalIdSchema.parse(request.params.attachmentId), authenticatedUserId(request)) });
}
