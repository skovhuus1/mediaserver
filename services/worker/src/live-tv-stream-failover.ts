import { liveTvConnectionHealthRank } from '@boltbytes/contracts';
import { Prisma, type PrismaClient, type SystemJob } from '@prisma/client';
import { runLiveTvStream } from './live-tv.js';

type ClaimedJob = SystemJob & { attemptNumber: number };
const activeStatuses = ['preparing', 'ready', 'active'];
const recoverableStatuses = [...activeStatuses, 'failed'];

export async function processLiveTvStreamJobWithFailover(prisma: PrismaClient, job: ClaimedJob, transcodeRoot: string, renewLease: () => Promise<void>) {
  try { await runLiveTvStream(prisma, job, transcodeRoot, renewLease); }
  catch (error) {
    const leaseId = objectValue(job.payload).leaseId;
    if (typeof leaseId === 'string') await selectFailoverSource(prisma, leaseId, job, error);
    throw error;
  }
}

async function selectFailoverSource(prisma: PrismaClient, leaseId: string, job: ClaimedJob, failure: unknown) {
  const message = failure instanceof Error ? failure.message : String(failure);
  await prisma.$transaction(async (tx) => {
    const initial = await tx.liveTvLease.findFirst({ where: { id: leaseId, jobId: job.id, status: { in: recoverableStatuses } } });
    if (!initial) return;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bbmedia:live-tv-pool'), hashtext(CAST(${initial.accountId} AS text)))::text AS lock_result`;
    const lease = await tx.liveTvLease.findFirst({ where: { id: initial.id, jobId: job.id, status: { in: recoverableStatuses } } });
    if (!lease) return;
    const attemptedSourceIds = [...new Set([...stringArray(objectValue(job.payload).failedSourceIds), lease.sourceId])];
    await tx.systemJob.updateMany({ where: { id: job.id }, data: { payload: {
      ...objectValue(job.payload), failedSourceIds: attemptedSourceIds,
    } as Prisma.InputJsonValue } });
    await tx.liveTvConnection.updateMany({ where: { id: lease.connectionId }, data: { healthStatus: 'failed', lastError: message.slice(0, 2_000) } });
    if (job.attemptNumber >= job.maxAttempts) return;
    const sources = await tx.liveTvChannelSource.findMany({ where: { channelId: lease.channelId, id: { notIn: attemptedSourceIds }, enabled: true, connection: { enabled: true, provider: { enabled: true } } }, include: { connection: { include: { provider: { include: { connections: { select: { id: true } } } } } } } });
    const ordered = sources.sort((left, right) => liveTvConnectionHealthRank(left.connection.healthStatus) - liveTvConnectionHealthRank(right.connection.healthStatus)
      || left.qualityRank - right.qualityRank || left.connection.provider.priority - right.connection.provider.priority
      || left.connection.priority - right.connection.priority || left.priority - right.priority);
    for (const source of ordered) {
      const providerConnections = source.connection.provider.connections.map((connection) => connection.id);
      const [connectionLeases, connectionRecordings, userLeases, userRecordings] = await Promise.all([
        tx.liveTvLease.count({ where: { connectionId: source.connectionId, id: { not: lease.id }, status: { in: activeStatuses }, leaseExpiresAt: { gt: new Date() } } }),
        tx.liveTvRecording.count({ where: { connectionId: source.connectionId, status: 'recording' } }),
        tx.liveTvLease.count({ where: { userId: lease.userId, id: { not: lease.id }, connectionId: { in: providerConnections }, status: { in: activeStatuses }, leaseExpiresAt: { gt: new Date() } } }),
        tx.liveTvRecording.count({ where: { userId: lease.userId, connectionId: { in: providerConnections }, status: 'recording' } }),
      ]);
      if (connectionLeases + connectionRecordings >= source.connection.maxConcurrentStreams) continue;
      if (userLeases + userRecordings >= source.connection.provider.perUserStreamLimit) continue;
      await tx.liveTvLease.update({ where: { id: lease.id }, data: { sourceId: source.id, connectionId: source.connectionId, status: 'preparing', runtimeState: 'failover', lastError: `Kilden fejlede; skifter til ${source.qualityLabel.toUpperCase()} via ${source.connection.name}` } });
      return;
    }
    await tx.liveTvLease.update({ where: { id: lease.id }, data: { lastError: `Ingen failover-kilde er ledig: ${message}` } });
  });
}

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
