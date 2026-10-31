import type { Request, Response } from 'express';
import { collectionIdSchema, listReceivablesQuerySchema, receivableIdSchema, receivableSummaryQuerySchema, statementClientIdSchema, statementQuerySchema, type RegisterCollectionInput, type ReverseCollectionInput } from '../schemas/receivable.schema.js';
import type { ReceivableService } from '../services/receivable.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class ReceivableController {
  constructor(private readonly service: ReceivableService) {}
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listReceivablesQuerySchema.parse(request.query)));
  summary = async (request: Request, response: Response) => response.status(200).json(await this.service.summary(receivableSummaryQuerySchema.parse(request.query)));
  statement = async (request: Request, response: Response) => response.status(200).json(await this.service.statement(statementClientIdSchema.parse(request.params.clientId), statementQuerySchema.parse(request.query)));
  getById = async (request: Request, response: Response) => response.status(200).json({ receivable: await this.service.getById(receivableIdSchema.parse(request.params.id)) });
  collect = async (request: Request<{ id: string }, unknown, RegisterCollectionInput>, response: Response) => response.status(201).json({ receivable: await this.service.registerCollection(receivableIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
  reverse = async (request: Request<{ id: string; collectionId: string }, unknown, ReverseCollectionInput>, response: Response) => response.status(200).json({ receivable: await this.service.reverseCollection(receivableIdSchema.parse(request.params.id), collectionIdSchema.parse(request.params.collectionId), request.body, request.auth!.role, authenticatedUserId(request)) });
  cancel = async (request: Request<{ id: string }>, response: Response) => response.status(200).json({ receivable: await this.service.cancel(receivableIdSchema.parse(request.params.id), request.auth!.role, authenticatedUserId(request)) });
}
