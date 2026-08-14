export const CPU_TRANSCODE_PRESETS = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
] as const;

export type CpuTranscodePreset = typeof CPU_TRANSCODE_PRESETS[number];

export type CpuTranscodeProfile = {
  preset: CpuTranscodePreset;
  totalThreads: number;
  filterThreads: number;
  threadsPerRendition: number;
  maxHeight: number;
  maxRenditions: number;
};

export function resolveCpuTranscodeProfile(input: {
  availableThreads: number;
  renditionCount: number;
  configuredThreads?: string | number | null | undefined;
  configuredRenditions?: string | number | null | undefined;
  configuredPreset?: string | null | undefined;
  configuredMaxHeight?: string | number | null | undefined;
}): CpuTranscodeProfile {
  const availableThreads = clamp(integer(input.availableThreads) ?? 1, 1, 256);
  const configuredThreads = integer(input.configuredThreads);
  const totalThreads = clamp(
    configuredThreads && configuredThreads > 0
      ? configuredThreads
      : Math.max(1, availableThreads - 1),
    1,
    Math.min(32, availableThreads),
  );
  const configuredRenditions = integer(input.configuredRenditions);
  const maxRenditions = clamp(
    configuredRenditions && configuredRenditions > 0
      ? configuredRenditions
      : Math.max(1, Math.floor(totalThreads / 2)),
    1,
    4,
  );
  const renditionCount = clamp(integer(input.renditionCount) ?? 1, 1, maxRenditions);
  const filterThreads = clamp(Math.floor(totalThreads / 4), 1, 4);
  const threadsPerRendition = Math.max(
    1,
    Math.floor(Math.max(1, totalThreads - filterThreads) / renditionCount),
  );
  const configuredPreset = input.configuredPreset?.trim().toLowerCase();
  const preset = CPU_TRANSCODE_PRESETS.includes(configuredPreset as CpuTranscodePreset)
    ? configuredPreset as CpuTranscodePreset
    : 'veryfast';

  return {
    preset,
    totalThreads,
    filterThreads,
    threadsPerRendition,
    maxHeight: clamp(integer(input.configuredMaxHeight) ?? 1080, 360, 2160),
    maxRenditions,
  };
}

function integer(value: string | number | null | undefined): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value?.trim() ?? '', 10);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
