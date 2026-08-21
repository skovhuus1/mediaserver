import { Prisma, type PrismaClient } from '@prisma/client';

export type WorkerProgress = { stage: string; percent?: number | null; current?: number | null; total?: number | null; message?: string | null };

export function withJobProgress(payloadValue: unknown, progress: WorkerProgress): Prisma.InputJsonValue {
  const payload = payloadValue !== null && typeof payloadValue === 'object' && !Array.isArray(payloadValue) ? payloadValue as Record<string, unknown> : {};
  return { ...payload, progress: { stage: progress.stage, percent: progress.percent ?? null, current: progress.current ?? null, total: progress.total ?? null, message: progress.message ?? null, updatedAt: new Date().toISOString() } } as Prisma.InputJsonValue;
}

export async function updateJobProgress(prisma: PrismaClient, job: { id: string; accountId: string; payload: Prisma.JsonValue }, progress: WorkerProgress): Promise<void> {
  const payload = withJobProgress(job.payload, progress);
  const updated = await prisma.systemJob.updateMany({ where: { id: job.id, accountId: job.accountId, status: 'running' }, data: { payload } });
  if (updated.count === 1) job.payload = payload as Prisma.JsonValue;
}
