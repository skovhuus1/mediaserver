import { Prisma, type PrismaClient, type SystemJob } from '@prisma/client';
import { updateJobProgress } from './job-progress.js';

export const LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS = {
  maxWait: 15_000,
  timeout: 120_000,
} as const;

type VisibilityPayload = {
  scope: 'all' | 'group';
  action: 'show' | 'hide';
  groupName: string | null;
  requestedBy: string | null;
};

export async function processLiveTvChannelVisibilityJob(
  prisma: PrismaClient,
  job: SystemJob,
  renew: () => Promise<void>,
) {
  const payload = parseVisibilityPayload(job.payload);
  const startedAt = Date.now();
  await renew();
  await updateJobProgress(prisma, job, {
    stage: 'Forbereder kanalændring', percent: 5,
    message: payload.scope === 'group' ? payload.groupName : 'Hele kataloget',
  });

  let renewalFailure: unknown = null;
  let renewal = Promise.resolve();
  const renewalTimer = setInterval(() => {
    renewal = renewal.then(renew).catch((error: unknown) => { renewalFailure ??= error; });
  }, 20_000);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const channelWhere: Prisma.LiveTvChannelWhereInput = {
        accountId: job.accountId,
        ...(payload.scope === 'group'
          ? { groupName: { equals: payload.groupName ?? '', mode: 'insensitive' } }
          : {}),
      };
      const relationScope = payload.scope === 'group'
        ? { channel: { groupName: { equals: payload.groupName ?? '', mode: 'insensitive' as const } } }
        : {};
      const enabled = payload.action === 'show';
      const now = new Date();
      const matchedCount = await tx.liveTvChannel.count({ where: channelWhere });
      const changedCount = (await tx.liveTvChannel.updateMany({
        where: { ...channelWhere, enabled: !enabled },
        data: { enabled },
      })).count;
      await assertJobActive(tx, job);

      let releasedStreams = 0;
      let cancelledRecordings = 0;
      if (!enabled && changedCount > 0) {
        const activeLeases = await tx.liveTvLease.findMany({
          where: {
            accountId: job.accountId,
            status: { in: ['preparing', 'ready', 'active'] },
            leaseExpiresAt: { gt: now },
            ...relationScope,
          },
          select: { id: true, jobId: true },
        });
        const activeRecordings = await tx.liveTvRecording.findMany({
          where: {
            accountId: job.accountId,
            status: { in: ['scheduled', 'queued', 'recording'] },
            ...relationScope,
          },
          select: { id: true, jobId: true },
        });
        await assertJobActive(tx, job);

        if (activeLeases.length > 0) {
          releasedStreams = (await tx.liveTvLease.updateMany({
            where: { id: { in: activeLeases.map((lease) => lease.id) } },
            data: {
              status: 'released', runtimeState: 'channel_hidden', endedAt: now,
              leaseExpiresAt: now, lastError: 'channel_hidden_by_admin',
            },
          })).count;
        }
        if (activeRecordings.length > 0) {
          cancelledRecordings = (await tx.liveTvRecording.updateMany({
            where: { id: { in: activeRecordings.map((recording) => recording.id) } },
            data: {
              status: 'cancelled', error: 'Kanalen blev skjult af administratoren', recordingEndedAt: now,
            },
          })).count;
        }
        const jobIds = [...new Set([...activeLeases, ...activeRecordings]
          .flatMap((item) => item.jobId ? [item.jobId] : []))];
        if (jobIds.length > 0) {
          await tx.systemJob.updateMany({
            where: { accountId: job.accountId, id: { in: jobIds }, status: { in: ['queued', 'running'] } },
            data: { status: 'cancelled', leaseExpiresAt: now },
          });
        }
      }
      await assertJobActive(tx, job);
      const auditAction = payload.scope === 'all'
        ? 'live_tv.channel.all_visibility'
        : 'live_tv.channel.group_visibility';
      await tx.auditLog.create({ data: {
        accountId: job.accountId,
        userId: payload.requestedBy,
        action: auditAction,
        outcome: 'success',
        code: payload.action,
        details: {
          scope: payload.scope, groupName: payload.groupName,
          matchedCount, changedCount, releasedStreams, cancelledRecordings,
        },
      } });
      return {
        scope: payload.scope,
        groupName: payload.groupName,
        action: payload.action,
        matchedCount,
        changedCount,
        releasedStreams,
        cancelledRecordings,
        auditAction,
      };
    }, LIVE_TV_VISIBILITY_TRANSACTION_OPTIONS);

    await renewal;
    if (renewalFailure) throw renewalFailure;
    const durationMs = Date.now() - startedAt;
    job.payload = {
      ...(job.payload as Prisma.JsonObject),
      result: { ...result, durationMs },
    };
    await updateJobProgress(prisma, job, {
      stage: 'Færdig', percent: 100, current: result.changedCount, total: result.matchedCount,
      message: `${result.changedCount.toLocaleString('da-DK')} af ${result.matchedCount.toLocaleString('da-DK')} kanaler ændret`,
    });
    return { ...result, durationMs };
  } finally {
    clearInterval(renewalTimer);
    await renewal;
  }
}

export function parseVisibilityPayload(value: Prisma.JsonValue): VisibilityPayload {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
  const scope = payload.scope === 'all' || payload.scope === 'group' ? payload.scope : null;
  const action = payload.action === 'show' || payload.action === 'hide' ? payload.action : null;
  const groupName = typeof payload.groupName === 'string' ? payload.groupName.trim() : null;
  if (!scope || !action || (scope === 'group' && !groupName)) {
    throw new Error('live-tv.channel-visibility payload is invalid');
  }
  return {
    scope,
    action,
    groupName: scope === 'group' ? groupName : null,
    requestedBy: typeof payload.requestedBy === 'string' ? payload.requestedBy : null,
  };
}

async function assertJobActive(tx: Prisma.TransactionClient, job: SystemJob) {
  const active = await tx.systemJob.count({
    where: { id: job.id, accountId: job.accountId, status: 'running', workerId: job.workerId },
  });
  if (active !== 1) throw new Error('Live TV-kanalopgaven blev annulleret');
}
