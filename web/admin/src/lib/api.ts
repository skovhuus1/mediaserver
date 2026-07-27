export type ApiFailure = {
  code: string;
  message: string;
  correlationId?: string;
  details?: unknown;
};

export function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('bb_access_token');
}

export function saveSession(access: string, refresh: string): void {
  window.localStorage.setItem('bb_access_token', access);
  window.localStorage.setItem('bb_refresh_token', refresh);
}

export function clearSession(): void {
  window.localStorage.removeItem('bb_access_token');
  window.localStorage.removeItem('bb_refresh_token');
}

export function deviceFingerprint(): string {
  const current = window.localStorage.getItem('bb_device_fingerprint');
  if (current) return current;
  const next = window.crypto.randomUUID();
  window.localStorage.setItem('bb_device_fingerprint', next);
  return next;
}

export async function api<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
  const token = accessToken();
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(authenticated && token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({ code: 'invalid_response', message: `HTTP ${response.status}` })) as T | ApiFailure;
  if (!response.ok) throw body;
  return body as T;
}
