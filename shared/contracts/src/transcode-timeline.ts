export type AccurateTranscodeSeek = {
  inputSeekSeconds: number;
  outputSeekSeconds: number;
  timelineOffsetSeconds: number;
};

export function resolveAccurateTranscodeSeek(
  startPositionMs: number,
  decodeWindowMs = 10_000,
): AccurateTranscodeSeek {
  const requestedMs = Math.max(0, Math.floor(startPositionMs));
  const inputSeekMs = Math.max(0, requestedMs - Math.max(0, Math.floor(decodeWindowMs)));
  return {
    inputSeekSeconds: inputSeekMs / 1_000,
    outputSeekSeconds: (requestedMs - inputSeekMs) / 1_000,
    timelineOffsetSeconds: requestedMs / 1_000,
  };
}
