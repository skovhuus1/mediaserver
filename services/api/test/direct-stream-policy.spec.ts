import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPathWithin, mediaContentType, parseByteRange, streamTokenMatches } from '../src/playback/direct-stream-policy';

describe('direct stream policy', () => {
  it('parses full, open and suffix byte ranges', () => {
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  });

  it('rejects malformed, multiple and out-of-bounds ranges', () => {
    expect(() => parseByteRange('items=0-1', 100)).toThrow(RangeError);
    expect(() => parseByteRange('bytes=0-1,4-5', 100)).toThrow(RangeError);
    expect(() => parseByteRange('bytes=100-', 100)).toThrow(RangeError);
  });

  it('prevents paths from escaping a storage root', () => {
    const root = resolve('media-root');
    expect(isPathWithin(root, resolve(root, 'films', 'movie.mkv'))).toBe(true);
    expect(isPathWithin(root, resolve(root, '..', 'secret.mkv'))).toBe(false);
  });

  it('matches only the token represented by the stored SHA-256 hash', () => {
    const token = 'short-lived-stream-token';
    const hash = createHash('sha256').update(token).digest('hex');
    expect(streamTokenMatches(token, hash)).toBe(true);
    expect(streamTokenMatches('wrong-token', hash)).toBe(false);
  });

  it('maps known containers and falls back safely', () => {
    expect(mediaContentType('movie.mp4')).toBe('video/mp4');
    expect(mediaContentType('movie.unknown')).toBe('application/octet-stream');
  });
});
