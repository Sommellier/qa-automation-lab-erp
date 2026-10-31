import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaUserRepository } from '../repositories/user.repository.js';
import { changePasswordSchema, updateProfileSchema } from '../schemas/profile.schema.js';
import { auditLogger } from '../services/audit.service.js';
import { ProfileService } from '../services/profile.service.js';
import { abuseProtection } from '../services/abuse-protection.js';

const userRepository = new PrismaUserRepository();
const profileService = new ProfileService(userRepository, auditLogger);
const profileController = new ProfileController(profileService, abuseProtection);

export const profileRouter = Router();

profileRouter.use(authenticate);
profileRouter.patch('/', validateBody(updateProfileSchema), profileController.update);
profileRouter.patch('/password', validateBody(changePasswordSchema), profileController.changePassword);
