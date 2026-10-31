-- Fase 12: transforma a categoria textual de Product em uma relação obrigatória.
-- Toda a operação é atômica; qualquer produto não vinculado faz a migration abortar.

ALTER TYPE "AuditEntity" ADD VALUE 'CATEGORY';

CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_normalized_name_key" ON "categories"("normalized_name");
CREATE INDEX "categories_name_idx" ON "categories"("name");
CREATE INDEX "categories_active_idx" ON "categories"("active");

ALTER TABLE "products" ADD COLUMN "category_id" UUID;

WITH cleaned AS (
  SELECT
    REGEXP_REPLACE(BTRIM("category"), '\s+', ' ', 'g') AS display_name,
    LOWER(REGEXP_REPLACE(BTRIM("category"), '\s+', ' ', 'g')) AS normalized_name
  FROM "products"
), grouped AS (
  SELECT display_name, normalized_name, COUNT(*) AS uses
  FROM cleaned
  WHERE display_name <> ''
  GROUP BY display_name, normalized_name
), chosen AS (
  SELECT DISTINCT ON (normalized_name) display_name, normalized_name
  FROM grouped
  ORDER BY normalized_name, uses DESC, display_name ASC
)
INSERT INTO "categories" ("id", "name", "normalized_name")
SELECT gen_random_uuid(), display_name, normalized_name FROM chosen;

UPDATE "products" AS p
SET "category_id" = c."id"
FROM "categories" AS c
WHERE c."normalized_name" = LOWER(REGEXP_REPLACE(BTRIM(p."category"), '\s+', ' ', 'g'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products" WHERE "category_id" IS NULL) THEN
    RAISE EXCEPTION 'Migration cancelada: há produtos sem categoria vinculada.';
  END IF;
END $$;

ALTER TABLE "products" ALTER COLUMN "category_id" SET NOT NULL;
DROP INDEX "products_category_idx";
ALTER TABLE "products" DROP COLUMN "category";
CREATE INDEX "products_category_id_idx" ON "products"("category_id");
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
