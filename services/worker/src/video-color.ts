export type VideoColorPipeline = {
  filter: string;
  outputPixelFormat: 'p010le' | 'yuv420p';
  toneMappedToSdr: boolean;
};

type ResolveVideoColorPipelineInput = {
  sourceIsHdr: boolean;
  preserveHdr: boolean;
  inputLabel?: string;
  outputLabel?: string;
};

const SOFTWARE_HDR_TO_SDR_FILTER = [
  'zscale=t=linear:npl=100',
  'format=gbrpf32le',
  'zscale=p=bt709',
  'tonemap=tonemap=hable:desat=0',
  'zscale=t=bt709:m=bt709:r=tv',
  'format=yuv420p',
].join(',');

export function resolveVideoColorPipeline(
  input: ResolveVideoColorPipelineInput,
): VideoColorPipeline {
  const inputLabel = input.inputLabel ?? 'subtitlePrepared';
  const outputLabel = input.outputLabel ?? 'prepared';
  const toneMappedToSdr = input.sourceIsHdr && !input.preserveHdr;

  return {
    filter: toneMappedToSdr
      ? `[${inputLabel}]${SOFTWARE_HDR_TO_SDR_FILTER}[${outputLabel}]`
      : `[${inputLabel}]null[${outputLabel}]`,
    outputPixelFormat: input.preserveHdr ? 'p010le' : 'yuv420p',
    toneMappedToSdr,
  };
}

export function buildSdrColorMetadataArguments(
  streamIndex: number,
  toneMappedToSdr: boolean,
): string[] {
  if (!toneMappedToSdr) return [];

  return [
    `-color_primaries:v:${streamIndex}`, 'bt709',
    `-color_trc:v:${streamIndex}`, 'bt709',
    `-colorspace:v:${streamIndex}`, 'bt709',
    `-color_range:v:${streamIndex}`, 'tv',
  ];
}
