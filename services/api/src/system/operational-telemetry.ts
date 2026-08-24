export type MetricPoint = {
  sampledAt: string; cpuPercent: number; memoryPercent: number; diskUsedPercent: number;
  activeSessions: number; bufferingSessions: number; queuedJobs: number; failedAttempts1h: number;
};

export type OperationalAlertCandidate = {
  key: string; severity: 'warning' | 'error'; title: string; message: string; details: Record<string, number>;
};

export function telemetryRangeMilliseconds(range: string | undefined): number {
  return ({ '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 } as const)[range as '1h'] ?? 86_400_000;
}

export function downsampleMetricPoints(points: MetricPoint[], maximum = 360): MetricPoint[] {
  if (points.length <= maximum) return points;
  const bucketSize = Math.ceil(points.length / maximum);
  const result: MetricPoint[] = [];
  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    const average = (field: keyof Omit<MetricPoint, 'sampledAt'>) => bucket.reduce((sum, point) => sum + point[field], 0) / bucket.length;
    result.push({ sampledAt: bucket.at(-1)?.sampledAt ?? bucket[0]!.sampledAt,
      cpuPercent: average('cpuPercent'), memoryPercent: average('memoryPercent'), diskUsedPercent: average('diskUsedPercent'),
      activeSessions: average('activeSessions'), bufferingSessions: average('bufferingSessions'), queuedJobs: average('queuedJobs'), failedAttempts1h: average('failedAttempts1h') });
  }
  return result;
}

export function operationalAlertCandidates(point: MetricPoint): OperationalAlertCandidate[] {
  const candidates: OperationalAlertCandidate[] = [];
  const percentageAlert = (key: string, label: string, value: number) => {
    if (value < 90) return;
    candidates.push({ key, severity: value >= 98 ? 'error' : 'warning', title: `${label} er belastet`, message: `${label} bruger ${value.toFixed(1)} %.`, details: { value } });
  };
  percentageAlert('cpu_pressure', 'CPU', point.cpuPercent);
  percentageAlert('memory_pressure', 'Hukommelse', point.memoryPercent);
  percentageAlert('disk_pressure', 'Disk', point.diskUsedPercent);
  if (point.bufferingSessions >= 2) candidates.push({ key: 'playback_buffering', severity: point.bufferingSessions >= 5 ? 'error' : 'warning', title: 'Flere streams buffer', message: `${point.bufferingSessions} aktive streams rapporterer buffering.`, details: { count: point.bufferingSessions } });
  if (point.queuedJobs >= 100) candidates.push({ key: 'job_backlog', severity: point.queuedJobs >= 500 ? 'error' : 'warning', title: 'Jobkøen vokser', message: `${point.queuedJobs} jobs venter i køen.`, details: { count: point.queuedJobs } });
  if (point.failedAttempts1h >= 10) candidates.push({ key: 'job_failures', severity: point.failedAttempts1h >= 50 ? 'error' : 'warning', title: 'Mange jobfejl', message: `${point.failedAttempts1h} jobforsøg er fejlet den seneste time.`, details: { count: point.failedAttempts1h } });
  return candidates;
}
