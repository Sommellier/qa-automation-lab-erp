-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
