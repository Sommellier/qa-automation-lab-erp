ALTER TYPE "AuditEntity" ADD VALUE 'SECURITY';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILURE';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGE_FAILURE';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET_FAILURE';
ALTER TYPE "AuditAction" ADD VALUE 'RATE_LIMIT_BLOCK';

CREATE TABLE "security_throttles" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "subject_hash" CHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "block_level" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "blocked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_throttles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "security_throttles_scope_subject_hash_key"
ON "security_throttles"("scope", "subject_hash");
CREATE INDEX "security_throttles_blocked_until_idx" ON "security_throttles"("blocked_until");
CREATE INDEX "security_throttles_updated_at_idx" ON "security_throttles"("updated_at");
