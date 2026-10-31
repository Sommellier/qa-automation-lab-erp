-- A prior local deployment installed the structural migration before its compatibility
-- backfill was appended. Keep the repair as a new, idempotent migration instead of
-- rewriting database history.

ALTER TABLE "warehouses" ALTER COLUMN "created_by_id" DROP NOT NULL;
ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_created_by_id_fkey";
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE SEQUENCE IF NOT EXISTS "stock_transfer_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "stock_inventory_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "stock_adjustment_number_seq" START 1;
CREATE SEQUENCE IF NOT EXISTS "order_shipment_number_seq" START 1;

CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_single_default_idx"
  ON "warehouses" ("is_default") WHERE "is_default" = true;
CREATE UNIQUE INDEX IF NOT EXISTS "stock_locations_single_default_idx"
  ON "stock_locations" ("warehouse_id", "is_default") WHERE "is_default" = true;

INSERT INTO "warehouses" ("id", "code", "name", "description", "is_default", "active", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000100', 'PADRAO', 'Depósito padrão',
        'Criado automaticamente para preservar o estoque anterior à gestão por depósitos.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "stock_locations" ("id", "warehouse_id", "code", "description", "type", "is_default", "active", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000100', 'GERAL',
        'Localização padrão para saldos históricos sem localização anterior.', 'STORAGE', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "inventory_balances" ("id", "key", "product_id", "warehouse_id", "location_id", "physical", "reserved", "blocked", "in_transit", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id"::text || ':00000000-0000-4000-8000-000000000100:00000000-0000-4000-8000-000000000101:none', p."id",
       '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000101',
       p."stock", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" p
WHERE NOT EXISTS (SELECT 1 FROM "inventory_balances" b WHERE b."product_id" = p."id")
ON CONFLICT ("key") DO NOTHING;

UPDATE "stock_movements"
SET "warehouse_id" = '00000000-0000-4000-8000-000000000100',
    "location_id" = '00000000-0000-4000-8000-000000000101',
    "previous_balance" = "previous_stock",
    "new_balance" = "new_stock"
WHERE "warehouse_id" IS NULL OR "location_id" IS NULL;

-- Shipment items may span more than one location/lot, so a shipment item can have
-- multiple ledger movements while retaining a single CMV entry.
DROP INDEX IF EXISTS "stock_movements_shipment_item_id_key";
CREATE INDEX IF NOT EXISTS "stock_movements_shipment_item_id_idx" ON "stock_movements"("shipment_item_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_nonnegative_ck') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative_ck" CHECK ("stock" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_nonnegative_ck') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_cost_nonnegative_ck" CHECK ("average_cost" >= 0 AND "stock_value" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_nonnegative_ck') THEN
    ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_nonnegative_ck" CHECK ("physical" >= 0 AND "reserved" >= 0 AND "blocked" >= 0 AND "in_transit" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_balances_allocation_ck') THEN
    ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_allocation_ck" CHECK ("reserved" + "blocked" <= "physical");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_quantity_positive_ck') THEN
    ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_positive_ck" CHECK ("quantity" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reservations_quantities_ck') THEN
    ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantities_ck" CHECK ("quantity" > 0 AND "consumed_quantity" >= 0 AND "released_quantity" >= 0 AND "consumed_quantity" + "released_quantity" <= "quantity");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfer_items_quantities_ck') THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_quantities_ck" CHECK ("requested_quantity" > 0 AND "shipped_quantity" >= 0 AND "received_quantity" >= 0 AND "lost_quantity" >= 0 AND "shipped_quantity" <= "requested_quantity" AND "received_quantity" + "lost_quantity" <= "shipped_quantity");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_inventory_items_quantities_ck') THEN
    ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_quantities_ck" CHECK ("expected_quantity" >= 0 AND ("final_quantity" IS NULL OR "final_quantity" >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_adjustment_items_quantity_positive_ck') THEN
    ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_quantity_positive_ck" CHECK ("quantity" > 0 AND ("unit_cost" IS NULL OR "unit_cost" >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cogs_entries_values_ck') THEN
    ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_values_ck" CHECK ("quantity" > 0 AND "unit_cost" >= 0 AND "amount" >= 0);
  END IF;
END $$;
