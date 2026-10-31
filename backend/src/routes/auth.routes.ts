import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { PasswordRecoveryController } from '../controllers/password-recovery.controller.js';
import { authenticate } from '../middlewares/authenticate.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { PrismaUserRepository } from '../repositories/user.repository.js';
import { PrismaPasswordResetRepository } from '../repositories/password-reset.repository.js';
import { loginSchema } from '../schemas/auth.schema.js';
import { forgotPasswordSchema, resetPasswordSchema } from '../schemas/password-recovery.schema.js';
import { auditLogger } from '../services/audit.service.js';
import { AuthService } from '../services/auth.service.js';
import { PasswordRecoveryService } from '../services/password-recovery.service.js';
import { createPasswordResetMailer } from '../services/password-reset-mailer.service.js';
import { abuseProtection } from '../services/abuse-protection.js';

const userRepository = new PrismaUserRepository();
const authService = new AuthService(userRepository);
const authController = new AuthController(authService, abuseProtection);
const passwordRecoveryService = new PasswordRecoveryService(
  userRepository,
  new PrismaPasswordResetRepository(),
  createPasswordResetMailer(),
  auditLogger,
  abuseProtection,
);
const passwordRecoveryController = new PasswordRecoveryController(passwordRecoveryService, abuseProtection);

export const authRouter = Router();

authRouter.post('/login', validateBody(loginSchema), authController.login);
authRouter.post('/forgot-password', validateBody(forgotPasswordSchema), passwordRecoveryController.forgot);
authRouter.post('/reset-password', validateBody(resetPasswordSchema), passwordRecoveryController.reset);
authRouter.post('/refresh', authController.refresh);
authRouter.get('/me', authenticate, authController.me);
authRouter.post('/logout', authenticate, authController.logout);

