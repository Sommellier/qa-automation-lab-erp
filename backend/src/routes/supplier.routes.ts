import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { SupplierController } from '../controllers/supplier.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaSupplierRepository } from '../repositories/supplier.repository.js';
import { createSupplierSchema, updateSupplierSchema, updateSupplierStatusSchema } from '../schemas/supplier.schema.js';
import { auditLogger } from '../services/audit.service.js';
import { SupplierService } from '../services/supplier.service.js';

const controller = new SupplierController(new SupplierService(new PrismaSupplierRepository(), auditLogger));
export const supplierRouter = Router();
supplierRouter.use(authenticate);
supplierRouter.get('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.list);
supplierRouter.get('/:id', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.getById);
supplierRouter.post('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), validateBody(createSupplierSchema), controller.create);
supplierRouter.patch('/:id', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), validateBody(updateSupplierSchema), controller.update);
supplierRouter.patch('/:id/status', authorizeRoles(UserRole.ADMIN), validateBody(updateSupplierStatusSchema), controller.updateStatus);
