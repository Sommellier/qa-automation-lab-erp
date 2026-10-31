import { OrderStatus, Prisma } from '@prisma/client';
import { LOW_STOCK_THRESHOLD } from '../constants/inventory.js';
import { prisma } from '../config/prisma.js';
import type {
  ClientReportInput, ClientReportSnapshot, OrderReportInput, OrderReportSnapshot,
  ProductReportInput, ProductReportSnapshot, RevenueDailyRecord, RevenueReportInput,
  RevenueReportSnapshot, RevenueTopClient, RevenueTopProduct,
} from '../types/report.js';

function createdAtRange(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

function clientBaseWhere(input: ClientReportInput): Prisma.ClientWhereInput {
  return {
    ...(input.search ? { OR: [
      { name: { contains: input.search, mode: 'insensitive' } },
      { document: { contains: input.search, mode: 'insensitive' } },
      { email: { contains: input.search, mode: 'insensitive' } },
    ] } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
}

function stockFilter(input: ProductReportInput): Prisma.IntFilter | undefined {
  if (input.stockStatus === 'OUT_OF_STOCK') return { equals: 0 };
  if (input.stockStatus === 'LOW_STOCK') return { lte: LOW_STOCK_THRESHOLD };
  if (input.stockStatus === 'IN_STOCK') return { gt: LOW_STOCK_THRESHOLD };
  return undefined;
}

function productWhere(input: ProductReportInput): Prisma.ProductWhereInput {
  const stock = stockFilter(input);
  const createdAt = createdAtRange(input.createdFrom, input.createdTo);
  return {
    ...(input.search ? { OR: [
      { name: { contains: input.search, mode: 'insensitive' } },
      { sku: { contains: input.search, mode: 'insensitive' } },
    ] } : {}),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(stock ? { stock } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

function productSqlWhere(input: ProductReportInput): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (input.search) {
    const search = `%${input.search}%`;
    conditions.push(Prisma.sql`("name" ILIKE ${search} OR "sku" ILIKE ${search})`);
  }
  if (input.categoryId) conditions.push(Prisma.sql`"category_id" = ${input.categoryId}::uuid`);
  if (input.active !== undefined) conditions.push(Prisma.sql`"active" = ${input.active}`);
  if (input.stockStatus === 'OUT_OF_STOCK') conditions.push(Prisma.sql`"stock" = 0`);
  if (input.stockStatus === 'LOW_STOCK') conditions.push(Prisma.sql`"stock" <= ${LOW_STOCK_THRESHOLD}`);
  if (input.stockStatus === 'IN_STOCK') conditions.push(Prisma.sql`"stock" > ${LOW_STOCK_THRESHOLD}`);
  if (input.createdFrom) conditions.push(Prisma.sql`"created_at" >= ${input.createdFrom}`);
  if (input.createdTo) conditions.push(Prisma.sql`"created_at" <= ${input.createdTo}`);
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

function orderWhere(input: OrderReportInput): Prisma.OrderWhereInput {
  return {
    ...(input.search ? { OR: [
      { number: { contains: input.search, mode: 'insensitive' } },
      { client: { is: { OR: [
        { name: { contains: input.search, mode: 'insensitive' } },
        { document: { contains: input.search, mode: 'insensitive' } },
      ] } } },
    ] } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.clientId ? { clientId: input.clientId } : {}),
    createdAt: { gte: input.dateFrom, lte: input.dateTo },
    ...(input.minTotal || input.maxTotal ? { total: {
      ...(input.minTotal ? { gte: input.minTotal } : {}),
      ...(input.maxTotal ? { lte: input.maxTotal } : {}),
    } } : {}),
  };
}

export interface ReportRepository {
  clients(input: ClientReportInput): Promise<ClientReportSnapshot>;
  products(input: ProductReportInput): Promise<ProductReportSnapshot>;
  orders(input: OrderReportInput): Promise<OrderReportSnapshot>;
  revenue(input: RevenueReportInput): Promise<RevenueReportSnapshot>;
}

export class PrismaReportRepository implements ReportRepository {
  async clients(input: ClientReportInput): Promise<ClientReportSnapshot> {
    const baseWhere = clientBaseWhere(input);
    const createdAt = createdAtRange(input.createdFrom, input.createdTo);
    const where: Prisma.ClientWhereInput = {
      ...baseWhere,
      ...(createdAt ? { createdAt } : {}),
    };
    const [records, recordsTotal, totalClients, active, inactive, newInPeriod] = await prisma.$transaction([
      prisma.client.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
        select: { id: true, name: true, document: true, email: true, phone: true, active: true, createdAt: true, updatedAt: true } }),
      prisma.client.count({ where }),
      prisma.client.count({ where: baseWhere }),
      prisma.client.count({ where: { AND: [baseWhere, { active: true }] } }),
      prisma.client.count({ where: { AND: [baseWhere, { active: false }] } }),
      prisma.client.count({ where }),
    ]);
    return { records, recordsTotal, totalClients, active, inactive, newInPeriod };
  }

  async products(input: ProductReportInput): Promise<ProductReportSnapshot> {
    const where = productWhere(input);
    const sqlWhere = productSqlWhere(input);
    const [rawRecords, total, active, inactive, outOfStock, lowStock, stockValueRows] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
        select: { id: true, name: true, sku: true, category: { select: { name: true } }, price: true, stock: true, active: true, createdAt: true } }),
      prisma.product.count({ where }),
      prisma.product.count({ where: { AND: [where, { active: true }] } }),
      prisma.product.count({ where: { AND: [where, { active: false }] } }),
      prisma.product.count({ where: { AND: [where, { stock: 0 }] } }),
      prisma.product.count({ where: { AND: [where, { stock: { lte: LOW_STOCK_THRESHOLD } }] } }),
      prisma.$queryRaw<Array<{ value: Prisma.Decimal }>>(Prisma.sql`SELECT COALESCE(SUM("price" * "stock"), 0) AS "value" FROM "products" ${sqlWhere}`),
    ]);
    const records = rawRecords.map(({ category, ...record }) => ({ ...record, category: category.name }));
    return { records, total, active, inactive, outOfStock, lowStock, stockValue: stockValueRows[0]?.value ?? new Prisma.Decimal(0) };
  }

  async orders(input: OrderReportInput): Promise<OrderReportSnapshot> {
    const where = orderWhere(input);
    const [records, total, groups, completedAggregate] = await Promise.all([
      prisma.order.findMany({ where, orderBy: { [input.sortBy]: input.sortOrder }, skip: (input.page - 1) * input.pageSize, take: input.pageSize,
        select: { id: true, number: true, status: true, total: true, createdAt: true, updatedAt: true,
          client: { select: { id: true, name: true, document: true } }, items: { select: { quantity: true } } } }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.order.aggregate({ where: { AND: [where, { status: OrderStatus.COMPLETED }] }, _avg: { total: true } }),
    ]);
    return { records, total, statusGroups: groups.map((group) => ({ status: group.status, count: group._count._all })), averageCompletedTicket: completedAggregate._avg.total };
  }

  async revenue(input: RevenueReportInput): Promise<RevenueReportSnapshot> {
    const period = { gte: input.dateFrom, lte: input.dateTo };
    const completedWhere: Prisma.OrderWhereInput = { status: OrderStatus.COMPLETED, createdAt: period };
    const [financial, completedOrders, cancellations, cancelledOrders, dailyRows, productRows, clientRows] = await Promise.all([
      prisma.order.aggregate({ where: completedWhere, _sum: { total: true }, _avg: { total: true }, _max: { total: true }, _min: { total: true } }),
      prisma.order.count({ where: completedWhere }),
      prisma.order.aggregate({ where: { status: OrderStatus.CANCELLED, createdAt: period }, _sum: { total: true } }),
      prisma.order.count({ where: { status: OrderStatus.CANCELLED, createdAt: period } }),
      prisma.$queryRaw<RevenueDailyRecord[]>`
        SELECT TO_CHAR(DATE_TRUNC('day', "created_at"), 'YYYY-MM-DD') AS "date",
          SUM("total") AS "revenue", COUNT(*)::int AS "orders"
        FROM "orders" WHERE "status" = 'COMPLETED'::"OrderStatus"
          AND "created_at" >= ${input.dateFrom} AND "created_at" <= ${input.dateTo}
        GROUP BY DATE_TRUNC('day', "created_at") ORDER BY DATE_TRUNC('day', "created_at") ASC
      `,
      prisma.$queryRaw<RevenueTopProduct[]>`
        SELECT oi."product_id" AS "productId", oi."product_name" AS "product", oi."product_sku" AS "sku",
          SUM(oi."quantity")::int AS "quantity", SUM(oi."subtotal") AS "revenue"
        FROM "order_items" oi INNER JOIN "orders" o ON o."id" = oi."order_id"
        WHERE o."status" = 'COMPLETED'::"OrderStatus" AND o."created_at" >= ${input.dateFrom} AND o."created_at" <= ${input.dateTo}
        GROUP BY oi."product_id", oi."product_name", oi."product_sku"
        ORDER BY SUM(oi."quantity") DESC, SUM(oi."subtotal") DESC LIMIT 10
      `,
      prisma.$queryRaw<RevenueTopClient[]>`
        SELECT c."id" AS "clientId", c."name" AS "client", c."document" AS "document",
          COUNT(o."id")::int AS "orders", SUM(o."total") AS "revenue"
        FROM "orders" o INNER JOIN "clients" c ON c."id" = o."client_id"
        WHERE o."status" = 'COMPLETED'::"OrderStatus" AND o."created_at" >= ${input.dateFrom} AND o."created_at" <= ${input.dateTo}
        GROUP BY c."id", c."name", c."document"
        ORDER BY SUM(o."total") DESC, COUNT(o."id") DESC LIMIT 10
      `,
    ]);
    return {
      totalRevenue: financial._sum.total, completedOrders, averageTicket: financial._avg.total,
      largestOrder: financial._max.total, smallestOrder: financial._min.total,
      cancelledOrders, cancelledValue: cancellations._sum.total,
      daily: dailyRows.map((row) => ({ ...row, orders: Number(row.orders) })),
      topProducts: productRows.map((row) => ({ ...row, quantity: Number(row.quantity) })),
      topClients: clientRows.map((row) => ({ ...row, orders: Number(row.orders) })),
    };
  }
}
