import type { ReturnStatus, ReturnType } from '@prisma/client';

export interface ListReturnsInput {
  search?: string;
  type?: ReturnType;
  status?: ReturnStatus;
  supplierId?: string;
  clientId?: string;
  productId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
}

export interface ReturnUploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
