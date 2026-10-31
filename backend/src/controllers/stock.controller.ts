import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { productIdSchema } from '../schemas/product.schema.js';
import { listStockMovementsSchema } from '../schemas/stock.schema.js';
import type { StockService } from '../services/stock.service.js';

export class StockController {
  constructor(private readonly service: StockService) {}
  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.service.list(productIdSchema.parse(request.params.id), listStockMovementsSchema.parse(request.query)));
  };
  entry = async (request: Request, _response: Response): Promise<void> => {
    productIdSchema.parse(request.params.id);
    throw new AppError('Entradas manuais devem ser solicitadas no fluxo de ajustes controlados.', 409, 'STOCK_ADJUSTMENT_WORKFLOW_REQUIRED');
  };
  exit = async (request: Request, _response: Response): Promise<void> => {
    productIdSchema.parse(request.params.id);
    throw new AppError('Saídas manuais devem ser solicitadas no fluxo de ajustes controlados.', 409, 'STOCK_ADJUSTMENT_WORKFLOW_REQUIRED');
  };
  adjust = async (request: Request, _response: Response): Promise<void> => {
    productIdSchema.parse(request.params.id);
    throw new AppError('Ajustes manuais devem ser solicitados no fluxo de ajustes controlados.', 409, 'STOCK_ADJUSTMENT_WORKFLOW_REQUIRED');
  };
}
