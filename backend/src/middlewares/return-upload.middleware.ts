import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.floor(env.RETURN_ATTACHMENT_MAX_FILE_SIZE_MB * 1024 * 1024), files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['application/pdf', 'application/xml', 'text/xml', 'image/png', 'image/jpeg', 'application/octet-stream'];
    if (!allowed.includes(file.mimetype)) return callback(new AppError('Tipo de anexo não permitido.', 400, 'INVALID_RETURN_ATTACHMENT_FORMAT'));
    callback(null, true);
  },
});

export const uploadReturnAttachment: RequestHandler = (request, response, next) => upload.single('file')(request, response, (error: unknown) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(`O arquivo excede o limite de ${env.RETURN_ATTACHMENT_MAX_FILE_SIZE_MB} MB.`, 413, 'RETURN_ATTACHMENT_TOO_LARGE'));
  if (error) return next(error);
  next();
});
