import type { RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

const memory = multer.memoryStorage();
const xmlUpload = multer({
  storage: memory,
  limits: { fileSize: Math.floor(env.FISCAL_XML_MAX_FILE_SIZE_MB * 1024 * 1024), files: env.FISCAL_XML_MAX_FILES },
  fileFilter: (_request, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith('.xml')) return callback(new AppError('Envie somente arquivos XML de NF-e.', 400, 'INVALID_FISCAL_XML_FORMAT'));
    callback(null, true);
  },
});

const attachmentUpload = multer({
  storage: memory,
  limits: { fileSize: Math.floor(env.FISCAL_ATTACHMENT_MAX_FILE_SIZE_MB * 1024 * 1024), files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['application/pdf', 'application/xml', 'text/xml', 'image/png', 'image/jpeg', 'application/octet-stream'];
    if (!allowed.includes(file.mimetype)) return callback(new AppError('Tipo de anexo não permitido.', 400, 'INVALID_FISCAL_ATTACHMENT_FORMAT'));
    callback(null, true);
  },
});

function handleUpload(handler: RequestHandler, maxSize: number, code: string): RequestHandler {
  return (request, response, next) => handler(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(`O arquivo excede o limite de ${maxSize} MB.`, 413, code));
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_COUNT') return next(new AppError(`O lote excede o limite de ${env.FISCAL_XML_MAX_FILES} arquivos.`, 413, 'FISCAL_XML_FILE_COUNT_EXCEEDED'));
    if (error) return next(error);
    next();
  });
}

export const uploadFiscalXmlBatch = handleUpload(xmlUpload.array('files', env.FISCAL_XML_MAX_FILES), env.FISCAL_XML_MAX_FILE_SIZE_MB, 'FISCAL_XML_TOO_LARGE');
export const uploadFiscalAttachment = handleUpload(attachmentUpload.single('file'), env.FISCAL_ATTACHMENT_MAX_FILE_SIZE_MB, 'FISCAL_ATTACHMENT_TOO_LARGE');
