import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { ImportController } from '../controllers/import.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { uploadCsv } from '../middlewares/csv-upload.middleware.js';
import { PrismaImportRepository } from '../repositories/import.repository.js';
import { PrismaStockRepository } from '../repositories/stock.repository.js';
import { auditLogger } from '../services/audit.service.js';
import { ImportService } from '../services/import.service.js';
import { StockService } from '../services/stock.service.js';

const stockService = new StockService(new PrismaStockRepository(), auditLogger);
const controller = new ImportController(new ImportService(new PrismaImportRepository(), auditLogger, stockService));
export const importRouter = Router();

importRouter.use(authenticate);
importRouter.get('/clients/template', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.clientsTemplate);
importRouter.get('/products/template', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR), controller.productsTemplate);
importRouter.post('/clients/validate', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), uploadCsv, controller.validateClients);
importRouter.post('/products/validate', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), uploadCsv, controller.validateProducts);
importRouter.post('/clients/execute', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), uploadCsv, controller.executeClients);
importRouter.post('/products/execute', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), uploadCsv, controller.executeProducts);
importRouter.get('/', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), controller.list);
importRouter.get('/:id', authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA), controller.getById);
