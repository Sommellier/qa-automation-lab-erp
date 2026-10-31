import { OrderStatus } from '@prisma/client';
import { AppError } from '../errors/app-error.js';
import type { ReportRepository } from '../repositories/report.repository.js';
import type { ClientReportQuery, OrderReportQuery, ProductReportQuery, RevenueReportQuery } from '../schemas/report.schema.js';
import type { OrderReportInput, ProductReportRecord, RevenueReportInput } from '../types/report.js';
import { createXlsx } from '../utils/xlsx.js';

const STATUS_ORDER = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.COMPLETED, OrderStatus.CANCELLED] as const;
const invalidPeriodMessage = 'A data inicial não pode ser posterior à data final.';

function defaultPeriod(query: { dateFrom?: Date | undefined; dateTo?: Date | undefined }, now: Date): RevenueReportInput {
  const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const dateTo = query.dateTo ?? defaultEnd;
  const defaultStart = new Date(Date.UTC(dateTo.getUTCFullYear(), dateTo.getUTCMonth(), dateTo.getUTCDate() - 29));
  const dateFrom = query.dateFrom ?? defaultStart;
  if (dateFrom > dateTo) throw new AppError(invalidPeriodMessage, 400, 'INVALID_REPORT_PERIOD');
  return { dateFrom, dateTo };
}

function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export class ReportService {
  constructor(private readonly reports: ReportRepository, private readonly now: () => Date = () => new Date()) {}

  async clients(query: ClientReportQuery) {
    const snapshot = await this.reports.clients(query);
    return {
      data: snapshot.records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() })),
      indicators: { total: snapshot.totalClients, active: snapshot.active, inactive: snapshot.inactive, newInPeriod: snapshot.newInPeriod },
      pagination: pagination(query.page, query.pageSize, snapshot.recordsTotal), timezone: 'UTC' as const,
    };
  }

  async products(query: ProductReportQuery) {
    const snapshot = await this.reports.products(query);
    return {
      data: snapshot.records.map((record) => ({ ...record, price: record.price.toFixed(2), createdAt: record.createdAt.toISOString() })),
      indicators: { total: snapshot.total, active: snapshot.active, inactive: snapshot.inactive, outOfStock: snapshot.outOfStock, lowStock: snapshot.lowStock, stockValue: snapshot.stockValue.toFixed(2) },
      pagination: pagination(query.page, query.pageSize, snapshot.total), timezone: 'UTC' as const,
    };
  }

  async exportProducts(query: ProductReportQuery, format: 'csv' | 'xlsx') {
    const records: ProductReportRecord[] = [];
    let page = 1;
    while (true) {
      const snapshot = await this.reports.products({ ...query, page, pageSize: 100 });
      records.push(...snapshot.records);
      if (records.length >= snapshot.total) break;
      page += 1;
    }
    const headers = ['Nome', 'SKU', 'Categoria', 'Preço', 'Estoque', 'Status', 'Cadastro'];
    const rows = records.map((record) => [record.name, record.sku, record.category, record.price.toFixed(2),
      record.stock, record.active ? 'Ativo' : 'Inativo', record.createdAt.toISOString()] as Array<string | number>);
    if (format === 'xlsx') return { fileName: 'relatorio-produtos.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: createXlsx(headers, rows) };
    const escaped = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const content = `\uFEFF${[headers, ...rows].map((row) => row.map(escaped).join(';')).join('\r\n')}\r\n`;
    return { fileName: 'relatorio-produtos.csv', contentType: 'text/csv; charset=utf-8', content: Buffer.from(content, 'utf8') };
  }

  async orders(query: OrderReportQuery) {
    const period = defaultPeriod(query, this.now());
    const input: OrderReportInput = { ...query, ...period };
    const snapshot = await this.reports.orders(input);
    const counts = new Map(snapshot.statusGroups.map((group) => [group.status, group.count]));
    return {
      data: snapshot.records.map(({ items, ...record }) => ({ ...record, total: record.total.toFixed(2),
        itemsCount: items.reduce((sum, item) => sum + item.quantity, 0), createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() })),
      indicators: {
        total: snapshot.total,
        byStatus: STATUS_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 })),
        averageCompletedTicket: snapshot.averageCompletedTicket?.toFixed(2) ?? '0.00',
      },
      pagination: pagination(query.page, query.pageSize, snapshot.total),
      period: { dateFrom: period.dateFrom.toISOString(), dateTo: period.dateTo.toISOString(), timezone: 'UTC' as const },
    };
  }

  async revenue(query: RevenueReportQuery) {
    const period = defaultPeriod(query, this.now());
    const snapshot = await this.reports.revenue(period);
    return {
      indicators: {
        totalRevenue: snapshot.totalRevenue?.toFixed(2) ?? '0.00', completedOrders: snapshot.completedOrders,
        averageTicket: snapshot.averageTicket?.toFixed(2) ?? '0.00', largestOrder: snapshot.largestOrder?.toFixed(2) ?? '0.00',
        smallestOrder: snapshot.smallestOrder?.toFixed(2) ?? '0.00', cancelledOrders: snapshot.cancelledOrders,
        cancelledValue: snapshot.cancelledValue?.toFixed(2) ?? '0.00',
      },
      daily: snapshot.daily.map((record) => ({ ...record, revenue: record.revenue.toFixed(2) })),
      topProducts: snapshot.topProducts.map((record) => ({ ...record, revenue: record.revenue.toFixed(2) })),
      topClients: snapshot.topClients.map((record) => ({ ...record, revenue: record.revenue.toFixed(2) })),
      period: { dateFrom: period.dateFrom.toISOString(), dateTo: period.dateTo.toISOString(), timezone: 'UTC' as const },
    };
  }
}
