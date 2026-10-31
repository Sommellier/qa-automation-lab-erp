import { apiDownload, apiRequest } from './api';
import type { ImportExecution, ImportJob, ImportType, ImportValidation, PaginatedImports } from '../types/import';

function segment(type: ImportType): string { return type === 'CLIENTS' ? 'clients' : 'products'; }
function form(file: File, validationJobId?: string): FormData {
  const data = new FormData(); data.append('file', file);
  if (validationJobId) data.append('validationJobId', validationJobId);
  return data;
}

export const importsApi = {
  validate: (type: ImportType, token: string, file: File) => apiRequest<ImportValidation>(`/imports/${segment(type)}/validate`, { method: 'POST', body: form(file) }, token),
  execute: (type: ImportType, token: string, file: File, validationJobId: string) => apiRequest<ImportExecution>(`/imports/${segment(type)}/execute`, { method: 'POST', body: form(file, validationJobId) }, token),
  template: (type: ImportType, token: string) => apiDownload(`/imports/${segment(type)}/template`, token),
  list: (token: string, page = 1, pageSize = 20) => apiRequest<PaginatedImports>(`/imports?page=${page}&pageSize=${pageSize}`, {}, token),
  getById: (token: string, id: string) => apiRequest<ImportJob>(`/imports/${id}`, {}, token),
};
