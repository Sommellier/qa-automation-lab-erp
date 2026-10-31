import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import type { ChangePasswordInput, UpdateProfileInput } from '../schemas/profile.schema.js';
import type { ProfileService } from '../services/profile.service.js';
import { noopAbuseProtection, type AbuseProtection } from '../services/security-throttle.service.js';
import { getClientIp } from '../utils/client-ip.js';

export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly abuse: AbuseProtection = noopAbuseProtection,
  ) {}

  update = async (request: Request<unknown, unknown, UpdateProfileInput>, response: Response): Promise<void> => {
    if (!request.auth) throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
    const user = await this.profileService.update(request.auth.userId, request.body);
    response.status(200).json({ user });
  };

  changePassword = async (
    request: Request<unknown, unknown, ChangePasswordInput>,
    response: Response,
  ): Promise<void> => {
    if (!request.auth) throw new AppError('Autenticação necessária.', 401, 'UNAUTHENTICATED');
    const subjects = {
      ip: getClientIp(request),
      account: request.auth.userId,
      userId: request.auth.userId,
    };
    await this.abuse.assertAllowed('PASSWORD_CHANGE', subjects);
    try {
      await this.profileService.changePassword(request.auth.userId, request.body);
    } catch (error: unknown) {
      if (error instanceof AppError && ['CURRENT_PASSWORD_INCORRECT', 'PASSWORD_UNCHANGED'].includes(error.code)) {
        await this.abuse.recordFailure('PASSWORD_CHANGE', subjects, error.code);
      }
      throw error;
    }
    await this.abuse.clearAccount('PASSWORD_CHANGE', request.auth.userId);
    response.status(204).send();
  };
}
