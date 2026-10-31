import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const storage = multer.memoryStorage();
const statementUpload = multer({
  storage,
  limits: { fileSize: Math.floor(env.BANK_STATEMENT_MAX_FILE_SIZE_MB * 1024 * 1024), files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (extension !== 'ofx' && extension !== 'csv') return callback(new AppError('Envie um extrato OFX ou CSV.', 400, 'INVALID_STATEMENT_FORMAT'));
    callback(null, true);
  },
});
const attachmentUpload = multer({
  storage,
  limits: { fileSize: Math.floor(env.FINANCIAL_ATTACHMENT_MAX_FILE_SIZE_MB * 1024 * 1024), files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'application/octet-stream'];
    if (!allowed.includes(file.mimetype)) return callback(new AppError('Tipo de comprovante não permitido.', 400, 'INVALID_FINANCIAL_ATTACHMENT_FORMAT'));
    callback(null, true);
  },
});

function wrapped(handler: RequestHandler, maxMb: number, code: string): RequestHandler {
  return (request, response, next) => handler(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(`O arquivo excede o limite de ${maxMb} MB.`, 413, code));
    if (error) return next(error);
    next();
  });
}

export const uploadBankStatement = wrapped(statementUpload.single('file'), env.BANK_STATEMENT_MAX_FILE_SIZE_MB, 'BANK_STATEMENT_TOO_LARGE');
export const uploadFinancialAttachment = wrapped(attachmentUpload.single('file'), env.FINANCIAL_ATTACHMENT_MAX_FILE_SIZE_MB, 'FINANCIAL_ATTACHMENT_TOO_LARGE');
