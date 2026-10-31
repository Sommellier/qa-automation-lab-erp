import { AuditAction, AuditEntity, ImportStatus, type ImportType, Prisma, UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import type { ImportRepository } from '../repositories/import.repository.js';
import { createClientSchema, type CreateClientInput } from '../schemas/client.schema.js';
import { importProductRowSchema, type ImportProductRowInput } from '../schemas/product.schema.js';
import type { ListImportsQuery } from '../schemas/import.schema.js';
import type {
  CsvFile, ImportActor, ImportExecutionResult, ImportFieldError, ImportJobView, ImportRecord,
  ImportRowError, ImportSummary, ImportValidationResult, ParsedCsvRow,
} from '../types/import.js';
import type { AuditLogger, AuditTransaction } from './audit.service.js';
import { CLIENT_HEADERS, parseCsvFile, PRODUCT_HEADERS } from './csv-import.parser.js';
import type { StockService } from './stock.service.js';
import { normalizeCategoryName } from '../utils/category-name.js';

interface WorkingRow {
  line: number;
  values: Record<string, string>;
  record?: ImportRecord;
  product?: ImportProductRowInput;
  identity: { email?: string; document?: string; sku?: string; category?: string };
  errors: ImportFieldError[];
}

const templates = {
  CLIENTS: {
    fileName: 'modelo_clientes.csv',
    content: 'name;document;email;phone;active\r\nCarlos Silva;12345678900;carlos@email.com;47999999999;true\r\n',
  },
  PRODUCTS: {
    fileName: 'modelo_produtos.csv',
    content: 'name;sku;description;price;stock;category;active\r\nNotebook Pro;NOTE001;Notebook profissional;5999.90;10;Informática;true\r\n',
  },
} as const;

function safeValue(value: string | undefined): string {
  return (value ?? '').slice(0, 200);
}

function errorCode(field: string, message: string): string {
  if (message.toLowerCase().includes('obrigat')) return `${field.toUpperCase()}_REQUIRED`;
  if (field === 'email') return 'INVALID_EMAIL';
  return `INVALID_${field.toUpperCase()}`;
}

function parseActive(value: string): boolean | string {
  if (value === '') return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function addError(row: WorkingRow, field: string, code: string, message: string): void {
  if (row.errors.some((error) => error.field === field && error.code === code)) return;
  row.errors.push({ field, code, message, value: safeValue(row.values[field]) });
}

function schemaErrors(row: WorkingRow, issues: Array<{ path: PropertyKey[]; message: string }>): void {
  const seen = new Set<string>();
  for (const issue of issues) {
    const field = typeof issue.path[0] === 'string' ? issue.path[0] : 'row';
    if (seen.has(field)) continue;
    seen.add(field);
    addError(row, field, errorCode(field, issue.message), issue.message);
  }
}

function prepareRows(type: ImportType, rows: ParsedCsvRow[]): WorkingRow[] {
  return rows.map(({ line, values }) => {
    const row: WorkingRow = { line, values, identity: {}, errors: [] };
    if (type === 'CLIENTS') {
      const emailResult = createClientSchema.shape.email.safeParse(values.email ?? '');
      const documentResult = createClientSchema.shape.document.safeParse(values.document ?? '');
      if (emailResult.success) row.identity.email = emailResult.data;
      if (documentResult.success) row.identity.document = documentResult.data;
      const result = createClientSchema.safeParse({
        name: values.name ?? '', document: values.document ?? '', email: values.email ?? '',
        phone: values.phone ?? '', active: parseActive(values.active ?? ''),
      });
      if (result.success) row.record = { type: 'CLIENTS', line, data: result.data };
      else schemaErrors(row, result.error.issues);
      return row;
    }

    const skuResult = importProductRowSchema.shape.sku.safeParse(values.sku ?? '');
    if (skuResult.success) row.identity.sku = skuResult.data;
    const stock = /^\d+$/.test(values.stock ?? '') ? Number(values.stock) : values.stock;
    const result = importProductRowSchema.safeParse({
      name: values.name ?? '', sku: values.sku ?? '', description: values.description ?? '',
      price: values.price ?? '', stock, category: values.category ?? '', active: parseActive(values.active ?? ''),
    });
    if (result.success) {
      row.product = result.data;
      row.identity.category = normalizeCategoryName(result.data.category);
    }
    else schemaErrors(row, result.error.issues);
    return row;
  });
}

function markInternalDuplicates(type: ImportType, rows: WorkingRow[]): void {
  const seenEmail = new Map<string, number>();
  const seenDocument = new Map<string, number>();
  const seenSku = new Map<string, number>();
  for (const row of rows) {
    if (type === 'CLIENTS') {
      if (row.identity.email) {
        const first = seenEmail.get(row.identity.email);
        if (first !== undefined) addError(row, 'email', 'DUPLICATE_EMAIL_IN_FILE', `E-mail duplicado dentro do arquivo. Primeira ocorrência na linha ${first}.`);
        else seenEmail.set(row.identity.email, row.line);
      }
      if (row.identity.document) {
        const first = seenDocument.get(row.identity.document);
        if (first !== undefined) addError(row, 'document', 'DUPLICATE_DOCUMENT_IN_FILE', `Documento duplicado dentro do arquivo. Primeira ocorrência na linha ${first}.`);
        else seenDocument.set(row.identity.document, row.line);
      }
    } else if (row.identity.sku) {
      const first = seenSku.get(row.identity.sku);
      if (first !== undefined) addError(row, 'sku', 'DUPLICATE_SKU_IN_FILE', `SKU duplicado dentro do arquivo. Primeira ocorrência na linha ${first}.`);
      else seenSku.set(row.identity.sku, row.line);
    }
  }
}

function orderedErrors(type: ImportType, rows: WorkingRow[]): ImportRowError[] {
  const order = type === 'CLIENTS' ? CLIENT_HEADERS : PRODUCT_HEADERS;
  const index = new Map<string, number>(order.map((field, position) => [field, position]));
  return rows.filter((row) => row.errors.length > 0).sort((a, b) => a.line - b.line).map((row) => ({
    line: row.line,
    errors: [...row.errors].sort((a, b) => (index.get(a.field) ?? 999) - (index.get(b.field) ?? 999)),
  }));
}

export class ImportService {
  constructor(private readonly imports: ImportRepository, private readonly audit: AuditLogger, private readonly stock?: StockService) {}

  template(type: ImportType): { fileName: string; content: Buffer } {
    const template = templates[type];
    return { fileName: template.fileName, content: Buffer.from(`\uFEFF${template.content}`, 'utf8') };
  }

  async validate(type: ImportType, file: CsvFile, actor: ImportActor): Promise<ImportSummary> {
    const result = await this.validateFile(type, file);
    const job = await this.imports.createJob({
      type, fileName: file.originalname, totalRows: result.totalRows, validRows: result.validRows,
      invalidRows: result.invalidRows, importedRows: 0, status: ImportStatus.VALIDATED,
      errors: result.errors, createdById: actor.id,
    });
    return { jobId: job.id, totalRows: result.totalRows, validRows: result.validRows, invalidRows: result.invalidRows, errors: result.errors };
  }

  async execute(type: ImportType, file: CsvFile, actor: ImportActor, validationJobId?: string): Promise<ImportExecutionResult> {
    let summary: ImportValidationResult | undefined;
    try {
      return await this.audit.transaction(async (transaction) => {
        summary = await this.validateFile(type, file, transaction);
        let job: ImportJobView | null = null;
        if (validationJobId) {
          job = await this.imports.findJob(validationJobId, transaction);
          if (!job || job.type !== type) throw new AppError('Validação de importação não encontrada.', 404, 'IMPORT_VALIDATION_NOT_FOUND');
          if (job.status !== ImportStatus.VALIDATED) throw new AppError('Esta validação já foi utilizada.', 409, 'IMPORT_VALIDATION_ALREADY_USED');
          if (job.createdById !== actor.id && actor.role !== UserRole.ADMIN) throw new AppError('Você não possui permissão para executar esta validação.', 403, 'FORBIDDEN');
          if (job.fileName !== file.originalname) throw new AppError('O arquivo enviado não corresponde à validação selecionada.', 400, 'IMPORT_FILE_MISMATCH');
        }

        const clientRecords = summary.records.filter((record): record is Extract<ImportRecord, { type: 'CLIENTS' }> => record.type === 'CLIENTS').map((record) => record.data);
        const productRecords = summary.records.filter((record): record is Extract<ImportRecord, { type: 'PRODUCTS' }> => record.type === 'PRODUCTS').map((record) => record.data);
        let imported: number;
        if (type === 'CLIENTS') {
          imported = await this.imports.createClients(clientRecords, transaction);
        } else {
          const products = await this.imports.createProducts(productRecords, transaction);
          await this.stock?.registerInitialBalances(transaction, products, actor.id);
          imported = products.length;
        }
        const jobData = {
          totalRows: summary.totalRows, validRows: summary.validRows, invalidRows: summary.invalidRows,
          importedRows: imported, status: ImportStatus.COMPLETED, errors: summary.errors, completedAt: new Date(),
        };
        job = job
          ? await this.imports.updateJob(job.id, jobData, transaction)
          : await this.imports.createJob({ ...jobData, type, fileName: file.originalname, createdById: actor.id }, transaction);
        await this.audit.log({
          userId: actor.id, entityType: AuditEntity.IMPORT, entityId: job.id, action: AuditAction.IMPORT,
          newData: { type, fileName: file.originalname, totalRows: summary.totalRows, imported, rejected: summary.invalidRows },
        }, transaction);
        return { jobId: job.id, totalRows: summary.totalRows, imported, rejected: summary.invalidRows, errors: summary.errors };
      });
    } catch (error: unknown) {
      if (validationJobId && !(error instanceof AppError)) {
        await this.imports.updateJob(validationJobId, { status: ImportStatus.FAILED, completedAt: new Date() }).catch(() => undefined);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('Um registro duplicado foi criado durante a execução. Valide o arquivo novamente.', 409, 'IMPORT_CONCURRENT_DUPLICATE');
      }
      throw error;
    }
  }

  async list(query: ListImportsQuery, actor: ImportActor) {
    const { jobs, total } = await this.imports.listJobs({
      page: query.page, pageSize: query.pageSize,
      ...(actor.role === UserRole.ANALISTA ? { createdById: actor.id } : {}),
    });
    return { data: jobs, pagination: { ...query, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async getById(id: string, actor: ImportActor): Promise<ImportJobView> {
    const job = await this.imports.findJob(id);
    if (!job || (actor.role === UserRole.ANALISTA && job.createdById !== actor.id)) {
      throw new AppError('Importação não encontrada.', 404, 'IMPORT_NOT_FOUND');
    }
    return job;
  }

  private async validateFile(type: ImportType, file: CsvFile, transaction?: AuditTransaction): Promise<ImportValidationResult> {
    const parsed = parseCsvFile(file.buffer, type, env.CSV_IMPORT_MAX_ROWS);
    const rows = prepareRows(type, parsed.rows);
    markInternalDuplicates(type, rows);

    if (type === 'CLIENTS') {
      const emails = [...new Set(rows.flatMap((row) => row.identity.email ? [row.identity.email] : []))];
      const documents = [...new Set(rows.flatMap((row) => row.identity.document ? [row.identity.document] : []))];
      const existing = await this.imports.existingClients(emails, documents, transaction);
      const existingEmails = new Set(existing.emails);
      const existingDocuments = new Set(existing.documents);
      for (const row of rows) {
        if (row.identity.email && existingEmails.has(row.identity.email)) addError(row, 'email', 'EMAIL_ALREADY_EXISTS', 'E-mail já cadastrado.');
        if (row.identity.document && existingDocuments.has(row.identity.document)) addError(row, 'document', 'DOCUMENT_ALREADY_EXISTS', 'Documento já cadastrado.');
      }
    } else {
      const skus = [...new Set(rows.flatMap((row) => row.identity.sku ? [row.identity.sku] : []))];
      const existing = new Set(await this.imports.existingProducts(skus, transaction));
      for (const row of rows) if (row.identity.sku && existing.has(row.identity.sku)) addError(row, 'sku', 'SKU_ALREADY_EXISTS', 'SKU já cadastrado.');
      const categoryNames = [...new Set(rows.flatMap((row) => row.identity.category ? [row.identity.category] : []))];
      const categories = await this.imports.categoriesByNormalizedNames(categoryNames, transaction);
      const byName = new Map(categories.map((category) => [category.normalizedName, category]));
      for (const row of rows) {
        if (!row.product || !row.identity.category) continue;
        const category = byName.get(row.identity.category);
        if (!category) addError(row, 'category', 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
        else if (!category.active) addError(row, 'category', 'CATEGORY_INACTIVE', 'A categoria informada está inativa.');
        else {
          const { category: _category, ...product } = row.product;
          row.record = { type: 'PRODUCTS', line: row.line, data: { ...product, categoryId: category.id } };
        }
      }
    }

    const errors = orderedErrors(type, rows);
    const invalidLines = new Set(errors.map((error) => error.line));
    const records = rows.flatMap((row) => row.record && !invalidLines.has(row.line) ? [row.record] : []);
    return { totalRows: parsed.totalRows, validRows: records.length, invalidRows: errors.length, errors, records };
  }
}
