import { ReceivableStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { effectiveReceivableStatus } from './receivable.js';

describe('status efetivo da conta a receber', () => {
  const today = new Date('2026-10-27T00:00:00Z');
  it('deriva atraso somente para títulos abertos vencidos', () => {
    expect(effectiveReceivableStatus(ReceivableStatus.PENDING, new Date('2026-10-26'), today)).toBe('OVERDUE');
    expect(effectiveReceivableStatus(ReceivableStatus.PARTIALLY_RECEIVED, new Date('2026-10-26'), today)).toBe('OVERDUE');
    expect(effectiveReceivableStatus(ReceivableStatus.RECEIVED, new Date('2026-10-26'), today)).toBe('RECEIVED');
    expect(effectiveReceivableStatus(ReceivableStatus.PENDING, today, today)).toBe('PENDING');
  });
});
