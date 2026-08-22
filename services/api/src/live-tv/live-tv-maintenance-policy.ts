export type MaintenanceJobLike = { type: string; status: string; payload: unknown };

export function isLiveTvRefreshDue(lastQueuedAt: Date | null, intervalMinutes: number, now: Date) {
  if (!lastQueuedAt) return true;
  return now.getTime() - lastQueuedAt.getTime() >= Math.max(5, intervalMinutes) * 60_000;
}

export function hasActiveProviderJob(jobs: MaintenanceJobLike[], type: 'live-tv.import' | 'live-tv.epg', providerId: string) {
  return jobs.some((job) => job.type === type && ['queued', 'running'].includes(job.status) && providerIdFromPayload(job.payload) === providerId);
}

export function providerIdFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).providerId;
  return typeof value === 'string' ? value : null;
}
