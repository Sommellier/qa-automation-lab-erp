import { OrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createOrderSchema, listOrdersQuerySchema, updateOrderStatusSchema } from './order.schema.js';

const clientId = randomUUID();
const productId = randomUUID();

describe('schemas de pedido', () => {
  it('aceita pedido válido sem preço ou total vindos do cliente', () => {
    expect(createOrderSchema.parse({ clientId, items: [{ productId, quantity: 2 }] }))
      .toEqual({ clientId, paymentInstallments: 1, firstPaymentDueDays: 30, paymentIntervalDays: 30, items: [{ productId, quantity: 2 }] });
  });

  it.each([0, -1, 1.5, '2'])('rejeita quantidade inválida %s', (quantity) => {
    const result = createOrderSchema.safeParse({ clientId, items: [{ productId, quantity }] });
    expect(result.success).toBe(false);
  });

  it('rejeita pedido sem itens e produto duplicado', () => {
    expect(createOrderSchema.safeParse({ clientId, items: [] }).success).toBe(false);
    const duplicate = createOrderSchema.safeParse({ clientId, items: [
      { productId, quantity: 1 }, { productId, quantity: 2 },
    ] });
    expect(duplicate.success).toBe(false);
  });

  it('valida filtros, período, paginação e whitelist de ordenação', () => {
    const result = listOrdersQuerySchema.parse({
      status: OrderStatus.CONFIRMED, dateStart: '2026-09-01', dateEnd: '2026-09-30',
      page: '2', pageSize: '20', sortBy: 'total', sortOrder: 'asc',
    });
    expect(result).toMatchObject({ status: OrderStatus.CONFIRMED, page: 2, pageSize: 20, sortBy: 'total', sortOrder: 'asc' });
    expect(listOrdersQuerySchema.safeParse({ sortBy: 'clientId' }).success).toBe(false);
    expect(listOrdersQuerySchema.safeParse({ dateStart: '2026-10-01', dateEnd: '2026-09-01' }).success).toBe(false);
  });

  it('aceita somente status do enum', () => {
    expect(updateOrderStatusSchema.parse({ status: OrderStatus.PROCESSING })).toEqual({ status: OrderStatus.PROCESSING });
    expect(updateOrderStatusSchema.safeParse({ status: 'PAID' }).success).toBe(false);
  });
});
