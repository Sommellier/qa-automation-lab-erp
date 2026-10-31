-- CreateEnum
CREATE TYPE "FiscalOperation" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('UNKNOWN', 'AUTHORIZED', 'CANCELLED', 'DENIED', 'VOIDED');

-- CreateEnum
CREATE TYPE "FiscalProcessingStatus" AS ENUM ('PENDING_LINKS', 'LINKED');

-- CreateEnum
CREATE TYPE "FiscalImportStatus" AS ENUM ('PREVIEWED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FiscalImportFileStatus" AS ENUM ('VALID', 'INVALID', 'DUPLICATE', 'IMPORTED');

-- CreateEnum
CREATE TYPE "FiscalAttachmentType" AS ENUM ('ORIGINAL_XML', 'DANFE_PDF', 'RECEIPT', 'AUXILIARY', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LINK';
ALTER TYPE "AuditAction" ADD VALUE 'ATTACH';
ALTER TYPE "AuditAction" ADD VALUE 'REMOVE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEntity" ADD VALUE 'FISCAL_COMPANY';
ALTER TYPE "AuditEntity" ADD VALUE 'FISCAL_IMPORT';
ALTER TYPE "AuditEntity" ADD VALUE 'FISCAL_DOCUMENT';
ALTER TYPE "AuditEntity" ADD VALUE 'FISCAL_ATTACHMENT';

-- CreateTable
CREATE TABLE "fiscal_companies" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_companies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_companies_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{11}([0-9]{3})?$')
);

-- CreateTable
CREATE TABLE "fiscal_import_batches" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "status" "FiscalImportStatus" NOT NULL DEFAULT 'PREVIEWED',
    "total_files" INTEGER NOT NULL,
    "valid_files" INTEGER NOT NULL,
    "invalid_files" INTEGER NOT NULL,
    "imported_files" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_import_batches_counts_check" CHECK ("total_files" > 0 AND "valid_files" >= 0 AND "invalid_files" >= 0 AND "imported_files" >= 0 AND "valid_files" + "invalid_files" = "total_files" AND "imported_files" <= "valid_files")
);

-- CreateTable
CREATE TABLE "fiscal_import_files" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "raw_content" BYTEA NOT NULL,
    "status" "FiscalImportFileStatus" NOT NULL,
    "access_key" TEXT,
    "parsed_data" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "duplicate_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_import_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_import_files_size_check" CHECK ("size" > 0)
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "operation" "FiscalOperation" NOT NULL,
    "model" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "access_key" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "movement_date" TIMESTAMP(3),
    "issuer_name" TEXT NOT NULL,
    "issuer_document" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_document" TEXT NOT NULL,
    "products_total" DECIMAL(14,2) NOT NULL,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "freight_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_expenses_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "tax_totals" JSONB,
    "declared_fiscal_status" TEXT,
    "fiscal_status" "FiscalDocumentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "processing_status" "FiscalProcessingStatus" NOT NULL DEFAULT 'PENDING_LINKS',
    "supplier_id" UUID,
    "client_id" UUID,
    "purchase_order_id" UUID,
    "order_id" UUID,
    "import_file_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_documents_access_key_check" CHECK ("access_key" ~ '^[0-9]{44}$'),
    CONSTRAINT "fiscal_documents_totals_check" CHECK ("products_total" >= 0 AND "discount_total" >= 0 AND "freight_total" >= 0 AND "other_expenses_total" >= 0 AND "total" >= 0),
    CONSTRAINT "fiscal_documents_operation_links_check" CHECK (("operation" = 'INBOUND' AND "client_id" IS NULL AND "order_id" IS NULL) OR ("operation" = 'OUTBOUND' AND "supplier_id" IS NULL AND "purchase_order_id" IS NULL))
);

-- CreateTable
CREATE TABLE "fiscal_document_items" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "fiscal_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ncm" TEXT,
    "cfop" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_value" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "taxes" JSONB,
    "product_id" UUID,

    CONSTRAINT "fiscal_document_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_document_items_values_check" CHECK ("line_number" > 0 AND "quantity" > 0 AND "unit_value" >= 0 AND "total" >= 0)
);

-- CreateTable
CREATE TABLE "fiscal_attachments" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "type" "FiscalAttachmentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA,
    "import_file_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by_id" UUID NOT NULL,
    "removed_at" TIMESTAMP(3),
    "removed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_attachments_content_check" CHECK ((("content" IS NOT NULL)::int + ("import_file_id" IS NOT NULL)::int) = 1),
    CONSTRAINT "fiscal_attachments_size_check" CHECK ("size" > 0),
    CONSTRAINT "fiscal_attachments_removal_check" CHECK (("removed_at" IS NULL) = ("removed_by_id" IS NULL))
);

-- CreateTable
CREATE TABLE "fiscal_payable_links" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "payable_id" UUID NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_payable_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_receivable_links" (
    "id" UUID NOT NULL,
    "fiscal_document_id" UUID NOT NULL,
    "receivable_id" UUID NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_receivable_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_companies_tax_id_key" ON "fiscal_companies"("tax_id");

-- CreateIndex
CREATE INDEX "fiscal_companies_active_idx" ON "fiscal_companies"("active");

-- CreateIndex
CREATE INDEX "fiscal_import_batches_created_by_id_created_at_idx" ON "fiscal_import_batches"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_import_batches_status_created_at_idx" ON "fiscal_import_batches"("status", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_import_files_batch_id_status_idx" ON "fiscal_import_files"("batch_id", "status");

-- CreateIndex
CREATE INDEX "fiscal_import_files_access_key_idx" ON "fiscal_import_files"("access_key");

-- CreateIndex
CREATE INDEX "fiscal_import_files_sha256_idx" ON "fiscal_import_files"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_import_file_id_key" ON "fiscal_documents"("import_file_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_operation_issue_date_idx" ON "fiscal_documents"("operation", "issue_date");

-- CreateIndex
CREATE INDEX "fiscal_documents_fiscal_status_issue_date_idx" ON "fiscal_documents"("fiscal_status", "issue_date");

-- CreateIndex
CREATE INDEX "fiscal_documents_processing_status_created_at_idx" ON "fiscal_documents"("processing_status", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_documents_supplier_id_issue_date_idx" ON "fiscal_documents"("supplier_id", "issue_date");

-- CreateIndex
CREATE INDEX "fiscal_documents_client_id_issue_date_idx" ON "fiscal_documents"("client_id", "issue_date");

-- CreateIndex
CREATE INDEX "fiscal_documents_purchase_order_id_idx" ON "fiscal_documents"("purchase_order_id");

-- CreateIndex
CREATE INDEX "fiscal_documents_order_id_idx" ON "fiscal_documents"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_company_id_access_key_key" ON "fiscal_documents"("company_id", "access_key");

-- CreateIndex
CREATE INDEX "fiscal_document_items_product_id_idx" ON "fiscal_document_items"("product_id");

-- CreateIndex
CREATE INDEX "fiscal_document_items_fiscal_code_idx" ON "fiscal_document_items"("fiscal_code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_document_items_fiscal_document_id_line_number_key" ON "fiscal_document_items"("fiscal_document_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_attachments_import_file_id_key" ON "fiscal_attachments"("import_file_id");

-- CreateIndex
CREATE INDEX "fiscal_attachments_fiscal_document_id_active_idx" ON "fiscal_attachments"("fiscal_document_id", "active");

-- CreateIndex
CREATE INDEX "fiscal_attachments_sha256_idx" ON "fiscal_attachments"("sha256");

-- CreateIndex
CREATE INDEX "fiscal_payable_links_payable_id_idx" ON "fiscal_payable_links"("payable_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_payable_links_fiscal_document_id_payable_id_key" ON "fiscal_payable_links"("fiscal_document_id", "payable_id");

-- CreateIndex
CREATE INDEX "fiscal_receivable_links_receivable_id_idx" ON "fiscal_receivable_links"("receivable_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_receivable_links_fiscal_document_id_receivable_id_key" ON "fiscal_receivable_links"("fiscal_document_id", "receivable_id");

-- AddForeignKey
ALTER TABLE "fiscal_companies" ADD CONSTRAINT "fiscal_companies_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_import_batches" ADD CONSTRAINT "fiscal_import_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "fiscal_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_import_batches" ADD CONSTRAINT "fiscal_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_import_files" ADD CONSTRAINT "fiscal_import_files_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "fiscal_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_import_files" ADD CONSTRAINT "fiscal_import_files_duplicate_document_id_fkey" FOREIGN KEY ("duplicate_document_id") REFERENCES "fiscal_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "fiscal_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "fiscal_import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_attachments" ADD CONSTRAINT "fiscal_attachments_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_attachments" ADD CONSTRAINT "fiscal_attachments_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "fiscal_import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_attachments" ADD CONSTRAINT "fiscal_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_attachments" ADD CONSTRAINT "fiscal_attachments_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_payable_links" ADD CONSTRAINT "fiscal_payable_links_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_payable_links" ADD CONSTRAINT "fiscal_payable_links_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_payable_links" ADD CONSTRAINT "fiscal_payable_links_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receivable_links" ADD CONSTRAINT "fiscal_receivable_links_fiscal_document_id_fkey" FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receivable_links" ADD CONSTRAINT "fiscal_receivable_links_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_receivable_links" ADD CONSTRAINT "fiscal_receivable_links_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
