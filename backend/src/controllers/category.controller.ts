import type { Request, Response } from 'express';
import { categoryIdSchema, categoryOptionsQuerySchema, listCategoriesQuerySchema,
  type CreateCategoryInput, type UpdateCategoryInput, type UpdateCategoryStatusInput } from '../schemas/category.schema.js';
import type { CategoryService } from '../services/category.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class CategoryController {
  constructor(private readonly service: CategoryService) {}
  list = async (request: Request, response: Response): Promise<void> => { response.status(200).json(await this.service.list(listCategoriesQuerySchema.parse(request.query))); };
  options = async (request: Request, response: Response): Promise<void> => { response.status(200).json({ data: await this.service.options(categoryOptionsQuerySchema.parse(request.query)) }); };
  getById = async (request: Request, response: Response): Promise<void> => { response.status(200).json({ category: await this.service.getById(categoryIdSchema.parse(request.params.id)) }); };
  create = async (request: Request<unknown, unknown, CreateCategoryInput>, response: Response): Promise<void> => { response.status(201).json({ category: await this.service.create(request.body, authenticatedUserId(request)) }); };
  update = async (request: Request<{ id: string }, unknown, UpdateCategoryInput>, response: Response): Promise<void> => { response.status(200).json({ category: await this.service.update(categoryIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) }); };
  updateStatus = async (request: Request<{ id: string }, unknown, UpdateCategoryStatusInput>, response: Response): Promise<void> => { response.status(200).json({ category: await this.service.updateStatus(categoryIdSchema.parse(request.params.id), request.body, authenticatedUserId(request)) }); };
}
