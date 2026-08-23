import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LiveTvRecordingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveTvRecordingSchedulerService.name);
  private readonly intervalSeconds = Math.max(5, Math.min(60, Number.parseInt(process.env.BB_MEDIA_LIVE_TV_RECORDING_SCHEDULER_SECONDS ?? '15', 10) || 15));
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runCycle().catch((error) => this.logger.error(error instanceof Error ? error.stack : String(error))), this.intervalSeconds * 1_000);
    this.timer.unref();
    void this.runCycle().catch((error) => this.logger.error(error instanceof Error ? error.stack : String(error)));
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const candidates = await this.prisma.liveTvRecording.findMany({ where: { status: { in: ['scheduled', 'queued'] }, startsAt: { lte: new Date(now.getTime() + 10 * 60_000) } }, distinct: ['accountId'], select: { accountId: true } });
      for (const { accountId } of candidates) await this.runAccount(accountId, now);
    } finally { this.running = false; }
  }

  private async runAccount(accountId: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('bbmedia:live-tv-recording-scheduler'), hashtext(CAST(${accountId} AS text))) AS acquired`;
      if (!rows[0]?.acquired) return;
      const recordings = await tx.liveTvRecording.findMany({ where: { accountId, status: { in: ['scheduled', 'queued'] }, startsAt: { lte: new Date(now.getTime() + 10 * 60_000) } }, orderBy: { startsAt: 'asc' } });
      for (const recording of recordings) {
        const effectiveEnd = new Date(recording.endsAt.getTime() + recording.postPaddingSeconds * 1_000);
        if (effectiveEnd <= now) {
          await tx.liveTvRecording.update({ where: { id: recording.id }, data: { status: 'missed', error: 'Optagelsesvinduet udløb, før en worker kunne starte det', recordingEndedAt: now } });
          continue;
        }
        const effectiveStart = new Date(recording.startsAt.getTime() - recording.prePaddingSeconds * 1_000);
        if (effectiveStart > now || recording.jobId) continue;
        const job = await tx.systemJob.create({ data: { accountId, type: 'live-tv.record', status: 'queued', maxAttempts: 3, payload: { recordingId: recording.id } } });
        await tx.liveTvRecording.update({ where: { id: recording.id }, data: { status: 'queued', jobId: job.id, error: null } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
