import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Response } from 'express';
import { correlationId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { parseRecordingRange, validateRecordingWindow } from './live-tv-recording-policy';
import type { CreateLiveTvRecordingDto } from './live-tv-recordings.dto';

const playbackTokenTtlMs = 6 * 60 * 60_000;
const recordingInclude = Prisma.validator<Prisma.LiveTvRecordingInclude>()({ channel: true, program: true, connection: { include: { provider: true } } });

@Injectable()
export class LiveTvRecordingsService {
  private readonly transcodeRoot = resolve(process.env.TRANSCODE_PATH?.trim() || '/transcode');
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser) {
    const profileId = this.profileId(actor);
    const rows = await this.prisma.liveTvRecording.findMany({ where: { accountId: actor.accountId, profileId }, include: recordingInclude, orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }] });
    return rows.map((row) => this.response(row));
  }

  async scheduleOptions(actor: AuthenticatedUser) {
    const profileId = this.profileId(actor);
    const profile = await this.prisma.profile.findFirst({ where: { id: profileId, accountId: actor.accountId }, select: { isChildProfile: true } });
    if (!profile) throw new NotFoundException({ code: 'live_tv_profile_missing', message: 'Den aktive profil findes ikke' });
    const now = new Date();
    const programs = await this.prisma.liveTvProgram.findMany({ where: { accountId: actor.accountId, endsAt: { gt: now }, startsAt: { lt: new Date(now.getTime() + 7 * 24 * 60 * 60_000) }, ...(profile.isChildProfile ? { channel: { isAdult: false } } : {}) }, include: { channel: true }, orderBy: [{ startsAt: 'asc' }, { channel: { sortOrder: 'asc' } }], take: 500 });
    const scheduled = await this.prisma.liveTvRecording.findMany({ where: { profileId, programId: { in: programs.map((program) => program.id) }, status: { notIn: ['cancelled', 'failed'] } }, select: { id: true, programId: true, status: true } });
    const byProgram = new Map(scheduled.map((recording) => [recording.programId, recording]));
    return programs.map((program) => ({ id: program.id, title: program.title, subtitle: program.subtitle, category: program.category, startsAt: program.startsAt, endsAt: program.endsAt, channel: { id: program.channel.id, name: program.channel.name, number: program.channel.number, logoUrl: program.channel.logoUrl }, recording: byProgram.get(program.id) ?? null }));
  }

  async create(actor: AuthenticatedUser, dto: CreateLiveTvRecordingDto) {
    const profileId = this.profileId(actor);
    const profile = await this.prisma.profile.findFirst({ where: { id: profileId, accountId: actor.accountId }, select: { isChildProfile: true } });
    if (!profile) throw new NotFoundException({ code: 'live_tv_profile_missing', message: 'Den aktive profil findes ikke' });
    const program = dto.programId ? await this.prisma.liveTvProgram.findFirst({ where: { id: dto.programId, accountId: actor.accountId }, include: { channel: true } }) : null;
    if (dto.programId && !program) throw new NotFoundException({ code: 'live_tv_program_missing', message: 'Programmet findes ikke længere i guiden' });
    const channelId = program?.channelId ?? dto.channelId!;
    const channel = program?.channel ?? await this.prisma.liveTvChannel.findFirst({ where: { id: channelId, accountId: actor.accountId } });
    if (!channel || !channel.enabled) throw new NotFoundException({ code: 'live_tv_channel_missing', message: 'Kanalen findes ikke eller er deaktiveret' });
    if (profile.isChildProfile && channel.isAdult) throw new ForbiddenException({ code: 'live_tv_recording_child_blocked', message: 'Kanalen er ikke tilgængelig for børneprofilen' });
    const startsAt = program?.startsAt ?? new Date(dto.startsAt!);
    const endsAt = program?.endsAt ?? new Date(dto.endsAt!);
    const windowError = validateRecordingWindow(startsAt, endsAt, new Date());
    if (windowError) throw new BadRequestException({ code: `live_tv_recording_${windowError}`, message: recordingWindowMessage(windowError) });
    if (program) {
      const existing = await this.prisma.liveTvRecording.findUnique({ where: { profileId_programId: { profileId, programId: program.id } }, include: recordingInclude });
      if (existing && !['cancelled', 'failed'].includes(existing.status)) return this.response(existing);
      if (existing) await this.prisma.liveTvRecording.delete({ where: { id: existing.id } });
    }
    const recordingId = await this.prisma.$transaction(async (tx) => {
      const row = await tx.liveTvRecording.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId, channelId, programId: program?.id ?? null, title: program?.title ?? dto.title!.trim(), startsAt, endsAt, prePaddingSeconds: dto.prePaddingSeconds ?? 60, postPaddingSeconds: dto.postPaddingSeconds ?? 120 } });
      await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId, correlationId: correlationId(), action: 'live_tv.recording_schedule', outcome: 'allowed', code: 'live_tv_recording_scheduled', details: { recordingId: row.id, channelId, programId: program?.id ?? null, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } } });
      return row.id;
    });
    return this.response(await this.owned(actor, recordingId));
  }

  async cancel(actor: AuthenticatedUser, id: string) {
    const recording = await this.owned(actor, id);
    if (['completed', 'failed', 'cancelled'].includes(recording.status)) return this.response(recording);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.liveTvRecording.update({ where: { id: recording.id }, data: { status: 'cancelled', error: 'Annulleret af brugeren', recordingEndedAt: new Date() }, include: recordingInclude });
      if (recording.jobId) await tx.systemJob.updateMany({ where: { id: recording.jobId, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled' } });
      await tx.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId: recording.profileId, correlationId: correlationId(), action: 'live_tv.recording_cancel', outcome: 'allowed', code: 'live_tv_recording_cancelled', details: { recordingId: recording.id } } });
      return row;
    });
    return this.response(updated);
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const recording = await this.owned(actor, id);
    if (!['completed', 'failed', 'cancelled', 'missed'].includes(recording.status)) throw new ConflictException({ code: 'live_tv_recording_active', message: 'En aktiv eller planlagt optagelse skal annulleres først' });
    await this.prisma.liveTvRecording.delete({ where: { id: recording.id } });
    if (recording.outputPath) {
      const candidate = resolve(this.transcodeRoot, ...recording.outputPath.split('/'));
      if (isWithin(this.transcodeRoot, candidate)) await rm(resolve(candidate, '..'), { recursive: true, force: true });
    }
    return { id, deleted: true };
  }

  async authorizePlayback(actor: AuthenticatedUser, id: string) {
    const recording = await this.owned(actor, id);
    if (recording.status !== 'completed' || !recording.outputPath) throw new ConflictException({ code: 'live_tv_recording_not_ready', message: 'Optagelsen er ikke klar til afspilning' });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + playbackTokenTtlMs);
    await this.prisma.liveTvRecording.update({ where: { id: recording.id }, data: { playbackTokenHash: hashToken(token), playbackTokenExpiresAt: expiresAt } });
    return { recordingId: recording.id, streamUrl: `/api/v1/live-tv/recordings/${recording.id}/stream?token=${encodeURIComponent(token)}`, expiresAt };
  }

  async send(id: string, token: string | undefined, rangeHeader: string | undefined, response: Response, headOnly = false) {
    if (!token) throw new UnauthorizedException({ code: 'live_tv_recording_token_required', message: 'Afspilningstoken mangler' });
    const recording = await this.prisma.liveTvRecording.findUnique({ where: { id } });
    if (!recording || recording.status !== 'completed' || !recording.outputPath) throw new NotFoundException({ code: 'live_tv_recording_missing', message: 'Optagelsen findes ikke' });
    if (!recording.playbackTokenHash || !tokenMatches(token, recording.playbackTokenHash)) throw new UnauthorizedException({ code: 'live_tv_recording_token_invalid', message: 'Afspilningstoken er ugyldigt' });
    if (!recording.playbackTokenExpiresAt || recording.playbackTokenExpiresAt <= new Date()) throw new GoneException({ code: 'live_tv_recording_token_expired', message: 'Afspilningstoken er udløbet' });
    const candidate = resolve(this.transcodeRoot, ...recording.outputPath.split('/'));
    if (!isWithin(this.transcodeRoot, candidate)) throw new UnauthorizedException({ code: 'live_tv_recording_path_invalid', message: 'Optagelsesstien er ugyldig' });
    const file = await stat(candidate).catch(() => null);
    if (!file?.isFile()) throw new NotFoundException({ code: 'live_tv_recording_file_missing', message: 'Optagelsesfilen mangler' });
    const range = parseRecordingRange(rangeHeader, file.size);
    response.setHeader('Accept-Ranges', 'bytes'); response.setHeader('Content-Type', 'video/mp4'); response.setHeader('Cache-Control', 'private, no-store');
    if (rangeHeader && !range) { response.status(416).setHeader('Content-Range', `bytes */${file.size}`); response.end(); return; }
    if (range) { response.status(206); response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`); response.setHeader('Content-Length', String(range.length)); }
    else { response.status(200); response.setHeader('Content-Length', String(file.size)); }
    if (headOnly) { response.end(); return; }
    createReadStream(candidate, range ? { start: range.start, end: range.end } : undefined).pipe(response);
  }

  private async owned(actor: AuthenticatedUser, id: string) {
    const row = await this.prisma.liveTvRecording.findFirst({ where: { id, accountId: actor.accountId, profileId: this.profileId(actor) }, include: recordingInclude });
    if (!row) throw new NotFoundException({ code: 'live_tv_recording_missing', message: 'Optagelsen findes ikke' });
    return row;
  }
  private profileId(actor: AuthenticatedUser) { if (!actor.profileId) throw new BadRequestException({ code: 'profile_required', message: 'Vælg en profil først' }); return actor.profileId; }
  private response(row: Prisma.LiveTvRecordingGetPayload<{ include: typeof recordingInclude }>) { return { id: row.id, title: row.title, status: row.status, progress: row.progress, startsAt: row.startsAt, endsAt: row.endsAt, prePaddingSeconds: row.prePaddingSeconds, postPaddingSeconds: row.postPaddingSeconds, sizeBytes: row.sizeBytes?.toString() ?? null, durationMs: row.durationMs, error: row.error, ready: row.status === 'completed' && Boolean(row.outputPath), channel: { id: row.channel.id, name: row.channel.name, number: row.channel.number, logoUrl: row.channel.logoUrl }, program: row.program ? { id: row.program.id, subtitle: row.program.subtitle, category: row.program.category, episode: row.program.episode } : null, connection: row.connection ? { id: row.connection.id, name: row.connection.name, provider: row.connection.provider.name } : null }; }
}

function recordingWindowMessage(code: string) { return ({ invalid_date: 'Datoerne er ugyldige', invalid_window: 'Sluttidspunktet skal ligge efter starttidspunktet', already_ended: 'Programmet er allerede slut', too_long: 'En optagelse må højst vare 12 timer', too_far_ahead: 'Optagelsen kan højst planlægges 30 dage frem' } as Record<string, string>)[code] ?? 'Optagelsesvinduet er ugyldigt'; }
function hashToken(value: string) { return createHash('sha256').update(value).digest('hex'); }
function tokenMatches(value: string, expected: string) { const actual = Buffer.from(hashToken(value)); const reference = Buffer.from(expected); return actual.length === reference.length && timingSafeEqual(actual, reference); }
function isWithin(root: string, candidate: string) { const normalizedRoot = resolve(root); const normalizedCandidate = resolve(candidate); return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}\\`) || normalizedCandidate.startsWith(`${normalizedRoot}/`); }
