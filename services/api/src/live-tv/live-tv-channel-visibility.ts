export interface LiveTvChannelVisibilityRow {
  id: string;
  enabled: boolean;
}

export const LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS = {
  maxWait: 15_000,
  timeout: 120_000,
} as const;

export function uniqueChannelIds(channelIds: string[]): string[] {
  return [...new Set(channelIds)];
}

export function changedChannelIds(channels: LiveTvChannelVisibilityRow[], enabled: boolean): string[] {
  return channels.filter((channel) => channel.enabled !== enabled).map((channel) => channel.id);
}
