ALTER TYPE "AuditEntity" ADD VALUE 'IMPORT';
ALTER TYPE "AuditAction" ADD VALUE 'IMPORT';

CREATE TYPE "ImportType" AS ENUM ('CLIENTS', 'PRODUCTS');
CREATE TYPE "ImportStatus" AS ENUM ('VALIDATED', 'COMPLETED', 'FAILED');

CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "invalid_rows" INTEGER NOT NULL,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL,
    "errors" JSONB,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_jobs_created_at_idx" ON "import_jobs"("created_at");
CREATE INDEX "import_jobs_created_by_id_created_at_idx" ON "import_jobs"("created_by_id", "created_at");
CREATE INDEX "import_jobs_type_status_created_at_idx" ON "import_jobs"("type", "status", "created_at");

ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
