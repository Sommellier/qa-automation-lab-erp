-- Localizações operacionais do depósito padrão para segregar devoluções sem
-- disponibilizar automaticamente mercadorias ainda não liberadas.
INSERT INTO "stock_locations" ("id", "warehouse_id", "code", "description", "type", "is_default", "active", "created_at", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000100', 'QUARENTENA', 'Área de quarentena para inspeção de devoluções', 'QUARANTINE', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000100', 'AVARIADOS', 'Área segregada para mercadorias avariadas ou em assistência', 'DAMAGED', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000100', 'DESCARTE', 'Área segregada para mercadorias destinadas a descarte', 'DISPOSAL', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("warehouse_id", "code") DO UPDATE
SET "description" = EXCLUDED."description", "type" = EXCLUDED."type", "active" = true, "updated_at" = CURRENT_TIMESTAMP;
