import { randomUUID } from 'node:crypto';
import { AuditAction, AuditEntity, type SecurityThrottle } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SecurityThrottleKey,
  SecurityThrottleRepository,
  SecurityThrottleState,
} from '../repositories/security-throttle.repository.js';
import { RecordingAuditLogger } from '../test/recording-audit.js';
import {
  FlowBypassAbuseProtection,
  SecurityThrottleService,
  type AbuseProtection,
} from './security-throttle.service.js';

class InMemorySecurityThrottleRepository implements SecurityThrottleRepository {
  readonly states = new Map<string, SecurityThrottle>();

  constructor(private readonly now: () => Date) {}

  async lock(): Promise<void> {}

  async findMany(keys: SecurityThrottleKey[]): Promise<SecurityThrottle[]> {
    return keys.flatMap((key) => {
      const state = this.states.get(`${key.scope}:${key.subjectHash}`);
      return state ? [state] : [];
    });
  }

  async save(state: SecurityThrottleState): Promise<void> {
    const key = `${state.scope}:${state.subjectHash}`;
    const existing = this.states.get(key);
    this.states.set(key, {
      id: existing?.id ?? randomUUID(),
      ...state,
      createdAt: existing?.createdAt ?? this.now(),
      updatedAt: this.now(),
    });
  }

  async remove(key: SecurityThrottleKey): Promise<void> {
    this.states.delete(`${key.scope}:${key.subjectHash}`);
  }
}

describe('SecurityThrottleService', () => {
  let currentTime: Date;
  let repository: InMemorySecurityThrottleRepository;
  let audit: RecordingAuditLogger;
  let service: SecurityThrottleService;
  const subjects = { ip: '203.0.113.10', account: 'pessoa@empresa.com' };

  beforeEach(() => {
    currentTime = new Date('2026-10-23T20:00:00.000Z');
    repository = new InMemorySecurityThrottleRepository(() => currentTime);
    audit = new RecordingAuditLogger();
    service = new SecurityThrottleService(repository, audit, () => currentTime);
  });

  it('limita separadamente por IP e conta sem persistir os identificadores em claro', async () => {
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await service.recordFailure('LOGIN', subjects, 'INVALID_CREDENTIALS');
    }
    await expect(service.recordFailure('LOGIN', subjects, 'INVALID_CREDENTIALS')).rejects.toMatchObject({
      statusCode: 429, code: 'RATE_LIMITED', retryAfterSeconds: 60,
    });

    expect(repository.states.size).toBe(2);
    expect([...repository.states.keys()]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^LOGIN_IP:[a-f0-9]{64}$/),
      expect.stringMatching(/^LOGIN_ACCOUNT:[a-f0-9]{64}$/),
    ]));
    expect(JSON.stringify([...repository.states])).not.toMatch(/203\.0\.113\.10|pessoa@empresa\.com/);
    expect(audit.entries.filter((entry) => entry.action === AuditAction.LOGIN_FAILURE)).toHaveLength(5);
    expect(audit.entries.at(-1)).toEqual(expect.objectContaining({
      userId: null,
      entityType: AuditEntity.SECURITY,
      action: AuditAction.RATE_LIMIT_BLOCK,
      newData: expect.objectContaining({
        flow: 'LOGIN', dimensions: ['IP', 'ACCOUNT'], blockLevel: 1, durationSeconds: 60,
      }),
    }));
    expect(JSON.stringify(audit.entries)).not.toMatch(/203\.0\.113\.10|pessoa@empresa\.com/);
  });

  it('aplica bloqueio progressivo e temporário, com teto de 30 minutos', async () => {
    let expectedSeconds = 60;
    for (let cycle = 1; cycle <= 7; cycle += 1) {
      for (let attempt = 1; attempt < 5; attempt += 1) {
        await service.recordFailure('LOGIN', subjects, 'INVALID_CREDENTIALS');
      }
      await expect(service.recordFailure('LOGIN', subjects, 'INVALID_CREDENTIALS')).rejects.toMatchObject({
        retryAfterSeconds: expectedSeconds,
      });
      await expect(service.assertAllowed('LOGIN', subjects)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      currentTime = new Date(currentTime.getTime() + expectedSeconds * 1000 + 1);
      await expect(service.assertAllowed('LOGIN', subjects)).resolves.toBeUndefined();
      expectedSeconds = Math.min(expectedSeconds * 2, 1800);
    }
  });

  it('reinicia a progressão após o período de recuperação', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.recordFailure('PASSWORD_CHANGE', { ...subjects, userId: 'user-1' }, 'CURRENT_PASSWORD_INCORRECT')
        .catch(() => undefined);
    }
    currentTime = new Date(currentTime.getTime() + 24 * 60 * 60_000 + 1);
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await service.recordFailure('PASSWORD_CHANGE', { ...subjects, userId: 'user-1' }, 'CURRENT_PASSWORD_INCORRECT');
    }
    await expect(service.recordFailure(
      'PASSWORD_CHANGE', { ...subjects, userId: 'user-1' }, 'CURRENT_PASSWORD_INCORRECT',
    )).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });

  it('bloqueia a conta mesmo quando o IP muda e limpa somente a dimensão da conta após sucesso', async () => {
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await service.recordFailure('LOGIN', { ...subjects, ip: `203.0.113.${attempt}` }, 'INVALID_CREDENTIALS');
    }
    await expect(service.recordFailure(
      'LOGIN', { ...subjects, ip: '203.0.113.99' }, 'INVALID_CREDENTIALS',
    )).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    await expect(service.assertAllowed('LOGIN', { ip: '198.51.100.8', account: subjects.account }))
      .rejects.toMatchObject({ code: 'RATE_LIMITED' });

    await service.clearAccount('LOGIN', subjects.account);
    await expect(service.assertAllowed('LOGIN', { ip: '198.51.100.8', account: subjects.account }))
      .resolves.toBeUndefined();
    expect([...repository.states.keys()].some((key) => key.startsWith('LOGIN_IP:'))).toBe(true);
  });

  it('contabiliza solicitações de recuperação sem auditar cada endereço consultado', async () => {
    for (let attempt = 1; attempt < 5; attempt += 1) {
      await service.consumeAttempt('PASSWORD_RECOVERY', subjects);
    }
    await expect(service.consumeAttempt('PASSWORD_RECOVERY', subjects)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.action).toBe(AuditAction.RATE_LIMIT_BLOCK);
  });
});

describe('FlowBypassAbuseProtection', () => {
  it('ignora somente o fluxo configurado e preserva os demais controles', async () => {
    const delegate: AbuseProtection = {
      assertAllowed: vi.fn(async () => undefined),
      consumeAttempt: vi.fn(async () => undefined),
      recordFailure: vi.fn(async () => undefined),
      clearAccount: vi.fn(async () => undefined),
    };
    const service = new FlowBypassAbuseProtection(delegate, new Set(['LOGIN']));
    const subjects = { ip: '203.0.113.10', account: 'pessoa@empresa.com' };

    await service.assertAllowed('LOGIN', subjects);
    await service.consumeAttempt('LOGIN', subjects);
    await service.recordFailure('LOGIN', subjects, 'INVALID_CREDENTIALS');
    await service.clearAccount('LOGIN', subjects.account);

    expect(delegate.assertAllowed).not.toHaveBeenCalled();
    expect(delegate.consumeAttempt).not.toHaveBeenCalled();
    expect(delegate.recordFailure).not.toHaveBeenCalled();
    expect(delegate.clearAccount).not.toHaveBeenCalled();

    await service.consumeAttempt('PASSWORD_RECOVERY', subjects);
    expect(delegate.consumeAttempt).toHaveBeenCalledWith('PASSWORD_RECOVERY', subjects);
  });
});
