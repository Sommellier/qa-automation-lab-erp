import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../prisma/migrations/20260930000000_add_client_addresses/migration.sql', import.meta.url), 'utf8');

describe('migration de ClientAddress', () => {
  it('é aditiva e preserva Client', () => {
    expect(sql).toContain('CREATE TABLE "client_addresses"');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN).*client/i);
  });
  it('impede exclusão em cascata e endereço inativo principal', () => {
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('client_addresses_inactive_not_primary');
  });
  it('garante no banco no máximo um principal ativo por cliente', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "client_addresses_one_active_primary_per_client"');
    expect(sql).toContain('WHERE "active" = true AND "is_primary" = true');
  });
});
