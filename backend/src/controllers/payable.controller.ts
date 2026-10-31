import type { Request, Response } from 'express';
import { listPayablesQuerySchema, payableIdSchema, payableSummaryQuerySchema, paymentIdSchema, type RegisterPaymentInput, type ReversePaymentInput } from '../schemas/payable.schema.js';
import type { PayableService } from '../services/payable.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class PayableController {
  constructor(private readonly service: PayableService) {}
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listPayablesQuerySchema.parse(request.query)));
  summary = async (request: Request, response: Response) => response.status(200).json(await this.service.summary(payableSummaryQuerySchema.parse(request.query)));
  getById = async (request: Request, response: Response) => response.status(200).json({ payable: await this.service.getById(payableIdSchema.parse(request.params.id)) });
  pay = async (request: Request<{ id: string }, unknown, RegisterPaymentInput>, response: Response) => response.status(201).json({ payable: await this.service.registerPayment(payableIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
  reverse = async (request: Request<{ id: string; paymentId: string }, unknown, ReversePaymentInput>, response: Response) => response.status(200).json({ payable: await this.service.reversePayment(payableIdSchema.parse(request.params.id), paymentIdSchema.parse(request.params.paymentId), request.body, request.auth!.role, authenticatedUserId(request)) });
  cancel = async (request: Request<{ id: string }>, response: Response) => response.status(200).json({ payable: await this.service.cancel(payableIdSchema.parse(request.params.id), request.auth!.role, authenticatedUserId(request)) });
}
