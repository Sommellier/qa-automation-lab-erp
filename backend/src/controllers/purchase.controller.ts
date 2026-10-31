import type { Request, Response } from 'express';
import { approvalRuleRoleSchema, costHistoryQuerySchema, createPurchaseSchema, listPurchasesQuerySchema, productCostHistoryIdSchema, purchaseApprovalCommentSchema, purchaseIdSchema, rejectPurchaseSchema, updateApprovalRuleSchema, type CreatePurchaseInput, type PurchaseApprovalCommentInput, type ReceivePurchaseInput, type RejectPurchaseInput, type UpdateApprovalRuleInput } from '../schemas/purchase.schema.js';
import type { PurchaseService } from '../services/purchase.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class PurchaseController {
  constructor(private readonly service: PurchaseService) {}
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listPurchasesQuerySchema.parse(request.query)));
  getById = async (request: Request, response: Response) => response.status(200).json({ purchase: await this.service.getById(purchaseIdSchema.parse(request.params.id)) });
  create = async (request: Request<unknown, unknown, CreatePurchaseInput>, response: Response) => response.status(201).json({ purchase: await this.service.create(createPurchaseSchema.parse(request.body), authenticatedUserId(request)) });
  receive = async (request: Request<{ id: string }, unknown, ReceivePurchaseInput>, response: Response) => response.status(201).json({ purchase: await this.service.receive(purchaseIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
  cancel = async (request: Request<{ id: string }>, response: Response) => response.status(200).json({ purchase: await this.service.cancel(purchaseIdSchema.parse(request.params.id), request.auth!.role, authenticatedUserId(request)) });
  listApprovalRules = async (_request: Request, response: Response) => response.status(200).json(await this.service.listApprovalRules());
  updateApprovalRule = async (request: Request<{ role: string }, unknown, UpdateApprovalRuleInput>, response: Response) => response.status(200).json({ rule: await this.service.updateApprovalRule(approvalRuleRoleSchema.parse(request.params.role), updateApprovalRuleSchema.parse(request.body), authenticatedUserId(request)) });
  submitForApproval = async (request: Request<{ id: string }, unknown, PurchaseApprovalCommentInput>, response: Response) => response.status(200).json({ purchase: await this.service.submitForApproval(purchaseIdSchema.parse(request.params.id), purchaseApprovalCommentSchema.parse(request.body), request.auth!.role, authenticatedUserId(request)) });
  approve = async (request: Request<{ id: string }, unknown, PurchaseApprovalCommentInput>, response: Response) => response.status(200).json({ purchase: await this.service.approve(purchaseIdSchema.parse(request.params.id), purchaseApprovalCommentSchema.parse(request.body), request.auth!.role, authenticatedUserId(request)) });
  reject = async (request: Request<{ id: string }, unknown, RejectPurchaseInput>, response: Response) => response.status(200).json({ purchase: await this.service.reject(purchaseIdSchema.parse(request.params.id), rejectPurchaseSchema.parse(request.body), request.auth!.role, authenticatedUserId(request)) });
  costHistory = async (request: Request, response: Response) => response.status(200).json(await this.service.costHistory(productCostHistoryIdSchema.parse(request.params.productId), costHistoryQuerySchema.parse(request.query)));
}
