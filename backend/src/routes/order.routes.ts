import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { OrderController } from '../controllers/order.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaOrderRepository } from '../repositories/order.repository.js';
import { PrismaStockRepository } from '../repositories/stock.repository.js';
import { createOrderSchema, updateOrderStatusSchema } from '../schemas/order.schema.js';
import { OrderService } from '../services/order.service.js';
import { auditLogger } from '../services/audit.service.js';
import { StockService } from '../services/stock.service.js';

const stockService = new StockService(new PrismaStockRepository(), auditLogger);
const controller = new OrderController(new OrderService(new PrismaOrderRepository(auditLogger, stockService)));
export const orderRouter = Router();

orderRouter.use(authenticate);
orderRouter.get('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.list);
orderRouter.get('/:id', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.getById);
orderRouter.post('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), validateBody(createOrderSchema), controller.create);
orderRouter.patch('/:id/status', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), validateBody(updateOrderStatusSchema), controller.updateStatus);
