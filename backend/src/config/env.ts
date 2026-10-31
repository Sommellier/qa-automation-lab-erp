import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter pelo menos 32 caracteres.'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  REFRESH_TOKEN_TTL_HOURS: z.coerce.number().int().positive().max(168).default(8),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  PASSWORD_RESET_MAIL_MODE: z.enum(['console', 'disabled']).default('console'),
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(2).max(20).default(5),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  RATE_LIMIT_BASE_BLOCK_MINUTES: z.coerce.number().int().positive().max(60).default(1),
  RATE_LIMIT_MAX_BLOCK_MINUTES: z.coerce.number().int().positive().max(1440).default(30),
  RATE_LIMIT_ESCALATION_RESET_MINUTES: z.coerce.number().int().positive().max(10_080).default(1440),
  DISABLE_LOGIN_RATE_LIMIT: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  CSV_IMPORT_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(50).default(5),
  CSV_IMPORT_MAX_ROWS: z.coerce.number().int().positive().max(50_000).default(5000),
  FISCAL_XML_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(20).default(2),
  FISCAL_XML_MAX_FILES: z.coerce.number().int().positive().max(100).default(20),
  FISCAL_ATTACHMENT_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(50).default(10),
  RETURN_ATTACHMENT_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(50).default(10),
  FINANCIAL_ATTACHMENT_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(50).default(10),
  BANK_STATEMENT_MAX_FILE_SIZE_MB: z.coerce.number().positive().max(20).default(5),
  BANK_STATEMENT_MAX_ROWS: z.coerce.number().int().positive().max(50_000).default(10_000),
}).superRefine((environment, context) => {
  if (environment.DISABLE_LOGIN_RATE_LIMIT && environment.NODE_ENV !== 'test') {
    context.addIssue({
      code: 'custom',
      path: ['DISABLE_LOGIN_RATE_LIMIT'],
      message: 'DISABLE_LOGIN_RATE_LIMIT só pode ser habilitado quando NODE_ENV=test.',
    });
  }
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error('Variáveis de ambiente inválidas:', z.flattenError(parsedEnvironment.error).fieldErrors);
  throw new Error('Não foi possível iniciar a aplicação: ambiente inválido.');
}

export const env = parsedEnvironment.data;

