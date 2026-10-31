import { env } from '../config/env.js';
import { PrismaSecurityThrottleRepository } from '../repositories/security-throttle.repository.js';
import { auditLogger } from './audit.service.js';
import {
  FlowBypassAbuseProtection,
  SecurityThrottleService,
  type AbuseProtection,
} from './security-throttle.service.js';

const persistentAbuseProtection = new SecurityThrottleService(
  new PrismaSecurityThrottleRepository(),
  auditLogger,
);

export const abuseProtection: AbuseProtection = env.DISABLE_LOGIN_RATE_LIMIT
  ? new FlowBypassAbuseProtection(persistentAbuseProtection, new Set(['LOGIN']))
  : persistentAbuseProtection;
