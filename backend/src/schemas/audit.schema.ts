import { AuditAction, AuditEntity } from '@prisma/client';
import { z } from 'zod';

const dateSchema = z.iso.date('Informe uma data válida.');

export const listAuditQuerySchema = z.object({
  entityType: z.enum(AuditEntity).optional(),
  action: z.enum(AuditAction).optional(),
  userId: z.uuid('Usuário inválido.').optional(),
  entityId: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().max(120).optional(),
  dateFrom: dateSchema.transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  dateTo: dateSchema.transform((value) => new Date(`${value}T23:59:59.999Z`)).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
  message: 'A data inicial deve ser anterior ou igual à data final.',
  path: ['dateTo'],
});

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
