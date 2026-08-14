type JsonRecord = Record<string, unknown>;

export type TranscoderRuntimeStatus = {
  state: string;
  available: boolean;
  stale: boolean;
  backend: 'nvenc' | 'software' | null;
  encoder: string | null;
  gpuName: string | null;
  h264Nvenc: boolean;
  hevcNvenc: boolean;
  telemetry: {
    utilizationPercent: number;
    memoryUsedMiB: number;
    memoryTotalMiB: number;
    temperatureCelsius: number;
  } | null;
  cpuProfile: {
    preset: string;
    totalThreads: number;
    filterThreads: number;
    threadsPerRendition: number;
    maxHeight: number;
    maxRenditions: number;
  } | null;
  maxConcurrent: number;
  running: number;
  queued: number;
  sessionId: string | null;
  updatedAt: string | null;
  lastError: string | null;
};

const heartbeatMaxAgeMs = 90_000;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function resolveTranscoderStatus(
  value: unknown,
  jobs: { running: number; queued: number },
  now = new Date(),
): TranscoderRuntimeStatus {
  const status = record(value);
  const capabilities = record(status.capabilities);
  const rawTelemetry = record(status.telemetry);
  const rawCpuProfile = record(status.cpuProfile);
  const updatedAt = text(status.updatedAt);
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const stale = !Number.isFinite(updatedAtMs)
    || updatedAtMs > now.getTime() + 5_000
    || now.getTime() - updatedAtMs > heartbeatMaxAgeMs;
  const backend = status.backend === 'nvenc' || status.backend === 'software'
    ? status.backend
    : null;
  const telemetryValues = {
    utilizationPercent: finiteNumber(rawTelemetry.utilizationPercent),
    memoryUsedMiB: finiteNumber(rawTelemetry.memoryUsedMiB),
    memoryTotalMiB: finiteNumber(rawTelemetry.memoryTotalMiB),
    temperatureCelsius: finiteNumber(rawTelemetry.temperatureCelsius),
  };
  const telemetry = Object.values(telemetryValues).every((entry) => entry !== null)
    ? telemetryValues as TranscoderRuntimeStatus['telemetry']
    : null;
  const cpuValues = {
    preset: text(rawCpuProfile.preset),
    totalThreads: finiteNumber(rawCpuProfile.totalThreads),
    filterThreads: finiteNumber(rawCpuProfile.filterThreads),
    threadsPerRendition: finiteNumber(rawCpuProfile.threadsPerRendition),
    maxHeight: finiteNumber(rawCpuProfile.maxHeight),
    maxRenditions: finiteNumber(rawCpuProfile.maxRenditions),
  };
  const cpuProfile = Object.values(cpuValues).every((entry) => entry !== null)
    ? cpuValues as TranscoderRuntimeStatus['cpuProfile']
    : null;

  return {
    state: stale ? 'offline' : text(status.state) ?? 'idle',
    available: !stale,
    stale,
    backend,
    encoder: text(status.encoder),
    gpuName: text(capabilities.gpuName),
    h264Nvenc: capabilities.h264 === true,
    hevcNvenc: capabilities.hevc === true,
    telemetry,
    cpuProfile,
    maxConcurrent: Math.max(1, Math.trunc(finiteNumber(status.maxConcurrent) ?? 1)),
    running: Math.max(0, jobs.running),
    queued: Math.max(0, jobs.queued),
    sessionId: text(status.sessionId),
    updatedAt,
    lastError: text(status.lastError),
  };
}
