import type { Request, Response } from 'express';
import {
  clientIdSchema,
  listClientsQuerySchema,
  type CreateClientInput,
  type UpdateClientInput,
  type UpdateClientStatusInput,
} from '../schemas/client.schema.js';
import type { ClientService } from '../services/client.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const query = listClientsQuerySchema.parse(request.query);
    response.status(200).json(await this.clientService.list(query));
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const id = clientIdSchema.parse(request.params.id);
    response.status(200).json({ client: await this.clientService.getById(id) });
  };

  create = async (request: Request<unknown, unknown, CreateClientInput>, response: Response): Promise<void> => {
    response.status(201).json({ client: await this.clientService.create(request.body, authenticatedUserId(request)) });
  };

  update = async (request: Request<{ id: string }, unknown, UpdateClientInput>, response: Response): Promise<void> => {
    const id = clientIdSchema.parse(request.params.id);
    response.status(200).json({ client: await this.clientService.update(id, request.body, authenticatedUserId(request)) });
  };

  updateStatus = async (
    request: Request<{ id: string }, unknown, UpdateClientStatusInput>,
    response: Response,
  ): Promise<void> => {
    const id = clientIdSchema.parse(request.params.id);
    response.status(200).json({ client: await this.clientService.updateStatus(id, request.body, authenticatedUserId(request)) });
  };
}
