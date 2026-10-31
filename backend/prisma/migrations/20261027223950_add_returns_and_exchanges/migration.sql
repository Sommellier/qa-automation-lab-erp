-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('SUPPLIER_RETURN', 'CUSTOMER_RETURN', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('DRAFT', 'REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'AWAITING_PHYSICAL', 'AWAITING_INSPECTION', 'AWAITING_FINANCIAL', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnPhysicalStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ReturnInspectionStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ReturnFinancialStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'SETTLED');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('NOT_APPLICABLE', 'PENDING_INSPECTION', 'RESALABLE', 'DAMAGED', 'DISPOSAL', 'ASSISTANCE');

-- CreateEnum
CREATE TYPE "ReturnFinancialAdjustmentType" AS ENUM ('SUPPLIER_CREDIT', 'PAYABLE_REDUCTION', 'SUPPLIER_REFUND', 'FUTURE_PURCHASE_CREDIT', 'CUSTOMER_REFUND', 'RECEIVABLE_REVERSAL', 'COMMERCIAL_CREDIT', 'RECEIVABLE_REDUCTION', 'EXCHANGE_CHARGE', 'EXCHANGE_REFUND');

-- CreateEnum
CREATE TYPE "ReturnFinancialAdjustmentStatus" AS ENUM ('PLANNED', 'APPROVED', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnFiscalDocumentRole" AS ENUM ('ORIGINAL', 'RETURN_DOCUMENT');

-- CreateEnum
CREATE TYPE "ReturnAttachmentType" AS ENUM ('RECEIPT', 'PHOTO', 'TECHNICAL_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnHistoryAction" AS ENUM ('CREATED', 'SUBMITTED', 'REVIEW_STARTED', 'APPROVED', 'REJECTED', 'PHYSICAL_CONFIRMED', 'INSPECTED', 'FINANCIAL_UPDATED', 'FISCAL_LINKED', 'ATTACHMENT_ADDED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PHYSICAL_CONFIRM';
ALTER TYPE "AuditAction" ADD VALUE 'INSPECT';
ALTER TYPE "AuditAction" ADD VALUE 'SETTLE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntity" ADD VALUE 'RETURN_PROCESS';
ALTER TYPE "AuditEntity" ADD VALUE 'RETURN_REASON';
ALTER TYPE "AuditEntity" ADD VALUE 'RETURN_ATTACHMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'SUPPLIER_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'CUSTOMER_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'EXCHANGE_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'EXCHANGE_SHIPMENT';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "return_item_id" UUID,
ADD COLUMN     "return_process_id" UUID;

-- Generate friendly, concurrency-safe identifiers. Gaps after rollbacks are expected.
CREATE SEQUENCE "return_process_number_seq" START 1;

-- CreateTable
CREATE TABLE "return_reasons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to" "ReturnType"[] DEFAULT ARRAY[]::"ReturnType"[],
    "requires_justification" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_processes" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "ReturnType" NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "physical_status" "ReturnPhysicalStatus" NOT NULL DEFAULT 'PENDING',
    "inspection_status" "ReturnInspectionStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "financial_status" "ReturnFinancialStatus" NOT NULL DEFAULT 'PENDING',
    "purchase_order_id" UUID,
    "purchase_receipt_id" UUID,
    "order_id" UUID,
    "supplier_id" UUID,
    "client_id" UUID,
    "reason_id" UUID NOT NULL,
    "justification" TEXT,
    "notes" TEXT,
    "returned_total" DECIMAL(14,2) NOT NULL,
    "replacement_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "financial_difference" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "physical_confirmed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "return_process_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "source_purchase_receipt_item_id" UUID,
    "source_order_item_id" UUID,
    "product_name" TEXT NOT NULL,
    "product_sku" TEXT NOT NULL,
    "original_quantity" INTEGER NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "processed_quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_value" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "condition" "ReturnItemCondition" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "inspected_at" TIMESTAMP(3),
    "inspected_by_id" UUID,
    "replacement_product_id" UUID,
    "replacement_quantity" INTEGER NOT NULL DEFAULT 0,
    "replacement_unit_value" DECIMAL(12,2),
    "replacement_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_history" (
    "id" UUID NOT NULL,
    "return_process_id" UUID NOT NULL,
    "action" "ReturnHistoryAction" NOT NULL,
    "from_status" "ReturnStatus",
    "to_status" "ReturnStatus",
    "comment" TEXT,
    "metadata" JSONB,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_financial_adjustments" (
    "id" UUID NOT NULL,
    "return_process_id" UUID NOT NULL,
    "type" "ReturnFinancialAdjustmentType" NOT NULL,
    "status" "ReturnFinancialAdjustmentStatus" NOT NULL DEFAULT 'PLANNED',
    "amount" DECIMAL(14,2) NOT NULL,
    "payable_id" UUID,
    "receivable_id" UUID,
    "notes" TEXT,
    "settlement_reference" TEXT,
    "created_by_id" UUID NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "settled_at" TIMESTAMP(3),
    "settled_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_fiscal_links" (
    "id" UUID NOT NULL,
    "return_process_id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "role" "ReturnFiscalDocumentRole" NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_fiscal_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_attachments" (
    "id" UUID NOT NULL,
    "return_process_id" UUID NOT NULL,
    "type" "ReturnAttachmentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by_id" UUID NOT NULL,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_reasons_code_key" ON "return_reasons"("code");

-- CreateIndex
CREATE INDEX "return_reasons_active_name_idx" ON "return_reasons"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "return_processes_number_key" ON "return_processes"("number");

-- CreateIndex
CREATE INDEX "return_processes_type_status_created_at_idx" ON "return_processes"("type", "status", "created_at");

-- CreateIndex
CREATE INDEX "return_processes_purchase_order_id_idx" ON "return_processes"("purchase_order_id");

-- CreateIndex
CREATE INDEX "return_processes_purchase_receipt_id_idx" ON "return_processes"("purchase_receipt_id");

-- CreateIndex
CREATE INDEX "return_processes_order_id_idx" ON "return_processes"("order_id");

-- CreateIndex
CREATE INDEX "return_processes_supplier_id_created_at_idx" ON "return_processes"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "return_processes_client_id_created_at_idx" ON "return_processes"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "return_processes_reason_id_idx" ON "return_processes"("reason_id");

-- CreateIndex
CREATE INDEX "return_processes_created_at_idx" ON "return_processes"("created_at");

-- CreateIndex
CREATE INDEX "return_items_source_purchase_receipt_item_id_idx" ON "return_items"("source_purchase_receipt_item_id");

-- CreateIndex
CREATE INDEX "return_items_source_order_item_id_idx" ON "return_items"("source_order_item_id");

-- CreateIndex
CREATE INDEX "return_items_product_id_idx" ON "return_items"("product_id");

-- CreateIndex
CREATE INDEX "return_items_replacement_product_id_idx" ON "return_items"("replacement_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_return_process_id_product_id_key" ON "return_items"("return_process_id", "product_id");

-- CreateIndex
CREATE INDEX "return_history_return_process_id_created_at_idx" ON "return_history"("return_process_id", "created_at");

-- CreateIndex
CREATE INDEX "return_history_actor_id_created_at_idx" ON "return_history"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "return_financial_adjustments_return_process_id_status_idx" ON "return_financial_adjustments"("return_process_id", "status");

-- CreateIndex
CREATE INDEX "return_financial_adjustments_payable_id_idx" ON "return_financial_adjustments"("payable_id");

-- CreateIndex
CREATE INDEX "return_financial_adjustments_receivable_id_idx" ON "return_financial_adjustments"("receivable_id");

-- CreateIndex
CREATE INDEX "return_fiscal_links_fiscal_document_id_idx" ON "return_fiscal_links"("fiscal_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_fiscal_links_return_process_id_fiscal_document_id_ro_key" ON "return_fiscal_links"("return_process_id", "fiscal_document_id", "role");

-- CreateIndex
CREATE INDEX "return_attachments_return_process_id_active_idx" ON "return_attachments"("return_process_id", "active");

-- CreateIndex
CREATE INDEX "return_attachments_sha256_idx" ON "return_attachments"("sha256");

-- CreateIndex
CREATE INDEX "stock_movements_return_process_id_created_at_idx" ON "stock_movements"("return_process_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_return_item_id_created_at_idx" ON "stock_movements"("return_item_id", "created_at");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_return_item_id_fkey" FOREIGN KEY ("return_item_id") REFERENCES "return_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "return_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_source_purchase_receipt_item_id_fkey" FOREIGN KEY ("source_purchase_receipt_item_id") REFERENCES "purchase_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_source_order_item_id_fkey" FOREIGN KEY ("source_order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_inspected_by_id_fkey" FOREIGN KEY ("inspected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_replacement_product_id_fkey" FOREIGN KEY ("replacement_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_history" ADD CONSTRAINT "return_history_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_history" ADD CONSTRAINT "return_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_financial_adjustments_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_financial_adjustments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_financial_adjustments_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_financial_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_financial_adjustments_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_financial_adjustments_settled_by_id_fkey" FOREIGN KEY ("settled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_fiscal_links" ADD CONSTRAINT "return_fiscal_links_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_fiscal_links" ADD CONSTRAINT "return_fiscal_links_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_fiscal_links" ADD CONSTRAINT "return_fiscal_links_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_attachments" ADD CONSTRAINT "return_attachments_return_process_id_fkey" FOREIGN KEY ("return_process_id") REFERENCES "return_processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_attachments" ADD CONSTRAINT "return_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_attachments" ADD CONSTRAINT "return_attachments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants also enforced below the service layer.
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_origin_check" CHECK (
  ("type" = 'SUPPLIER_RETURN' AND "purchase_order_id" IS NOT NULL AND "purchase_receipt_id" IS NOT NULL AND "supplier_id" IS NOT NULL AND "order_id" IS NULL AND "client_id" IS NULL)
  OR
  ("type" IN ('CUSTOMER_RETURN', 'EXCHANGE') AND "order_id" IS NOT NULL AND "client_id" IS NOT NULL AND "purchase_order_id" IS NULL AND "purchase_receipt_id" IS NULL AND "supplier_id" IS NULL)
);
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_totals_check" CHECK (
  "returned_total" > 0 AND "replacement_total" >= 0
);
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_physical_date_check" CHECK (
  ("physical_status" = 'PENDING' AND "physical_confirmed_at" IS NULL)
  OR ("physical_status" = 'CONFIRMED' AND "physical_confirmed_at" IS NOT NULL)
);
ALTER TABLE "return_processes" ADD CONSTRAINT "return_processes_completion_date_check" CHECK (
  ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
  OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
);

ALTER TABLE "return_items" ADD CONSTRAINT "return_items_source_check" CHECK (
  ("source_purchase_receipt_item_id" IS NOT NULL) <> ("source_order_item_id" IS NOT NULL)
);
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_quantities_check" CHECK (
  "original_quantity" > 0 AND "requested_quantity" > 0 AND "requested_quantity" <= "original_quantity"
  AND "processed_quantity" >= 0 AND "processed_quantity" <= "requested_quantity"
);
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_values_check" CHECK (
  "unit_value" >= 0 AND "total" >= 0 AND "replacement_quantity" >= 0 AND "replacement_total" >= 0
  AND (("replacement_quantity" = 0 AND "replacement_product_id" IS NULL AND "replacement_unit_value" IS NULL AND "replacement_total" = 0)
    OR ("replacement_quantity" > 0 AND "replacement_product_id" IS NOT NULL AND "replacement_unit_value" IS NOT NULL AND "replacement_unit_value" >= 0))
);

ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_adjustments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_adjustments_title_check" CHECK (NOT ("payable_id" IS NOT NULL AND "receivable_id" IS NOT NULL));
ALTER TABLE "return_financial_adjustments" ADD CONSTRAINT "return_adjustments_status_dates_check" CHECK (
  ("status" = 'PLANNED' AND "approved_at" IS NULL AND "settled_at" IS NULL)
  OR ("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "settled_at" IS NULL)
  OR ("status" = 'SETTLED' AND "approved_at" IS NOT NULL AND "settled_at" IS NOT NULL AND "settlement_reference" IS NOT NULL)
  OR ("status" = 'CANCELLED' AND "settled_at" IS NULL)
);

ALTER TABLE "return_attachments" ADD CONSTRAINT "return_attachments_size_check" CHECK ("size" > 0);
ALTER TABLE "return_attachments" ADD CONSTRAINT "return_attachments_removal_check" CHECK (
  ("active" = true AND "removed_at" IS NULL AND "removed_by_id" IS NULL)
  OR ("active" = false AND "removed_at" IS NOT NULL AND "removed_by_id" IS NOT NULL)
);

-- Initial configurable reasons. Administrators can deactivate or extend this catalogue.
INSERT INTO "return_reasons" ("id", "code", "name", "applies_to", "requires_justification", "updated_at") VALUES
  (gen_random_uuid(), 'DEFECTIVE', 'Produto com defeito', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN','EXCHANGE']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'DAMAGED', 'Produto avariado', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN','EXCHANGE']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'INCORRECT_PRODUCT', 'Produto incorreto', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN','EXCHANGE']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'QUANTITY_DIVERGENCE', 'Divergência de quantidade', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'COMMERCIAL_DISAGREEMENT', 'Desacordo comercial', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PURCHASE_WITHDRAWAL', 'Desistência da compra', ARRAY['CUSTOMER_RETURN']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OUT_OF_SPECIFICATION', 'Produto fora da especificação', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN','EXCHANGE']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MODEL_OR_SIZE_EXCHANGE', 'Troca de modelo ou tamanho', ARRAY['EXCHANGE']::"ReturnType"[], false, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'OTHER', 'Outros', ARRAY['CUSTOMER_RETURN','SUPPLIER_RETURN','EXCHANGE']::"ReturnType"[], true, CURRENT_TIMESTAMP);
