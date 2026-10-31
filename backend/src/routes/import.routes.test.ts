import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { ImportStatus, ImportType, UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userFindUnique: vi.fn(), existingClients: vi.fn(), existingProducts: vi.fn(), createJob: vi.fn(),
  updateJob: vi.fn(), findJob: vi.fn(), listJobs: vi.fn(), createClients: vi.fn(), createProducts: vi.fn(),
}));

vi.mock('../config/prisma.js', () => ({ prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() } }));
vi.mock('../repositories/import.repository.js', () => ({ PrismaImportRepository: class {
  existingClients = mock.existingClients; existingProducts = mock.existingProducts; createJob = mock.createJob;
  updateJob = mock.updateJob; findJob = mock.findJob; listJobs = mock.listJobs;
  createClients = mock.createClients; createProducts = mock.createProducts;
} }));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas de importação', () => {
  let server: Server; let baseUrl: string; const actorId = randomUUID();
  const now = new Date('2026-09-27T17:00:00.000Z');
  beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.'); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  beforeEach(() => {
    Object.values(mock).forEach((entry) => entry.mockReset()); mock.existingClients.mockResolvedValue({ emails: [], documents: [] }); mock.existingProducts.mockResolvedValue([]); mock.listJobs.mockResolvedValue({ jobs: [], total: 0 });
    mock.createJob.mockImplementation(async (data: Record<string, unknown>) => ({ id: randomUUID(), ...data, errors: data.errors ?? [], createdAt: now, completedAt: null, createdBy: { id: actorId, name: 'Usuário', email: 'usuario@teste.com' } }));
  });
  function token(role: UserRole): string { const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: actorId, name: role, email: `${role.toLowerCase()}@teste.com`, role, active: true }; mock.userFindUnique.mockResolvedValue(user); return createAccessToken(actorId, role); }
  function upload(name: string, content: string, auth: string): Promise<Response> { const data = new FormData(); data.append('file', new Blob([content], { type: 'text/csv' }), name); return fetch(`${baseUrl}/api/imports/clients/validate`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: data }); }

  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('RF026: %s baixa templates completos', async (role) => {
    const auth = token(role);
    for (const [kind, fileName, header, example] of [
      ['clients', 'modelo_clientes.csv', 'name;document;email;phone;active', 'Carlos Silva'],
      ['products', 'modelo_produtos.csv', 'name;sku;description;price;stock;category;active', 'Notebook Pro'],
    ]) {
      const response = await fetch(`${baseUrl}/api/imports/${kind}/template`, { headers: { Authorization: `Bearer ${auth}` } }); const bytes = Buffer.from(await response.arrayBuffer()); const text = bytes.toString('utf8');
      expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('text/csv'); expect(response.headers.get('content-disposition')).toContain(fileName); expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); expect(text).toContain(header); expect(text).toContain(example);
    }
  });

  it.each([UserRole.ADMIN, UserRole.ANALISTA])('CT036-037: %s valida multipart CSV', async (role) => {
    const response = await upload('clientes.csv', 'name;document;email;phone;active\nCarlos;12345;carlos@teste.com;;true', token(role)); const body = await response.json() as { totalRows: number; validRows: number };
    expect(response.status).toBe(200); expect(body).toMatchObject({ totalRows: 1, validRows: 1 }); expect(mock.createJob).toHaveBeenCalledWith(expect.objectContaining({ status: ImportStatus.VALIDATED, type: ImportType.CLIENTS }));
  });

  it('CT004: rejeita extensão diferente de CSV', async () => {
    const response = await upload('clientes.txt', 'name;document;email;phone;active', token(UserRole.ADMIN)); const body = await response.json() as { error: { code: string; message: string } };
    expect(response.status).toBe(400); expect(body.error).toEqual({ code: 'INVALID_CSV_FORMAT', message: 'Formato de arquivo inválido. Envie um arquivo CSV.' });
  });

  it('CT003: rejeita arquivo vazio e ausência do campo file', async () => {
    expect((await upload('vazio.csv', '', token(UserRole.ADMIN))).status).toBe(400); const data = new FormData(); data.append('outro', 'x'); const response = await fetch(`${baseUrl}/api/imports/clients/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` }, body: data }); expect(response.status).toBe(400);
  });

  it('CT046: rejeita arquivo maior que 5 MB', async () => {
    const data = new FormData(); data.append('file', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1, 65)], { type: 'text/csv' }), 'grande.csv');
    const response = await fetch(`${baseUrl}/api/imports/clients/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` }, body: data });
    expect(response.status).toBe(413); expect((await response.json() as { error: { code: string } }).error.code).toBe('CSV_FILE_TOO_LARGE');
  });

  it('CT038 e CT042: VISUALIZADOR recebe 403 para validação, execução e histórico', async () => {
    const auth = token(UserRole.VISUALIZADOR); const data = new FormData(); data.append('file', new Blob(['name;document;email;active'], { type: 'text/csv' }), 'clientes.csv');
    expect((await fetch(`${baseUrl}/api/imports/clients/validate`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: data })).status).toBe(403);
    const executeData = new FormData(); executeData.append('file', new Blob(['name;document;email;active'], { type: 'text/csv' }), 'clientes.csv');
    expect((await fetch(`${baseUrl}/api/imports/clients/execute`, { method: 'POST', headers: { Authorization: `Bearer ${auth}` }, body: executeData })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/imports`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(403);
  });

  it('CT040-041: limita o histórico do ANALISTA e deixa ADMIN consultar tudo', async () => {
    expect((await fetch(`${baseUrl}/api/imports`, { headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` } })).status).toBe(200); expect(mock.listJobs).toHaveBeenLastCalledWith(expect.not.objectContaining({ createdById: expect.anything() }));
    expect((await fetch(`${baseUrl}/api/imports`, { headers: { Authorization: `Bearer ${token(UserRole.ANALISTA)}` } })).status).toBe(200); expect(mock.listJobs).toHaveBeenLastCalledWith(expect.objectContaining({ createdById: actorId }));
  });

  it('exige autenticação', async () => { expect((await fetch(`${baseUrl}/api/imports/clients/template`)).status).toBe(401); });
});
