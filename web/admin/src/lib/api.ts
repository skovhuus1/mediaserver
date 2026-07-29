export type ApiFailure = {
  code: string;
  message: string;
  correlationId?: string;
  details?: unknown;
};

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type SessionUser = {
  id: string;
  accountId: string;
  email: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
  roles: string[];
  activeProfileId: string | null;
  profiles: Array<{ id: string; name: string; isChildProfile: boolean; language: string; hasPin: boolean }>;
};

type RefreshOutcome =
  | { status: 'refreshed' }
  | { status: 'invalid'; failure: ApiFailure }
  | { status: 'unavailable'; failure: ApiFailure };

let refreshRequest: Promise<RefreshOutcome> | null = null;

export function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('bb_access_token');
}

function refreshToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('bb_refresh_token');
}

export function saveSession(access: string, refresh: string): void {
  window.localStorage.setItem('bb_access_token', access);
  window.localStorage.setItem('bb_refresh_token', refresh);
}

export function clearSession(): void {
  window.localStorage.removeItem('bb_access_token');
  window.localStorage.removeItem('bb_refresh_token');
}

export async function logoutSession(): Promise<void> {
  const currentRefreshToken = refreshToken();
  const currentAccessToken = accessToken();
  try {
    if (currentRefreshToken && currentAccessToken) {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${currentAccessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: currentRefreshToken }),
      });
    }
  } finally {
    clearSession();
  }
}

export async function selectProfile(profileId: string, profilePin?: string): Promise<void> {
  const currentRefreshToken = refreshToken();
  if (!currentRefreshToken) {
    throw { code: 'refresh_token_missing', message: 'Sessionen er udløbet. Log ind igen.' } satisfies ApiFailure;
  }
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: currentRefreshToken, profileId, ...(profilePin ? { profilePin } : {}) }),
  });
  const tokens = await parseResponse<TokenPair>(response);
  saveSession(tokens.accessToken, tokens.refreshToken);
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
  const response = await request(path, init, authenticated ? accessToken() : null);
  if (authenticated && response.status === 401) {
    const outcome = await refreshSession();
    if (outcome.status === 'refreshed') {
      return parseResponse<T>(await request(path, init, accessToken()));
    }
    if (outcome.status === 'invalid' && typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign('/login?session=expired');
    }
    throw outcome.failure;
  }
  return parseResponse<T>(response);
}

function request(path: string, init: RequestInit, token: string | null): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({ code: 'invalid_response', message: `HTTP ${response.status}` })) as T | ApiFailure;
  if (!response.ok) throw body;
  return body as T;
}

function refreshSession(): Promise<RefreshOutcome> {
  if (refreshRequest) return refreshRequest;
  refreshRequest = performRefresh().finally(() => {
    refreshRequest = null;
  });
  return refreshRequest;
}

async function performRefresh(): Promise<RefreshOutcome> {
  const currentRefreshToken = refreshToken();
  if (!currentRefreshToken) {
    const failure = { code: 'refresh_token_missing', message: 'Sessionen er udløbet. Log ind igen.' };
    clearSession();
    return { status: 'invalid', failure };
  }
  let response: Response;
  try {
    response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
  } catch {
    return {
      status: 'unavailable',
      failure: { code: 'refresh_unavailable', message: 'Serveren er midlertidigt utilgængelig. Prøv igen om et øjeblik.' },
    };
  }
  const body = await response.json().catch(() => ({
    code: 'invalid_response',
    message: `HTTP ${response.status}`,
  })) as TokenPair | ApiFailure;
  if (response.ok) {
    const tokens = body as TokenPair;
    saveSession(tokens.accessToken, tokens.refreshToken);
    return { status: 'refreshed' };
  }
  const failure = body as ApiFailure;
  if (response.status === 400 || response.status === 401) {
    clearSession();
    return { status: 'invalid', failure };
  }
  return { status: 'unavailable', failure };
}
