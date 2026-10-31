import { createHmac } from 'node:crypto';
import { AuditAction, AuditEntity, type SecurityThrottle } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type {
  SecurityThrottleKey,
  SecurityThrottleRepository,
  SecurityThrottleState,
} from '../repositories/security-throttle.repository.js';
import { noopAuditLogger, type AuditLogger } from './audit.service.js';

export type SecurityFlow = 'LOGIN' | 'PASSWORD_CHANGE' | 'PASSWORD_RECOVERY';
type SecurityDimension = 'IP' | 'ACCOUNT';

export interface SecuritySubjects {
  ip?: string | undefined;
  account?: string | undefined;
  userId?: string | undefined;
}

interface SubjectKey extends SecurityThrottleKey {
  dimension: SecurityDimension;
}

interface BlockDecision {
  retryAfterSeconds: number;
}

export interface AbuseProtection {
  assertAllowed(flow: SecurityFlow, subjects: SecuritySubjects): Promise<void>;
  consumeAttempt(flow: SecurityFlow, subjects: SecuritySubjects): Promise<void>;
  recordFailure(flow: SecurityFlow, subjects: SecuritySubjects, reason: string): Promise<void>;
  clearAccount(flow: SecurityFlow, account: string): Promise<void>;
}

const failureActions: Record<SecurityFlow, AuditAction> = {
  LOGIN: AuditAction.LOGIN_FAILURE,
  PASSWORD_CHANGE: AuditAction.PASSWORD_CHANGE_FAILURE,
  PASSWORD_RECOVERY: AuditAction.PASSWORD_RESET_FAILURE,
};

function rateLimitError(retryAfterSeconds: number): AppError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new AppError(
    `Muitas tentativas. Tente novamente em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    429,
    'RATE_LIMITED',
    retryAfterSeconds,
  );
}

export class SecurityThrottleService implements AbuseProtection {
  constructor(
    private readonly repository: SecurityThrottleRepository,
    private readonly audit: AuditLogger = noopAuditLogger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async assertAllowed(flow: SecurityFlow, subjects: SecuritySubjects): Promise<void> {
    const now = this.now();
    const states = await this.repository.findMany(this.keys(flow, subjects));
    const blocked = this.currentBlock(states, now);
    if (blocked) throw rateLimitError(blocked.retryAfterSeconds);
  }

  async consumeAttempt(flow: SecurityFlow, subjects: SecuritySubjects): Promise<void> {
    const blocked = await this.register(flow, subjects);
    if (blocked) throw rateLimitError(blocked.retryAfterSeconds);
  }

  async recordFailure(flow: SecurityFlow, subjects: SecuritySubjects, reason: string): Promise<void> {
    const blocked = await this.register(flow, subjects, reason);
    if (blocked) throw rateLimitError(blocked.retryAfterSeconds);
  }

  async clearAccount(flow: SecurityFlow, account: string): Promise<void> {
    const [key] = this.keys(flow, { account });
    if (!key) return;
    await this.audit.transaction(async (transaction) => {
      await this.repository.lock([key], transaction);
      await this.repository.remove(key, transaction);
    });
  }

  private keys(flow: SecurityFlow, subjects: SecuritySubjects): SubjectKey[] {
    const entries: Array<[SecurityDimension, string | undefined]> = [
      ['IP', subjects.ip],
      ['ACCOUNT', subjects.account],
    ];
    return entries.flatMap(([dimension, subject]) => subject
      ? [{
          dimension,
          scope: `${flow}_${dimension}`,
          subjectHash: createHmac('sha256', env.JWT_SECRET)
            .update(`rate-limit:${dimension}:${subject.trim().toLowerCase()}`)
            .digest('hex'),
        }]
      : []);
  }

  private async register(
    flow: SecurityFlow,
    subjects: SecuritySubjects,
    failureReason?: string,
  ): Promise<BlockDecision | null> {
    const now = this.now();
    const keys = this.keys(flow, subjects);
    if (keys.length === 0) return null;

    return this.audit.transaction(async (transaction) => {
      await this.repository.lock(keys, transaction);
      const storedStates = await this.repository.findMany(keys, transaction);
      const currentBlock = this.currentBlock(storedStates, now);
      if (currentBlock) return currentBlock;

      const stateByKey = new Map(storedStates.map((state) => [`${state.scope}:${state.subjectHash}`, state]));
      const blockedDimensions: SecurityDimension[] = [];
      let highestBlockLevel = 0;
      let longestDurationSeconds = 0;

      for (const key of keys) {
        const stored = stateByKey.get(`${key.scope}:${key.subjectHash}`);
        const next = this.nextState(key, stored, now);
        await this.repository.save(next, transaction);
        if (next.blockedUntil && next.blockedUntil > now) {
          blockedDimensions.push(key.dimension);
          highestBlockLevel = Math.max(highestBlockLevel, next.blockLevel);
          longestDurationSeconds = Math.max(
            longestDurationSeconds,
            Math.ceil((next.blockedUntil.getTime() - now.getTime()) / 1000),
          );
        }
      }

      const accountKey = keys.find((key) => key.dimension === 'ACCOUNT');
      const entityId = subjects.userId ?? accountKey?.subjectHash ?? keys[0]!.subjectHash;
      const userId = subjects.userId ?? null;

      if (failureReason) {
        await this.audit.log({
          userId,
          entityType: userId ? AuditEntity.USER : AuditEntity.SECURITY,
          entityId,
          action: failureActions[flow],
          newData: { flow, outcome: 'FAILED', reason: failureReason },
        }, transaction);
      }

      if (blockedDimensions.length > 0) {
        await this.audit.log({
          userId,
          entityType: userId ? AuditEntity.USER : AuditEntity.SECURITY,
          entityId,
          action: AuditAction.RATE_LIMIT_BLOCK,
          newData: {
            flow,
            dimensions: blockedDimensions,
            blockLevel: highestBlockLevel,
            durationSeconds: longestDurationSeconds,
          },
        }, transaction);
        return { retryAfterSeconds: longestDurationSeconds };
      }
      return null;
    });
  }

  private nextState(key: SecurityThrottleKey, stored: SecurityThrottle | undefined, now: Date): SecurityThrottleState {
    const windowMs = env.RATE_LIMIT_WINDOW_MINUTES * 60_000;
    const escalationResetMs = env.RATE_LIMIT_ESCALATION_RESET_MINUTES * 60_000;
    const escalationExpired = stored ? now.getTime() - stored.updatedAt.getTime() >= escalationResetMs : false;
    const windowExpired = stored ? now.getTime() - stored.windowStartedAt.getTime() >= windowMs : true;
    const attemptCount = (windowExpired ? 0 : (stored?.attemptCount ?? 0)) + 1;
    const previousLevel = escalationExpired ? 0 : (stored?.blockLevel ?? 0);

    if (attemptCount >= env.RATE_LIMIT_MAX_ATTEMPTS) {
      const blockLevel = Math.min(previousLevel + 1, 31);
      const durationMinutes = Math.min(
        env.RATE_LIMIT_BASE_BLOCK_MINUTES * (2 ** (blockLevel - 1)),
        env.RATE_LIMIT_MAX_BLOCK_MINUTES,
      );
      return {
        scope: key.scope,
        subjectHash: key.subjectHash,
        attemptCount: 0,
        blockLevel,
        windowStartedAt: now,
        blockedUntil: new Date(now.getTime() + durationMinutes * 60_000),
      };
    }

    return {
      scope: key.scope,
      subjectHash: key.subjectHash,
      attemptCount,
      blockLevel: previousLevel,
      windowStartedAt: windowExpired ? now : stored!.windowStartedAt,
      blockedUntil: null,
    };
  }

  private currentBlock(states: SecurityThrottleState[], now: Date): BlockDecision | null {
    const remainingSeconds = states.reduce((longest, state) => {
      if (!state.blockedUntil || state.blockedUntil <= now) return longest;
      return Math.max(longest, Math.ceil((state.blockedUntil.getTime() - now.getTime()) / 1000));
    }, 0);
    return remainingSeconds > 0 ? { retryAfterSeconds: remainingSeconds } : null;
  }
}

export const noopAbuseProtection: AbuseProtection = {
  assertAllowed: async () => undefined,
  consumeAttempt: async () => undefined,
  recordFailure: async () => undefined,
  clearAccount: async () => undefined,
};

export class FlowBypassAbuseProtection implements AbuseProtection {
  constructor(
    private readonly delegate: AbuseProtection,
    private readonly bypassedFlows: ReadonlySet<SecurityFlow>,
  ) {}

  assertAllowed(flow: SecurityFlow, subjects: SecuritySubjects): Promise<void> {
    return this.isBypassed(flow) ? Promise.resolve() : this.delegate.assertAllowed(flow, subjects);
  }

  consumeAttempt(flow: SecurityFlow, subjects: SecuritySubjects): Promise<void> {
    return this.isBypassed(flow) ? Promise.resolve() : this.delegate.consumeAttempt(flow, subjects);
  }

  recordFailure(flow: SecurityFlow, subjects: SecuritySubjects, reason: string): Promise<void> {
    return this.isBypassed(flow) ? Promise.resolve() : this.delegate.recordFailure(flow, subjects, reason);
  }

  clearAccount(flow: SecurityFlow, account: string): Promise<void> {
    return this.isBypassed(flow) ? Promise.resolve() : this.delegate.clearAccount(flow, account);
  }

  private isBypassed(flow: SecurityFlow): boolean {
    return this.bypassedFlows.has(flow);
  }
}
