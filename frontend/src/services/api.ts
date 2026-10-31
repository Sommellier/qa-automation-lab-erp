interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = 'REQUEST_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';
const CSRF_COOKIE = 'qa_csrf_token';
let refreshPromise: Promise<void> | null = null;

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const item = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function requestHeaders(options: RequestInit): Headers {
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const method = (options.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }

  return headers;
}

async function rawRequest(path: string, options: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: requestHeaders(options),
    credentials: 'include',
  });
}

function canRenew(path: string): boolean {
  return !['/auth/login', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'].includes(path);
}

async function renewSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error('SESSION_REFRESH_FAILED');
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function notifyExpiredSession(): void {
  window.dispatchEvent(new Event('qa-management:session-expired'));
}

async function requestWithRenewal(path: string, options: RequestInit): Promise<Response> {
  let response = await rawRequest(path, options);
  if (response.status === 401 && canRenew(path)) {
    try {
      await renewSession();
      response = await rawRequest(path, options);
    } catch {
      notifyExpiredSession();
    }
  }
  return response;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  _sessionMarker?: string,
): Promise<T> {
  let response: Response;

  try {
    response = await requestWithRenewal(path, options);
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      body.error?.message ?? 'Não foi possível concluir a solicitação.',
      response.status,
      body.error?.code,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiDownload(path: string, _sessionMarker: string): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await requestWithRenewal(path, {});
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', 0, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(body.error?.message ?? 'Não foi possível baixar o arquivo.', response.status, body.error?.code);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'modelo.csv';
  return { blob: await response.blob(), fileName };
}

