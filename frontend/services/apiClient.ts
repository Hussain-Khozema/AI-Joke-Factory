import type { ApiErrorResponse } from '../types';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(opts: { status: number; code?: string; message: string; details?: unknown }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

type ApiClientOptions = Omit<RequestInit, 'body' | 'headers'> & {
  headers?: Record<string, string | undefined>;
  body?: unknown;
};

function getBaseUrl(): string {
  const envBase = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return (envBase && envBase.trim()) ? envBase : 'http://localhost:8081';
}

function getUserIdHeader(): string | undefined {
  const v = localStorage.getItem('joke_factory_user_id');
  return v ?? undefined;
}

async function parseErrorBody(resp: Response): Promise<{ code?: string; message: string; details?: unknown }> {
  const contentType = resp.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    let json: unknown;
    try {
      json = await resp.json();
    } catch {
      return { message: resp.statusText || `HTTP ${resp.status}` };
    }

    const maybe = json as ApiErrorResponse & Record<string, any>;
    const code = maybe.code ?? maybe.error?.code ?? maybe.error_code ?? maybe?.err?.code;
    const message =
      maybe.message ??
      maybe.error?.message ??
      maybe.error_message ??
      maybe?.err?.message ??
      (resp.statusText || `HTTP ${resp.status}`);

    return { code, message, details: json };
  }

  let text: string | undefined;
  try {
    text = await resp.text();
  } catch {
    // ignore
  }
  return { message: (text && text.trim()) ? text : (resp.statusText || `HTTP ${resp.status}`) };
}

export async function apiRequest<T>(path: string, opts: ApiClientOptions = {}): Promise<T> {
  const baseUrl = getBaseUrl().replace(/\/+$/, '');
  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

  const userId = getUserIdHeader();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(userId ? { 'X-User-Id': userId } : {}),
  };

  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v === undefined) continue;
      headers[k] = v;
    }
  }

  const resp = await fetch(url, {
    ...opts,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!resp.ok) {
    const err = await parseErrorBody(resp);
    throw new ApiError({ status: resp.status, code: err.code, message: err.message, details: err.details });
  }

  // 204 / empty responses
  if (resp.status === 204) return undefined as T;

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    // Best-effort: allow empty response bodies
    const text = await resp.text().catch(() => '');
    return (text as unknown) as T;
  }

  return (await resp.json()) as T;
}


