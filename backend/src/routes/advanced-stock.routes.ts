import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { AdvancedStockController } from '../controllers/advanced-stock.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { createInventorySchema, createOrderShipmentSchema, createStockAdjustmentSchema, createStockLocationSchema, createStockTransferSchema, createWarehouseSchema, inventoryCountsSchema, inventoryDecisionSchema, receiveTransferSchema, rejectTransferSchema, reverseStockAdjustmentSchema, stockAdjustmentDecisionSchema, transferCommentSchema, updateProductTrackingSchema, updateStockLocationSchema, updateWarehouseSchema } from '../schemas/advanced-stock.schema.js';
import { AdvancedStockService } from '../services/advanced-stock.service.js';
import { auditLogger } from '../services/audit.service.js';

const controller = new AdvancedStockController(new AdvancedStockService(auditLogger));
export const advancedStockRouter = Router();
advancedStockRouter.use(authenticate);
const view = authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR);
const operate = authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA);
const admin = authorizeRoles(UserRole.ADMIN);

advancedStockRouter.get('/setup', view, controller.setup);
advancedStockRouter.get('/balances', view, controller.balances);
advancedStockRouter.get('/expiry-alerts', view, controller.expiry);
advancedStockRouter.get('/timeline', view, controller.timeline);
advancedStockRouter.get('/valuation', view, controller.valuation);
advancedStockRouter.patch('/products/:id/tracking', admin, validateBody(updateProductTrackingSchema), controller.updateProductTracking);
advancedStockRouter.post('/orders/:id/shipments', operate, validateBody(createOrderShipmentSchema), controller.createOrderShipment);

advancedStockRouter.get('/warehouses', view, controller.warehouses);
advancedStockRouter.post('/warehouses', admin, validateBody(createWarehouseSchema), controller.createWarehouse);
advancedStockRouter.patch('/warehouses/:id', admin, validateBody(updateWarehouseSchema), controller.updateWarehouse);
advancedStockRouter.post('/warehouses/:id/locations', admin, validateBody(createStockLocationSchema), controller.createLocation);
advancedStockRouter.patch('/locations/:id', admin, validateBody(updateStockLocationSchema), controller.updateLocation);

advancedStockRouter.get('/transfers', view, controller.transfers);
advancedStockRouter.post('/transfers', operate, validateBody(createStockTransferSchema), controller.createTransfer);
advancedStockRouter.get('/transfers/:id', view, controller.transfer);
advancedStockRouter.post('/transfers/:id/submit', operate, validateBody(transferCommentSchema), controller.submitTransfer);
advancedStockRouter.post('/transfers/:id/approve', admin, validateBody(transferCommentSchema), controller.approveTransfer);
advancedStockRouter.post('/transfers/:id/reject', admin, validateBody(rejectTransferSchema), controller.rejectTransfer);
advancedStockRouter.post('/transfers/:id/ship', operate, controller.shipTransfer);
advancedStockRouter.post('/transfers/:id/receive', operate, validateBody(receiveTransferSchema), controller.receiveTransfer);

advancedStockRouter.get('/inventories', view, controller.inventories);
advancedStockRouter.post('/inventories', operate, validateBody(createInventorySchema), controller.createInventory);
advancedStockRouter.post('/inventories/:id/counts', operate, validateBody(inventoryCountsSchema), controller.countInventory);
advancedStockRouter.post('/inventories/:id/submit', operate, controller.submitInventory);
advancedStockRouter.post('/inventories/:id/approve', admin, validateBody(inventoryDecisionSchema), controller.approveInventory);
advancedStockRouter.post('/inventories/:id/reject', admin, validateBody(inventoryDecisionSchema), controller.rejectInventory);

advancedStockRouter.get('/adjustments', view, controller.adjustments);
advancedStockRouter.post('/adjustments', operate, validateBody(createStockAdjustmentSchema), controller.createAdjustment);
advancedStockRouter.post('/adjustments/:id/submit', operate, validateBody(stockAdjustmentDecisionSchema), controller.submitAdjustment);
advancedStockRouter.post('/adjustments/:id/approve', admin, validateBody(stockAdjustmentDecisionSchema), controller.approveAdjustment);
advancedStockRouter.post('/adjustments/:id/reject', admin, validateBody(stockAdjustmentDecisionSchema), controller.rejectAdjustment);
advancedStockRouter.post('/adjustments/:id/reverse', admin, validateBody(reverseStockAdjustmentSchema), controller.reverseAdjustment);
