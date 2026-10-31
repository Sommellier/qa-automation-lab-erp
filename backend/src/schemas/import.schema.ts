import { z } from 'zod';

export const listImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'A página deve ser maior ou igual a 1.').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'O tamanho da página deve ser no máximo 100.').default(20),
});

export const importJobIdSchema = z.uuid('ID de importação inválido.');
export const optionalValidationJobIdSchema = z.uuid('ID de validação inválido.').optional();

export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;
