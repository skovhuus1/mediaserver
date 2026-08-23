import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveTvSourceText } from '../src/live-tv.js';

afterEach(() => vi.unstubAllGlobals());

describe('Live TV source fetch', () => {
  it('streams a source whose size is below the configured limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('#EXTM3U\nhttps://tv.test/channel')));

    await expect(fetchLiveTvSourceText('https://provider.test/list.m3u', 1024, { timeoutMs: 5_000 }))
      .resolves.toBe('#EXTM3U\nhttps://tv.test/channel');
  });

  it('stops reading as soon as an unknown-length source exceeds the limit', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(700));
        controller.enqueue(new Uint8Array(700));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));

    await expect(fetchLiveTvSourceText('https://provider.test/list.m3u', 1024, { timeoutMs: 5_000 }))
      .rejects.toThrow('Kilden overstiger sikkerhedsgrænsen på 1 MiB');
  });

  it('rejects a declared oversize source before reading its body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('small', { headers: { 'content-length': '2048' } })));

    await expect(fetchLiveTvSourceText('https://provider.test/list.m3u', 1024, { timeoutMs: 5_000 }))
      .rejects.toThrow('Kilden overstiger sikkerhedsgrænsen på 1 MiB');
  });

  it('reports declared download progress from start through completion', async () => {
    const body = '#EXTM3U\nhttps://tv.test/channel';
    const onProgress = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'content-length': String(Buffer.byteLength(body)) } })));

    await fetchLiveTvSourceText('https://provider.test/list.m3u', 1024, { timeoutMs: 5_000, onProgress });

    expect(onProgress).toHaveBeenNthCalledWith(1, { receivedBytes: 0, totalBytes: Buffer.byteLength(body) });
    expect(onProgress).toHaveBeenLastCalledWith({ receivedBytes: Buffer.byteLength(body), totalBytes: Buffer.byteLength(body) });
  });
});
