import type { Request, Response } from 'express';
import {
  confirmReturnPhysicalSchema,
  createReturnSchema,
  inspectReturnItemSchema,
  linkReturnAdjustmentSchema,
  linkReturnFiscalSchema,
  listReturnsQuerySchema,
  rejectReturnSchema,
  returnAttachmentMetadataSchema,
  returnCommentSchema,
  returnIdSchema,
  returnReasonInputSchema,
  settleReturnAdjustmentSchema,
} from '../schemas/return.schema.js';
import type { ReturnService } from '../services/return.service.js';
import type { ReturnUploadFile } from '../types/return.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class ReturnController {
  constructor(private readonly service: ReturnService) {}
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listReturnsQuerySchema.parse(request.query)));
  getById = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.getById(returnIdSchema.parse(request.params.id)) });
  create = async (request: Request, response: Response) => response.status(201).json({ returnProcess: await this.service.create(createReturnSchema.parse(request.body), authenticatedUserId(request)) });
  listReasons = async (request: Request, response: Response) => response.status(200).json({ reasons: await this.service.listReasons(request.query.includeInactive === 'true') });
  createReason = async (request: Request, response: Response) => response.status(201).json({ reason: await this.service.createReason(returnReasonInputSchema.parse(request.body), authenticatedUserId(request)) });
  updateReason = async (request: Request, response: Response) => response.status(200).json({ reason: await this.service.updateReason(returnIdSchema.parse(request.params.reasonId), returnReasonInputSchema.parse(request.body), authenticatedUserId(request)) });
  submit = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.submit(returnIdSchema.parse(request.params.id), returnCommentSchema.parse(request.body), authenticatedUserId(request)) });
  startReview = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.startReview(returnIdSchema.parse(request.params.id), returnCommentSchema.parse(request.body), authenticatedUserId(request)) });
  approve = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.approve(returnIdSchema.parse(request.params.id), returnCommentSchema.parse(request.body), authenticatedUserId(request)) });
  reject = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.reject(returnIdSchema.parse(request.params.id), rejectReturnSchema.parse(request.body), authenticatedUserId(request)) });
  cancel = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.cancel(returnIdSchema.parse(request.params.id), returnCommentSchema.parse(request.body), authenticatedUserId(request)) });
  confirmPhysical = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.confirmPhysical(returnIdSchema.parse(request.params.id), confirmReturnPhysicalSchema.parse(request.body), authenticatedUserId(request)) });
  inspectItem = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.inspectItem(returnIdSchema.parse(request.params.id), returnIdSchema.parse(request.params.itemId), inspectReturnItemSchema.parse(request.body), authenticatedUserId(request)) });
  linkAdjustment = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.linkAdjustment(returnIdSchema.parse(request.params.id), returnIdSchema.parse(request.params.adjustmentId), linkReturnAdjustmentSchema.parse(request.body), authenticatedUserId(request)) });
  approveAdjustment = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.approveAdjustment(returnIdSchema.parse(request.params.id), returnIdSchema.parse(request.params.adjustmentId), authenticatedUserId(request)) });
  settleAdjustment = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.settleAdjustment(returnIdSchema.parse(request.params.id), returnIdSchema.parse(request.params.adjustmentId), settleReturnAdjustmentSchema.parse(request.body), authenticatedUserId(request)) });
  linkFiscal = async (request: Request, response: Response) => response.status(200).json({ returnProcess: await this.service.linkFiscal(returnIdSchema.parse(request.params.id), linkReturnFiscalSchema.parse(request.body), authenticatedUserId(request)) });
  addAttachment = async (request: Request, response: Response) => response.status(201).json({ attachment: await this.service.addAttachment(returnIdSchema.parse(request.params.id), request.file as ReturnUploadFile | undefined, returnAttachmentMetadataSchema.parse(request.body), authenticatedUserId(request)) });
  downloadAttachment = async (request: Request, response: Response) => {
    const attachment = await this.service.downloadAttachment(returnIdSchema.parse(request.params.id), returnIdSchema.parse(request.params.attachmentId));
    response.setHeader('Content-Type', attachment.contentType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    response.status(200).send(attachment.content);
  };
  removeAttachment = async (request: Request, response: Response) => response.status(200).json({ attachment: await this.service.removeAttachment(returnIdSchema.parse(request.params.id), returnIdSchema.parse(request.params.attachmentId), authenticatedUserId(request)) });
}
