ALTER TYPE "AuditEntity" ADD VALUE 'PURCHASE_APPROVAL_RULE';
ALTER TYPE "AuditAction" ADD VALUE 'SUBMIT';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVE';
ALTER TYPE "AuditAction" ADD VALUE 'REJECT';

CREATE TYPE "PurchaseApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "PurchaseApprovalAction" AS ENUM ('SUBMIT', 'APPROVE', 'REJECT');

ALTER TABLE "purchase_orders"
  ADD COLUMN "approval_status" "PurchaseApprovalStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by_id" UUID;

UPDATE "purchase_orders"
SET "submitted_at" = "created_at", "approved_at" = "created_at", "approved_by_id" = "created_by_id";

ALTER TABLE "purchase_orders" ALTER COLUMN "approval_status" SET DEFAULT 'DRAFT';

CREATE TABLE "purchase_approval_rules" (
  "id" UUID NOT NULL,
  "role" "UserRole" NOT NULL,
  "max_amount" DECIMAL(14,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_approval_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_approval_rules_max_amount_check" CHECK ("max_amount" IS NULL OR "max_amount" > 0)
);

CREATE TABLE "purchase_approval_events" (
  "id" UUID NOT NULL,
  "purchase_order_id" UUID NOT NULL,
  "action" "PurchaseApprovalAction" NOT NULL,
  "from_status" "PurchaseApprovalStatus" NOT NULL,
  "to_status" "PurchaseApprovalStatus" NOT NULL,
  "comment" TEXT,
  "actor_id" UUID NOT NULL,
  "actor_role" "UserRole" NOT NULL,
  "approval_limit" DECIMAL(14,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_approval_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_approval_rules_role_key" ON "purchase_approval_rules"("role");
CREATE INDEX "purchase_approval_rules_active_idx" ON "purchase_approval_rules"("active");
CREATE INDEX "purchase_approval_events_purchase_order_id_created_at_idx" ON "purchase_approval_events"("purchase_order_id", "created_at");
CREATE INDEX "purchase_approval_events_actor_id_created_at_idx" ON "purchase_approval_events"("actor_id", "created_at");
CREATE INDEX "purchase_approval_events_action_created_at_idx" ON "purchase_approval_events"("action", "created_at");
CREATE INDEX "purchase_orders_approval_status_created_at_idx" ON "purchase_orders"("approval_status", "created_at");

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_approval_rules" ADD CONSTRAINT "purchase_approval_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_approval_events" ADD CONSTRAINT "purchase_approval_events_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_approval_events" ADD CONSTRAINT "purchase_approval_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "purchase_approval_rules" ("id", "role", "max_amount", "active", "created_at", "updated_at") VALUES
  (gen_random_uuid(), 'ANALISTA', 10000.00, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ADMIN', NULL, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "purchase_approval_events" (
  "id", "purchase_order_id", "action", "from_status", "to_status", "comment",
  "actor_id", "actor_role", "approval_limit", "created_at"
)
SELECT
  gen_random_uuid(), purchase."id", 'APPROVE'::"PurchaseApprovalAction",
  'DRAFT'::"PurchaseApprovalStatus", 'APPROVED'::"PurchaseApprovalStatus",
  'Aprovação preservada durante a migração do módulo de alçadas.',
  purchase."created_by_id", creator."role", NULL, purchase."created_at"
FROM "purchase_orders" AS purchase
JOIN "users" AS creator ON creator."id" = purchase."created_by_id";
