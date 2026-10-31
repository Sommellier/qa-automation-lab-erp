ALTER TYPE "AuditEntity" ADD VALUE 'SUPPLIER';
ALTER TYPE "AuditEntity" ADD VALUE 'PURCHASE_ORDER';
ALTER TYPE "AuditAction" ADD VALUE 'RECEIVE';
ALTER TYPE "StockMovementType" ADD VALUE 'PURCHASE_RECEIPT';

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDING', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE "suppliers" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "contact_name" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_orders" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "supplier_id" UUID NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDING',
  "total" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "expected_at" DATE,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_items" (
  "id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name" TEXT NOT NULL,
  "product_sku" TEXT NOT NULL,
  "ordered_quantity" INTEGER NOT NULL,
  "received_quantity" INTEGER NOT NULL DEFAULT 0,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_items_quantities_check" CHECK ("ordered_quantity" > 0 AND "received_quantity" >= 0 AND "received_quantity" <= "ordered_quantity"),
  CONSTRAINT "purchase_order_items_unit_cost_check" CHECK ("unit_cost" >= 0)
);

CREATE TABLE "purchase_receipts" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "received_by_id" UUID NOT NULL,
  "notes" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_receipt_items" (
  "id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "purchase_order_item_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "product_name" TEXT NOT NULL,
  "product_sku" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_cost" DECIMAL(12,2) NOT NULL,
  "subtotal" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_receipt_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "purchase_receipt_items_unit_cost_check" CHECK ("unit_cost" >= 0)
);

ALTER TABLE "stock_movements" ADD COLUMN "purchase_order_id" UUID;
ALTER TABLE "stock_movements" ADD COLUMN "purchase_receipt_id" UUID;

CREATE SEQUENCE "purchase_order_number_seq" START 1;
CREATE SEQUENCE "purchase_receipt_number_seq" START 1;

CREATE UNIQUE INDEX "suppliers_document_key" ON "suppliers"("document");
CREATE UNIQUE INDEX "suppliers_email_key" ON "suppliers"("email");
CREATE INDEX "suppliers_active_idx" ON "suppliers"("active");
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");
CREATE INDEX "suppliers_created_at_idx" ON "suppliers"("created_at");
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");
CREATE INDEX "purchase_orders_supplier_id_created_at_idx" ON "purchase_orders"("supplier_id", "created_at");
CREATE INDEX "purchase_orders_status_created_at_idx" ON "purchase_orders"("status", "created_at");
CREATE INDEX "purchase_orders_created_by_id_created_at_idx" ON "purchase_orders"("created_by_id", "created_at");
CREATE INDEX "purchase_orders_created_at_idx" ON "purchase_orders"("created_at");
CREATE UNIQUE INDEX "purchase_order_items_purchase_order_id_product_id_key" ON "purchase_order_items"("purchase_order_id", "product_id");
CREATE INDEX "purchase_order_items_purchase_order_id_idx" ON "purchase_order_items"("purchase_order_id");
CREATE INDEX "purchase_order_items_product_id_idx" ON "purchase_order_items"("product_id");
CREATE UNIQUE INDEX "purchase_receipts_number_key" ON "purchase_receipts"("number");
CREATE INDEX "purchase_receipts_purchase_order_id_received_at_idx" ON "purchase_receipts"("purchase_order_id", "received_at");
CREATE INDEX "purchase_receipts_received_by_id_received_at_idx" ON "purchase_receipts"("received_by_id", "received_at");
CREATE INDEX "purchase_receipts_received_at_idx" ON "purchase_receipts"("received_at");
CREATE UNIQUE INDEX "purchase_receipt_items_receipt_id_product_id_key" ON "purchase_receipt_items"("receipt_id", "product_id");
CREATE INDEX "purchase_receipt_items_receipt_id_idx" ON "purchase_receipt_items"("receipt_id");
CREATE INDEX "purchase_receipt_items_purchase_order_item_id_idx" ON "purchase_receipt_items"("purchase_order_item_id");
CREATE INDEX "purchase_receipt_items_product_id_receipt_id_idx" ON "purchase_receipt_items"("product_id", "receipt_id");
CREATE INDEX "stock_movements_purchase_order_id_created_at_idx" ON "stock_movements"("purchase_order_id", "created_at");
CREATE INDEX "stock_movements_purchase_receipt_id_created_at_idx" ON "stock_movements"("purchase_receipt_id", "created_at");

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
