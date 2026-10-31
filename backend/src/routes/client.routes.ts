import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { ClientController } from '../controllers/client.controller.js';
import { ClientAddressController } from '../controllers/client-address.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaClientRepository } from '../repositories/client.repository.js';
import { PrismaClientAddressRepository } from '../repositories/client-address.repository.js';
import { createClientSchema, updateClientSchema, updateClientStatusSchema } from '../schemas/client.schema.js';
import { createClientAddressSchema, updateClientAddressSchema, updateClientAddressStatusSchema } from '../schemas/client-address.schema.js';
import { ClientAddressService } from '../services/client-address.service.js';
import { ClientService } from '../services/client.service.js';
import { auditLogger } from '../services/audit.service.js';

const clientRepository = new PrismaClientRepository();
const clientService = new ClientService(clientRepository, auditLogger);
const clientController = new ClientController(clientService);
const clientAddressService = new ClientAddressService(new PrismaClientAddressRepository(), clientRepository, auditLogger);
const clientAddressController = new ClientAddressController(clientAddressService);

export const clientRouter = Router();

clientRouter.use(authenticate);
clientRouter.get('/:clientId/addresses', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), clientAddressController.list);
clientRouter.get('/:clientId/addresses/:addressId', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), clientAddressController.getById);
clientRouter.post('/:clientId/addresses', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), validateBody(createClientAddressSchema), clientAddressController.create);
clientRouter.patch('/:clientId/addresses/:addressId', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), validateBody(updateClientAddressSchema), clientAddressController.update);
clientRouter.patch('/:clientId/addresses/:addressId/status', authorizeRoles(UserRole.ADMIN), validateBody(updateClientAddressStatusSchema), clientAddressController.updateStatus);
clientRouter.patch('/:clientId/addresses/:addressId/primary', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), clientAddressController.setPrimary);
clientRouter.get('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), clientController.list);
clientRouter.get('/:id', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), clientController.getById);
clientRouter.post(
  '/',
  authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA),
  validateBody(createClientSchema),
  clientController.create,
);
clientRouter.patch(
  '/:id',
  authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA),
  validateBody(updateClientSchema),
  clientController.update,
);
clientRouter.patch(
  '/:id/status',
  authorizeRoles(UserRole.ADMIN),
  validateBody(updateClientStatusSchema),
  clientController.updateStatus,
);
