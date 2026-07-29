import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { SaveMetadataSettingsDto } from './metadata-settings.dto';
import { decryptSecret, encryptSecret } from './secret-value';

const tmdbTokenKey = 'metadata.tmdb.token';
const languageKey = 'metadata.tmdb.language';
const tvdbApiKeyKey = 'metadata.tvdb.apikey';
const tvdbPinKey = 'metadata.tvdb.pin';

export async function metadataSettingsStatus(prisma: PrismaService, accountId: string) {
  const runtime = await resolveMetadataSettings(prisma, accountId);
  return {
    enabled: Boolean(runtime.tmdbToken || runtime.tvdbApiKey),
    configured: Boolean(runtime.tmdbToken || runtime.tvdbApiKey),
    provider: runtime.tmdbToken && runtime.tvdbApiKey ? 'tmdb+tvdb' : runtime.tvdbApiKey ? 'tvdb' : 'tmdb',
    language: runtime.language,
    source: runtime.source,
    providers: {
      tmdb: { enabled: Boolean(runtime.tmdbToken), source: runtime.tmdbSource },
      tvdb: { enabled: Boolean(runtime.tvdbApiKey), source: runtime.tvdbSource },
    },
  };
}

export async function resolveMetadataSettings(prisma: PrismaService, accountId: string) {
  const [tmdbSetting, languageSetting, tvdbSetting, tvdbPinSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: tmdbTokenKey } } }),
    prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: languageKey } } }),
    prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: tvdbApiKeyKey } } }),
    prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: tvdbPinKey } } }),
  ]);
  const tmdbToken = tmdbSetting ? decryptSecret(tmdbSetting.value) : process.env.TMDB_API_TOKEN?.trim() || null;
  const tvdbApiKey = tvdbSetting ? decryptSecret(tvdbSetting.value) : process.env.TVDB_API_KEY?.trim() || null;
  const tvdbPin = tvdbPinSetting ? decryptSecret(tvdbPinSetting.value) : process.env.TVDB_SUBSCRIBER_PIN?.trim() || null;
  const languageValue = languageSetting?.value;
  const storedLanguage = languageValue && typeof languageValue === 'object' && !Array.isArray(languageValue)
    ? (languageValue as { value?: unknown }).value
    : null;
  const tmdbSource = tmdbSetting ? 'database' : tmdbToken ? 'environment' : 'none';
  const tvdbSource = tvdbSetting ? 'database' : tvdbApiKey ? 'environment' : 'none';
  return {
    token: tmdbToken,
    tmdbToken,
    tvdbApiKey,
    tvdbPin,
    language: typeof storedLanguage === 'string' ? storedLanguage : process.env.TMDB_LANGUAGE?.trim() || 'da-DK',
    source: tmdbSource === tvdbSource ? tmdbSource : 'mixed',
    tmdbSource,
    tvdbSource,
  };
}

export async function saveMetadataSettings(
  prisma: PrismaService,
  accountId: string,
  input: SaveMetadataSettingsDto,
) {
  const current = await resolveMetadataSettings(prisma, accountId);
  const tmdbToken = (input.tmdbToken ?? input.token)?.trim() || null;
  const tvdbApiKey = input.tvdbApiKey?.trim() || null;
  const requestedTvdbPin = input.tvdbPin?.trim() || null;
  const effectiveTvdbApiKey = tvdbApiKey || current.tvdbApiKey;
  const effectiveTvdbPin = requestedTvdbPin || current.tvdbPin;
  if (!tmdbToken && !tvdbApiKey && !current.tmdbToken && !current.tvdbApiKey) {
    throw new BadRequestException({
      code: 'metadata_credentials_required',
      message: 'Angiv en TMDB-token eller en TVDB API-nøgle.',
    });
  }
  if (requestedTvdbPin && !effectiveTvdbApiKey) {
    throw new BadRequestException({
      code: 'metadata_tvdb_key_required',
      message: 'En TVDB API-nøgle er nødvendig, før en Subscriber PIN kan gemmes.',
    });
  }
  if (tmdbToken) await validateTmdbToken(tmdbToken);
  if ((tvdbApiKey || requestedTvdbPin) && effectiveTvdbApiKey) {
    await validateTvdbCredentials(effectiveTvdbApiKey, effectiveTvdbPin);
  }
  const writes = [
    prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: languageKey } },
      create: { accountId, key: languageKey, value: { value: input.language }, encrypted: false },
      update: { value: { value: input.language }, encrypted: false },
    }),
  ];
  if (tmdbToken) {
    writes.push(prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: tmdbTokenKey } },
      create: { accountId, key: tmdbTokenKey, value: encryptSecret(tmdbToken), encrypted: true },
      update: { value: encryptSecret(tmdbToken), encrypted: true },
    }));
  }
  if (tvdbApiKey) {
    writes.push(prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: tvdbApiKeyKey } },
      create: { accountId, key: tvdbApiKeyKey, value: encryptSecret(tvdbApiKey), encrypted: true },
      update: { value: encryptSecret(tvdbApiKey), encrypted: true },
    }));
  }
  if (requestedTvdbPin) {
    writes.push(prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: tvdbPinKey } },
      create: { accountId, key: tvdbPinKey, value: encryptSecret(requestedTvdbPin), encrypted: true },
      update: { value: encryptSecret(requestedTvdbPin), encrypted: true },
    }));
  }
  await prisma.$transaction(writes);
  return metadataSettingsStatus(prisma, accountId);
}

async function validateTmdbToken(token: string) {
  const response = await fetch('https://api.themoviedb.org/3/configuration', {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => providerUnavailable('TMDB'));
  if (response.status === 401 || response.status === 403) providerRejected('TMDB');
  if (!response.ok) providerHttpError('TMDB', response.status);
}

async function validateTvdbCredentials(apikey: string, pin: string | null) {
  const response = await fetch('https://api4.thetvdb.com/v4/login', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ apikey, ...(pin ? { pin } : {}) }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => providerUnavailable('TVDB'));
  if (response.status === 401 || response.status === 403) providerRejected('TVDB');
  if (!response.ok) providerHttpError('TVDB', response.status);
  const payload = await response.json() as { data?: { token?: unknown } };
  if (typeof payload.data?.token !== 'string' || !payload.data.token) providerRejected('TVDB');
}

function providerUnavailable(provider: string): never {
  throw new BadGatewayException({
    code: 'metadata_provider_unavailable',
    message: `${provider} kunne ikke kontaktes. Nøglen er ikke gemt.`,
  });
}

function providerRejected(provider: string): never {
  throw new BadRequestException({
    code: 'metadata_token_invalid',
    message: `${provider}-nøglen blev afvist. Nøglen er ikke gemt.`,
  });
}

function providerHttpError(provider: string, status: number): never {
  throw new BadGatewayException({
    code: 'metadata_provider_http_error',
    message: `${provider} svarede med HTTP ${status}. Nøglen er ikke gemt.`,
  });
}
