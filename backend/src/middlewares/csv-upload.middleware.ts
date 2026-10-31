import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

export const CSV_IMPORT_MAX_BYTES = Math.floor(env.CSV_IMPORT_MAX_FILE_SIZE_MB * 1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CSV_IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      callback(new AppError('Formato de arquivo inválido. Envie um arquivo CSV.', 400, 'INVALID_CSV_FORMAT'));
      return;
    }
    callback(null, true);
  },
});

export const uploadCsv: RequestHandler = (request, response, next) => {
  upload.single('file')(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError(`O arquivo excede o limite de ${env.CSV_IMPORT_MAX_FILE_SIZE_MB} MB.`, 413, 'CSV_FILE_TOO_LARGE'));
      return;
    }
    if (error) { next(error); return; }
    next();
  });
};
