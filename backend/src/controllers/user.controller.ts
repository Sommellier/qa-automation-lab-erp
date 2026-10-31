import type { Request, Response } from 'express';
import {
  listUsersQuerySchema,
  type CreateUserInput,
  type UpdateUserInput,
  type UpdateUserStatusInput,
  userIdSchema,
} from '../schemas/user.schema.js';
import type { UserService } from '../services/user.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class UserController {
  constructor(private readonly userService: UserService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const query = listUsersQuerySchema.parse(request.query);
    const result = await this.userService.list(query);
    response.status(200).json(result);
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const id = userIdSchema.parse(request.params.id);
    const user = await this.userService.getById(id);
    response.status(200).json({ user });
  };

  create = async (request: Request<unknown, unknown, CreateUserInput>, response: Response): Promise<void> => {
    const user = await this.userService.create(request.body, authenticatedUserId(request));
    response.status(201).json({ user });
  };

  update = async (request: Request<{ id: string }, unknown, UpdateUserInput>, response: Response): Promise<void> => {
    const id = userIdSchema.parse(request.params.id);
    const user = await this.userService.update(id, request.body, authenticatedUserId(request));
    response.status(200).json({ user });
  };

  updateStatus = async (
    request: Request<{ id: string }, unknown, UpdateUserStatusInput>,
    response: Response,
  ): Promise<void> => {
    const id = userIdSchema.parse(request.params.id);
    const user = await this.userService.updateStatus(id, request.body, authenticatedUserId(request));
    response.status(200).json({ user });
  };
}

