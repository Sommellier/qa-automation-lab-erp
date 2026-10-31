-- CreateEnum
CREATE TYPE "ProductTrackingMode" AS ENUM ('NONE', 'LOT', 'SERIAL', 'LOT_AND_SERIAL');

-- CreateEnum
CREATE TYPE "StockLocationType" AS ENUM ('STORAGE', 'RECEIVING', 'SHIPPING', 'QUARANTINE', 'DAMAGED', 'DISPOSAL');

-- CreateEnum
CREATE TYPE "StockLotStatus" AS ENUM ('AVAILABLE', 'QUARANTINE', 'BLOCKED', 'EXPIRED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "StockSerialStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_TRANSIT', 'SOLD', 'QUARANTINE', 'BLOCKED', 'RETURNED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockInventoryStatus" AS ENUM ('OPEN', 'COUNTING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockAdjustmentType" AS ENUM ('POSITIVE', 'NEGATIVE', 'LOSS', 'DAMAGE', 'DISPOSAL', 'INVENTORY_CORRECTION', 'LOCATION_CORRECTION', 'TRACEABILITY_CORRECTION');

-- CreateEnum
CREATE TYPE "StockAdjustmentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StockCostEventType" AS ENUM ('INITIAL_BALANCE', 'PURCHASE_RECEIPT', 'CUSTOMER_RETURN', 'ADJUSTMENT_IN', 'SALE', 'TRANSFER', 'SUPPLIER_RETURN', 'LOSS', 'DAMAGE', 'DISPOSAL', 'COST_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CogsEntryType" AS ENUM ('RECOGNITION', 'REVERSAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntity" ADD VALUE 'WAREHOUSE';
ALTER TYPE "AuditEntity" ADD VALUE 'STOCK_TRANSFER';
ALTER TYPE "AuditEntity" ADD VALUE 'STOCK_INVENTORY';
ALTER TYPE "AuditEntity" ADD VALUE 'STOCK_ADJUSTMENT';
ALTER TYPE "AuditEntity" ADD VALUE 'STOCK_COST';
ALTER TYPE "AuditEntity" ADD VALUE 'COGS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION';
ALTER TYPE "StockMovementType" ADD VALUE 'RESERVATION_RELEASE';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_LOSS';
ALTER TYPE "StockMovementType" ADD VALUE 'INVENTORY_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'INVENTORY_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'LOSS';
ALTER TYPE "StockMovementType" ADD VALUE 'DAMAGE';
ALTER TYPE "StockMovementType" ADD VALUE 'DISPOSAL';
ALTER TYPE "StockMovementType" ADD VALUE 'QUARANTINE_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'QUARANTINE_RELEASE';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "average_cost" DECIMAL(14,6) NOT NULL DEFAULT 0,
ADD COLUMN     "block_expired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "expiry_warning_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "stock_value" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tracking_mode" "ProductTrackingMode" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "adjustment_id" UUID,
ADD COLUMN     "adjustment_item_id" UUID,
ADD COLUMN     "average_cost_after" DECIMAL(14,6),
ADD COLUMN     "average_cost_before" DECIMAL(14,6),
ADD COLUMN     "destination_location_id" UUID,
ADD COLUMN     "destination_warehouse_id" UUID,
ADD COLUMN     "document_reference" TEXT,
ADD COLUMN     "inventory_id" UUID,
ADD COLUMN     "inventory_item_id" UUID,
ADD COLUMN     "location_id" UUID,
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "new_balance" INTEGER,
ADD COLUMN     "new_blocked" INTEGER,
ADD COLUMN     "new_reserved" INTEGER,
ADD COLUMN     "operation_key" TEXT,
ADD COLUMN     "previous_balance" INTEGER,
ADD COLUMN     "previous_blocked" INTEGER,
ADD COLUMN     "previous_reserved" INTEGER,
ADD COLUMN     "serial_id" UUID,
ADD COLUMN     "shipment_id" UUID,
ADD COLUMN     "shipment_item_id" UUID,
ADD COLUMN     "total_cost" DECIMAL(16,2),
ADD COLUMN     "transfer_id" UUID,
ADD COLUMN     "transfer_item_id" UUID,
ADD COLUMN     "unit_cost" DECIMAL(14,6),
ADD COLUMN     "warehouse_id" UUID;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "company_name" TEXT,
    "address" TEXT,
    "responsible_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "StockLocationType" NOT NULL DEFAULT 'STORAGE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "supplier_id" UUID,
    "manufacture_date" DATE,
    "expiration_date" DATE,
    "status" "StockLotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "warehouse_id" UUID,
    "purchase_receipt_id" UUID,
    "purchase_receipt_item_id" UUID,
    "fiscal_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_serials" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "serial_number" TEXT NOT NULL,
    "lot_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "status" "StockSerialStatus" NOT NULL DEFAULT 'AVAILABLE',
    "purchase_receipt_id" UUID,
    "purchase_receipt_item_id" UUID,
    "fiscal_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "physical" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "blocked" INTEGER NOT NULL DEFAULT 0,
    "in_transit" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "quantity" INTEGER NOT NULL,
    "consumed_quantity" INTEGER NOT NULL DEFAULT 0,
    "released_quantity" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "source_warehouse_id" UUID NOT NULL,
    "destination_warehouse_id" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "idempotency_key" TEXT,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "shipped_by_id" UUID,
    "shipped_at" TIMESTAMP(3),
    "received_by_id" UUID,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "source_location_id" UUID NOT NULL,
    "destination_location_id" UUID NOT NULL,
    "lot_id" UUID,
    "requested_quantity" INTEGER NOT NULL,
    "shipped_quantity" INTEGER NOT NULL DEFAULT 0,
    "received_quantity" INTEGER NOT NULL DEFAULT 0,
    "lost_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_serials" (
    "id" UUID NOT NULL,
    "transfer_item_id" UUID NOT NULL,
    "serial_id" UUID NOT NULL,
    "received_at" TIMESTAMP(3),

    CONSTRAINT "stock_transfer_serials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_inventories" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "location_id" UUID,
    "status" "StockInventoryStatus" NOT NULL DEFAULT 'OPEN',
    "scope" JSONB,
    "notes" TEXT,
    "reference_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_inventory_items" (
    "id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "expected_quantity" INTEGER NOT NULL,
    "final_quantity" INTEGER,
    "serial_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_inventory_counts" (
    "id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "counted_quantity" INTEGER NOT NULL,
    "serial_numbers" JSONB,
    "notes" TEXT,
    "counted_by_id" UUID NOT NULL,
    "counted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "StockAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "inventory_id" UUID,
    "created_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "applied_by_id" UUID,
    "applied_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_items" (
    "id" UUID NOT NULL,
    "adjustment_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_id" UUID,
    "type" "StockAdjustmentType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,6),
    "serial_numbers" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_cost_history" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "event_type" "StockCostEventType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,6) NOT NULL,
    "total_value" DECIMAL(16,2) NOT NULL,
    "previous_quantity" INTEGER NOT NULL,
    "new_quantity" INTEGER NOT NULL,
    "average_cost_before" DECIMAL(14,6) NOT NULL,
    "average_cost_after" DECIMAL(14,6) NOT NULL,
    "stock_value_before" DECIMAL(16,2) NOT NULL,
    "stock_value_after" DECIMAL(16,2) NOT NULL,
    "stock_movement_id" UUID,
    "purchase_receipt_id" UUID,
    "reference" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_shipments" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "order_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "notes" TEXT,
    "shipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_shipment_items" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,6) NOT NULL,
    "total_cost" DECIMAL(16,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cogs_entries" (
    "id" UUID NOT NULL,
    "type" "CogsEntryType" NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "shipment_item_id" UUID,
    "return_process_id" UUID,
    "return_item_id" UUID,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(14,6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "original_entry_id" UUID,
    "competence_date" DATE NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cogs_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE INDEX "warehouses_active_name_idx" ON "warehouses"("active", "name");

-- CreateIndex
CREATE INDEX "warehouses_responsible_id_idx" ON "warehouses"("responsible_id");

-- CreateIndex
CREATE INDEX "stock_locations_warehouse_id_active_type_idx" ON "stock_locations"("warehouse_id", "active", "type");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_warehouse_id_code_key" ON "stock_locations"("warehouse_id", "code");

-- CreateIndex
CREATE INDEX "stock_lots_product_id_expiration_date_status_idx" ON "stock_lots"("product_id", "expiration_date", "status");

-- CreateIndex
CREATE INDEX "stock_lots_supplier_id_idx" ON "stock_lots"("supplier_id");

-- CreateIndex
CREATE INDEX "stock_lots_purchase_receipt_id_idx" ON "stock_lots"("purchase_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lots_product_id_code_key" ON "stock_lots"("product_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_serials_serial_number_key" ON "stock_serials"("serial_number");

-- CreateIndex
CREATE INDEX "stock_serials_product_id_status_idx" ON "stock_serials"("product_id", "status");

-- CreateIndex
CREATE INDEX "stock_serials_warehouse_id_location_id_status_idx" ON "stock_serials"("warehouse_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "stock_serials_lot_id_idx" ON "stock_serials"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_key_key" ON "inventory_balances"("key");

-- CreateIndex
CREATE INDEX "inventory_balances_product_id_warehouse_id_idx" ON "inventory_balances"("product_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "inventory_balances_warehouse_id_location_id_idx" ON "inventory_balances"("warehouse_id", "location_id");

-- CreateIndex
CREATE INDEX "inventory_balances_lot_id_idx" ON "inventory_balances"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_key_key" ON "stock_reservations"("key");

-- CreateIndex
CREATE INDEX "stock_reservations_order_id_active_idx" ON "stock_reservations"("order_id", "active");

-- CreateIndex
CREATE INDEX "stock_reservations_order_item_id_active_idx" ON "stock_reservations"("order_item_id", "active");

-- CreateIndex
CREATE INDEX "stock_reservations_product_id_warehouse_id_active_idx" ON "stock_reservations"("product_id", "warehouse_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_number_key" ON "stock_transfers"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_idempotency_key_key" ON "stock_transfers"("idempotency_key");

-- CreateIndex
CREATE INDEX "stock_transfers_source_warehouse_id_status_created_at_idx" ON "stock_transfers"("source_warehouse_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_transfers_destination_warehouse_id_status_created_at_idx" ON "stock_transfers"("destination_warehouse_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_transfer_items_product_id_idx" ON "stock_transfer_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_product_id_source_location_key" ON "stock_transfer_items"("transfer_id", "product_id", "source_location_id", "destination_location_id", "lot_id");

-- CreateIndex
CREATE INDEX "stock_transfer_serials_serial_id_idx" ON "stock_transfer_serials"("serial_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_serials_transfer_item_id_serial_id_key" ON "stock_transfer_serials"("transfer_item_id", "serial_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_inventories_number_key" ON "stock_inventories"("number");

-- CreateIndex
CREATE INDEX "stock_inventories_warehouse_id_status_created_at_idx" ON "stock_inventories"("warehouse_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_inventory_items_product_id_idx" ON "stock_inventory_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_inventory_items_inventory_id_product_id_location_id_l_key" ON "stock_inventory_items"("inventory_id", "product_id", "location_id", "lot_id");

-- CreateIndex
CREATE INDEX "stock_inventory_counts_counted_by_id_counted_at_idx" ON "stock_inventory_counts"("counted_by_id", "counted_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_inventory_counts_inventory_item_id_sequence_key" ON "stock_inventory_counts"("inventory_item_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_number_key" ON "stock_adjustments"("number");

-- CreateIndex
CREATE INDEX "stock_adjustments_warehouse_id_status_created_at_idx" ON "stock_adjustments"("warehouse_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stock_adjustments_inventory_id_idx" ON "stock_adjustments"("inventory_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_items_adjustment_id_idx" ON "stock_adjustment_items"("adjustment_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_items_product_id_location_id_idx" ON "stock_adjustment_items"("product_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_cost_history_stock_movement_id_key" ON "stock_cost_history"("stock_movement_id");

-- CreateIndex
CREATE INDEX "stock_cost_history_product_id_created_at_idx" ON "stock_cost_history"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_cost_history_event_type_created_at_idx" ON "stock_cost_history"("event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "order_shipments_number_key" ON "order_shipments"("number");

-- CreateIndex
CREATE UNIQUE INDEX "order_shipments_idempotency_key_key" ON "order_shipments"("idempotency_key");

-- CreateIndex
CREATE INDEX "order_shipments_order_id_shipped_at_idx" ON "order_shipments"("order_id", "shipped_at");

-- CreateIndex
CREATE INDEX "order_shipment_items_shipment_id_idx" ON "order_shipment_items"("shipment_id");

-- CreateIndex
CREATE INDEX "order_shipment_items_order_item_id_idx" ON "order_shipment_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cogs_entries_shipment_item_id_key" ON "cogs_entries"("shipment_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "cogs_entries_idempotency_key_key" ON "cogs_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "cogs_entries_product_id_competence_date_idx" ON "cogs_entries"("product_id", "competence_date");

-- CreateIndex
CREATE INDEX "cogs_entries_order_id_order_item_id_idx" ON "cogs_entries"("order_id", "order_item_id");

-- CreateIndex
CREATE INDEX "cogs_entries_return_process_id_idx" ON "cogs_entries"("return_process_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_operation_key_key" ON "stock_movements"("operation_key");

-- CreateIndex
CREATE INDEX "stock_movements_shipment_item_id_idx" ON "stock_movements"("shipment_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_warehouse_id_location_id_created_at_idx" ON "stock_movements"("warehouse_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_lot_id_created_at_idx" ON "stock_movements"("lot_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_serial_id_created_at_idx" ON "stock_movements"("serial_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_transfer_id_created_at_idx" ON "stock_movements"("transfer_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_inventory_id_created_at_idx" ON "stock_movements"("inventory_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_adjustment_id_created_at_idx" ON "stock_movements"("adjustment_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_shipment_id_created_at_idx" ON "stock_movements"("shipment_id", "created_at");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "stock_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transfer_item_id_fkey" FOREIGN KEY ("transfer_item_id") REFERENCES "stock_transfer_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "stock_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "stock_inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_adjustment_item_id_fkey" FOREIGN KEY ("adjustment_item_id") REFERENCES "stock_adjustment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "order_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shipment_item_id_fkey" FOREIGN KEY ("shipment_item_id") REFERENCES "order_shipment_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_purchase_receipt_item_id_fkey" FOREIGN KEY ("purchase_receipt_item_id") REFERENCES "purchase_receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_purchase_receipt_item_id_fkey" FOREIGN KEY ("purchase_receipt_item_id") REFERENCES "purchase_receipt_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_serials" ADD CONSTRAINT "stock_serials_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_warehouse_id_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_warehouse_id_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_shipped_by_id_fkey" FOREIGN KEY ("shipped_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_destination_location_id_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_serials" ADD CONSTRAINT "stock_transfer_serials_transfer_item_id_fkey" FOREIGN KEY ("transfer_item_id") REFERENCES "stock_transfer_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_serials" ADD CONSTRAINT "stock_transfer_serials_serial_id_fkey" FOREIGN KEY ("serial_id") REFERENCES "stock_serials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventories" ADD CONSTRAINT "stock_inventories_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventories" ADD CONSTRAINT "stock_inventories_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventories" ADD CONSTRAINT "stock_inventories_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventories" ADD CONSTRAINT "stock_inventories_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "stock_inventories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_counts" ADD CONSTRAINT "stock_inventory_counts_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "stock_inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_inventory_counts" ADD CONSTRAINT "stock_inventory_counts_counted_by_id_fkey" FOREIGN KEY ("counted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "stock_inventories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "stock_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_cost_history" ADD CONSTRAINT "stock_cost_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_cost_history" ADD CONSTRAINT "stock_cost_history_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_cost_history" ADD CONSTRAINT "stock_cost_history_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_cost_history" ADD CONSTRAINT "stock_cost_history_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipment_items" ADD CONSTRAINT "order_shipment_items_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "order_shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipment_items" ADD CONSTRAINT "order_shipment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipment_items" ADD CONSTRAINT "order_shipment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_shipment_item_id_fkey" FOREIGN KEY ("shipment_item_id") REFERENCES "order_shipment_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_original_entry_id_fkey" FOREIGN KEY ("original_entry_id") REFERENCES "cogs_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Friendly, concurrency-safe document numbers.
CREATE SEQUENCE "stock_transfer_number_seq" START 1;
CREATE SEQUENCE "stock_inventory_number_seq" START 1;
CREATE SEQUENCE "stock_adjustment_number_seq" START 1;
CREATE SEQUENCE "order_shipment_number_seq" START 1;

-- Only one default warehouse and one default location per warehouse.
CREATE UNIQUE INDEX "warehouses_single_default_idx" ON "warehouses" ("is_default") WHERE "is_default" = true;
CREATE UNIQUE INDEX "stock_locations_single_default_idx" ON "stock_locations" ("warehouse_id", "is_default") WHERE "is_default" = true;

-- Preserve all pre-existing quantities without inventing lots, serials or costs.
INSERT INTO "warehouses" ("id", "code", "name", "description", "is_default", "active", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000100', 'PADRAO', 'Depósito padrão',
        'Criado automaticamente para preservar o estoque anterior à gestão por depósitos.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "stock_locations" ("id", "warehouse_id", "code", "description", "type", "is_default", "active", "created_at", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000100', 'GERAL',
        'Localização padrão para saldos históricos sem localização anterior.', 'STORAGE', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "inventory_balances" ("id", "key", "product_id", "warehouse_id", "location_id", "physical", "reserved", "blocked", "in_transit", "created_at", "updated_at")
SELECT gen_random_uuid(), p."id"::text || ':00000000-0000-4000-8000-000000000100:00000000-0000-4000-8000-000000000101:none', p."id",
       '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000101',
       p."stock", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "products" p;

UPDATE "stock_movements"
SET "warehouse_id" = '00000000-0000-4000-8000-000000000100',
    "location_id" = '00000000-0000-4000-8000-000000000101',
    "previous_balance" = "previous_stock",
    "new_balance" = "new_stock"
WHERE "warehouse_id" IS NULL;

-- Database-level guards complement the serialized domain transactions.
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative_ck" CHECK ("stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_cost_nonnegative_ck" CHECK ("average_cost" >= 0 AND "stock_value" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_expiry_warning_nonnegative_ck" CHECK ("expiry_warning_days" >= 0);
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_nonnegative_ck" CHECK ("physical" >= 0 AND "reserved" >= 0 AND "blocked" >= 0 AND "in_transit" >= 0);
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_allocation_ck" CHECK ("reserved" + "blocked" <= "physical");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_positive_ck" CHECK ("quantity" > 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cost_nonnegative_ck" CHECK (("unit_cost" IS NULL OR "unit_cost" >= 0) AND ("total_cost" IS NULL OR "total_cost" >= 0));
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantities_ck" CHECK ("quantity" > 0 AND "consumed_quantity" >= 0 AND "released_quantity" >= 0 AND "consumed_quantity" + "released_quantity" <= "quantity");
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_quantities_ck" CHECK ("requested_quantity" > 0 AND "shipped_quantity" >= 0 AND "received_quantity" >= 0 AND "lost_quantity" >= 0 AND "shipped_quantity" <= "requested_quantity" AND "received_quantity" + "lost_quantity" <= "shipped_quantity");
ALTER TABLE "stock_inventory_items" ADD CONSTRAINT "stock_inventory_items_quantities_ck" CHECK ("expected_quantity" >= 0 AND ("final_quantity" IS NULL OR "final_quantity" >= 0));
ALTER TABLE "stock_inventory_counts" ADD CONSTRAINT "stock_inventory_counts_quantities_ck" CHECK ("sequence" > 0 AND "counted_quantity" >= 0);
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_quantity_positive_ck" CHECK ("quantity" > 0 AND ("unit_cost" IS NULL OR "unit_cost" >= 0));
ALTER TABLE "stock_cost_history" ADD CONSTRAINT "stock_cost_history_values_ck" CHECK ("quantity" > 0 AND "unit_cost" >= 0 AND "total_value" >= 0 AND "previous_quantity" >= 0 AND "new_quantity" >= 0 AND "average_cost_before" >= 0 AND "average_cost_after" >= 0 AND "stock_value_before" >= 0 AND "stock_value_after" >= 0);
ALTER TABLE "order_shipment_items" ADD CONSTRAINT "order_shipment_items_values_ck" CHECK ("quantity" > 0 AND "unit_cost" >= 0 AND "total_cost" >= 0);
ALTER TABLE "cogs_entries" ADD CONSTRAINT "cogs_entries_values_ck" CHECK ("quantity" > 0 AND "unit_cost" >= 0 AND "amount" >= 0);
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_code_nonempty_ck" CHECK (length(trim("code")) > 0);
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_code_nonempty_ck" CHECK (length(trim("code")) > 0);
