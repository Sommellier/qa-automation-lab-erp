import type { Request, Response } from 'express';
import type { ForgotPasswordInput, ResetPasswordInput } from '../schemas/password-recovery.schema.js';
import { PASSWORD_RESET_GENERIC_MESSAGE, type PasswordRecoveryService } from '../services/password-recovery.service.js';
import { noopAbuseProtection, type AbuseProtection } from '../services/security-throttle.service.js';
import { getClientIp } from '../utils/client-ip.js';
import { clearSessionCookies } from '../utils/session-cookie.js';

export class PasswordRecoveryController {
  constructor(
    private readonly passwordRecovery: PasswordRecoveryService,
    private readonly abuse: AbuseProtection = noopAbuseProtection,
  ) {}

  forgot = async (request: Request<unknown, unknown, ForgotPasswordInput>, response: Response): Promise<void> => {
    await this.abuse.consumeAttempt('PASSWORD_RECOVERY', {
      ip: getClientIp(request),
      account: request.body.email,
    });
    await this.passwordRecovery.request(request.body);
    response.status(202).json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
  };

  reset = async (request: Request<unknown, unknown, ResetPasswordInput>, response: Response): Promise<void> => {
    await this.passwordRecovery.reset(request.body, { ip: getClientIp(request) });
    clearSessionCookies(response);
    response.status(204).send();
  };
}
