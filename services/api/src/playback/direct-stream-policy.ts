import { createHash, timingSafeEqual } from 'node:crypto';
import { extname, isAbsolute, relative, sep } from 'node:path';

export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string | undefined, size: number): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) throw new RangeError('Requested byte range is not satisfiable');
  const first = match[1] ?? '';
  const second = match[2] ?? '';
  let start: number;
  let end: number;
  if (!first) {
    const suffix = Number.parseInt(second, 10);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError('Requested byte range is not satisfiable');
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(first, 10);
    end = second ? Number.parseInt(second, 10) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    throw new RangeError('Requested byte range is not satisfiable');
  }
  return { start, end: Math.min(end, size - 1) };
}

export function isPathWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function streamTokenMatches(token: string, expectedHash: string): boolean {
  const supplied = Buffer.from(createHash('sha256').update(token).digest('hex'), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function mediaContentType(path: string): string {
  return ({
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.ts': 'video/mp2t',
  } as Record<string, string>)[extname(path).toLowerCase()] ?? 'application/octet-stream';
}
