import { z } from 'zod';

export const PASSWORD_POLICY = {
  minLength: 8,
  description: 'Mínimo de 8 caracteres, com letra maiúscula, letra minúscula, número e caractere especial.',
} as const;

export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, 'A senha deve ter pelo menos 8 caracteres.')
  .regex(/[A-Z]/, 'A senha deve conter pelo menos uma letra maiúscula.')
  .regex(/[a-z]/, 'A senha deve conter pelo menos uma letra minúscula.')
  .regex(/[0-9]/, 'A senha deve conter pelo menos um número.')
  .regex(/[^A-Za-z0-9]/, 'A senha deve conter pelo menos um caractere especial.');
