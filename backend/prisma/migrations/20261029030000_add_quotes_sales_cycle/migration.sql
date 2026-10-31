-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteNegotiationAction" AS ENUM ('CREATE', 'UPDATE', 'NOTE', 'SUBMIT', 'APPROVE', 'REJECT', 'RESERVE', 'RELEASE', 'RENEW', 'CONVERT', 'CANCEL', 'EXPIRE');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'QUOTE';
ALTER TYPE "AuditEntity" ADD VALUE 'QUOTE_APPROVAL_RULE';
ALTER TYPE "AuditEntity" ADD VALUE 'SALES_COMMISSION_RULE';

-- Sequence
CREATE SEQUENCE "quote_number_seq" START WITH 1 INCREMENT BY 1;

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "client_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "gross_total" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "commission_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_installments" INTEGER NOT NULL DEFAULT 1,
    "first_payment_due_days" INTEGER NOT NULL DEFAULT 30,
    "payment_interval_days" INTEGER NOT NULL DEFAULT 30,
    "valid_until" DATE NOT NULL,
    "reservation_hours" INTEGER NOT NULL DEFAULT 24,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quotes_amounts_check" CHECK ("gross_total" >= 0 AND "discount_total" >= 0 AND "total" >= 0 AND "total" <= "gross_total"),
    CONSTRAINT "quotes_discount_percent_check" CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100),
    CONSTRAINT "quotes_commission_check" CHECK ("commission_rate" >= 0 AND "commission_rate" <= 100 AND "commission_amount" >= 0),
    CONSTRAINT "quotes_payment_check" CHECK ("payment_installments" BETWEEN 1 AND 24 AND "first_payment_due_days" BETWEEN 0 AND 3650 AND "payment_interval_days" BETWEEN 1 AND 365),
    CONSTRAINT "quotes_reservation_hours_check" CHECK ("reservation_hours" BETWEEN 1 AND 720)
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "original_unit_price" DECIMAL(12,2) NOT NULL,
    "discount_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_items_values_check" CHECK ("quantity" > 0 AND "original_unit_price" >= 0 AND "unit_price" >= 0 AND "subtotal" >= 0),
    CONSTRAINT "quote_items_discount_check" CHECK ("discount_percent" >= 0 AND "discount_percent" <= 100)
);

-- CreateTable
CREATE TABLE "quote_negotiations" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "action" "QuoteNegotiationAction" NOT NULL,
    "comment" TEXT,
    "metadata" JSONB,
    "actor_id" UUID NOT NULL,
    "actor_role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_approval_rules" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "max_discount_percent" DECIMAL(7,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quote_approval_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_approval_rules_discount_check" CHECK ("max_discount_percent" >= 0 AND "max_discount_percent" <= 100)
);

-- CreateTable
CREATE TABLE "sales_commission_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rate" DECIMAL(7,4) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sales_commission_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_commission_rules_rate_check" CHECK ("rate" >= 0 AND "rate" <= 100)
);

-- AlterTable
ALTER TABLE "orders"
    ADD COLUMN "gross_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "quote_id" UUID,
    ADD COLUMN "seller_id" UUID,
    ADD COLUMN "commission_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    ADD COLUMN "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "orders" SET "gross_total" = "total";

ALTER TABLE "orders"
    ADD CONSTRAINT "orders_sales_values_check" CHECK ("gross_total" >= 0 AND "discount_total" >= 0 AND "total" >= 0 AND "commission_rate" >= 0 AND "commission_rate" <= 100 AND "commission_amount" >= 0);

-- AlterTable
ALTER TABLE "stock_movements"
    ADD COLUMN "quote_id" UUID,
    ADD COLUMN "quote_item_id" UUID;

-- CreateTable
CREATE TABLE "quote_reservations" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "quote_id" UUID NOT NULL,
    "quote_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "balance_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "quantity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "released_at" TIMESTAMP(3),
    "converted_reservation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quote_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_reservations_quantity_check" CHECK ("quantity" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");
CREATE INDEX "quotes_status_valid_until_idx" ON "quotes"("status", "valid_until");
CREATE INDEX "quotes_client_id_created_at_idx" ON "quotes"("client_id", "created_at");
CREATE INDEX "quotes_seller_id_created_at_idx" ON "quotes"("seller_id", "created_at");
CREATE INDEX "quotes_created_at_idx" ON "quotes"("created_at");
CREATE UNIQUE INDEX "quote_items_quote_id_product_id_key" ON "quote_items"("quote_id", "product_id");
CREATE INDEX "quote_items_product_id_idx" ON "quote_items"("product_id");
CREATE INDEX "quote_negotiations_quote_id_created_at_idx" ON "quote_negotiations"("quote_id", "created_at");
CREATE INDEX "quote_negotiations_actor_id_created_at_idx" ON "quote_negotiations"("actor_id", "created_at");
CREATE UNIQUE INDEX "quote_approval_rules_role_key" ON "quote_approval_rules"("role");
CREATE UNIQUE INDEX "sales_commission_rules_user_id_key" ON "sales_commission_rules"("user_id");
CREATE INDEX "sales_commission_rules_active_idx" ON "sales_commission_rules"("active");
CREATE UNIQUE INDEX "orders_quote_id_key" ON "orders"("quote_id");
CREATE INDEX "orders_seller_id_created_at_idx" ON "orders"("seller_id", "created_at");
CREATE INDEX "stock_movements_quote_id_created_at_idx" ON "stock_movements"("quote_id", "created_at");
CREATE INDEX "stock_movements_quote_item_id_idx" ON "stock_movements"("quote_item_id");
CREATE UNIQUE INDEX "quote_reservations_key_key" ON "quote_reservations"("key");
CREATE UNIQUE INDEX "quote_reservations_converted_reservation_id_key" ON "quote_reservations"("converted_reservation_id");
CREATE INDEX "quote_reservations_quote_id_active_expires_at_idx" ON "quote_reservations"("quote_id", "active", "expires_at");
CREATE INDEX "quote_reservations_quote_item_id_active_idx" ON "quote_reservations"("quote_item_id", "active");
CREATE INDEX "quote_reservations_product_id_warehouse_id_active_idx" ON "quote_reservations"("product_id", "warehouse_id", "active");
CREATE INDEX "quote_reservations_expires_at_active_idx" ON "quote_reservations"("expires_at", "active");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_negotiations" ADD CONSTRAINT "quote_negotiations_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_negotiations" ADD CONSTRAINT "quote_negotiations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_approval_rules" ADD CONSTRAINT "quote_approval_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_commission_rules" ADD CONSTRAINT "sales_commission_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_commission_rules" ADD CONSTRAINT "sales_commission_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_balance_id_fkey" FOREIGN KEY ("balance_id") REFERENCES "inventory_balances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_reservations" ADD CONSTRAINT "quote_reservations_converted_reservation_id_fkey" FOREIGN KEY ("converted_reservation_id") REFERENCES "stock_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData
INSERT INTO "quote_approval_rules" ("id", "role", "max_discount_percent", "active", "created_at", "updated_at") VALUES
    (gen_random_uuid(), 'ADMIN', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ANALISTA', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'VISUALIZADOR', 0, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("role") DO NOTHING;
