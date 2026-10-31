import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { ReturnController } from '../controllers/return.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { uploadReturnAttachment } from '../middlewares/return-upload.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaReturnRepository } from '../repositories/return.repository.js';
import { PrismaStockRepository } from '../repositories/stock.repository.js';
import {
  confirmReturnPhysicalSchema,
  createReturnSchema,
  inspectReturnItemSchema,
  linkReturnAdjustmentSchema,
  linkReturnFiscalSchema,
  rejectReturnSchema,
  returnCommentSchema,
  returnReasonInputSchema,
  settleReturnAdjustmentSchema,
} from '../schemas/return.schema.js';
import { auditLogger } from '../services/audit.service.js';
import { ReturnService } from '../services/return.service.js';
import { StockService } from '../services/stock.service.js';

const managers = [UserRole.ADMIN, UserRole.ANALISTA] as const;
const controller = new ReturnController(new ReturnService(new PrismaReturnRepository(), new StockService(new PrismaStockRepository(), auditLogger), auditLogger));
export const returnRouter = Router();
returnRouter.use(authenticate);
returnRouter.get('/reasons', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.listReasons);
returnRouter.post('/reasons', authorizeRoles(UserRole.ADMIN), validateBody(returnReasonInputSchema), controller.createReason);
returnRouter.patch('/reasons/:reasonId', authorizeRoles(UserRole.ADMIN), validateBody(returnReasonInputSchema), controller.updateReason);
returnRouter.get('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.list);
returnRouter.post('/', authorizeRoles(...managers), validateBody(createReturnSchema), controller.create);
returnRouter.get('/:id', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.getById);
returnRouter.post('/:id/submit', authorizeRoles(...managers), validateBody(returnCommentSchema), controller.submit);
returnRouter.post('/:id/review', authorizeRoles(...managers), validateBody(returnCommentSchema), controller.startReview);
returnRouter.post('/:id/approve', authorizeRoles(UserRole.ADMIN), validateBody(returnCommentSchema), controller.approve);
returnRouter.post('/:id/reject', authorizeRoles(UserRole.ADMIN), validateBody(rejectReturnSchema), controller.reject);
returnRouter.post('/:id/cancel', authorizeRoles(UserRole.ADMIN), validateBody(returnCommentSchema), controller.cancel);
returnRouter.post('/:id/physical-confirmation', authorizeRoles(...managers), validateBody(confirmReturnPhysicalSchema), controller.confirmPhysical);
returnRouter.post('/:id/items/:itemId/inspection', authorizeRoles(...managers), validateBody(inspectReturnItemSchema), controller.inspectItem);
returnRouter.patch('/:id/financial-adjustments/:adjustmentId', authorizeRoles(...managers), validateBody(linkReturnAdjustmentSchema), controller.linkAdjustment);
returnRouter.post('/:id/financial-adjustments/:adjustmentId/approve', authorizeRoles(UserRole.ADMIN), controller.approveAdjustment);
returnRouter.post('/:id/financial-adjustments/:adjustmentId/settle', authorizeRoles(UserRole.ADMIN), validateBody(settleReturnAdjustmentSchema), controller.settleAdjustment);
returnRouter.post('/:id/fiscal-links', authorizeRoles(...managers), validateBody(linkReturnFiscalSchema), controller.linkFiscal);
returnRouter.post('/:id/attachments', authorizeRoles(...managers), uploadReturnAttachment, controller.addAttachment);
returnRouter.get('/:id/attachments/:attachmentId/download', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.downloadAttachment);
returnRouter.delete('/:id/attachments/:attachmentId', authorizeRoles(UserRole.ADMIN), controller.removeAttachment);
