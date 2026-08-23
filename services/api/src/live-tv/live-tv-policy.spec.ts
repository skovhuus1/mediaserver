import { describe, expect, it } from 'vitest';
import { chooseLiveTvMethod, selectLiveTvSource, type LiveTvSourceCandidate } from './live-tv-policy';

const source = (overrides: Partial<LiveTvSourceCandidate>): LiveTvSourceCandidate => ({
  sourceId: 'source-1', connectionId: 'connection-1', providerId: 'provider-1', streamFormat: 'hls',
  connectionHealth: 'healthy', qualityRank: 30, sourcePriority: 100, connectionPriority: 100,
  providerPriority: 100, connectionLimit: 1, providerUserLimit: 1,
  ...overrides,
});

describe('Live TV pool policy', () => {
  it('uses the next prioritized connection when the first tuner is occupied', () => {
    const selected = selectLiveTvSource(
      [source({}), source({ sourceId: 'source-2', connectionId: 'connection-2', connectionPriority: 200 })],
      new Map([['connection-1', 1]]),
      new Map(),
    );
    expect(selected?.connectionId).toBe('connection-2');
  });

  it('enforces the provider user limit independently of connection capacity', () => {
    expect(selectLiveTvSource([source({ connectionLimit: 5 })], new Map(), new Map([['provider-1', 1]]))).toBeNull();
  });

  it('prefers a healthy FHD source and falls back to healthy HD when FHD is failed', () => {
    const fhd = source({ sourceId: 'fhd', connectionId: 'fhd-line', qualityRank: 10 });
    const hd = source({ sourceId: 'hd', connectionId: 'hd-line', qualityRank: 20 });
    expect(selectLiveTvSource([hd, fhd], new Map(), new Map())?.sourceId).toBe('fhd');
    expect(selectLiveTvSource([{ ...fhd, connectionHealth: 'failed' }, hd], new Map(), new Map())?.sourceId).toBe('hd');
  });

  it('prefers direct HLS and falls back to remux or transcode by entitlement', () => {
    expect(chooseLiveTvMethod('hls', { allowDirectPlay: true, allowDirectStream: true, allowVideoTranscode: true })).toBe('direct_play');
    expect(chooseLiveTvMethod('mpegts', { allowDirectPlay: true, allowDirectStream: true, allowVideoTranscode: true })).toBe('direct_stream');
    expect(chooseLiveTvMethod('mpegts', { allowDirectPlay: true, allowDirectStream: false, allowVideoTranscode: true })).toBe('transcode');
  });
});
