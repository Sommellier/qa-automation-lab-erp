import type { Request, Response } from 'express';
import { supplierIdSchema, listSuppliersQuerySchema, type CreateSupplierInput, type UpdateSupplierInput, type UpdateSupplierStatusInput } from '../schemas/supplier.schema.js';
import type { SupplierService } from '../services/supplier.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class SupplierController {
  constructor(private readonly service: SupplierService) {}
  list = async (request: Request, response: Response) => response.status(200).json(await this.service.list(listSuppliersQuerySchema.parse(request.query)));
  getById = async (request: Request, response: Response) => response.status(200).json({ supplier: await this.service.getById(supplierIdSchema.parse(request.params.id)) });
  create = async (request: Request<unknown, unknown, CreateSupplierInput>, response: Response) => response.status(201).json({ supplier: await this.service.create(request.body, authenticatedUserId(request)) });
  update = async (request: Request<{ id: string }, unknown, UpdateSupplierInput>, response: Response) => response.status(200).json({ supplier: await this.service.update(supplierIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
  updateStatus = async (request: Request<{ id: string }, unknown, UpdateSupplierStatusInput>, response: Response) => response.status(200).json({ supplier: await this.service.updateStatus(supplierIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) });
}
