import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { UserRole, type User } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  userFindUnique: vi.fn(), list: vi.fn(), getById: vi.fn(), listCompanies: vi.fn(), createCompany: vi.fn(), updateCompany: vi.fn(),
  preview: vi.fn(), getImportBatch: vi.fn(), confirm: vi.fn(), updateLinks: vi.fn(), addAttachment: vi.fn(), downloadAttachment: vi.fn(), removeAttachment: vi.fn(),
}));
vi.mock('../config/prisma.js', () => ({ prisma: { user: { findUnique: mock.userFindUnique }, $disconnect: vi.fn() } }));
vi.mock('../services/fiscal.service.js', () => ({ FiscalService: class {
  list = mock.list; getById = mock.getById; listCompanies = mock.listCompanies; createCompany = mock.createCompany; updateCompany = mock.updateCompany;
  preview = mock.preview; getImportBatch = mock.getImportBatch; confirm = mock.confirm; updateLinks = mock.updateLinks;
  addAttachment = mock.addAttachment; downloadAttachment = mock.downloadAttachment; removeAttachment = mock.removeAttachment;
} }));

import { app } from '../app.js';
import { createAccessToken } from '../services/token.service.js';

describe('rotas fiscais', () => {
  let server: Server; let baseUrl: string; const actorId = randomUUID();
  beforeAll(async () => { await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', (error?: Error) => error ? reject(error) : resolve()); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Servidor não iniciou.'); baseUrl = `http://127.0.0.1:${address.port}`; });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
  beforeEach(() => { Object.values(mock).forEach((entry) => entry.mockReset()); mock.list.mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } }); mock.listCompanies.mockResolvedValue([]); mock.preview.mockResolvedValue({ id: randomUUID(), files: [] }); mock.removeAttachment.mockResolvedValue({ id: randomUUID() }); });
  function token(role: UserRole): string { const user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'active'> = { id: actorId, name: role, email: `${role.toLowerCase()}@teste.com`, role, active: true }; mock.userFindUnique.mockResolvedValue(user); return createAccessToken(actorId, role); }
  it.each([UserRole.ADMIN, UserRole.ANALISTA, UserRole.VISUALIZADOR])('%s consulta documentos e empresas', async (role) => {
    const auth = token(role); expect((await fetch(`${baseUrl}/api/fiscal/documents`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200); expect((await fetch(`${baseUrl}/api/fiscal/companies`, { headers: { Authorization: `Bearer ${auth}` } })).status).toBe(200);
  });
  it.each([UserRole.ADMIN, UserRole.ANALISTA])('%s envia lote XML para prévia', async (role) => {
    const form = new FormData(); form.append('files', new Blob(['<NFe/>'], { type: 'application/xml' }), 'nota.xml');
    expect((await fetch(`${baseUrl}/api/fiscal/imports/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token(role)}` }, body: form })).status).toBe(201); expect(mock.preview).toHaveBeenCalled();
  });
  it('bloqueia mutações para visualizador e restringe remoção a administrador', async () => {
    const viewer = token(UserRole.VISUALIZADOR); const form = new FormData(); form.append('files', new Blob(['<NFe/>'], { type: 'application/xml' }), 'nota.xml');
    expect((await fetch(`${baseUrl}/api/fiscal/imports/preview`, { method: 'POST', headers: { Authorization: `Bearer ${viewer}` }, body: form })).status).toBe(403);
    const documentId = randomUUID(); const attachmentId = randomUUID();
    expect((await fetch(`${baseUrl}/api/fiscal/documents/${documentId}/attachments/${attachmentId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token(UserRole.ANALISTA)}` } })).status).toBe(403);
    expect((await fetch(`${baseUrl}/api/fiscal/documents/${documentId}/attachments/${attachmentId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` } })).status).toBe(200);
  });
  it('rejeita extensão não XML e exige autenticação', async () => {
    const form = new FormData(); form.append('files', new Blob(['x'], { type: 'text/plain' }), 'nota.txt');
    const response = await fetch(`${baseUrl}/api/fiscal/imports/preview`, { method: 'POST', headers: { Authorization: `Bearer ${token(UserRole.ADMIN)}` }, body: form });
    expect(response.status).toBe(400); expect((await response.json() as { error: { code: string } }).error.code).toBe('INVALID_FISCAL_XML_FORMAT');
    expect((await fetch(`${baseUrl}/api/fiscal/documents`)).status).toBe(401);
  });
});
