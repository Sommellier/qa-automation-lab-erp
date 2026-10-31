import type { Request, Response } from 'express';
import { listAuditQuerySchema } from '../schemas/audit.schema.js';
import type { AuditQueryService } from '../services/audit-query.service.js';

export class AuditController {
  constructor(private readonly service: AuditQueryService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json(await this.service.list(listAuditQuerySchema.parse(request.query)));
  };
}
