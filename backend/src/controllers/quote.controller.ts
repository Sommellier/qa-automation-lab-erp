import type { Request, Response } from 'express';
import {
  createQuoteSchema, listQuotesQuerySchema, quoteCommentSchema, quoteIdSchema, quoteOptionalCommentSchema, quoteRoleSchema,
  rejectQuoteSchema, renewQuoteSchema, updateCommissionRuleSchema, updateQuoteApprovalRuleSchema, updateQuoteSchema,
} from '../schemas/quote.schema.js';
import type { QuoteService } from '../services/quote.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

const id = (value: unknown) => quoteIdSchema.parse(value);

export class QuoteController {
  constructor(private readonly service: QuoteService) {}
  setup = async (request: Request, response: Response) => response.status(200).json(await this.service.setup(authenticatedUserId(request), request.auth!.role));
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listQuotesQuerySchema.parse(request.query), authenticatedUserId(request)));
  get = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.getById(id(request.params.id), authenticatedUserId(request)) });
  create = async (request: Request, response: Response) => response.status(201).json({ quote: await this.service.create(createQuoteSchema.parse(request.body), authenticatedUserId(request), request.auth!.role) });
  update = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.update(id(request.params.id), updateQuoteSchema.parse(request.body), authenticatedUserId(request), request.auth!.role) });
  submit = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.submit(id(request.params.id), quoteOptionalCommentSchema.parse(request.body).comment, authenticatedUserId(request), request.auth!.role) });
  approve = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.approve(id(request.params.id), quoteOptionalCommentSchema.parse(request.body).comment, authenticatedUserId(request), request.auth!.role) });
  reject = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.reject(id(request.params.id), rejectQuoteSchema.parse(request.body).reason, authenticatedUserId(request), request.auth!.role) });
  renew = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.renew(id(request.params.id), renewQuoteSchema.parse(request.body).reservationHours, authenticatedUserId(request), request.auth!.role) });
  note = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.addNote(id(request.params.id), quoteCommentSchema.parse(request.body).comment, authenticatedUserId(request), request.auth!.role) });
  cancel = async (request: Request, response: Response) => response.status(200).json({ quote: await this.service.cancel(id(request.params.id), quoteOptionalCommentSchema.parse(request.body).comment, authenticatedUserId(request), request.auth!.role) });
  convert = async (request: Request, response: Response) => response.status(201).json({ order: await this.service.convert(id(request.params.id), authenticatedUserId(request), request.auth!.role) });
  approvalRules = async (_request: Request, response: Response) => response.status(200).json(await this.service.listApprovalRules());
  updateApprovalRule = async (request: Request, response: Response) => response.status(200).json({ rule: await this.service.updateApprovalRule(quoteRoleSchema.parse(request.params.role), updateQuoteApprovalRuleSchema.parse(request.body), authenticatedUserId(request)) });
  commissionRules = async (_request: Request, response: Response) => response.status(200).json(await this.service.listCommissionRules());
  updateCommissionRule = async (request: Request, response: Response) => response.status(200).json({ rule: await this.service.updateCommissionRule(quoteIdSchema.parse(request.params.userId), updateCommissionRuleSchema.parse(request.body), authenticatedUserId(request)) });
  commissions = async (_request: Request, response: Response) => response.status(200).json(await this.service.commissions());
}
