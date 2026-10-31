import type { Request, Response } from 'express';
import { clientIdSchema } from '../schemas/client.schema.js';
import { addressIdSchema, listClientAddressesQuerySchema, type CreateClientAddressInput, type UpdateClientAddressInput, type UpdateClientAddressStatusInput } from '../schemas/client-address.schema.js';
import type { ClientAddressService } from '../services/client-address.service.js';
import { authenticatedUserId } from '../utils/request-auth.js';

export class ClientAddressController {
  constructor(private readonly service: ClientAddressService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const clientId = clientIdSchema.parse(request.params.clientId);
    response.status(200).json(await this.service.list(clientId, listClientAddressesQuerySchema.parse(request.query)));
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const clientId = clientIdSchema.parse(request.params.clientId);
    const addressId = addressIdSchema.parse(request.params.addressId);
    response.status(200).json({ address: await this.service.getById(clientId, addressId) });
  };

  create = async (request: Request<{ clientId: string }, unknown, CreateClientAddressInput>, response: Response): Promise<void> => {
    const clientId = clientIdSchema.parse(request.params.clientId);
    response.status(201).json({ address: await this.service.create(clientId, request.body, authenticatedUserId(request)) });
  };

  update = async (request: Request<{ clientId: string; addressId: string }, unknown, UpdateClientAddressInput>, response: Response): Promise<void> => {
    const clientId = clientIdSchema.parse(request.params.clientId);
    const addressId = addressIdSchema.parse(request.params.addressId);
    response.status(200).json({ address: await this.service.update(clientId, addressId, request.body, authenticatedUserId(request)) });
  };

  updateStatus = async (request: Request<{ clientId: string; addressId: string }, unknown, UpdateClientAddressStatusInput>, response: Response): Promise<void> => {
    const clientId = clientIdSchema.parse(request.params.clientId);
    const addressId = addressIdSchema.parse(request.params.addressId);
    response.status(200).json({ address: await this.service.updateStatus(clientId, addressId, request.body, authenticatedUserId(request)) });
  };

  setPrimary = async (request: Request, response: Response): Promise<void> => {
    const clientId = clientIdSchema.parse(request.params.clientId);
    const addressId = addressIdSchema.parse(request.params.addressId);
    response.status(200).json({ address: await this.service.setPrimary(clientId, addressId, authenticatedUserId(request)) });
  };
}
