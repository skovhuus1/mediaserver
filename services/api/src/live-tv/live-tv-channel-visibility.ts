export interface LiveTvChannelVisibilityRow {
  id: string;
  enabled: boolean;
}

export function uniqueChannelIds(channelIds: string[]): string[] {
  return [...new Set(channelIds)];
}

export function changedChannelIds(channels: LiveTvChannelVisibilityRow[], enabled: boolean): string[] {
  return channels.filter((channel) => channel.enabled !== enabled).map((channel) => channel.id);
}
