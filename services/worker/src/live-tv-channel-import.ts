import { LIVE_TV_CANONICAL_KEY_PREFIX, describeLiveTvChannel } from '@boltbytes/contracts';
import { Prisma, type PrismaClient } from '@prisma/client';

type ImportChannel = {
  id: string;
  canonicalKey: string;
  tvgId: string | null;
  name: string;
  number: number | null;
  logoUrl: string | null;
  groupName: string | null;
  metadataLocked: boolean;
  createdAt: Date;
};

export type LiveTvChannelImportIndex = {
  canonical: Map<string, ImportChannel>;
  legacy: Map<string, ImportChannel[]>;
  removed: Set<string>;
};

export type LiveTvImportEntry = {
  name: string;
  tvgName: string | null;
  tvgId: string | null;
  channelNumber: number | null;
  logoUrl: string | null;
  groupName: string | null;
};

export async function loadLiveTvChannelImportIndex(prisma: PrismaClient, accountId: string): Promise<LiveTvChannelImportIndex> {
  const channels = await prisma.liveTvChannel.findMany({
    where: { accountId },
    select: {
      id: true, canonicalKey: true, tvgId: true, name: true, number: true, logoUrl: true,
      groupName: true, metadataLocked: true, createdAt: true,
      sources: { select: { sourceName: true } },
    },
  });
  const index: LiveTvChannelImportIndex = { canonical: new Map(), legacy: new Map(), removed: new Set() };
  for (const channel of channels) {
    if (channel.canonicalKey.startsWith(LIVE_TV_CANONICAL_KEY_PREFIX)) {
      index.canonical.set(channel.canonicalKey, channel);
      continue;
    }
    const sourceName = channel.sources[0]?.sourceName ?? channel.name;
    const key = describeLiveTvChannel({ name: sourceName, tvgId: channel.tvgId }).canonicalKey;
    index.legacy.set(key, [...(index.legacy.get(key) ?? []), channel]);
  }
  return index;
}

export async function resolveLiveTvImportChannel(
  prisma: PrismaClient,
  accountId: string,
  index: LiveTvChannelImportIndex,
  entry: LiveTvImportEntry,
) {
  const descriptor = describeLiveTvChannel(entry);
  let channel = index.canonical.get(descriptor.canonicalKey) ?? null;
  const legacy = (index.legacy.get(descriptor.canonicalKey) ?? [])
    .filter((candidate) => !index.removed.has(candidate.id) && candidate.id !== channel?.id)
    .sort((left, right) => Number(right.metadataLocked) - Number(left.metadataLocked)
      || left.createdAt.getTime() - right.createdAt.getTime()
      || left.id.localeCompare(right.id));

  if (!channel && legacy[0]) {
    const candidate = legacy[0];
    try {
      channel = await prisma.liveTvChannel.update({ where: { id: candidate.id }, data: { canonicalKey: descriptor.canonicalKey } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      channel = await prisma.liveTvChannel.findUnique({ where: { accountId_canonicalKey: { accountId, canonicalKey: descriptor.canonicalKey } } });
      if (!channel) throw error;
    }
  }

  if (!channel) {
    channel = await prisma.liveTvChannel.upsert({
      where: { accountId_canonicalKey: { accountId, canonicalKey: descriptor.canonicalKey } },
      create: {
        accountId, canonicalKey: descriptor.canonicalKey, tvgId: entry.tvgId,
        name: descriptor.displayName, number: entry.channelNumber, logoUrl: entry.logoUrl, groupName: entry.groupName,
      },
      update: {},
    });
  }

  index.canonical.set(descriptor.canonicalKey, channel);
  for (const duplicate of legacy) {
    if (duplicate.id === channel.id || index.removed.has(duplicate.id)) continue;
    await mergeImportedLiveTvChannel(prisma, accountId, channel.id, duplicate.id);
    index.removed.add(duplicate.id);
  }
  return { channel, descriptor };
}

export function rememberLiveTvImportChannel(index: LiveTvChannelImportIndex, channel: ImportChannel) {
  index.canonical.set(channel.canonicalKey, channel);
}

async function mergeImportedLiveTvChannel(prisma: PrismaClient, accountId: string, targetChannelId: string, sourceChannelId: string) {
  await prisma.$transaction(async (tx) => {
    const source = await tx.liveTvChannel.findFirst({ where: { id: sourceChannelId, accountId }, select: { id: true } });
    if (!source) return;
    const favorites = await tx.liveTvFavorite.findMany({ where: { accountId, channelId: sourceChannelId } });
    for (const favorite of favorites) {
      await tx.liveTvFavorite.upsert({
        where: { profileId_channelId: { profileId: favorite.profileId, channelId: targetChannelId } },
        create: { accountId, profileId: favorite.profileId, channelId: targetChannelId },
        update: {},
      });
    }
    await tx.liveTvFavorite.deleteMany({ where: { accountId, channelId: sourceChannelId } });
    await tx.liveTvLease.updateMany({ where: { accountId, channelId: sourceChannelId }, data: { channelId: targetChannelId } });
    await tx.liveTvRecording.updateMany({ where: { accountId, channelId: sourceChannelId }, data: { channelId: targetChannelId } });
    await tx.liveTvProgram.deleteMany({ where: { accountId, channelId: sourceChannelId } });
    await tx.liveTvChannelSource.updateMany({ where: { channelId: sourceChannelId }, data: { channelId: targetChannelId } });
    await tx.liveTvChannel.delete({ where: { id: sourceChannelId } });
    await tx.auditLog.create({ data: {
      accountId, action: 'live_tv.channel.auto_merge', outcome: 'success', code: targetChannelId,
      details: { sourceChannelId, reason: 'canonical_quality_variant' },
    } });
  });
}
