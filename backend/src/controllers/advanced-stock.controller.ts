import type { Request, Response } from 'express';
import {
  advancedStockIdSchema,
  advancedStockQuerySchema,
  createInventorySchema,
  createOrderShipmentSchema,
  createStockAdjustmentSchema,
  createStockLocationSchema,
  createStockTransferSchema,
  createWarehouseSchema,
  expiryQuerySchema,
  inventoryCountsSchema,
  inventoryDecisionSchema,
  receiveTransferSchema,
  rejectTransferSchema,
  reverseStockAdjustmentSchema,
  stockAdjustmentDecisionSchema,
  transferCommentSchema,
  updateProductTrackingSchema,
  updateStockLocationSchema,
  updateWarehouseSchema,
} from '../schemas/advanced-stock.schema.js';
import type { AdvancedStockService } from '../services/advanced-stock.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

const id = (value: unknown) => advancedStockIdSchema.parse(value);

export class AdvancedStockController {
  constructor(private readonly service: AdvancedStockService) {}
  setup = async (_request: Request, response: Response) => response.status(200).json(await this.service.setup());
  warehouses = async (_request: Request, response: Response) => response.status(200).json(await this.service.listWarehouses());
  createWarehouse = async (request: Request, response: Response) => response.status(201).json({ warehouse: await this.service.createWarehouse(createWarehouseSchema.parse(request.body), authenticatedUserId(request)) });
  updateWarehouse = async (request: Request, response: Response) => response.status(200).json({ warehouse: await this.service.updateWarehouse(id(request.params.id), updateWarehouseSchema.parse(request.body), authenticatedUserId(request)) });
  createLocation = async (request: Request, response: Response) => response.status(201).json({ location: await this.service.createLocation(id(request.params.id), createStockLocationSchema.parse(request.body), authenticatedUserId(request)) });
  updateLocation = async (request: Request, response: Response) => response.status(200).json({ location: await this.service.updateLocation(id(request.params.id), updateStockLocationSchema.parse(request.body), authenticatedUserId(request)) });
  updateProductTracking = async (request: Request, response: Response) => response.status(200).json({ product: await this.service.updateProductTracking(id(request.params.id), updateProductTrackingSchema.parse(request.body), authenticatedUserId(request)) });

  balances = async (request: Request, response: Response) => response.status(200).json(await this.service.balances(advancedStockQuerySchema.parse(request.query)));
  expiry = async (request: Request, response: Response) => { const query = expiryQuerySchema.parse(request.query); response.status(200).json(await this.service.expiryAlerts(query.days, query.warehouseId)); };
  timeline = async (request: Request, response: Response) => response.status(200).json(await this.service.timeline(advancedStockQuerySchema.parse(request.query)));
  valuation = async (_request: Request, response: Response) => response.status(200).json(await this.service.valuation());
  createOrderShipment = async (request: Request, response: Response) => response.status(201).json({ shipment: await this.service.createOrderShipment(id(request.params.id), createOrderShipmentSchema.parse(request.body), authenticatedUserId(request)) });

  transfers = async (_request: Request, response: Response) => response.status(200).json(await this.service.listTransfers());
  transfer = async (request: Request, response: Response) => response.status(200).json({ transfer: await this.service.getTransfer(id(request.params.id)) });
  createTransfer = async (request: Request, response: Response) => response.status(201).json({ transfer: await this.service.createTransfer(createStockTransferSchema.parse(request.body), authenticatedUserId(request)) });
  submitTransfer = async (request: Request, response: Response) => response.status(200).json({ transfer: await this.service.transitionTransfer(id(request.params.id), 'submit', transferCommentSchema.parse(request.body).comment, request.auth!.role, authenticatedUserId(request)) });
  approveTransfer = async (request: Request, response: Response) => response.status(200).json({ transfer: await this.service.transitionTransfer(id(request.params.id), 'approve', transferCommentSchema.parse(request.body).comment, request.auth!.role, authenticatedUserId(request)) });
  rejectTransfer = async (request: Request, response: Response) => response.status(200).json({ transfer: await this.service.transitionTransfer(id(request.params.id), 'reject', rejectTransferSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  shipTransfer = async (request: Request, response: Response) => response.status(200).json({ transfer: await this.service.shipTransfer(id(request.params.id), authenticatedUserId(request)) });
  receiveTransfer = async (request: Request, response: Response) => response.status(200).json({ transfer: await this.service.receiveTransfer(id(request.params.id), receiveTransferSchema.parse(request.body), authenticatedUserId(request)) });

  inventories = async (_request: Request, response: Response) => response.status(200).json(await this.service.listInventories());
  createInventory = async (request: Request, response: Response) => response.status(201).json({ inventory: await this.service.createInventory(createInventorySchema.parse(request.body), authenticatedUserId(request)) });
  countInventory = async (request: Request, response: Response) => response.status(200).json({ inventory: await this.service.countInventory(id(request.params.id), inventoryCountsSchema.parse(request.body), authenticatedUserId(request)) });
  submitInventory = async (request: Request, response: Response) => response.status(200).json({ inventory: await this.service.submitInventory(id(request.params.id), authenticatedUserId(request)) });
  approveInventory = async (request: Request, response: Response) => response.status(200).json({ inventory: await this.service.decideInventory(id(request.params.id), true, inventoryDecisionSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  rejectInventory = async (request: Request, response: Response) => response.status(200).json({ inventory: await this.service.decideInventory(id(request.params.id), false, inventoryDecisionSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });

  adjustments = async (_request: Request, response: Response) => response.status(200).json(await this.service.listAdjustments());
  createAdjustment = async (request: Request, response: Response) => response.status(201).json({ adjustment: await this.service.createAdjustment(createStockAdjustmentSchema.parse(request.body), authenticatedUserId(request)) });
  submitAdjustment = async (request: Request, response: Response) => response.status(200).json({ adjustment: await this.service.transitionAdjustment(id(request.params.id), 'submit', stockAdjustmentDecisionSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  approveAdjustment = async (request: Request, response: Response) => response.status(200).json({ adjustment: await this.service.transitionAdjustment(id(request.params.id), 'approve', stockAdjustmentDecisionSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  rejectAdjustment = async (request: Request, response: Response) => response.status(200).json({ adjustment: await this.service.transitionAdjustment(id(request.params.id), 'reject', stockAdjustmentDecisionSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
  reverseAdjustment = async (request: Request, response: Response) => response.status(200).json({ adjustment: await this.service.transitionAdjustment(id(request.params.id), 'reverse', reverseStockAdjustmentSchema.parse(request.body).reason, request.auth!.role, authenticatedUserId(request)) });
}
