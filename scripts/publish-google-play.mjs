import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [bundlePath, packageName, track = 'internal', releaseName = 'BoltBytes Media'] = process.argv.slice(2);
if (!bundlePath || !packageName) {
  throw new Error('Usage: node scripts/publish-google-play.mjs <aab> <package> [track] [release-name]');
}
if (!['internal', 'alpha', 'beta', 'production'].includes(track)) {
  throw new Error(`Unsupported Google Play track: ${track}`);
}
const encoded = process.env.BB_MEDIA_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64?.trim();
if (!encoded) throw new Error('BB_MEDIA_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64 is required');
const service = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
if (!service.client_email || !service.private_key || !service.token_uri) {
  throw new Error('Google Play service account JSON is incomplete');
}

const accessToken = await oauthToken(service);
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
const edit = await requestJson(`${api}/edits`, {
  method: 'POST',
  headers: authHeaders(accessToken, 'application/json'),
  body: '{}',
});
if (!edit.id) throw new Error('Google Play did not return an edit id');

const bundle = await readFile(bundlePath);
const uploaded = await requestJson(
  `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/edits/${edit.id}/bundles?uploadType=media`,
  {
    method: 'POST',
    headers: authHeaders(accessToken, 'application/octet-stream'),
    body: bundle,
  },
);
if (!uploaded.versionCode) throw new Error('Google Play did not return the uploaded version code');

await requestJson(`${api}/edits/${edit.id}/tracks/${encodeURIComponent(track)}`, {
  method: 'PUT',
  headers: authHeaders(accessToken, 'application/json'),
  body: JSON.stringify({
    track,
    releases: [{
      name: releaseName,
      status: 'completed',
      versionCodes: [String(uploaded.versionCode)],
    }],
  }),
});
await requestJson(`${api}/edits/${edit.id}:commit`, {
  method: 'POST',
  headers: authHeaders(accessToken, 'application/json'),
  body: '{}',
});
process.stdout.write(`Published version ${uploaded.versionCode} to Google Play track ${track}\n`);

async function oauthToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(unsigned).end().sign(account.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(account.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Google OAuth failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  const parsed = JSON.parse(body);
  if (!parsed.access_token) throw new Error('Google OAuth response has no access token');
  return parsed.access_token;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`Google Play API failed with HTTP ${response.status}: ${body.slice(0, 1000)}`);
  return body ? JSON.parse(body) : {};
}

function authHeaders(token, contentType) {
  return { authorization: `Bearer ${token}`, 'content-type': contentType };
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}
