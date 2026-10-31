import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../prisma/migrations/20260929000000_add_product_categories/migration.sql', import.meta.url), 'utf8');

describe('migration de categorias', () => {
  it('migra os dados antes de remover a coluna textual', () => {
    expect(sql.indexOf('INSERT INTO "categories"')).toBeLessThan(sql.indexOf('UPDATE "products"'));
    expect(sql.indexOf('UPDATE "products"')).toBeLessThan(sql.indexOf('DROP COLUMN "category"'));
  });
  it('aborta se algum produto ficar sem categoria e torna a FK obrigatória', () => {
    expect(sql).toContain('WHERE "category_id" IS NULL');
    expect(sql).toContain('ALTER COLUMN "category_id" SET NOT NULL');
  });
  it('normaliza case/espaços e protege produtos contra exclusão em cascata', () => {
    expect(sql).toContain('LOWER(REGEXP_REPLACE(BTRIM("category")');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).not.toContain('ON DELETE CASCADE');
  });
});
