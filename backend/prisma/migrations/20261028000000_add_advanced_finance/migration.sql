-- CreateEnum
CREATE TYPE "FinancialTitleType" AS ENUM ('PAYABLE', 'RECEIVABLE');

-- CreateEnum
CREATE TYPE "FinancialTitleOrigin" AS ENUM ('MANUAL', 'PURCHASE', 'SALE', 'RETURN', 'RECURRENCE', 'FISCAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ChartAccountKind" AS ENUM ('SYNTHETIC', 'ANALYTICAL');

-- CreateEnum
CREATE TYPE "ChartAccountNature" AS ENUM ('REVENUE', 'DEDUCTION', 'COST', 'EXPENSE', 'FINANCIAL_REVENUE', 'FINANCIAL_EXPENSE', 'INCOME_TAX', 'ASSET', 'LIABILITY', 'EQUITY', 'NONE');

-- CreateEnum
CREATE TYPE "FinancialRecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "FinancialRecurrenceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinancialRecurrenceOccurrenceStatus" AS ENUM ('PENDING', 'GENERATED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FinancialAdjustmentKind" AS ENUM ('INTEREST', 'PENALTY', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "FinancialCalculationType" AS ENUM ('FIXED', 'SIMPLE_PERCENTAGE');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'PAYMENT', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "BankMovementNature" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "BankMovementType" AS ENUM ('SETTLEMENT', 'TRANSFER', 'FEE', 'INTEREST', 'ADJUSTMENT', 'INITIAL_BALANCE');

-- CreateEnum
CREATE TYPE "BankStatementImportStatus" AS ENUM ('PREVIEWED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BankTransactionReconciliationStatus" AS ENUM ('PENDING', 'SUGGESTED', 'RECONCILED', 'DIVERGENT', 'IGNORED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SUSPEND';
ALTER TYPE "AuditAction" ADD VALUE 'REACTIVATE';
ALTER TYPE "AuditAction" ADD VALUE 'CLOSE';
ALTER TYPE "AuditAction" ADD VALUE 'GENERATE';
ALTER TYPE "AuditAction" ADD VALUE 'RECONCILE';
ALTER TYPE "AuditAction" ADD VALUE 'RECONCILIATION_REVERSAL';
ALTER TYPE "AuditAction" ADD VALUE 'TRANSFER';
ALTER TYPE "AuditAction" ADD VALUE 'ADJUST';
ALTER TYPE "AuditAction" ADD VALUE 'SNAPSHOT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntity" ADD VALUE 'COST_CENTER';
ALTER TYPE "AuditEntity" ADD VALUE 'CHART_ACCOUNT';
ALTER TYPE "AuditEntity" ADD VALUE 'FINANCIAL_TITLE';
ALTER TYPE "AuditEntity" ADD VALUE 'FINANCIAL_RECURRENCE';
ALTER TYPE "AuditEntity" ADD VALUE 'BANK_ACCOUNT';
ALTER TYPE "AuditEntity" ADD VALUE 'BANK_STATEMENT_IMPORT';
ALTER TYPE "AuditEntity" ADD VALUE 'BANK_RECONCILIATION';
ALTER TYPE "AuditEntity" ADD VALUE 'FINANCIAL_SNAPSHOT';

-- AlterEnum
ALTER TYPE "PayableStatus" ADD VALUE 'DRAFT';

-- AlterEnum
ALTER TYPE "ReceivableStatus" ADD VALUE 'DRAFT';

-- AlterTable
ALTER TABLE "payable_payments" ADD COLUMN     "bank_account_id" UUID,
ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "payables" ADD COLUMN     "chart_account_id" UUID,
ADD COLUMN     "competence_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "counterparty_name" TEXT,
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT 'Conta a pagar',
ADD COLUMN     "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interest_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "issue_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "origin" "FinancialTitleOrigin" NOT NULL DEFAULT 'PURCHASE',
ADD COLUMN     "penalty_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "planned_bank_account_id" UUID,
ADD COLUMN     "planned_method" "PaymentMethod",
ADD COLUMN     "recurrence_occurrence_id" UUID,
ALTER COLUMN "supplier_id" DROP NOT NULL,
ALTER COLUMN "purchase_order_id" DROP NOT NULL,
ALTER COLUMN "purchase_receipt_id" DROP NOT NULL,
ALTER COLUMN "installment_number" SET DEFAULT 1,
ALTER COLUMN "installment_count" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "receivable_collections" ADD COLUMN     "bank_account_id" UUID,
ADD COLUMN     "idempotency_key" TEXT;

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "chart_account_id" UUID,
ADD COLUMN     "competence_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "counterparty_name" TEXT,
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT 'Conta a receber',
ADD COLUMN     "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interest_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "issue_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "origin" "FinancialTitleOrigin" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "penalty_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "planned_bank_account_id" UUID,
ADD COLUMN     "planned_method" "PaymentMethod",
ADD COLUMN     "recurrence_occurrence_id" UUID,
ALTER COLUMN "client_id" DROP NOT NULL,
ALTER COLUMN "order_id" DROP NOT NULL,
ALTER COLUMN "installment_number" SET DEFAULT 1,
ALTER COLUMN "installment_count" SET DEFAULT 1;

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parent_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_accounts" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ChartAccountKind" NOT NULL,
    "nature" "ChartAccountNature" NOT NULL DEFAULT 'NONE',
    "parent_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_allocations" (
    "id" UUID NOT NULL,
    "payable_id" UUID,
    "receivable_id" UUID,
    "cost_center_id" UUID NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" UUID NOT NULL,
    "payable_id" UUID,
    "receivable_id" UUID,
    "kind" "FinancialAdjustmentKind" NOT NULL,
    "calculation_type" "FinancialCalculationType" NOT NULL,
    "rate" DECIMAL(9,6),
    "base_amount" DECIMAL(14,2) NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "calculated_amount" DECIMAL(14,2) NOT NULL,
    "applied_amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "calculation_memory" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_recurrences" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "type" "FinancialTitleType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "chart_account_id" UUID NOT NULL,
    "cost_center_id" UUID NOT NULL,
    "supplier_id" UUID,
    "client_id" UUID,
    "counterparty_name" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "frequency" "FinancialRecurrenceFrequency" NOT NULL,
    "due_day" INTEGER,
    "max_occurrences" INTEGER,
    "generated_occurrences" INTEGER NOT NULL DEFAULT 0,
    "status" "FinancialRecurrenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "next_occurrence" DATE NOT NULL,
    "planned_method" "PaymentMethod",
    "planned_bank_account_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_recurrence_occurrences" (
    "id" UUID NOT NULL,
    "recurrence_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "FinancialRecurrenceOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "generated_at" TIMESTAMP(3),
    "generated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_recurrence_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "agency" TEXT,
    "account_number" TEXT,
    "type" "BankAccountType" NOT NULL,
    "holder" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "initial_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "initial_balance_date" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_movements" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "nature" "BankMovementNature" NOT NULL,
    "type" "BankMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "external_reference" TEXT,
    "transfer_group_id" UUID,
    "payable_payment_id" UUID,
    "receivable_collection_id" UUID,
    "created_by_id" UUID NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "format" VARCHAR(8) NOT NULL,
    "status" "BankStatementImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "period_start" DATE,
    "period_end" DATE,
    "preview" JSONB NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "statement_import_id" UUID NOT NULL,
    "transaction_date" DATE NOT NULL,
    "processed_at" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "bank_identifier" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "nature" "BankMovementNature" NOT NULL,
    "reference" TEXT,
    "fingerprint" TEXT NOT NULL,
    "reconciliation_status" "BankTransactionReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "ignored_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" UUID NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliation_links" (
    "id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "bank_movement_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliation_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_attachments" (
    "id" UUID NOT NULL,
    "payable_id" UUID,
    "receivable_id" UUID,
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

    CONSTRAINT "financial_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_forecast_snapshots" (
    "id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "filters" JSONB,
    "data" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE INDEX "cost_centers_parent_id_active_idx" ON "cost_centers"("parent_id", "active");

-- CreateIndex
CREATE INDEX "cost_centers_name_idx" ON "cost_centers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "chart_accounts_code_key" ON "chart_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_accounts_parent_id_active_idx" ON "chart_accounts"("parent_id", "active");

-- CreateIndex
CREATE INDEX "chart_accounts_nature_active_idx" ON "chart_accounts"("nature", "active");

-- CreateIndex
CREATE INDEX "chart_accounts_name_idx" ON "chart_accounts"("name");

-- CreateIndex
CREATE INDEX "financial_allocations_cost_center_id_idx" ON "financial_allocations"("cost_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_allocations_payable_id_cost_center_id_key" ON "financial_allocations"("payable_id", "cost_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_allocations_receivable_id_cost_center_id_key" ON "financial_allocations"("receivable_id", "cost_center_id");

-- CreateIndex
CREATE INDEX "financial_adjustments_payable_id_created_at_idx" ON "financial_adjustments"("payable_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_receivable_id_created_at_idx" ON "financial_adjustments"("receivable_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_kind_created_at_idx" ON "financial_adjustments"("kind", "created_at");

-- CreateIndex
CREATE INDEX "financial_recurrences_status_next_occurrence_idx" ON "financial_recurrences"("status", "next_occurrence");

-- CreateIndex
CREATE INDEX "financial_recurrences_chart_account_id_idx" ON "financial_recurrences"("chart_account_id");

-- CreateIndex
CREATE INDEX "financial_recurrences_cost_center_id_idx" ON "financial_recurrences"("cost_center_id");

-- CreateIndex
CREATE INDEX "financial_recurrence_occurrences_status_due_date_idx" ON "financial_recurrence_occurrences"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "financial_recurrence_occurrences_recurrence_id_sequence_key" ON "financial_recurrence_occurrences"("recurrence_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "financial_recurrence_occurrences_recurrence_id_due_date_key" ON "financial_recurrence_occurrences"("recurrence_id", "due_date");

-- CreateIndex
CREATE INDEX "bank_accounts_active_name_idx" ON "bank_accounts"("active", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_movements_number_key" ON "bank_movements"("number");

-- CreateIndex
CREATE UNIQUE INDEX "bank_movements_payable_payment_id_key" ON "bank_movements"("payable_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_movements_receivable_collection_id_key" ON "bank_movements"("receivable_collection_id");

-- CreateIndex
CREATE INDEX "bank_movements_bank_account_id_posted_at_idx" ON "bank_movements"("bank_account_id", "posted_at");

-- CreateIndex
CREATE INDEX "bank_movements_type_posted_at_idx" ON "bank_movements"("type", "posted_at");

-- CreateIndex
CREATE INDEX "bank_movements_transfer_group_id_idx" ON "bank_movements"("transfer_group_id");

-- CreateIndex
CREATE INDEX "bank_statement_imports_bank_account_id_created_at_idx" ON "bank_statement_imports"("bank_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_imports_bank_account_id_sha256_key" ON "bank_statement_imports"("bank_account_id", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_fingerprint_key" ON "bank_transactions"("fingerprint");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_transaction_date_idx" ON "bank_transactions"("bank_account_id", "transaction_date");

-- CreateIndex
CREATE INDEX "bank_transactions_reconciliation_status_transaction_date_idx" ON "bank_transactions"("reconciliation_status", "transaction_date");

-- CreateIndex
CREATE INDEX "bank_reconciliations_created_at_idx" ON "bank_reconciliations"("created_at");

-- CreateIndex
CREATE INDEX "bank_reconciliation_links_bank_transaction_id_idx" ON "bank_reconciliation_links"("bank_transaction_id");

-- CreateIndex
CREATE INDEX "bank_reconciliation_links_bank_movement_id_idx" ON "bank_reconciliation_links"("bank_movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconciliation_links_reconciliation_id_bank_transactio_key" ON "bank_reconciliation_links"("reconciliation_id", "bank_transaction_id", "bank_movement_id");

-- CreateIndex
CREATE INDEX "financial_attachments_payable_id_active_idx" ON "financial_attachments"("payable_id", "active");

-- CreateIndex
CREATE INDEX "financial_attachments_receivable_id_active_idx" ON "financial_attachments"("receivable_id", "active");

-- CreateIndex
CREATE INDEX "financial_attachments_sha256_idx" ON "financial_attachments"("sha256");

-- CreateIndex
CREATE INDEX "financial_forecast_snapshots_snapshot_date_period_start_per_idx" ON "financial_forecast_snapshots"("snapshot_date", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "payable_payments_idempotency_key_key" ON "payable_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payable_payments_bank_account_id_paid_at_idx" ON "payable_payments"("bank_account_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "payables_recurrence_occurrence_id_key" ON "payables"("recurrence_occurrence_id");

-- CreateIndex
CREATE INDEX "payables_chart_account_id_competence_date_idx" ON "payables"("chart_account_id", "competence_date");

-- CreateIndex
CREATE INDEX "payables_origin_created_at_idx" ON "payables"("origin", "created_at");

-- CreateIndex
CREATE INDEX "payables_planned_bank_account_id_due_date_idx" ON "payables"("planned_bank_account_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_collections_idempotency_key_key" ON "receivable_collections"("idempotency_key");

-- CreateIndex
CREATE INDEX "receivable_collections_bank_account_id_received_at_idx" ON "receivable_collections"("bank_account_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "receivables_recurrence_occurrence_id_key" ON "receivables"("recurrence_occurrence_id");

-- CreateIndex
CREATE INDEX "receivables_chart_account_id_competence_date_idx" ON "receivables"("chart_account_id", "competence_date");

-- CreateIndex
CREATE INDEX "receivables_origin_created_at_idx" ON "receivables"("origin", "created_at");

-- CreateIndex
CREATE INDEX "receivables_planned_bank_account_id_due_date_idx" ON "receivables"("planned_bank_account_id", "due_date");

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_planned_bank_account_id_fkey" FOREIGN KEY ("planned_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_recurrence_occurrence_id_fkey" FOREIGN KEY ("recurrence_occurrence_id") REFERENCES "financial_recurrence_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_collections" ADD CONSTRAINT "receivable_collections_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_planned_bank_account_id_fkey" FOREIGN KEY ("planned_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_recurrence_occurrence_id_fkey" FOREIGN KEY ("recurrence_occurrence_id") REFERENCES "financial_recurrence_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_accounts" ADD CONSTRAINT "chart_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_allocations" ADD CONSTRAINT "financial_allocations_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_allocations" ADD CONSTRAINT "financial_allocations_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_allocations" ADD CONSTRAINT "financial_allocations_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_chart_account_id_fkey" FOREIGN KEY ("chart_account_id") REFERENCES "chart_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_planned_bank_account_id_fkey" FOREIGN KEY ("planned_bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrence_occurrences" ADD CONSTRAINT "financial_recurrence_occurrences_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "financial_recurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_recurrence_occurrences" ADD CONSTRAINT "financial_recurrence_occurrences_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_payable_payment_id_fkey" FOREIGN KEY ("payable_payment_id") REFERENCES "payable_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_receivable_collection_id_fkey" FOREIGN KEY ("receivable_collection_id") REFERENCES "receivable_collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statement_import_id_fkey" FOREIGN KEY ("statement_import_id") REFERENCES "bank_statement_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_links" ADD CONSTRAINT "bank_reconciliation_links_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "bank_reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_links" ADD CONSTRAINT "bank_reconciliation_links_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliation_links" ADD CONSTRAINT "bank_reconciliation_links_bank_movement_id_fkey" FOREIGN KEY ("bank_movement_id") REFERENCES "bank_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_forecast_snapshots" ADD CONSTRAINT "financial_forecast_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain sequences
CREATE SEQUENCE "bank_movement_number_seq" START 1;

-- Financial integrity constraints
ALTER TABLE "payables" ADD CONSTRAINT "payables_adjusted_amount_check"
  CHECK ("original_amount" > 0 AND "interest_amount" >= 0 AND "penalty_amount" >= 0 AND "discount_amount" >= 0
    AND "discount_amount" <= "original_amount" + "interest_amount" + "penalty_amount"
    AND "paid_amount" >= 0 AND "paid_amount" <= "original_amount" + "interest_amount" + "penalty_amount" - "discount_amount");

ALTER TABLE "receivables" ADD CONSTRAINT "receivables_adjusted_amount_check"
  CHECK ("original_amount" > 0 AND "interest_amount" >= 0 AND "penalty_amount" >= 0 AND "discount_amount" >= 0
    AND "discount_amount" <= "original_amount" + "interest_amount" + "penalty_amount"
    AND "received_amount" >= 0 AND "received_amount" <= "original_amount" + "interest_amount" + "penalty_amount" - "discount_amount");

ALTER TABLE "financial_allocations" ADD CONSTRAINT "financial_allocations_single_title_check"
  CHECK (num_nonnulls("payable_id", "receivable_id") = 1);
ALTER TABLE "financial_allocations" ADD CONSTRAINT "financial_allocations_values_check"
  CHECK ("amount" > 0 AND "percentage" > 0 AND "percentage" <= 100);

ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_single_title_check"
  CHECK (num_nonnulls("payable_id", "receivable_id") = 1);
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_values_check"
  CHECK ("base_amount" > 0 AND "calculated_amount" >= 0 AND "applied_amount" > 0);

ALTER TABLE "financial_attachments" ADD CONSTRAINT "financial_attachments_single_title_check"
  CHECK (num_nonnulls("payable_id", "receivable_id") = 1);

ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_values_check"
  CHECK ("amount" > 0 AND ("due_day" IS NULL OR "due_day" BETWEEN 1 AND 31)
    AND ("max_occurrences" IS NULL OR "max_occurrences" > 0));
ALTER TABLE "financial_recurrences" ADD CONSTRAINT "financial_recurrences_party_check"
  CHECK (("type" = 'PAYABLE' AND "client_id" IS NULL) OR ("type" = 'RECEIVABLE' AND "supplier_id" IS NULL));

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_currency_check"
  CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_amount_check" CHECK ("amount" > 0);
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_single_settlement_check"
  CHECK (num_nonnulls("payable_payment_id", "receivable_collection_id") <= 1);
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_amount_check" CHECK ("amount" > 0);
ALTER TABLE "bank_reconciliation_links" ADD CONSTRAINT "bank_reconciliation_links_amount_check" CHECK ("amount" > 0);
