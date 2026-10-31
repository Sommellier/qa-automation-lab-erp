import { ImportType } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { importJobIdSchema, listImportsQuerySchema, optionalValidationJobIdSchema } from '../schemas/import.schema.js';
import type { ImportService } from '../services/import.service.js';
import type { CsvFile, ImportActor } from '../types/import.js';

function actor(request: Request): ImportActor {
  if (!request.auth) throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
  return { id: request.auth.userId, role: request.auth.role };
}

function file(request: Request): CsvFile {
  if (!request.file) throw new AppError('Selecione um arquivo CSV.', 400, 'CSV_FILE_REQUIRED');
  return request.file;
}

export class ImportController {
  constructor(private readonly service: ImportService) {}

  clientsTemplate = (_request: Request, response: Response): void => this.sendTemplate(ImportType.CLIENTS, response);
  productsTemplate = (_request: Request, response: Response): void => this.sendTemplate(ImportType.PRODUCTS, response);
  validateClients = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.validate(ImportType.CLIENTS, file(request), actor(request))); };
  validateProducts = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.validate(ImportType.PRODUCTS, file(request), actor(request))); };
  executeClients = async (request: Request, response: Response): Promise<void> => { response.status(201).json(await this.service.execute(ImportType.CLIENTS, file(request), actor(request), optionalValidationJobIdSchema.parse(request.body.validationJobId || undefined))); };
  executeProducts = async (request: Request, response: Response): Promise<void> => { response.status(201).json(await this.service.execute(ImportType.PRODUCTS, file(request), actor(request), optionalValidationJobIdSchema.parse(request.body.validationJobId || undefined))); };
  list = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.list(listImportsQuerySchema.parse(request.query), actor(request))); };
  getById = async (request: Request<{ id: string }>, response: Response): Promise<void> => { response.status(200).json(await this.service.getById(importJobIdSchema.parse(request.params.id), actor(request))); };

  private sendTemplate(type: ImportType, response: Response): void {
    const template = this.service.template(type);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
    response.status(200).send(template.content);
  }
}
