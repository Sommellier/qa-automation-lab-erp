ALTER TYPE "AuditEntity" ADD VALUE 'RECEIVABLE';
ALTER TYPE "AuditAction" ADD VALUE 'COLLECTION';
ALTER TYPE "AuditAction" ADD VALUE 'COLLECTION_REVERSAL';

CREATE TYPE "ReceivableStatus" AS ENUM ('PENDING', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

ALTER TABLE "orders"
  ADD COLUMN "payment_installments" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "first_payment_due_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "payment_interval_days" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_installments_check" CHECK ("payment_installments" BETWEEN 1 AND 24),
  ADD CONSTRAINT "orders_first_payment_due_days_check" CHECK ("first_payment_due_days" BETWEEN 0 AND 3650),
  ADD CONSTRAINT "orders_payment_interval_days_check" CHECK ("payment_interval_days" BETWEEN 1 AND 365);

CREATE SEQUENCE "receivable_number_seq" START 1;
CREATE SEQUENCE "receivable_collection_number_seq" START 1;

CREATE TABLE "receivables" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "client_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "installment_number" INTEGER NOT NULL,
  "installment_count" INTEGER NOT NULL,
  "original_amount" DECIMAL(14,2) NOT NULL,
  "received_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "due_date" DATE NOT NULL,
  "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receivables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receivables_installment_number_check" CHECK ("installment_number" >= 1 AND "installment_number" <= "installment_count"),
  CONSTRAINT "receivables_installment_count_check" CHECK ("installment_count" BETWEEN 1 AND 24),
  CONSTRAINT "receivables_original_amount_check" CHECK ("original_amount" > 0),
  CONSTRAINT "receivables_received_amount_check" CHECK ("received_amount" >= 0 AND "received_amount" <= "original_amount")
);

CREATE TABLE "receivable_collections" (
  "id" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "receivable_id" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "created_by_id" UUID NOT NULL,
  "reversed_at" TIMESTAMP(3),
  "reversed_by_id" UUID,
  "reversal_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivable_collections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receivable_collections_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "receivable_collections_reversal_check" CHECK (
    ("reversed_at" IS NULL AND "reversed_by_id" IS NULL AND "reversal_reason" IS NULL)
    OR ("reversed_at" IS NOT NULL AND "reversed_by_id" IS NOT NULL AND "reversal_reason" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "receivables_number_key" ON "receivables"("number");
CREATE UNIQUE INDEX "receivables_order_id_installment_number_key" ON "receivables"("order_id", "installment_number");
CREATE INDEX "receivables_client_id_due_date_idx" ON "receivables"("client_id", "due_date");
CREATE INDEX "receivables_order_id_idx" ON "receivables"("order_id");
CREATE INDEX "receivables_status_due_date_idx" ON "receivables"("status", "due_date");
CREATE INDEX "receivables_due_date_idx" ON "receivables"("due_date");
CREATE UNIQUE INDEX "receivable_collections_number_key" ON "receivable_collections"("number");
CREATE INDEX "receivable_collections_receivable_id_received_at_idx" ON "receivable_collections"("receivable_id", "received_at");
CREATE INDEX "receivable_collections_created_by_id_received_at_idx" ON "receivable_collections"("created_by_id", "received_at");
CREATE INDEX "receivable_collections_reversed_by_id_idx" ON "receivable_collections"("reversed_by_id");
CREATE INDEX "receivable_collections_received_at_idx" ON "receivable_collections"("received_at");

ALTER TABLE "receivables" ADD CONSTRAINT "receivables_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_collections" ADD CONSTRAINT "receivable_collections_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_collections" ADD CONSTRAINT "receivable_collections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_collections" ADD CONSTRAINT "receivable_collections_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "receivables" (
  "id", "number", "client_id", "order_id", "installment_number", "installment_count",
  "original_amount", "received_amount", "due_date", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'CR-' || LPAD(nextval('receivable_number_seq')::text, 6, '0'),
  "client_id", "id", 1, 1, "total", 0,
  ("updated_at" AT TIME ZONE 'UTC')::date + 30,
  'PENDING'::"ReceivableStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "orders"
WHERE "status" = 'COMPLETED';
