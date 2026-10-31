import type { AuditRepository } from '../repositories/audit.repository.js';
import type { ListAuditQuery } from '../schemas/audit.schema.js';

export class AuditQueryService {
  constructor(private readonly audit: AuditRepository) {}

  async list(query: ListAuditQuery) {
    const { logs, total } = await this.audit.list(query);
    return {
      data: logs,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
