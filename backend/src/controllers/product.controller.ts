import type { Request, Response } from 'express';
import { listProductsQuerySchema, productIdSchema, type CreateProductInput, type UpdateProductInput, type UpdateProductStatusInput } from '../schemas/product.schema.js';
import type { ProductService } from '../services/product.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class ProductController {
  constructor(private readonly service: ProductService) {}
  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.service.list(listProductsQuerySchema.parse(request.query)));
  };
  getById = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ product: await this.service.getById(productIdSchema.parse(request.params.id)) });
  };
  create = async (request: Request<unknown, unknown, CreateProductInput>, response: Response): Promise<void> => {
    response.status(201).json({ product: await this.service.create(request.body, authenticatedUserId(request)) });
  };
  update = async (request: Request<{ id: string }, unknown, UpdateProductInput>, response: Response): Promise<void> => {
    response.status(200).json({ product: await this.service.update(productIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
  };
  updateStatus = async (request: Request<{ id: string }, unknown, UpdateProductStatusInput>, response: Response): Promise<void> => {
    response.status(200).json({ product: await this.service.updateStatus(productIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
  };
}
