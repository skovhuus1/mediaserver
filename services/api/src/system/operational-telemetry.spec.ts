import { describe, expect, it } from 'vitest';
import { downsampleMetricPoints, operationalAlertCandidates, telemetryRangeMilliseconds, type MetricPoint } from './operational-telemetry.js';

const point = (overrides: Partial<MetricPoint> = {}): MetricPoint => ({ sampledAt: '2026-08-24T12:00:00.000Z', cpuPercent: 10, memoryPercent: 20, diskUsedPercent: 30, activeSessions: 1, bufferingSessions: 0, queuedJobs: 0, failedAttempts1h: 0, ...overrides });

describe('operational telemetry', () => {
  it('creates actionable severity thresholds', () => {
    expect(operationalAlertCandidates(point({ cpuPercent: 98.1, bufferingSessions: 2 })).map((alert) => [alert.key, alert.severity])).toEqual([['cpu_pressure', 'error'], ['playback_buffering', 'warning']]);
  });
  it('downsamples without losing the newest sample', () => {
    const points = Array.from({ length: 1000 }, (_, index) => point({ sampledAt: new Date(index * 60_000).toISOString(), cpuPercent: index }));
    const sampled = downsampleMetricPoints(points, 100);
    expect(sampled).toHaveLength(100);
    expect(sampled.at(-1)?.sampledAt).toBe(points.at(-1)?.sampledAt);
  });
  it('uses a safe default range', () => {
    expect(telemetryRangeMilliseconds('7d')).toBe(604_800_000);
    expect(telemetryRangeMilliseconds('invalid')).toBe(86_400_000);
  });
});

