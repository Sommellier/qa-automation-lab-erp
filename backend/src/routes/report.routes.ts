import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { ReportController } from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { PrismaReportRepository } from '../repositories/report.repository.js';
import { ReportService } from '../services/report.service.js';

const controller = new ReportController(new ReportService(new PrismaReportRepository()));
export const reportRouter = Router();

reportRouter.use(authenticate, authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR));
reportRouter.get('/clients', controller.clients);
reportRouter.get('/products/export', controller.exportProducts);
reportRouter.get('/products', controller.products);
reportRouter.get('/orders', controller.orders);
reportRouter.get('/revenue', controller.revenue);
