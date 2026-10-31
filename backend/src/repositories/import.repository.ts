import { ImportStatus, type ImportType, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import type { CreateClientInput } from '../schemas/client.schema.js';
import type { CreateProductInput } from '../schemas/product.schema.js';
import type { ImportJobView, ImportRowError, ListImportJobsInput } from '../types/import.js';
import type { AuditTransaction } from '../services/audit.service.js';

const jobSelect = {
  id: true, type: true, fileName: true, totalRows: true, validRows: true, invalidRows: true,
  importedRows: true, status: true, errors: true, createdById: true, createdAt: true, completedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
} as const satisfies Prisma.ImportJobSelect;

interface JobData {
  type: ImportType;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  importedRows: number;
  status: ImportStatus;
  errors: ImportRowError[];
  createdById: string;
  completedAt?: Date;
}

export interface ImportRepository {
  existingClients(emails: string[], documents: string[], transaction?: AuditTransaction): Promise<{ emails: string[]; documents: string[] }>;
  existingProducts(skus: string[], transaction?: AuditTransaction): Promise<string[]>;
  categoriesByNormalizedNames(names: string[], transaction?: AuditTransaction): Promise<Array<{ id: string; normalizedName: string; active: boolean }>>;
  createClients(records: CreateClientInput[], transaction?: AuditTransaction): Promise<number>;
  createProducts(records: CreateProductInput[], transaction?: AuditTransaction): Promise<Array<{ id: string; stock: number }>>;
  createJob(data: JobData, transaction?: AuditTransaction): Promise<ImportJobView>;
  updateJob(id: string, data: Partial<Pick<JobData, 'totalRows' | 'validRows' | 'invalidRows' | 'importedRows' | 'status' | 'errors' | 'completedAt'>>, transaction?: AuditTransaction): Promise<ImportJobView>;
  findJob(id: string, transaction?: AuditTransaction): Promise<ImportJobView | null>;
  listJobs(input: ListImportJobsInput): Promise<{ jobs: ImportJobView[]; total: number }>;
}

function jsonErrors(errors: ImportRowError[]): Prisma.InputJsonValue {
  return errors as unknown as Prisma.InputJsonValue;
}

export class PrismaImportRepository implements ImportRepository {
  async existingClients(emails: string[], documents: string[], transaction?: AuditTransaction) {
    if (emails.length === 0 && documents.length === 0) return { emails: [], documents: [] };
    const records = await (transaction ?? prisma).client.findMany({
      where: { OR: [
        ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
        ...(documents.length > 0 ? [{ document: { in: documents } }] : []),
      ] },
      select: { email: true, document: true },
    });
    return { emails: records.map((record) => record.email), documents: records.map((record) => record.document) };
  }

  async existingProducts(skus: string[], transaction?: AuditTransaction): Promise<string[]> {
    if (skus.length === 0) return [];
    const records = await (transaction ?? prisma).product.findMany({ where: { sku: { in: skus } }, select: { sku: true } });
    return records.map((record) => record.sku);
  }

  async categoriesByNormalizedNames(names: string[], transaction?: AuditTransaction) {
    if (names.length === 0) return [];
    return (transaction ?? prisma).category.findMany({
      where: { normalizedName: { in: names } }, select: { id: true, normalizedName: true, active: true },
    });
  }

  async createClients(records: CreateClientInput[], transaction?: AuditTransaction): Promise<number> {
    if (records.length === 0) return 0;
    const result = await (transaction ?? prisma).client.createMany({ data: records.map((record) => ({
      name: record.name, document: record.document, email: record.email, phone: record.phone ?? null, active: record.active,
    })) });
    return result.count;
  }

  async createProducts(records: CreateProductInput[], transaction?: AuditTransaction): Promise<Array<{ id: string; stock: number }>> {
    if (records.length === 0) return [];
    return (transaction ?? prisma).product.createManyAndReturn({ data: records.map((record) => ({
      name: record.name, sku: record.sku, description: record.description ?? null,
      price: new Prisma.Decimal(record.price), stock: record.stock, categoryId: record.categoryId, active: record.active,
    })), select: { id: true, stock: true } });
  }

  createJob(data: JobData, transaction?: AuditTransaction): Promise<ImportJobView> {
    const createData: Prisma.ImportJobUncheckedCreateInput = {
      type: data.type, fileName: data.fileName, totalRows: data.totalRows, validRows: data.validRows,
      invalidRows: data.invalidRows, importedRows: data.importedRows, status: data.status,
      errors: jsonErrors(data.errors), createdById: data.createdById,
      ...(data.completedAt ? { completedAt: data.completedAt } : {}),
    };
    return (transaction ?? prisma).importJob.create({ data: createData, select: jobSelect });
  }

  updateJob(id: string, data: Partial<Pick<JobData, 'totalRows' | 'validRows' | 'invalidRows' | 'importedRows' | 'status' | 'errors' | 'completedAt'>>, transaction?: AuditTransaction): Promise<ImportJobView> {
    const updateData: Prisma.ImportJobUncheckedUpdateInput = {
      ...(data.totalRows !== undefined ? { totalRows: data.totalRows } : {}),
      ...(data.validRows !== undefined ? { validRows: data.validRows } : {}),
      ...(data.invalidRows !== undefined ? { invalidRows: data.invalidRows } : {}),
      ...(data.importedRows !== undefined ? { importedRows: data.importedRows } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.errors !== undefined ? { errors: jsonErrors(data.errors) } : {}),
      ...(data.completedAt !== undefined ? { completedAt: data.completedAt } : {}),
    };
    return (transaction ?? prisma).importJob.update({ where: { id }, data: updateData, select: jobSelect });
  }

  findJob(id: string, transaction?: AuditTransaction): Promise<ImportJobView | null> {
    return (transaction ?? prisma).importJob.findUnique({ where: { id }, select: jobSelect });
  }

  async listJobs(input: ListImportJobsInput): Promise<{ jobs: ImportJobView[]; total: number }> {
    const where: Prisma.ImportJobWhereInput = input.createdById ? { createdById: input.createdById } : {};
    const [jobs, total] = await prisma.$transaction([
      prisma.importJob.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize, select: jobSelect }),
      prisma.importJob.count({ where }),
    ]);
    return { jobs, total };
  }
}
