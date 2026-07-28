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

function randomUuidV4(): string {
  if (typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function deviceFingerprint(): string {
  const current = window.localStorage.getItem('bb_device_fingerprint');
  if (current) return current;
  const next = randomUuidV4();
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
