ALTER TYPE "AuditEntity" ADD VALUE 'PAYABLE';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_REVERSAL';

CREATE TYPE "PayableStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'BANK_TRANSFER', 'BOLETO', 'CASH', 'CARD', 'OTHER');

ALTER TABLE "purchase_orders"
  ADD COLUMN "payment_installments" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "first_payment_due_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "payment_interval_days" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_payment_installments_check" CHECK ("payment_installments" BETWEEN 1 AND 24),
  ADD CONSTRAINT "purchase_orders_first_payment_due_days_check" CHECK ("first_payment_due_days" BETWEEN 0 AND 3650),
  ADD CONSTRAINT "purchase_orders_payment_interval_days_check" CHECK ("payment_interval_days" BETWEEN 1 AND 365);

ALTER TABLE "purchase_receipts" ADD COLUMN "total" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "purchase_receipts" AS receipt
SET "total" = COALESCE((
  SELECT SUM(item."subtotal")
  FROM "purchase_receipt_items" AS item
  WHERE item."receipt_id" = receipt."id"
), 0);

CREATE SEQUENCE "payable_number_seq" START 1;
CREATE SEQUENCE "payable_payment_number_seq" START 1;

CREATE TABLE "payables" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "supplier_id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "purchase_receipt_id" UUID NOT NULL,
  "installment_number" INTEGER NOT NULL,
  "installment_count" INTEGER NOT NULL,
  "original_amount" DECIMAL(14,2) NOT NULL,
  "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "due_date" DATE NOT NULL,
  "status" "PayableStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payables_installment_number_check" CHECK ("installment_number" >= 1 AND "installment_number" <= "installment_count"),
  CONSTRAINT "payables_installment_count_check" CHECK ("installment_count" BETWEEN 1 AND 24),
  CONSTRAINT "payables_original_amount_check" CHECK ("original_amount" > 0),
  CONSTRAINT "payables_paid_amount_check" CHECK ("paid_amount" >= 0 AND "paid_amount" <= "original_amount")
);

CREATE TABLE "payable_payments" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "payable_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "created_by_id" UUID NOT NULL,
  "reversed_at" TIMESTAMP(3),
  "reversed_by_id" UUID,
  "reversal_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payable_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payable_payments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payable_payments_reversal_check" CHECK (
    ("reversed_at" IS NULL AND "reversed_by_id" IS NULL AND "reversal_reason" IS NULL)
    OR ("reversed_at" IS NOT NULL AND "reversed_by_id" IS NOT NULL AND "reversal_reason" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "payables_number_key" ON "payables"("number");
CREATE UNIQUE INDEX "payables_purchase_receipt_id_installment_number_key" ON "payables"("purchase_receipt_id", "installment_number");
CREATE INDEX "payables_supplier_id_due_date_idx" ON "payables"("supplier_id", "due_date");
CREATE INDEX "payables_purchase_order_id_idx" ON "payables"("purchase_order_id");
CREATE INDEX "payables_purchase_receipt_id_idx" ON "payables"("purchase_receipt_id");
CREATE INDEX "payables_status_due_date_idx" ON "payables"("status", "due_date");
CREATE INDEX "payables_due_date_idx" ON "payables"("due_date");

CREATE UNIQUE INDEX "payable_payments_number_key" ON "payable_payments"("number");
CREATE INDEX "payable_payments_payable_id_paid_at_idx" ON "payable_payments"("payable_id", "paid_at");
CREATE INDEX "payable_payments_created_by_id_paid_at_idx" ON "payable_payments"("created_by_id", "paid_at");
CREATE INDEX "payable_payments_reversed_by_id_idx" ON "payable_payments"("reversed_by_id");
CREATE INDEX "payable_payments_paid_at_idx" ON "payable_payments"("paid_at");

ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables" ADD CONSTRAINT "payables_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
