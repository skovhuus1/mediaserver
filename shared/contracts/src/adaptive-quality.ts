export type QualityMode = 'auto' | 'fixed' | 'original';
export type HdrMode = 'auto' | 'prefer_hdr' | 'force_sdr';

export type AdaptiveQualityInput = {
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceBitrate: number | null;
  sourceHdr: boolean;
  planMaxHeight: number;
  planMaxBitrate: number;
  serverMaxHeight?: number;
  serverMaxRenditions?: number;
  screenHeight?: number | null;
  devicePixelRatio?: number | null;
  estimatedDownlinkMbps?: number | null;
  qualityMode: QualityMode;
  fixedQualityHeight?: number | null;
  allowUpscale: boolean;
  upscaleMode?: 'off' | 'server' | 'device';
  dataSaver: boolean;
  hdrMode: HdrMode;
};

export type AdaptiveRendition = {
  name: string;
  width: number;
  height: number;
  bitrate: number;
  bandwidth: number;
  upscaled: boolean;
  hdr: boolean;
};

export type AdaptiveQualityPlan = {
  mode: QualityMode;
  effectiveMaxHeight: number;
  effectiveMaxBitrate: number;
  estimatedBandwidth: number | null;
  renditions: AdaptiveRendition[];
};

const LEVELS = [
  { height: 360, bitrate: 800_000 },
  { height: 480, bitrate: 1_400_000 },
  { height: 720, bitrate: 3_000_000 },
  { height: 1080, bitrate: 6_000_000 },
  { height: 1440, bitrate: 10_000_000 },
  { height: 2160, bitrate: 20_000_000 },
] as const;

export function buildAdaptiveQualityPlan(
  input: AdaptiveQualityInput,
): AdaptiveQualityPlan {
  const sourceHeight = positive(input.sourceHeight) ?? 1080;
  const sourceWidth = positive(input.sourceWidth) ?? Math.round(sourceHeight * 16 / 9);
  const physicalScreenHeight =
    positive(input.screenHeight) && positive(input.devicePixelRatio)
      ? Math.round(input.screenHeight! * input.devicePixelRatio!)
      : null;
  const fixedHeight =
    input.qualityMode === 'fixed'
      ? positive(input.fixedQualityHeight) ?? input.planMaxHeight
      : Number.POSITIVE_INFINITY;
  const screenCap =
    input.qualityMode === 'original'
      ? sourceHeight
      : physicalScreenHeight ?? Number.POSITIVE_INFINITY;
  const upscaleCap =
    input.upscaleMode === 'device' || input.upscaleMode === 'off' || !input.allowUpscale
      ? sourceHeight
      : Number.POSITIVE_INFINITY;
  const dataCap = input.dataSaver ? 720 : Number.POSITIVE_INFINITY;
  const effectiveMaxHeight = Math.max(
    360,
    Math.min(
      input.planMaxHeight,
      input.serverMaxHeight ?? 2160,
      screenCap,
      fixedHeight,
      upscaleCap,
      dataCap,
    ),
  );
  const effectiveMaxBitrate = Math.max(
    800_000,
    Math.min(
      input.planMaxBitrate,
      input.dataSaver ? 3_000_000 : Number.POSITIVE_INFINITY,
    ),
  );
  const hdr = input.sourceHdr && input.hdrMode !== 'force_sdr';

  let levels = LEVELS.filter((level) => level.height <= effectiveMaxHeight);
  if (levels.length === 0) levels = [LEVELS[0]];
  if (input.qualityMode === 'original') {
    const nearest =
      [...LEVELS].reverse().find((level) => level.height <= sourceHeight) ?? LEVELS[0];
    levels = [nearest];
  }
  const maximumRenditions = Number.isFinite(input.serverMaxRenditions)
    ? Math.max(1, Math.min(4, Math.trunc(input.serverMaxRenditions!)))
    : 4;
  levels = evenlyDistributed(levels, maximumRenditions);

  return {
    mode: input.qualityMode,
    effectiveMaxHeight,
    effectiveMaxBitrate,
    estimatedBandwidth: positive(input.estimatedDownlinkMbps)
      ? Math.round(input.estimatedDownlinkMbps! * 1_000_000)
      : null,
    renditions: levels.map((level) => {
      const height = level.height;
      const width = even(Math.round(sourceWidth * height / sourceHeight));
      const bitrate = Math.min(level.bitrate, effectiveMaxBitrate);
      return {
        name: height === 2160 ? '4K' : `${height}p`,
        width,
        height,
        bitrate,
        bandwidth: Math.round(bitrate * 1.08),
        upscaled: height > sourceHeight,
        hdr,
      };
    }),
  };
}

function evenlyDistributed<T>(items: readonly T[], maximum: number): T[] {
  if (items.length <= maximum) return [...items];
  const indexes = new Set<number>([0, items.length - 1]);
  for (let slot = 1; slot < maximum - 1; slot += 1) {
    indexes.add(Math.round((slot * (items.length - 1)) / (maximum - 1)));
  }
  return [...indexes].sort((left, right) => left - right).map((index) => items[index]!);
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function even(value: number) {
  return value % 2 === 0 ? value : value - 1;
}
