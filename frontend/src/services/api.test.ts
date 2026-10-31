import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

describe('cliente HTTP de sessão', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'qa_csrf_token=; Max-Age=0; Path=/';
  });

  it('envia cookies, não envia Bearer e acrescenta CSRF em mutações', async () => {
    document.cookie = 'qa_csrf_token=csrf-assinado; Path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await apiRequest<{ ok: boolean }>('/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Novo nome' }),
    }, 'marcador-legado');

    const options = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(options?.headers);
    expect(options?.credentials).toBe('include');
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('X-CSRF-Token')).toBe('csrf-assinado');
  });

  it('renova uma vez após 401 e repete a solicitação original', async () => {
    document.cookie = 'qa_csrf_token=csrf-assinado; Path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'TOKEN_EXPIRED' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: '1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    await apiRequest('/auth/me');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('/auth/me'),
      expect.stringContaining('/auth/refresh'),
      expect.stringContaining('/auth/me'),
    ]);
    const refreshHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(refreshHeaders.get('X-CSRF-Token')).toBe('csrf-assinado');
  });
});
