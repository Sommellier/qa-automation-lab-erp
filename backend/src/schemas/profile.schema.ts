import { z } from 'zod';
import { passwordSchema } from './password.schema.js';
import { nameSchema } from './user.schema.js';

export const updateProfileSchema = z
  .object({ name: nameSchema })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
    newPassword: z.string().min(1, 'Nova senha é obrigatória.').pipe(passwordSchema),
    confirmPassword: z.string().min(1, 'Confirmação da nova senha é obrigatória.'),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'A confirmação da nova senha não corresponde.',
    path: ['confirmPassword'],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
