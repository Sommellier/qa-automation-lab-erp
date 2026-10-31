import type { ImportStatus, ImportType, Prisma, UserRole } from '@prisma/client';
import type { CreateClientInput } from '../schemas/client.schema.js';
import type { CreateProductInput } from '../schemas/product.schema.js';
import type { ImportProductRowInput } from '../schemas/product.schema.js';

export interface CsvFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ImportFieldError {
  field: string;
  code: string;
  message: string;
  value: string;
}

export interface ImportRowError {
  line: number;
  errors: ImportFieldError[];
}

export interface ParsedCsvRow {
  line: number;
  values: Record<string, string>;
}

export interface ParsedCsv {
  totalRows: number;
  rows: ParsedCsvRow[];
}

export type ImportRecord =
  | { type: 'CLIENTS'; line: number; data: CreateClientInput }
  | { type: 'PRODUCTS'; line: number; data: CreateProductInput };

export type PendingProductImport = ImportProductRowInput;

export interface ImportValidationResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ImportRowError[];
  records: ImportRecord[];
}

export interface ImportSummary {
  jobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ImportRowError[];
}

export interface ImportExecutionResult {
  jobId: string;
  totalRows: number;
  imported: number;
  rejected: number;
  errors: ImportRowError[];
}

export interface ImportActor {
  id: string;
  role: UserRole;
}

export interface ImportJobView {
  id: string;
  type: ImportType;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  status: ImportStatus;
  errors: Prisma.JsonValue | null;
  createdById: string;
  createdBy: { id: string; name: string; email: string };
  createdAt: Date;
  completedAt: Date | null;
}

export interface ListImportJobsInput {
  createdById?: string;
  page: number;
  pageSize: number;
}
