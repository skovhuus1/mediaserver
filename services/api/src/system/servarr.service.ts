import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedUser } from '@boltbytes/contracts';
import { LibraryType, Prisma } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { correlationId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import type { AddServarrItemDto, SaveServarrConnectionDto, TestServarrConnectionDto } from './servarr.dto';
import { decryptSecret, encryptSecret } from './secret-value';

export type ServarrProvider = 'sonarr' | 'radarr';
type StoredConfig = { version: 1; enabled: boolean; url: string; libraryId: string | null; rootFolderPath: string | null; qualityProfileId: number | null; updatedAt: string };
type LastWebhook = { eventType: string; receivedAt: string; queuedScanId: string | null; title: string | null };
type RuntimeConnection = StoredConfig & { accountId: string; provider: ServarrProvider; apiKey: string | null; webhookSecret: string | null; lastWebhook: LastWebhook | null };
type JsonRecord = Record<string, unknown>;
const providers: ServarrProvider[] = ['sonarr', 'radarr'];

@Injectable()
export class ServarrService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AuthenticatedUser) {
    const [connections, libraries] = await Promise.all([
      Promise.all(providers.map(async (provider) => this.connectionView(await this.resolve(actor.accountId, provider), true))),
      this.prisma.library.findMany({ where: { accountId: actor.accountId }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true } }),
    ]);
    return { canWrite: actor.roles.includes('admin'), connections, libraries };
  }

  async save(actor: AuthenticatedUser, requestedProvider: string, input: SaveServarrConnectionDto) {
    const provider = parseProvider(requestedProvider); const current = await this.resolve(actor.accountId, provider);
    const url = normalizeServarrUrl(input.url); const apiKey = input.apiKey?.trim() || current.apiKey;
    if (!apiKey) throw new BadRequestException({ code: 'servarr_api_key_required', message: `${label(provider)} kræver en API-nøgle.` });
    const system = await this.request<JsonRecord>(url, apiKey, 'system/status');
    if (input.libraryId) {
      const library = await this.prisma.library.findFirst({ where: { id: input.libraryId, accountId: actor.accountId }, select: { id: true, type: true } });
      if (!library) throw new NotFoundException({ code: 'servarr_library_missing', message: 'Det valgte BoltBytes-bibliotek findes ikke.' });
      const expectedType = provider === 'sonarr' ? LibraryType.series : LibraryType.movie;
      if (library.type !== expectedType && library.type !== LibraryType.mixed) throw new BadRequestException({ code: 'servarr_library_type_invalid', message: `${label(provider)} skal bindes til et ${provider === 'sonarr' ? 'serie' : 'film'}bibliotek eller et blandet bibliotek.` });
    }
    if (input.rootFolderPath || input.qualityProfileId) await this.validateDefaults(url, apiKey, input.rootFolderPath, input.qualityProfileId);
    const generatedSecret = current.webhookSecret ? null : randomBytes(32).toString('base64url');
    const config: StoredConfig = { version: 1, enabled: input.enabled, url, libraryId: input.libraryId ?? null, rootFolderPath: input.rootFolderPath?.trim() || null, qualityProfileId: input.qualityProfileId ?? null, updatedAt: new Date().toISOString() };
    const writes = [
      this.prisma.systemSetting.upsert({ where: { accountId_key: { accountId: actor.accountId, key: configKey(provider) } }, create: { accountId: actor.accountId, key: configKey(provider), value: config as Prisma.InputJsonValue, encrypted: false }, update: { value: config as Prisma.InputJsonValue, encrypted: false } }),
      this.prisma.systemSetting.upsert({ where: { accountId_key: { accountId: actor.accountId, key: apiKeyKey(provider) } }, create: { accountId: actor.accountId, key: apiKeyKey(provider), value: encryptSecret(apiKey), encrypted: true }, update: { value: encryptSecret(apiKey), encrypted: true } }),
    ];
    if (generatedSecret) writes.push(this.prisma.systemSetting.upsert({ where: { accountId_key: { accountId: actor.accountId, key: webhookKey(provider) } }, create: { accountId: actor.accountId, key: webhookKey(provider), value: encryptSecret(generatedSecret), encrypted: true }, update: { value: encryptSecret(generatedSecret), encrypted: true } }));
    await this.prisma.$transaction(writes);
    await this.audit(actor, `integration.${provider}.save`, 'servarr_connection_saved', { provider, enabled: input.enabled, url, libraryId: config.libraryId });
    const view = await this.connectionView({ ...config, accountId: actor.accountId, provider, apiKey, webhookSecret: generatedSecret ?? current.webhookSecret, lastWebhook: current.lastWebhook }, false, system);
    return { ...view, webhookCredentials: generatedSecret ? credentials(actor.accountId, provider, generatedSecret) : null };
  }

  async test(actor: AuthenticatedUser, requestedProvider: string, input: TestServarrConnectionDto) {
    const provider = parseProvider(requestedProvider); const current = await this.resolve(actor.accountId, provider);
    const url = input.url ? normalizeServarrUrl(input.url) : current.url; const apiKey = input.apiKey?.trim() || current.apiKey;
    if (!url || !apiKey) throw new BadRequestException({ code: 'servarr_not_configured', message: `${label(provider)} mangler URL eller API-nøgle.` });
    return this.health(url, apiKey, true);
  }

  async resources(actor: AuthenticatedUser, requestedProvider: string) {
    const provider = parseProvider(requestedProvider); const current = await this.requireConnection(actor.accountId, provider);
    const [rootFolders, qualityProfiles, queue] = await Promise.all([
      this.request<unknown[]>(current.url, current.apiKey!, 'rootfolder'),
      this.request<unknown[]>(current.url, current.apiKey!, 'qualityprofile'),
      this.request<JsonRecord>(current.url, current.apiKey!, 'queue/status').catch(() => null),
    ]);
    return {
      rootFolders: rows(rootFolders).map((row) => ({ id: numberValue(row.id), path: stringValue(row.path), freeSpace: numberValue(row.freeSpace), accessible: row.accessible !== false })).filter((row) => row.id && row.path),
      qualityProfiles: rows(qualityProfiles).map((row) => ({ id: numberValue(row.id), name: stringValue(row.name) })).filter((row) => row.id && row.name),
      queue: queue ? { count: numberValue(queue.count) ?? 0, unknownCount: numberValue(queue.unknownCount) ?? 0, errors: Boolean(queue.errors) } : null,
    };
  }

  async lookup(actor: AuthenticatedUser, requestedProvider: string, term: string) {
    const provider = parseProvider(requestedProvider); const current = await this.requireConnection(actor.accountId, provider);
    const endpoint = provider === 'sonarr' ? 'series/lookup' : 'movie/lookup';
    const candidates = await this.request<unknown[]>(current.url, current.apiKey!, `${endpoint}?term=${encodeURIComponent(term.trim())}`);
    return rows(candidates).slice(0, 24).map((candidate) => lookupView(provider, candidate)).filter((candidate) => candidate.providerId !== null && candidate.title);
  }

  async add(actor: AuthenticatedUser, requestedProvider: string, input: AddServarrItemDto) {
    const provider = parseProvider(requestedProvider); const current = await this.requireConnection(actor.accountId, provider);
    const rootFolderPath = input.rootFolderPath?.trim() || current.rootFolderPath; const qualityProfileId = input.qualityProfileId ?? current.qualityProfileId;
    if (!rootFolderPath || !qualityProfileId) throw new BadRequestException({ code: 'servarr_defaults_required', message: 'Vælg root folder og kvalitetsprofil, før titlen tilføjes.' });
    await this.validateDefaults(current.url, current.apiKey!, rootFolderPath, qualityProfileId);
    const identity = provider === 'sonarr' ? `tvdb:${input.providerId}` : `tmdb:${input.providerId}`; const endpoint = provider === 'sonarr' ? 'series/lookup' : 'movie/lookup';
    const candidates = rows(await this.request<unknown[]>(current.url, current.apiKey!, `${endpoint}?term=${encodeURIComponent(identity)}`));
    const idKey = provider === 'sonarr' ? 'tvdbId' : 'tmdbId'; const candidate = candidates.find((item) => numberValue(item[idKey]) === input.providerId);
    if (!candidate) throw new NotFoundException({ code: 'servarr_lookup_missing', message: 'Titlen kunne ikke længere findes hos Servarr-providerens metadataindeks.' });
    if ((numberValue(candidate.id) ?? 0) > 0) throw new ConflictException({ code: 'servarr_item_exists', message: `${stringValue(candidate.title) || 'Titlen'} findes allerede i ${label(provider)}.` });
    const monitored = input.monitored ?? true; const searchOnAdd = input.searchOnAdd ?? true;
    const payload: JsonRecord = provider === 'sonarr'
      ? { ...candidate, id: 0, rootFolderPath, qualityProfileId, monitored, seasonFolder: true, addOptions: { monitor: 'all', searchForMissingEpisodes: searchOnAdd, searchForCutoffUnmetEpisodes: false } }
      : { ...candidate, id: 0, rootFolderPath, qualityProfileId, monitored, addOptions: { searchForMovie: searchOnAdd } };
    const result = await this.request<JsonRecord>(current.url, current.apiKey!, provider === 'sonarr' ? 'series' : 'movie', { method: 'POST', body: payload });
    await this.audit(actor, `integration.${provider}.add`, 'servarr_item_added', { provider, providerId: input.providerId, title: stringValue(candidate.title), monitored, searchOnAdd });
    return { added: true, provider, id: numberValue(result.id), title: stringValue(result.title), monitored, searchOnAdd };
  }

  async remove(actor: AuthenticatedUser, requestedProvider: string) {
    const provider = parseProvider(requestedProvider);
    await this.prisma.systemSetting.deleteMany({ where: { accountId: actor.accountId, key: { in: [configKey(provider), apiKeyKey(provider), webhookKey(provider), lastWebhookKey(provider)] } } });
    await this.audit(actor, `integration.${provider}.delete`, 'servarr_connection_removed', { provider });
    return { removed: true, provider };
  }

  async rotateWebhookSecret(actor: AuthenticatedUser, requestedProvider: string) {
    const provider = parseProvider(requestedProvider); await this.requireConnection(actor.accountId, provider); const secret = randomBytes(32).toString('base64url');
    await this.prisma.systemSetting.upsert({ where: { accountId_key: { accountId: actor.accountId, key: webhookKey(provider) } }, create: { accountId: actor.accountId, key: webhookKey(provider), value: encryptSecret(secret), encrypted: true }, update: { value: encryptSecret(secret), encrypted: true } });
    await this.audit(actor, `integration.${provider}.webhook_rotate`, 'servarr_webhook_secret_rotated', { provider });
    return credentials(actor.accountId, provider, secret);
  }

  async webhook(accountId: string, requestedProvider: string, authorization: string | undefined, directSecret: string | undefined, body: unknown) {
    const provider = parseProvider(requestedProvider); const connection = await this.resolve(accountId, provider);
    if (!connection.enabled || !connection.webhookSecret) throw new NotFoundException({ code: 'servarr_webhook_disabled', message: 'Webhook-integrationen er ikke aktiveret.' });
    const supplied = directSecret?.trim() || authorizationSecret(authorization);
    if (!supplied || !secretEqual(supplied, connection.webhookSecret)) throw new UnauthorizedException({ code: 'servarr_webhook_unauthorized', message: 'Webhook-hemmeligheden er ugyldig.' });
    const payload = objectValue(body); const eventType = stringValue(payload.eventType) || 'Unknown'; const title = webhookTitle(provider, payload);
    const scan = eventType.toLowerCase() === 'test' ? null : await this.queueScan(accountId, connection.libraryId, provider);
    const lastWebhook: LastWebhook = { eventType, receivedAt: new Date().toISOString(), queuedScanId: scan?.id ?? null, title };
    await this.prisma.systemSetting.upsert({ where: { accountId_key: { accountId, key: lastWebhookKey(provider) } }, create: { accountId, key: lastWebhookKey(provider), value: lastWebhook as Prisma.InputJsonValue, encrypted: false }, update: { value: lastWebhook as Prisma.InputJsonValue, encrypted: false } });
    await this.prisma.auditLog.create({ data: { accountId, userId: null, profileId: null, correlationId: correlationId(), action: `integration.${provider}.webhook`, outcome: 'allowed', code: 'servarr_webhook_received', details: { provider, eventType, queuedScanId: scan?.id ?? null, title } } });
    return { accepted: true, provider, eventType, scanId: scan?.id ?? null };
  }

  private async resolve(accountId: string, provider: ServarrProvider): Promise<RuntimeConnection> {
    const [configSetting, apiKeySetting, webhookSetting, lastWebhookSetting] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: configKey(provider) } } }), this.prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: apiKeyKey(provider) } } }), this.prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: webhookKey(provider) } } }), this.prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: lastWebhookKey(provider) } } }),
    ]);
    const config = readConfig(configSetting?.value);
    return { accountId, provider, ...config, apiKey: apiKeySetting ? decryptSecret(apiKeySetting.value) : null, webhookSecret: webhookSetting ? decryptSecret(webhookSetting.value) : null, lastWebhook: readLastWebhook(lastWebhookSetting?.value) };
  }

  private async requireConnection(accountId: string, provider: ServarrProvider) { const current = await this.resolve(accountId, provider); if (!current.enabled || !current.url || !current.apiKey) throw new ConflictException({ code: 'servarr_not_configured', message: `${label(provider)} er ikke aktiveret og konfigureret.` }); return current; }
  private async connectionView(runtime: RuntimeConnection, testHealth: boolean, knownSystem?: JsonRecord) { const health = runtime.enabled && runtime.url && runtime.apiKey ? (knownSystem ? healthView(knownSystem) : testHealth ? await this.health(runtime.url, runtime.apiKey, false) : null) : null; return { provider: runtime.provider, label: label(runtime.provider), configured: Boolean(runtime.url && runtime.apiKey), enabled: runtime.enabled, url: runtime.url || null, libraryId: runtime.libraryId, rootFolderPath: runtime.rootFolderPath, qualityProfileId: runtime.qualityProfileId, hasApiKey: Boolean(runtime.apiKey), hasWebhookSecret: Boolean(runtime.webhookSecret), webhookPath: webhookPath(runtime.accountId, runtime.provider), lastWebhook: runtime.lastWebhook, health }; }
  private async health(url: string, apiKey: string, throwOnFailure: boolean) { try { return healthView(await this.request<JsonRecord>(url, apiKey, 'system/status')); } catch (reason) { if (throwOnFailure) throw reason; return { online: false, error: reason instanceof Error ? reason.message : 'Servarr kunne ikke kontaktes.' }; } }
  private async validateDefaults(url: string, apiKey: string, rootFolderPath?: string | null, qualityProfileId?: number | null) { const [folders, profiles] = await Promise.all([this.request<unknown[]>(url, apiKey, 'rootfolder'), this.request<unknown[]>(url, apiKey, 'qualityprofile')]); if (rootFolderPath && !rows(folders).some((item) => stringValue(item.path) === rootFolderPath.trim())) throw new BadRequestException({ code: 'servarr_root_folder_invalid', message: 'Root folder findes ikke længere i Servarr.' }); if (qualityProfileId && !rows(profiles).some((item) => numberValue(item.id) === qualityProfileId)) throw new BadRequestException({ code: 'servarr_quality_profile_invalid', message: 'Kvalitetsprofilen findes ikke længere i Servarr.' }); }
  private async queueScan(accountId: string, libraryId: string | null, provider: ServarrProvider) { if (!libraryId) return null; return this.prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('bbmedia:library-scan'), hashtext(CAST(${libraryId} AS text)))::text AS lock_result`; const library = await tx.library.findFirst({ where: { id: libraryId, accountId } }); if (!library) return null; const active = await tx.libraryScan.findFirst({ where: { libraryId, status: { in: ['queued', 'running'] } }, orderBy: { createdAt: 'desc' } }); if (active) return active; const scan = await tx.libraryScan.create({ data: { accountId, libraryId, status: 'queued' } }); const job = await tx.systemJob.create({ data: { accountId, type: 'library.scan', status: 'queued', payload: { libraryId, scanId: scan.id, requestedBy: `servarr:${provider}` }, maxAttempts: 3 } }); await tx.library.update({ where: { id: libraryId }, data: { lastScheduledScanAt: new Date() } }); return tx.libraryScan.update({ where: { id: scan.id }, data: { jobId: job.id } }); }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }); }
  private async request<T>(baseUrl: string, apiKey: string, endpoint: string, options: { method?: 'POST'; body?: JsonRecord } = {}): Promise<T> { const url = `${baseUrl.replace(/\/$/, '')}/api/v3/${endpoint.replace(/^\//, '')}`; let response: Response; try { response = await fetch(url, { method: options.method ?? 'GET', redirect: 'error', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-api-key': apiKey }, ...(options.body ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(12_000) }); } catch { throw new BadGatewayException({ code: 'servarr_unavailable', message: 'Servarr kunne ikke kontaktes inden for 12 sekunder.' }); } const text = await response.text(); if (!response.ok) { if (response.status === 401 || response.status === 403) throw new BadRequestException({ code: 'servarr_credentials_invalid', message: 'Servarr afviste API-nøglen.' }); throw new BadGatewayException({ code: 'servarr_http_error', message: `Servarr svarede med HTTP ${response.status}.`, details: { response: text.slice(0, 400) } }); } if (!text) return null as T; try { return JSON.parse(text) as T; } catch { throw new BadGatewayException({ code: 'servarr_response_invalid', message: 'Servarr returnerede et ugyldigt JSON-svar.' }); } }
  private audit(actor: AuthenticatedUser, action: string, code: string, details: Record<string, unknown>) { return this.prisma.auditLog.create({ data: { accountId: actor.accountId, userId: actor.sub, profileId: actor.profileId ?? null, correlationId: correlationId(), action, outcome: 'allowed', code, details: details as Prisma.InputJsonValue } }); }
}

export function normalizeServarrUrl(value: string) { const parsed = new URL(value.trim()); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new BadRequestException({ code: 'servarr_url_invalid', message: 'Servarr-URL skal bruge HTTP/HTTPS uden credentials.' }); parsed.search = ''; parsed.hash = ''; return parsed.toString().replace(/\/$/, ''); }
export function parseProvider(value: string): ServarrProvider { if (value !== 'sonarr' && value !== 'radarr') throw new BadRequestException({ code: 'servarr_provider_invalid', message: 'Provider skal være sonarr eller radarr.' }); return value; }
function configKey(provider: ServarrProvider) { return `integration.${provider}.config`; } function apiKeyKey(provider: ServarrProvider) { return `integration.${provider}.apikey`; } function webhookKey(provider: ServarrProvider) { return `integration.${provider}.webhook-secret`; } function lastWebhookKey(provider: ServarrProvider) { return `integration.${provider}.last-webhook`; }
function label(provider: ServarrProvider) { return provider === 'sonarr' ? 'Sonarr' : 'Radarr'; }
function emptyConfig(): StoredConfig { return { version: 1, enabled: false, url: '', libraryId: null, rootFolderPath: null, qualityProfileId: null, updatedAt: new Date(0).toISOString() }; }
function readConfig(value: unknown): StoredConfig { const item = objectValue(value); if (item.version !== 1 || typeof item.url !== 'string') return emptyConfig(); return { version: 1, enabled: item.enabled === true, url: item.url, libraryId: typeof item.libraryId === 'string' ? item.libraryId : null, rootFolderPath: typeof item.rootFolderPath === 'string' ? item.rootFolderPath : null, qualityProfileId: numberValue(item.qualityProfileId), updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date(0).toISOString() }; }
function readLastWebhook(value: unknown): LastWebhook | null { const item = objectValue(value); if (typeof item.eventType !== 'string' || typeof item.receivedAt !== 'string') return null; return { eventType: item.eventType, receivedAt: item.receivedAt, queuedScanId: typeof item.queuedScanId === 'string' ? item.queuedScanId : null, title: typeof item.title === 'string' ? item.title : null }; }
function objectValue(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function rows(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(objectValue) : []; }
function stringValue(value: unknown) { return typeof value === 'string' ? value : null; } function numberValue(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function lookupView(provider: ServarrProvider, item: JsonRecord) { const images = rows(item.images); return { provider, providerId: numberValue(item[provider === 'sonarr' ? 'tvdbId' : 'tmdbId']), title: stringValue(item.title), year: numberValue(item.year), overview: stringValue(item.overview), status: stringValue(item.status), existing: (numberValue(item.id) ?? 0) > 0, posterUrl: stringValue(images.find((image) => image.coverType === 'poster')?.remoteUrl) || stringValue(images.find((image) => image.coverType === 'poster')?.url) }; }
function healthView(system: JsonRecord) { return { online: true, appName: stringValue(system.appName), instanceName: stringValue(system.instanceName), version: stringValue(system.version), branch: stringValue(system.branch), operatingSystem: stringValue(system.operatingSystem), startupPath: stringValue(system.startupPath) }; }
function webhookPath(accountId: string, provider: ServarrProvider) { return `/api/v1/system/integrations/servarr/webhooks/${accountId}/${provider}`; }
function credentials(accountId: string, provider: ServarrProvider, secret: string) { return { webhookPath: webhookPath(accountId, provider), username: 'boltbytes', password: secret, headerName: 'X-BoltBytes-Webhook-Secret' }; }
function authorizationSecret(value: string | undefined) { if (!value) return null; if (value.startsWith('Bearer ')) return value.slice(7).trim(); if (!value.startsWith('Basic ')) return null; try { const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8'); const separator = decoded.indexOf(':'); return separator >= 0 ? decoded.slice(separator + 1) : null; } catch { return null; } }
function secretEqual(left: string, right: string) { const a = createHash('sha256').update(left).digest(); const b = createHash('sha256').update(right).digest(); return timingSafeEqual(a, b); }
function webhookTitle(provider: ServarrProvider, payload: JsonRecord) { const item = objectValue(payload[provider === 'sonarr' ? 'series' : 'movie']); return stringValue(item.title); }
