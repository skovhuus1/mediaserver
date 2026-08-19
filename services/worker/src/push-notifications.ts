import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Prisma, PrismaClient } from '@prisma/client';

type PushJob = { id: string; payload: Prisma.JsonValue };

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

export async function deliverPushNotification(
  prisma: PrismaClient,
  job: PushJob,
): Promise<void> {
  const payload = objectValue(job.payload);
  const notificationId = stringValue(payload.notificationId);
  const registrationId = stringValue(payload.registrationId);
  if (!notificationId || !registrationId) throw new Error('Push job payload is invalid');

  const [notification, registration] = await Promise.all([
    prisma.userNotification.findUnique({ where: { id: notificationId } }),
    prisma.clientPushRegistration.findUnique({ where: { id: registrationId } }),
  ]);
  if (!notification || !registration || !registration.enabled) return;
  if (notification.accountId !== registration.accountId || notification.userId !== registration.userId) {
    throw new Error('Push registration is outside notification scope');
  }

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) {
    await prisma.userNotification.update({
      where: { id: notification.id },
      data: {
        deliveryStatus: 'disabled',
        deliveryError: 'Firebase service account is not configured',
      },
    });
    return;
  }

  const accessToken = await serviceAccountAccessToken(serviceAccount);
  const data = objectValue(notification.data);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.project_id)}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: registration.token,
          notification: { title: notification.title, body: notification.body },
          data: Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, stringifyData(value)]),
          ),
          android: {
            priority: 'high',
            notification: { channel_id: 'bbmedia_general' },
          },
        },
      }),
    },
  );
  if (response.ok) {
    await prisma.userNotification.update({
      where: { id: notification.id },
      data: { deliveryStatus: 'sent', deliveryError: null, sentAt: new Date() },
    });
    return;
  }

  const errorBody = (await response.text()).slice(0, 1000);
  const permanentlyInvalid = response.status === 404 ||
    (response.status === 400 && /UNREGISTERED|INVALID_ARGUMENT/i.test(errorBody));
  await prisma.$transaction([
    prisma.userNotification.update({
      where: { id: notification.id },
      data: {
        deliveryStatus: permanentlyInvalid ? 'invalid_registration' : 'retrying',
        deliveryError: `FCM HTTP ${response.status}: ${errorBody}`.slice(0, 1200),
      },
    }),
    ...(permanentlyInvalid
      ? [prisma.clientPushRegistration.update({
          where: { id: registration.id },
          data: { enabled: false },
        })]
      : []),
  ]);
  if (!permanentlyInvalid) throw new Error(`FCM delivery failed with HTTP ${response.status}`);
}

export async function queueOfflineReadyNotification(
  prisma: PrismaClient,
  job: PushJob,
): Promise<void> {
  const downloadId = stringValue(objectValue(job.payload).downloadId);
  if (!downloadId) return;
  const download = await prisma.offlineDownload.findUnique({
    where: { id: downloadId },
    include: {
      profile: { select: { userId: true } },
      media: { select: { title: true, seriesTitle: true } },
    },
  });
  if (!download || download.status !== 'ready') return;
  const registrations = await prisma.clientPushRegistration.findMany({
    where: {
      accountId: download.accountId,
      userId: download.profile.userId,
      enabled: true,
    },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    const notification = await tx.userNotification.create({
      data: {
        accountId: download.accountId,
        userId: download.profile.userId,
        profileId: download.profileId,
        type: 'offline.ready',
        title: 'Klar til offline afspilning',
        body: `${download.media.seriesTitle || download.media.title} er hentet og krypteret.`,
        data: { route: '/downloads', mediaId: download.mediaId, downloadId: download.id },
        deliveryStatus: registrations.length > 0 ? 'queued' : 'in_app_only',
      },
    });
    for (const registration of registrations) {
      await tx.systemJob.create({
        data: {
          accountId: download.accountId,
          type: 'notification.push',
          status: 'queued',
          payload: { notificationId: notification.id, registrationId: registration.id },
          maxAttempts: 4,
        },
      });
    }
  });
}

export function buildServiceAccountAssertion(
  account: ServiceAccount,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: account.token_uri || 'https://oauth2.googleapis.com/token',
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .end()
    .sign(account.private_key);
  return `${signingInput}.${base64Url(signature)}`;
}

async function serviceAccountAccessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildServiceAccountAssertion(account),
    }),
  });
  if (!response.ok) throw new Error(`Firebase OAuth failed with HTTP ${response.status}`);
  const json = await response.json() as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error('Firebase OAuth response did not include an access token');
  cachedAccessToken = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(300, json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

function loadServiceAccount(): ServiceAccount | null {
  const encoded = process.env.BB_MEDIA_FCM_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : path
      ? readFileSync(path, 'utf8')
      : null;
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!value.project_id || !value.client_email || !value.private_key) {
    throw new Error('Firebase service account is incomplete');
  }
  return value as ServiceAccount;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringifyData(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value ?? null);
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}
