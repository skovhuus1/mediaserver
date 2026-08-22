import type { Response } from 'express';

export function normalizedMediaOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function applyMediaCors(response: Response, origin: string | undefined): void {
  const allowedOrigin = normalizedMediaOrigin(origin);
  if (allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Range, Accept-Encoding, Content-Type');
  response.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}
