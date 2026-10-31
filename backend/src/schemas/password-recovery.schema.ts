import { z } from 'zod';
import { passwordSchema } from './password.schema.js';

export const forgotPasswordSchema = z
  .object({
    email: z
      .string({ error: 'E-mail é obrigatório.' })
      .trim()
      .min(1, 'E-mail é obrigatório.')
      .email('Informe um e-mail válido.')
      .transform((email) => email.toLowerCase()),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string({ error: 'Token é obrigatório.' }).min(32, 'Token inválido.').max(512, 'Token inválido.'),
    newPassword: z.string().min(1, 'Nova senha é obrigatória.').pipe(passwordSchema),
    confirmPassword: z.string().min(1, 'Confirmação da nova senha é obrigatória.'),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'A confirmação da nova senha não corresponde.',
    path: ['confirmPassword'],
  });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
