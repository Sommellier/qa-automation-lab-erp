import type { ErrorRequestHandler } from 'express';
import { ZodError, z } from 'zod';
import { AppError } from '../errors/app-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    const flattened = z.flattenError(error);
    const firstMessage = Object.values(flattened.fieldErrors).flat()[0] ?? 'Dados inválidos.';

    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: firstMessage,
        fields: flattened.fieldErrors,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    response.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' },
  });
};

