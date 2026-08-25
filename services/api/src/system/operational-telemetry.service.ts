import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { PrismaService } from '../prisma/prisma.service';
import { downsampleMetricPoints, operationalAlertCandidates, telemetryRangeMilliseconds, type MetricPoint } from './operational-telemetry';

type CpuSnapshot = { idle: number; total: number };
type MetricRow = {
  sampledAt: Date; cpuPercent: number; memoryPercent: number; diskUsedPercent: number;
  activeSessions: number; bufferingSessions: number; queuedJobs: number; failedAttempts1h: number;
};

function cpuSnapshot(): CpuSnapshot {
  return cpus().reduce((result, cpu) => {
    const times = Object.values(cpu.times);
    return { idle: result.idle + cpu.times.idle, total: result.total + times.reduce((sum, value) => sum + value, 0) };
  }, { idle: 0, total: 0 });
}

@Injectable()
export class OperationalTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationalTelemetryService.name);
  private previousCpu = cpuSnapshot();
  private timer?: NodeJS.Timeout;
  private sampling = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const initial = setTimeout(() => void this.sampleAllAccounts(), 10_000);
    initial.unref();
    this.timer = setInterval(() => void this.sampleAllAccounts(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sampleAllAccounts() {
    if (this.sampling) return;
    this.sampling = true;
    try {
      const accounts = await this.prisma.account.findMany({ select: { id: true } });
      for (const account of accounts) await this.sampleAccount(account.id).catch((error) => this.logger.warn(`Telemetry sample failed for ${account.id}: ${error instanceof Error ? error.message : String(error)}`));
      await this.prisma.$executeRaw`DELETE FROM "system_metric_samples" WHERE "sampled_at" < NOW() - INTERVAL '30 days'`;
      await this.prisma.$executeRaw`DELETE FROM "system_alert_events" WHERE "status" = 'resolved' AND "resolved_at" < NOW() - INTERVAL '90 days'`;
    } finally {
      this.sampling = false;
    }
  }

  private async sampleAccount(accountId: string) {
    const now = new Date();
    const currentCpu = cpuSnapshot();
    const totalDelta = currentCpu.total - this.previousCpu.total;
    const idleDelta = currentCpu.idle - this.previousCpu.idle;
    this.previousCpu = currentCpu;
    const memoryTotalBytes = totalmem();
    const memoryUsedBytes = Math.max(0, memoryTotalBytes - freemem());
    const disk = await statfs('/');
    const diskTotal = Number(disk.blocks) * Number(disk.bsize);
    const diskFree = Number(disk.bavail) * Number(disk.bsize);
    const since = new Date(now.getTime() - 3_600_000);
    const [vodActive, liveActive, vodBuffering, liveBuffering, queuedJobs, failedAttempts1h] = await Promise.all([
      this.prisma.playbackSession.count({ where: { accountId, status: { in: ['reserving', 'active', 'paused'] } } }),
      this.prisma.liveTvLease.count({ where: { accountId, status: { in: ['preparing', 'ready', 'active'] }, leaseExpiresAt: { gt: now } } }),
      this.prisma.playbackSession.count({ where: { accountId, runtimeState: 'buffering', status: { in: ['active', 'paused'] } } }),
      this.prisma.liveTvLease.count({ where: { accountId, runtimeState: 'buffering', status: { in: ['ready', 'active'] } } }),
      this.prisma.systemJob.count({ where: { accountId, status: 'queued' } }),
      this.prisma.jobAttempt.count({ where: { job: { accountId }, status: 'failed', startedAt: { gte: since } } }),
    ]);
    const point: MetricPoint = {
      sampledAt: now.toISOString(),
      cpuPercent: totalDelta > 0 ? Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100)) : 0,
      memoryPercent: memoryTotalBytes > 0 ? (memoryUsedBytes / memoryTotalBytes) * 100 : 0,
      diskUsedPercent: diskTotal > 0 ? ((diskTotal - diskFree) / diskTotal) * 100 : 0,
      activeSessions: vodActive + liveActive,
      bufferingSessions: vodBuffering + liveBuffering,
      queuedJobs,
      failedAttempts1h,
    };
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "system_metric_samples" (
        "id", "account_id", "sampled_at", "cpu_percent", "memory_percent", "memory_used_bytes", "memory_total_bytes",
        "load_1m", "disk_used_percent", "disk_free_bytes", "active_sessions", "buffering_sessions", "queued_jobs", "failed_attempts_1h"
      ) VALUES (
        ${randomUUID()}::uuid, ${accountId}, ${now}, ${point.cpuPercent}, ${point.memoryPercent}, ${BigInt(memoryUsedBytes)}, ${BigInt(memoryTotalBytes)},
        ${loadavg()[0]}, ${point.diskUsedPercent}, ${BigInt(Math.max(0, diskFree))}, ${point.activeSessions}, ${point.bufferingSessions}, ${queuedJobs}, ${failedAttempts1h}
      )
    `);
    await this.syncAlerts(accountId, point);
  }

  private async syncAlerts(accountId: string, point: MetricPoint) {
    const candidates = operationalAlertCandidates(point);
    const activeKeys = candidates.map((candidate) => candidate.key);
    for (const candidate of candidates) {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "system_alert_events" ("id", "account_id", "alert_key", "severity", "title", "message", "details")
        VALUES (${randomUUID()}::uuid, ${accountId}, ${candidate.key}, ${candidate.severity}, ${candidate.title}, ${candidate.message}, ${JSON.stringify(candidate.details)}::jsonb)
        ON CONFLICT ("account_id", "alert_key") WHERE "status" IN ('open', 'acknowledged')
        DO UPDATE SET "severity" = EXCLUDED."severity", "title" = EXCLUDED."title", "message" = EXCLUDED."message", "details" = EXCLUDED."details", "last_seen_at" = NOW()
      `);
    }
    if (activeKeys.length) {
      await this.prisma.$executeRaw(Prisma.sql`UPDATE "system_alert_events" SET "status" = 'resolved', "resolved_at" = NOW(), "last_seen_at" = NOW() WHERE "account_id" = ${accountId} AND "status" IN ('open', 'acknowledged') AND NOT ("alert_key" = ANY(${activeKeys}::text[]))`);
    } else {
      await this.prisma.$executeRaw(Prisma.sql`UPDATE "system_alert_events" SET "status" = 'resolved', "resolved_at" = NOW(), "last_seen_at" = NOW() WHERE "account_id" = ${accountId} AND "status" IN ('open', 'acknowledged')`);
    }
  }

  async history(accountId: string, range?: string) {
    const duration = telemetryRangeMilliseconds(range);
    const from = new Date(Date.now() - duration);
    const rows = await this.prisma.$queryRaw<MetricRow[]>(Prisma.sql`
      SELECT "sampled_at" AS "sampledAt", "cpu_percent" AS "cpuPercent", "memory_percent" AS "memoryPercent", "disk_used_percent" AS "diskUsedPercent",
        "active_sessions" AS "activeSessions", "buffering_sessions" AS "bufferingSessions", "queued_jobs" AS "queuedJobs", "failed_attempts_1h" AS "failedAttempts1h"
      FROM "system_metric_samples" WHERE "account_id" = ${accountId} AND "sampled_at" >= ${from} ORDER BY "sampled_at" ASC
    `);
    const points = rows.map((row) => ({ ...row, sampledAt: row.sampledAt.toISOString() }));
    return { range: range && ['1h', '6h', '24h', '7d', '30d'].includes(range) ? range : '24h', from: from.toISOString(), to: new Date().toISOString(), points: downsampleMetricPoints(points) };
  }

  async alerts(accountId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "alert_key" AS "key", "severity", "status", "title", "message", "details", "first_seen_at" AS "firstSeenAt",
        "last_seen_at" AS "lastSeenAt", "acknowledged_at" AS "acknowledgedAt", "resolved_at" AS "resolvedAt"
      FROM "system_alert_events" WHERE "account_id" = ${accountId} ORDER BY ("status" = 'resolved') ASC, "last_seen_at" DESC LIMIT 100
    `);
  }

  async acknowledge(accountId: string, userId: string, id: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      UPDATE "system_alert_events" SET "status" = 'acknowledged', "acknowledged_at" = NOW(), "acknowledged_by" = ${userId}
      WHERE "id" = ${id}::uuid AND "account_id" = ${accountId} AND "status" = 'open' RETURNING "id", "status"
    `);
    if (!rows[0]) return { acknowledged: false };
    return { acknowledged: true, ...rows[0] };
  }
}
