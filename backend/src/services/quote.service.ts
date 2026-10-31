import { AuditAction, AuditEntity, Prisma, QuoteNegotiationAction, QuoteStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { CreateQuoteInput, ListQuotesQuery, UpdateCommissionRuleInput, UpdateQuoteApprovalRuleInput, UpdateQuoteInput } from '../schemas/quote.schema.js';
import type { AuditLogger } from './audit.service.js';
import { assertWithinDiscountApprovalLimit, calculateCommission, calculateQuoteLine, effectiveDiscountPercent, isQuoteExpired, quoteReservationExpiry } from './quote-rules.js';
import type { StockService } from './stock.service.js';

const quoteInclude = {
  client: { select: { id: true, name: true, document: true, email: true } },
  seller: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  items: { orderBy: { productName: 'asc' as const } },
  negotiations: { orderBy: { createdAt: 'desc' as const }, include: { actor: { select: { id: true, name: true, email: true } } } },
  reservations: { orderBy: { expiresAt: 'asc' as const }, include: {
    warehouse: { select: { id: true, code: true, name: true } },
    location: { select: { id: true, code: true, description: true } },
    lot: { select: { id: true, code: true, expirationDate: true } },
  } },
  order: { select: { id: true, number: true, status: true, createdAt: true } },
} satisfies Prisma.QuoteInclude;

type QuoteRecord = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;

export class QuoteService {
  constructor(private readonly stock: StockService, private readonly audit: AuditLogger) {}

  async setup(actorUserId: string, role: UserRole) {
    const [clients, products, sellers, approvalRules, commissionRules] = await Promise.all([
      prisma.client.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, document: true } }),
      prisma.product.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, sku: true, price: true, stock: true } }),
      prisma.user.findMany({ where: { active: true, role: { in: [UserRole.ADMIN, UserRole.ANALISTA] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, role: true } }),
      prisma.quoteApprovalRule.findMany({ orderBy: { role: 'asc' } }),
      prisma.salesCommissionRule.findMany({ include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { user: { name: 'asc' } } }),
    ]);
    return {
      clients, products,
      sellers: role === UserRole.ADMIN ? sellers : sellers.filter((seller) => seller.id === actorUserId),
      approvalRules, commissionRules,
    };
  }

  async list(query: ListQuotesQuery, actorUserId: string) {
    await this.cleanupExpiredReservations();
    await this.expireOverdue(actorUserId);
    const where: Prisma.QuoteWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.search ? { OR: [
        { number: { contains: query.search, mode: 'insensitive' } },
        { client: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
        { seller: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      ] } : {}),
    };
    const [data, total] = await prisma.$transaction([
      prisma.quote.findMany({ where, orderBy: { createdAt: query.sortOrder }, skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { client: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } }, order: { select: { id: true, number: true } }, _count: { select: { items: true } } } }),
      prisma.quote.count({ where }),
    ]);
    return { data: data.map(({ _count, ...quote }) => ({ ...quote, itemsCount: _count.items })), pagination: {
      page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize),
    } };
  }

  async getById(id: string, actorUserId: string): Promise<QuoteRecord> {
    await this.cleanupExpiredReservations(id);
    await this.expireOne(id, actorUserId);
    const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
    if (!quote) throw new AppError('Orçamento não encontrado.', 404, 'QUOTE_NOT_FOUND');
    return quote;
  }

  create(input: CreateQuoteInput, actorUserId: string, role: UserRole) {
    return this.transaction(async (tx) => {
      const commercial = await this.commercialData(tx, input, actorUserId, role);
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('quote_number_seq') AS value`;
      const number = `ORC-${sequence[0]!.value.toString().padStart(6, '0')}`;
      const quote = await tx.quote.create({ data: {
        number, status: QuoteStatus.DRAFT, clientId: input.clientId, sellerId: commercial.sellerId, createdById: actorUserId,
        grossTotal: commercial.grossTotal, discountTotal: commercial.discountTotal, discountPercent: commercial.discountPercent,
        total: commercial.total, commissionRate: commercial.commissionRate, commissionAmount: commercial.commissionAmount,
        paymentInstallments: input.paymentInstallments, firstPaymentDueDays: input.firstPaymentDueDays,
        paymentIntervalDays: input.paymentIntervalDays, validUntil: input.validUntil, reservationHours: input.reservationHours,
        ...(input.notes ? { notes: input.notes } : {}), items: { create: commercial.items },
        negotiations: { create: { action: QuoteNegotiationAction.CREATE, comment: 'Orçamento criado.', actorId: actorUserId, actorRole: role,
          metadata: { grossTotal: commercial.grossTotal.toFixed(2), discountTotal: commercial.discountTotal.toFixed(2), total: commercial.total.toFixed(2) } } },
      }, include: quoteInclude });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.QUOTE, entityId: quote.id, action: AuditAction.CREATE,
        newData: { number, status: quote.status, clientId: quote.clientId, sellerId: quote.sellerId, total: quote.total } }, tx);
      return quote;
    });
  }

  update(id: string, input: UpdateQuoteInput, actorUserId: string, role: UserRole) {
    return this.transaction(async (tx) => {
      const current = await this.lockQuote(tx, id);
      const editableStatuses: QuoteStatus[] = [QuoteStatus.DRAFT, QuoteStatus.REJECTED];
      if (!editableStatuses.includes(current.status)) throw new AppError('Somente orçamentos em rascunho ou rejeitados podem ser editados.', 409, 'QUOTE_NOT_EDITABLE');
      const commercial = await this.commercialData(tx, input, actorUserId, role);
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      const quote = await tx.quote.update({ where: { id }, data: {
        status: QuoteStatus.DRAFT, clientId: input.clientId, sellerId: commercial.sellerId,
        grossTotal: commercial.grossTotal, discountTotal: commercial.discountTotal, discountPercent: commercial.discountPercent,
        total: commercial.total, commissionRate: commercial.commissionRate, commissionAmount: commercial.commissionAmount,
        paymentInstallments: input.paymentInstallments, firstPaymentDueDays: input.firstPaymentDueDays,
        paymentIntervalDays: input.paymentIntervalDays, validUntil: input.validUntil, reservationHours: input.reservationHours,
        notes: input.notes ?? null, rejectionReason: null, items: { create: commercial.items },
        negotiations: { create: { action: QuoteNegotiationAction.UPDATE, comment: 'Condições comerciais atualizadas.', actorId: actorUserId, actorRole: role } },
      }, include: quoteInclude });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.QUOTE, entityId: id, action: AuditAction.UPDATE,
        oldData: { status: current.status, total: current.total }, newData: { status: quote.status, total: quote.total } }, tx);
      return quote;
    });
  }

  submit(id: string, comment: string | undefined, actorUserId: string, role: UserRole) {
    return this.transition(id, actorUserId, async (tx, quote) => {
      if (quote.status !== QuoteStatus.DRAFT) throw new AppError('Apenas rascunhos podem ser enviados para aprovação.', 409, 'QUOTE_CANNOT_SUBMIT');
      return tx.quote.update({ where: { id }, data: { status: QuoteStatus.PENDING_APPROVAL,
        negotiations: { create: { action: QuoteNegotiationAction.SUBMIT, ...(comment ? { comment } : {}), actorId: actorUserId, actorRole: role } } }, include: quoteInclude });
    }, AuditAction.SUBMIT);
  }

  approve(id: string, comment: string | undefined, actorUserId: string, role: UserRole) {
    return this.transition(id, actorUserId, async (tx, quote) => {
      if (quote.status !== QuoteStatus.PENDING_APPROVAL) throw new AppError('O orçamento não está aguardando aprovação.', 409, 'QUOTE_CANNOT_APPROVE');
      if (isQuoteExpired(quote.validUntil)) throw new AppError('O orçamento perdeu a validade.', 409, 'QUOTE_EXPIRED');
      const rule = await tx.quoteApprovalRule.findUnique({ where: { role } });
      assertWithinDiscountApprovalLimit(quote.discountPercent, rule);
      const expiresAt = quoteReservationExpiry(quote.validUntil, quote.reservationHours);
      for (const item of [...quote.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.stock.reserveQuote(tx, { quoteId: id, quoteItemId: item.id, productId: item.productId, quantity: item.quantity, expiresAt, actorUserId });
      }
      const commissionRule = await tx.salesCommissionRule.findUnique({ where: { userId: quote.sellerId } });
      const commissionRate = commissionRule?.active ? commissionRule.rate : new Prisma.Decimal(0);
      return tx.quote.update({ where: { id }, data: {
        status: QuoteStatus.APPROVED, approvedById: actorUserId, approvedAt: new Date(), rejectionReason: null,
        commissionRate, commissionAmount: calculateCommission(quote.total, commissionRate),
        negotiations: { create: [
          { action: QuoteNegotiationAction.APPROVE, ...(comment ? { comment } : {}), actorId: actorUserId, actorRole: role,
            metadata: { approvalLimit: rule!.maxDiscountPercent.toFixed(4), discountPercent: quote.discountPercent.toFixed(4) } },
          { action: QuoteNegotiationAction.RESERVE, comment: `Estoque reservado até ${expiresAt.toISOString()}.`, actorId: actorUserId, actorRole: role },
        ] },
      }, include: quoteInclude });
    }, AuditAction.APPROVE);
  }

  reject(id: string, reason: string, actorUserId: string, role: UserRole) {
    return this.transition(id, actorUserId, async (tx, quote) => {
      if (quote.status !== QuoteStatus.PENDING_APPROVAL) throw new AppError('O orçamento não está aguardando aprovação.', 409, 'QUOTE_CANNOT_REJECT');
      return tx.quote.update({ where: { id }, data: { status: QuoteStatus.REJECTED, rejectionReason: reason,
        negotiations: { create: { action: QuoteNegotiationAction.REJECT, comment: reason, actorId: actorUserId, actorRole: role } } }, include: quoteInclude });
    }, AuditAction.REJECT);
  }

  renew(id: string, reservationHours: number | undefined, actorUserId: string, role: UserRole) {
    return this.transition(id, actorUserId, async (tx, quote) => {
      if (quote.status !== QuoteStatus.APPROVED) throw new AppError('Somente orçamentos aprovados podem ter a reserva renovada.', 409, 'QUOTE_CANNOT_RENEW');
      if (isQuoteExpired(quote.validUntil)) throw new AppError('O orçamento perdeu a validade.', 409, 'QUOTE_EXPIRED');
      await this.stock.releaseQuoteReservations(tx, id, actorUserId, 'Renovação da reserva do orçamento');
      const hours = reservationHours ?? quote.reservationHours;
      const expiresAt = quoteReservationExpiry(quote.validUntil, hours);
      for (const item of [...quote.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.stock.reserveQuote(tx, { quoteId: id, quoteItemId: item.id, productId: item.productId, quantity: item.quantity, expiresAt, actorUserId });
      }
      return tx.quote.update({ where: { id }, data: { reservationHours: hours,
        negotiations: { create: { action: QuoteNegotiationAction.RENEW, comment: `Reserva renovada até ${expiresAt.toISOString()}.`, actorId: actorUserId, actorRole: role } } }, include: quoteInclude });
    }, AuditAction.UPDATE);
  }

  addNote(id: string, comment: string, actorUserId: string, role: UserRole) {
    return this.transaction(async (tx) => {
      await this.lockQuote(tx, id);
      await tx.quoteNegotiation.create({ data: { quoteId: id, action: QuoteNegotiationAction.NOTE, comment, actorId: actorUserId, actorRole: role } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.QUOTE, entityId: id, action: AuditAction.UPDATE, newData: { noteAdded: true } }, tx);
      return tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
    });
  }

  cancel(id: string, comment: string | undefined, actorUserId: string, role: UserRole) {
    return this.transition(id, actorUserId, async (tx, quote) => {
      const terminalStatuses: QuoteStatus[] = [QuoteStatus.CONVERTED, QuoteStatus.CANCELLED, QuoteStatus.EXPIRED];
      if (terminalStatuses.includes(quote.status)) throw new AppError('O orçamento não pode ser cancelado.', 409, 'QUOTE_CANNOT_CANCEL');
      if (quote.status === QuoteStatus.APPROVED) await this.stock.releaseQuoteReservations(tx, id, actorUserId, 'Cancelamento do orçamento');
      return tx.quote.update({ where: { id }, data: { status: QuoteStatus.CANCELLED,
        negotiations: { create: { action: QuoteNegotiationAction.CANCEL, ...(comment ? { comment } : {}), actorId: actorUserId, actorRole: role } } }, include: quoteInclude });
    }, AuditAction.CANCEL);
  }

  convert(id: string, actorUserId: string, role: UserRole) {
    return this.transaction(async (tx) => {
      const quote = await this.lockQuote(tx, id);
      const existing = await tx.order.findUnique({ where: { quoteId: id } });
      if (existing) return existing;
      if (quote.status !== QuoteStatus.APPROVED) throw new AppError('Somente orçamentos aprovados podem ser convertidos.', 409, 'QUOTE_CANNOT_CONVERT');
      if (isQuoteExpired(quote.validUntil)) throw new AppError('O orçamento perdeu a validade.', 409, 'QUOTE_EXPIRED');
      const sequence = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('order_number_seq') AS value`;
      const order = await tx.order.create({ data: {
        number: `PED-${sequence[0]!.value.toString().padStart(6, '0')}`, clientId: quote.clientId, total: quote.total,
        grossTotal: quote.grossTotal, discountTotal: quote.discountTotal, quoteId: quote.id, sellerId: quote.sellerId,
        commissionRate: quote.commissionRate, commissionAmount: quote.commissionAmount,
        paymentInstallments: quote.paymentInstallments, firstPaymentDueDays: quote.firstPaymentDueDays,
        paymentIntervalDays: quote.paymentIntervalDays, items: { create: quote.items.map((item) => ({
          productId: item.productId, productName: item.productName, productSku: item.productSku,
          quantity: item.quantity, unitPrice: item.unitPrice, subtotal: item.subtotal,
        })) },
      }, include: { items: true } });
      const orderItemByProduct = new Map(order.items.map((item) => [item.productId, item.id]));
      await this.stock.convertQuoteReservations(tx, id, order.id,
        new Map(quote.items.map((item) => [item.id, orderItemByProduct.get(item.productId)!])), actorUserId);
      await tx.quote.update({ where: { id }, data: { status: QuoteStatus.CONVERTED,
        negotiations: { create: { action: QuoteNegotiationAction.CONVERT, comment: `Convertido no pedido ${order.number}, sem redigitação.`, actorId: actorUserId, actorRole: role,
          metadata: { orderId: order.id, orderNumber: order.number } } } } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.QUOTE, entityId: id, action: AuditAction.STATUS_CHANGE,
        oldData: { status: quote.status }, newData: { status: QuoteStatus.CONVERTED, orderId: order.id, orderNumber: order.number } }, tx);
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.ORDER, entityId: order.id, action: AuditAction.CREATE,
        newData: { number: order.number, quoteId: id, sellerId: order.sellerId, total: order.total, commissionAmount: order.commissionAmount } }, tx);
      return order;
    });
  }

  async listApprovalRules() {
    return { rules: await prisma.quoteApprovalRule.findMany({ orderBy: { role: 'asc' }, include: { updatedBy: { select: { id: true, name: true } } } }) };
  }

  updateApprovalRule(role: UserRole, input: UpdateQuoteApprovalRuleInput, actorUserId: string) {
    return this.transaction(async (tx) => {
      const current = await tx.quoteApprovalRule.findUnique({ where: { role } });
      const rule = await tx.quoteApprovalRule.upsert({ where: { role }, create: { role, ...input, updatedById: actorUserId }, update: { ...input, updatedById: actorUserId } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.QUOTE_APPROVAL_RULE, entityId: rule.id,
        action: current ? AuditAction.UPDATE : AuditAction.CREATE, oldData: current, newData: rule }, tx);
      return rule;
    });
  }

  async listCommissionRules() {
    const sellers = await prisma.user.findMany({ where: { active: true, role: { in: [UserRole.ADMIN, UserRole.ANALISTA] } }, orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, commissionRule: true } });
    return { rules: sellers.map(({ commissionRule, ...user }) => ({ user, rate: commissionRule?.rate ?? new Prisma.Decimal(0), active: commissionRule?.active ?? false, id: commissionRule?.id ?? null })) };
  }

  updateCommissionRule(userId: string, input: UpdateCommissionRuleInput, actorUserId: string) {
    return this.transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      const sellerRoles: UserRole[] = [UserRole.ADMIN, UserRole.ANALISTA];
      if (!user || !user.active || !sellerRoles.includes(user.role)) throw new AppError('Vendedor inválido ou inativo.', 404, 'SELLER_NOT_FOUND');
      const current = await tx.salesCommissionRule.findUnique({ where: { userId } });
      const rule = await tx.salesCommissionRule.upsert({ where: { userId }, create: { userId, ...input, updatedById: actorUserId }, update: { ...input, updatedById: actorUserId } });
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.SALES_COMMISSION_RULE, entityId: rule.id,
        action: current ? AuditAction.UPDATE : AuditAction.CREATE, oldData: current, newData: rule }, tx);
      return rule;
    });
  }

  async commissions() {
    const orders = await prisma.order.findMany({ where: { sellerId: { not: null }, status: { not: 'CANCELLED' } },
      select: { id: true, number: true, total: true, commissionRate: true, commissionAmount: true, createdAt: true, seller: { select: { id: true, name: true, email: true } }, quote: { select: { id: true, number: true } } },
      orderBy: { createdAt: 'desc' } });
    const bySeller = new Map<string, { seller: NonNullable<(typeof orders)[number]['seller']>; orders: number; salesTotal: Prisma.Decimal; commissionTotal: Prisma.Decimal }>();
    for (const order of orders) {
      if (!order.seller) continue;
      const current = bySeller.get(order.seller.id) ?? { seller: order.seller, orders: 0, salesTotal: new Prisma.Decimal(0), commissionTotal: new Prisma.Decimal(0) };
      current.orders += 1; current.salesTotal = current.salesTotal.add(order.total); current.commissionTotal = current.commissionTotal.add(order.commissionAmount);
      bySeller.set(order.seller.id, current);
    }
    return { summary: [...bySeller.values()], orders };
  }

  private async commercialData(tx: Prisma.TransactionClient, input: CreateQuoteInput | UpdateQuoteInput, actorUserId: string, role: UserRole) {
    if (isQuoteExpired(input.validUntil)) throw new AppError('A validade do orçamento não pode estar no passado.', 422, 'QUOTE_INVALID_VALIDITY');
    const client = await tx.client.findUnique({ where: { id: input.clientId }, select: { active: true } });
    if (!client) throw new AppError('Cliente não encontrado.', 404, 'CLIENT_NOT_FOUND');
    if (!client.active) throw new AppError('O cliente selecionado está inativo.', 409, 'CLIENT_INACTIVE');
    const sellerId = input.sellerId ?? actorUserId;
    if (role !== UserRole.ADMIN && sellerId !== actorUserId) throw new AppError('Apenas administradores podem selecionar outro vendedor.', 403, 'SELLER_SELECTION_FORBIDDEN');
    const seller = await tx.user.findUnique({ where: { id: sellerId }, include: { commissionRule: true } });
    const sellerRoles: UserRole[] = [UserRole.ADMIN, UserRole.ANALISTA];
    if (!seller || !seller.active || !sellerRoles.includes(seller.role)) throw new AppError('Vendedor inválido ou inativo.', 404, 'SELLER_NOT_FOUND');
    const products = await tx.product.findMany({ where: { id: { in: input.items.map((item) => item.productId) } } });
    const byId = new Map(products.map((product) => [product.id, product]));
    const items = input.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
      if (!product.active) throw new AppError(`O produto "${product.name}" está inativo.`, 409, 'PRODUCT_INACTIVE');
      const calculation = calculateQuoteLine(product.price, item.quantity, item.discountPercent);
      return { productId: product.id, productName: product.name, productSku: product.sku, quantity: item.quantity,
        originalUnitPrice: calculation.originalUnitPrice, discountPercent: calculation.discountPercent,
        unitPrice: calculation.unitPrice, subtotal: calculation.subtotal, grossTotal: calculation.grossTotal, discountTotal: calculation.discountTotal };
    });
    const grossTotal = items.reduce((sum, item) => sum.add(item.grossTotal), new Prisma.Decimal(0));
    const discountTotal = items.reduce((sum, item) => sum.add(item.discountTotal), new Prisma.Decimal(0));
    const total = items.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
    const commissionRate = seller.commissionRule?.active ? seller.commissionRule.rate : new Prisma.Decimal(0);
    return { sellerId, grossTotal, discountTotal, total, discountPercent: effectiveDiscountPercent(grossTotal, discountTotal),
      commissionRate, commissionAmount: calculateCommission(total, commissionRate),
      items: items.map(({ grossTotal: _gross, discountTotal: _discount, ...item }) => item) };
  }

  private async lockQuote(tx: Prisma.TransactionClient, id: string): Promise<QuoteRecord> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "quotes" WHERE "id" = ${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new AppError('Orçamento não encontrado.', 404, 'QUOTE_NOT_FOUND');
    return tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
  }

  private transition(id: string, actorUserId: string,
    operation: (tx: Prisma.TransactionClient, quote: QuoteRecord) => Promise<QuoteRecord>, action: AuditAction) {
    return this.transaction(async (tx) => {
      const current = await this.lockQuote(tx, id);
      const updated = await operation(tx, current);
      await this.audit.log({ userId: actorUserId, entityType: AuditEntity.QUOTE, entityId: id, action,
        oldData: { status: current.status }, newData: { status: updated.status } }, tx);
      return updated;
    });
  }

  private async expireOne(id: string, actorUserId: string): Promise<void> {
    const current = await prisma.quote.findUnique({ where: { id }, select: { status: true, validUntil: true } });
    if (current?.status === QuoteStatus.APPROVED && isQuoteExpired(current.validUntil)) await this.expireQuote(id, actorUserId);
  }

  private async cleanupExpiredReservations(quoteId?: string): Promise<void> {
    const due = await prisma.quoteReservation.findMany({
      where: { active: true, expiresAt: { lte: new Date() }, ...(quoteId ? { quoteId } : {}) },
      distinct: ['quoteId'], select: { quoteId: true },
    });
    for (const item of due) {
      await this.transaction(async (tx) => {
        const quote = await this.lockQuote(tx, item.quoteId);
        const expired = await tx.quoteReservation.count({ where: { quoteId: item.quoteId, active: true, expiresAt: { lte: new Date() } } });
        if (!expired) return;
        await this.stock.releaseQuoteReservations(tx, item.quoteId, quote.createdById, 'Expiração da reserva temporária do orçamento');
        await tx.quoteNegotiation.create({ data: { quoteId: item.quoteId, action: QuoteNegotiationAction.RELEASE,
          comment: 'Reserva temporária expirada; estoque liberado para novas negociações.', actorId: quote.createdById, actorRole: quote.createdBy.role } });
        await this.audit.log({ userId: quote.createdById, entityType: AuditEntity.QUOTE, entityId: item.quoteId,
          action: AuditAction.UPDATE, newData: { reservationReleased: true, reason: 'EXPIRED' } }, tx);
      });
    }
  }

  private async expireOverdue(actorUserId: string): Promise<void> {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const due = await prisma.quote.findMany({ where: { status: QuoteStatus.APPROVED, validUntil: { lt: today } }, select: { id: true } });
    for (const quote of due) await this.expireQuote(quote.id, actorUserId);
  }

  private expireQuote(id: string, _actorUserId: string) {
    return this.transaction(async (tx) => {
      const quote = await this.lockQuote(tx, id);
      if (quote.status !== QuoteStatus.APPROVED || !isQuoteExpired(quote.validUntil)) return;
      await this.stock.releaseQuoteReservations(tx, id, quote.createdById, 'Validade do orçamento expirada');
      await tx.quote.update({ where: { id }, data: { status: QuoteStatus.EXPIRED,
        negotiations: { create: { action: QuoteNegotiationAction.EXPIRE, comment: 'Validade encerrada; estoque liberado.', actorId: quote.createdById, actorRole: quote.createdBy.role } } } });
      await this.audit.log({ userId: quote.createdById, entityType: AuditEntity.QUOTE, entityId: id, action: AuditAction.STATUS_CHANGE,
        oldData: { status: quote.status }, newData: { status: QuoteStatus.EXPIRED } }, tx);
    });
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 3) {
          if (retryable) throw new AppError('Conflito de concorrência. Tente novamente.', 409, 'QUOTE_CONCURRENCY_CONFLICT');
          throw error;
        }
      }
    }
    throw new AppError('Conflito de concorrência. Tente novamente.', 409, 'QUOTE_CONCURRENCY_CONFLICT');
  }
}
