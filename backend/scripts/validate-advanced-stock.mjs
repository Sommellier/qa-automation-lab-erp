import { PrismaClient } from '@prisma/client';

const database = new PrismaClient();

try {
  const [products, balances, warehouses, locations, movementsWithDimension, movementsWithoutDimension, mismatches, invalidAllocations, inventedCosts] = await Promise.all([
    database.product.aggregate({ _count: true, _sum: { stock: true } }),
    database.inventoryBalance.aggregate({ _count: true, _sum: { physical: true, reserved: true, blocked: true, inTransit: true } }),
    database.warehouse.findMany({ select: { id: true, code: true, name: true, isDefault: true, active: true } }),
    database.stockLocation.findMany({ select: { id: true, warehouseId: true, code: true, type: true, isDefault: true, active: true } }),
    database.stockMovement.count({ where: { warehouseId: { not: null }, locationId: { not: null } } }),
    database.stockMovement.count({ where: { OR: [{ warehouseId: null }, { locationId: null }] } }),
    database.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM products p WHERE p.stock <> COALESCE((SELECT SUM(ib.physical) FROM inventory_balances ib WHERE ib.product_id=p.id),0)'),
    database.$queryRawUnsafe('SELECT COUNT(*)::int AS count FROM inventory_balances WHERE physical < 0 OR reserved < 0 OR blocked < 0 OR in_transit < 0 OR reserved + blocked > physical'),
    database.product.count({ where: { averageCost: { gt: 0 }, costHistory: { none: {} } } }),
  ]);
  const mismatchCount = Number(mismatches[0]?.count ?? 0);
  const invalidAllocationCount = Number(invalidAllocations[0]?.count ?? 0);
  const requiredLocationTypes = new Set(['QUARANTINE', 'DAMAGED', 'DISPOSAL']);
  const missingReturnLocationTypes = [...requiredLocationTypes].filter((type) => !locations.some((location) => location.active && location.type === type));
  const result = { products, balances, warehouses, locations, movementsWithDimension, movementsWithoutDimension, mismatchCount, invalidAllocationCount, missingReturnLocationTypes, inventedCosts };
  console.log(JSON.stringify(result, null, 2));
  if (movementsWithoutDimension > 0 || mismatchCount > 0 || invalidAllocationCount > 0 || missingReturnLocationTypes.length > 0 || inventedCosts > 0) process.exitCode = 1;
} finally {
  await database.$disconnect();
}
