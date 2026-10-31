import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaUserRepository } from '../repositories/user.repository.js';
import { createUserSchema, updateUserSchema, updateUserStatusSchema } from '../schemas/user.schema.js';
import { UserService } from '../services/user.service.js';
import { auditLogger } from '../services/audit.service.js';

const userRepository = new PrismaUserRepository();
const userService = new UserService(userRepository, auditLogger);
const userController = new UserController(userService);

export const userRouter = Router();

userRouter.use(authenticate, authorizeRoles(UserRole.ADMIN));
userRouter.get('/', userController.list);
userRouter.get('/:id', userController.getById);
userRouter.post('/', validateBody(createUserSchema), userController.create);
userRouter.patch('/:id', validateBody(updateUserSchema), userController.update);
userRouter.patch('/:id/status', validateBody(updateUserStatusSchema), userController.updateStatus);

