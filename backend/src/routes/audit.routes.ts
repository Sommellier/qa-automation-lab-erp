import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { PrismaAuditRepository } from '../repositories/audit.repository.js';
import { AuditQueryService } from '../services/audit-query.service.js';

const controller = new AuditController(new AuditQueryService(new PrismaAuditRepository()));
export const auditRouter = Router();

auditRouter.use(authenticate, authorizeRoles(UserRole.ADMIN));
auditRouter.get('/', controller.list);
