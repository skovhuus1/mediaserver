export type LiveTvSourceCandidate = {
  sourceId: string;
  connectionId: string;
  providerId: string;
  streamFormat: string;
  sourcePriority: number;
  connectionPriority: number;
  providerPriority: number;
  connectionLimit: number;
  providerUserLimit: number;
};

export type LiveTvPlaybackRights = {
  allowDirectPlay: boolean;
  allowDirectStream: boolean;
  allowVideoTranscode: boolean;
};

export type LiveTvMethod = 'direct_play' | 'direct_stream' | 'transcode';

export function chooseLiveTvMethod(
  format: string,
  rights: LiveTvPlaybackRights,
  preferred: string = 'auto',
): LiveTvMethod | null {
  const hls = format === 'hls';
  const allowed = (method: LiveTvMethod) => method === 'direct_play'
    ? hls && rights.allowDirectPlay
    : method === 'direct_stream'
      ? rights.allowDirectStream
      : rights.allowVideoTranscode;
  if (preferred !== 'auto') return allowed(preferred as LiveTvMethod) ? preferred as LiveTvMethod : null;
  if (allowed('direct_play')) return 'direct_play';
  if (allowed('direct_stream')) return 'direct_stream';
  if (allowed('transcode')) return 'transcode';
  return null;
}

export function selectLiveTvSource(
  candidates: readonly LiveTvSourceCandidate[],
  activeByConnection: ReadonlyMap<string, number>,
  activeByProviderForUser: ReadonlyMap<string, number>,
): LiveTvSourceCandidate | null {
  return [...candidates]
    .sort((left, right) => left.providerPriority - right.providerPriority
      || left.connectionPriority - right.connectionPriority
      || left.sourcePriority - right.sourcePriority
      || left.sourceId.localeCompare(right.sourceId))
    .find((candidate) => (activeByConnection.get(candidate.connectionId) ?? 0) < candidate.connectionLimit
      && (activeByProviderForUser.get(candidate.providerId) ?? 0) < candidate.providerUserLimit) ?? null;
}
