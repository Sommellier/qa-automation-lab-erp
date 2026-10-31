export type ImportType = 'CLIENTS' | 'PRODUCTS';
export type ImportStatus = 'VALIDATED' | 'COMPLETED' | 'FAILED';

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

export interface ImportValidation {
  jobId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ImportRowError[];
}

export interface ImportExecution {
  jobId: string;
  totalRows: number;
  imported: number;
  rejected: number;
  errors: ImportRowError[];
}

export interface ImportJob {
  id: string;
  type: ImportType;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  status: ImportStatus;
  errors: ImportRowError[] | null;
  createdById: string;
  createdBy: { id: string; name: string; email: string };
  createdAt: string;
  completedAt: string | null;
}

export interface PaginatedImports {
  data: ImportJob[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = { CLIENTS: 'Clientes', PRODUCTS: 'Produtos' };
export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = { VALIDATED: 'Validado', COMPLETED: 'Concluído', FAILED: 'Falhou' };
