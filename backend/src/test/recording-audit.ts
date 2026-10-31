import type { AuditLogInput } from '../types/audit.js';
import type { AuditLogger, AuditTransaction } from '../services/audit.service.js';

export class RecordingAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];

  transaction<T>(operation: (transaction: AuditTransaction) => Promise<T>): Promise<T> {
    return operation(undefined);
  }

  async log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
  }
}
