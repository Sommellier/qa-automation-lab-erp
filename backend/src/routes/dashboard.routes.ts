import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { PrismaDashboardRepository } from '../repositories/dashboard.repository.js';
import { DashboardService } from '../services/dashboard.service.js';

const controller = new DashboardController(new DashboardService(new PrismaDashboardRepository()));
export const dashboardRouter = Router();

dashboardRouter.use(authenticate);
dashboardRouter.get(
  '/summary',
  authorizeRoles(UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR),
  controller.summary,
);
