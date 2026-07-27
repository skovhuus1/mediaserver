#!/usr/bin/env node
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(repositoryRoot, '.env');
const examplePath = join(repositoryRoot, '.env.example');
const temporaryPath = `${envPath}.tmp`;

function parseEnvironment(source) {
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1));
  }
  return values;
}

function isMissingSecret(value) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return normalized.includes('change-me') || normalized.includes('replace-me') || normalized.includes('todo');
}

if (!existsSync(examplePath)) {
  throw new Error(`Missing environment template: ${examplePath}`);
}

const template = readFileSync(examplePath, 'utf8');
const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : template;
const values = parseEnvironment(current);

if (isMissingSecret(values.get('JWT_SECRET'))) {
  values.set('JWT_SECRET', randomBytes(64).toString('hex'));
}
if (isMissingSecret(values.get('ENCRYPTION_KEY'))) {
  values.set('ENCRYPTION_KEY', `base64:${randomBytes(32).toString('base64')}`);
}
if (!values.get('BB_MEDIA_UPDATE_REPO_PATH')) {
  values.set('BB_MEDIA_UPDATE_REPO_PATH', repositoryRoot.replaceAll('\\', '/'));
}

const knownKeys = new Set(values.keys());
const output = [];
for (const rawLine of template.split(/\r?\n/)) {
  const line = rawLine.trim();
  const separator = line.indexOf('=');
  if (!line || line.startsWith('#') || separator <= 0) {
    output.push(rawLine);
    continue;
  }
  const key = line.slice(0, separator).trim();
  output.push(`${key}=${values.get(key) ?? ''}`);
  knownKeys.delete(key);
}
for (const key of knownKeys) {
  output.push(`${key}=${values.get(key) ?? ''}`);
}

writeFileSync(temporaryPath, `${output.join('\n').replace(/\n+$/, '')}\n`, { encoding: 'utf8', mode: 0o600 });
renameSync(temporaryPath, envPath);
try {
  chmodSync(envPath, 0o600);
} catch {
  // Windows does not implement POSIX file modes.
}
console.log(`Environment ready at ${envPath}. Secrets were not printed.`);
