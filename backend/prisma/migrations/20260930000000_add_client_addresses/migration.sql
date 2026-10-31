-- ClientAddress is additive: no existing Client fields or rows are changed.
CREATE TYPE "AddressType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'BILLING', 'OTHER');

ALTER TYPE "AuditEntity" ADD VALUE 'CLIENT_ADDRESS';
ALTER TYPE "AuditAction" ADD VALUE 'PRIMARY_CHANGE';

CREATE TABLE "client_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "type" "AddressType" NOT NULL,
    "zip_code" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_addresses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_addresses_inactive_not_primary" CHECK ("active" OR NOT "is_primary"),
    CONSTRAINT "client_addresses_client_id_fkey" FOREIGN KEY ("client_id")
      REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "client_addresses_client_id_idx" ON "client_addresses"("client_id");
CREATE INDEX "client_addresses_client_id_active_idx" ON "client_addresses"("client_id", "active");
CREATE INDEX "client_addresses_client_id_is_primary_idx" ON "client_addresses"("client_id", "is_primary");
CREATE INDEX "client_addresses_created_at_idx" ON "client_addresses"("created_at");

-- Prisma cannot currently describe partial unique indexes in schema.prisma.
-- This is the final database guarantee used in addition to transactional service rules.
CREATE UNIQUE INDEX "client_addresses_one_active_primary_per_client"
  ON "client_addresses"("client_id")
  WHERE "active" = true AND "is_primary" = true;
