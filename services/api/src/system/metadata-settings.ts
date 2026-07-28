import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './secret-value';

const tokenKey = 'metadata.tmdb.token';
const languageKey = 'metadata.tmdb.language';

export async function metadataSettingsStatus(prisma: PrismaService, accountId: string) {
  const runtime = await resolveMetadataSettings(prisma, accountId);
  return {
    enabled: Boolean(runtime.token),
    configured: Boolean(runtime.token),
    provider: 'tmdb',
    language: runtime.language,
    source: runtime.source,
  };
}

export async function resolveMetadataSettings(prisma: PrismaService, accountId: string) {
  const [tokenSetting, languageSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: tokenKey } } }),
    prisma.systemSetting.findUnique({ where: { accountId_key: { accountId, key: languageKey } } }),
  ]);
  const token = tokenSetting
    ? decryptSecret(tokenSetting.value)
    : process.env.TMDB_API_TOKEN?.trim() || null;
  const languageValue = languageSetting?.value;
  const storedLanguage = languageValue && typeof languageValue === 'object' && !Array.isArray(languageValue)
    ? (languageValue as { value?: unknown }).value
    : null;
  return {
    token,
    language: typeof storedLanguage === 'string'
      ? storedLanguage
      : process.env.TMDB_LANGUAGE?.trim() || 'da-DK',
    source: tokenSetting ? 'database' : token ? 'environment' : 'none',
  };
}

export async function saveMetadataSettings(
  prisma: PrismaService,
  accountId: string,
  token: string,
  language: string,
) {
  const normalizedToken = token.trim();
  const response = await fetch('https://api.themoviedb.org/3/configuration', {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${normalizedToken}`,
    },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new BadGatewayException({
      code: 'metadata_provider_unavailable',
      message: 'TMDB kunne ikke kontaktes. Nøglen er ikke gemt.',
    });
  });
  if (response.status === 401 || response.status === 403) {
    throw new BadRequestException({
      code: 'metadata_token_invalid',
      message: 'TMDB-nøglen blev afvist. Nøglen er ikke gemt.',
    });
  }
  if (!response.ok) {
    throw new BadGatewayException({
      code: 'metadata_provider_http_error',
      message: `TMDB svarede med HTTP ${response.status}. Nøglen er ikke gemt.`,
    });
  }
  await prisma.$transaction([
    prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: tokenKey } },
      create: { accountId, key: tokenKey, value: encryptSecret(normalizedToken), encrypted: true },
      update: { value: encryptSecret(normalizedToken), encrypted: true },
    }),
    prisma.systemSetting.upsert({
      where: { accountId_key: { accountId, key: languageKey } },
      create: { accountId, key: languageKey, value: { value: language }, encrypted: false },
      update: { value: { value: language }, encrypted: false },
    }),
  ]);
  return metadataSettingsStatus(prisma, accountId);
}
