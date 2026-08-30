import { describe, expect, it, vi } from 'vitest';
import { commitPlaybackAnalysis, fingerprintFrameQuality, pendingSeasonReanalysisMediaIds, playbackFingerprintMatchesSource, prioritizeTimelineMarkers } from './playback-assets.js';

describe('playback fingerprint quality', () => {
  it('rejects flat black and white frames as visual evidence', () => {
    expect(fingerprintFrameQuality(Buffer.alloc(72, 0))).toBe(0);
    expect(fingerprintFrameQuality(Buffer.alloc(72, 255))).toBe(0);
  });

  it('scores exposed frames with visual contrast above flat frames', () => {
    const frame = Buffer.from(Array.from({ length: 72 }, (_, index) => 24 + index % 48 * 4));
    expect(fingerprintFrameQuality(frame)).toBeGreaterThan(0.25);
  });

  it('only reuses sibling fingerprints from the same source file version', () => {
    const sourceModifiedAt = new Date('2026-08-26T10:00:00.000Z');
    expect(playbackFingerprintMatchesSource(sourceModifiedAt, new Date('2026-08-26T10:00:00.000Z'))).toBe(true);
    expect(playbackFingerprintMatchesSource(sourceModifiedAt, new Date('2026-08-26T10:01:00.000Z'))).toBe(false);
    expect(playbackFingerprintMatchesSource(null, sourceModifiedAt)).toBe(false);
  });

  it('preserves marker priority manual, chapter, external, then automatic', () => {
    const marker = (kind: 'intro' | 'recap' | 'credits', source: 'manual' | 'chapter' | 'external' | 'automatic') => ({
      kind, source, startMs: 0, endMs: 30_000, confidence: source === 'manual' || source === 'chapter' ? 1 : 0.9,
    });
    expect(prioritizeTimelineMarkers(
      [marker('intro', 'manual')],
      [marker('intro', 'chapter'), marker('recap', 'chapter')],
      [marker('intro', 'external'), marker('recap', 'external'), marker('credits', 'external')],
      [marker('intro', 'automatic'), marker('recap', 'automatic'), marker('credits', 'automatic')],
    )).toEqual([
      marker('intro', 'manual'), marker('recap', 'chapter'), marker('credits', 'external'),
    ]);
  });

  it('requeues only current-version pending intro analyses without active jobs', () => {
    const manifest = (version: number, state: string, reason: string) => ({
      analysis: { markerAnalysisVersion: version, intro: { state, reason } },
    });
    expect(pendingSeasonReanalysisMediaIds([
      { mediaId: 'pending', manifest: manifest(7, 'pending', 'insufficient_references'), sourceCurrent: true },
      { mediaId: 'active', manifest: manifest(7, 'pending', 'insufficient_references'), sourceCurrent: true },
      { mediaId: 'settled', manifest: manifest(7, 'not-detected', 'no_repeated_sequence'), sourceCurrent: true },
      { mediaId: 'stale-version', manifest: manifest(5, 'pending', 'insufficient_references'), sourceCurrent: true },
      { mediaId: 'stale-source', manifest: manifest(7, 'pending', 'insufficient_references'), sourceCurrent: false },
      { mediaId: 'recap-pending', manifest: { analysis: { markerAnalysisVersion: 7, intro: {}, recap: { state: 'pending', reason: 'insufficient_previous_episodes' } } }, sourceCurrent: true, recapCanConverge: true },
    ] as never, new Set(['active']))).toEqual(['pending', 'recap-pending']);
  });

  it('commits diagnostics and generated markers atomically while preserving manual kinds', async () => {
    const tx = {
      mediaTimelineMarker: {
        findMany: vi.fn().mockResolvedValue([{ kind: 'intro' }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      mediaPlaybackAsset: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<void>) => operation(tx)),
    };
    await commitPlaybackAnalysis(prisma as never, {
      accountId: 'account-1',
      mediaId: 'episode-1',
      markers: [
        { kind: 'intro', startMs: 40_000, endMs: 90_000, source: 'automatic', confidence: 0.94 },
        { kind: 'recap', startMs: 0, endMs: 35_000, source: 'automatic', confidence: 0.91 },
      ],
      assetData: { status: 'ready', manifest: { analysis: { markerAnalysisVersion: 5 } } },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(tx.mediaTimelineMarker.deleteMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1', mediaId: 'episode-1', source: { not: 'manual' } },
    });
    expect(tx.mediaTimelineMarker.createMany).toHaveBeenCalledWith({
      data: [{ accountId: 'account-1', mediaId: 'episode-1', kind: 'recap', startMs: 0, endMs: 35_000, source: 'automatic', confidence: 0.91 }],
    });
    expect(tx.mediaPlaybackAsset.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { mediaId: 'episode-1' }, data: expect.objectContaining({ status: 'ready' }),
    }));
  });
});
