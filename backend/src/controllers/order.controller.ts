import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { listOrdersQuerySchema, orderIdSchema, type CreateOrderInput, type UpdateOrderStatusInput } from '../schemas/order.schema.js';
import type { OrderService } from '../services/order.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class OrderController {
  constructor(private readonly service: OrderService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.service.list(listOrdersQuerySchema.parse(request.query)));
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ order: await this.service.getById(orderIdSchema.parse(request.params.id)) });
  };

  create = async (request: Request<unknown, unknown, CreateOrderInput>, response: Response): Promise<void> => {
    response.status(201).json({ order: await this.service.create(request.body, authenticatedUserId(request)) });
  };

  updateStatus = async (request: Request<{ id: string }, unknown, UpdateOrderStatusInput>, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
    response.status(200).json({
      order: await this.service.updateStatus(
        orderIdSchema.parse(request.params.id), request.body.status, request.auth.role, request.auth.userId,
      ),
    });
  };
}
