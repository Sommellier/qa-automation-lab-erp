import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string({ error: 'E-mail é obrigatório.' })
    .trim()
    .min(1, 'E-mail é obrigatório.')
    .email('Informe um e-mail válido.'),
  password: z
    .string({ error: 'Senha é obrigatória.' })
    .min(1, 'Senha é obrigatória.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

