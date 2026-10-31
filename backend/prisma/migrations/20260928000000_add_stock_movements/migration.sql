ALTER TYPE "AuditAction" ADD VALUE 'STOCK_ADJUSTMENT';

CREATE TYPE "StockMovementType" AS ENUM (
  'ENTRY', 'EXIT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
  'SALE', 'ORDER_CANCELLATION', 'INITIAL_BALANCE'
);

CREATE TABLE "stock_movements" (
  "id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "previous_stock" INTEGER NOT NULL,
  "new_stock" INTEGER NOT NULL,
  "reason" TEXT,
  "order_id" UUID,
  "created_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "stock_movements_stocks_non_negative" CHECK ("previous_stock" >= 0 AND "new_stock" >= 0)
);

CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");
CREATE INDEX "stock_movements_type_created_at_idx" ON "stock_movements"("type", "created_at");
CREATE INDEX "stock_movements_order_id_created_at_idx" ON "stock_movements"("order_id", "created_at");
CREATE INDEX "stock_movements_created_by_id_created_at_idx" ON "stock_movements"("created_by_id", "created_at");
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "stock_movements" (
  "id", "product_id", "type", "quantity", "previous_stock", "new_stock", "reason", "created_at"
)
SELECT gen_random_uuid(), "id", 'INITIAL_BALANCE'::"StockMovementType", "stock", 0, "stock",
  'Saldo inicial da implantação do histórico de estoque', CURRENT_TIMESTAMP
FROM "products"
WHERE "stock" > 0;
