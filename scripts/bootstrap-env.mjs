#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const root = process.cwd();
const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');

function loadFile(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function parseEnv(raw: string): Map<string, string> {
  const map = new Map<string, string>();

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const idx = line.indexOf('=');
    if (idx <= 0) {
      return;
    }

    const key = line.substring(0, idx).trim();
    const value = line.substring(idx + 1).trim();
    if (key) {
      map.set(key, value);
    }
  });

  return map;
}

function isPlaceholder(value: string): boolean {
  const lowered = value.toLowerCase();
  return !value ||
    value.startsWith('change-') ||
    lowered.includes('replace') ||
    lowered.includes('setme') ||
    lowered.includes('please') ||
    lowered.includes('todo');
}

function ensureGeneratedKeys(vars: Map<string, string>) {
  const secret = vars.get('JWT_SECRET') ?? '';
  if (!secret || secret.trim().length < 16 || isPlaceholder(secret)) {
    const next = randomBytes(48).toString('hex');
    vars.set('JWT_SECRET', next);
  }

  const encryption = vars.get('ENCRYPTION_KEY') ?? '';
  if (!encryption || encryption.trim().length < 16 || isPlaceholder(encryption) || !encryption.startsWith('base64:')) {
    vars.set('ENCRYPTION_KEY', `base64:${randomBytes(32).toString('base64')}`);
  }

  if (!vars.has('BB_MEDIA_UPDATE_REPO_PATH') || !vars.get('BB_MEDIA_UPDATE_REPO_PATH')) {
    vars.set('BB_MEDIA_UPDATE_REPO_PATH', root.replace(/\\/g, '/'));
  }

  if (!vars.has('BB_MEDIA_UPDATE_GIT_REMOTE') || !vars.get('BB_MEDIA_UPDATE_GIT_REMOTE')) {
    vars.set('BB_MEDIA_UPDATE_GIT_REMOTE', 'origin');
  }

  if (!vars.has('BB_MEDIA_UPDATE_GIT_BRANCH') || !vars.get('BB_MEDIA_UPDATE_GIT_BRANCH')) {
    vars.set('BB_MEDIA_UPDATE_GIT_BRANCH', 'main');
  }

  if (!vars.has('BB_MEDIA_UPDATE_RESTART_MODE') || !vars.get('BB_MEDIA_UPDATE_RESTART_MODE')) {
    vars.set('BB_MEDIA_UPDATE_RESTART_MODE', 'docker-compose');
  }

  if (!vars.has('BB_MEDIA_UPDATE_AUTO_RESTART')) {
    vars.set('BB_MEDIA_UPDATE_AUTO_RESTART', 'true');
  }
}

function renderEnv(vars: Map<string, string>, source: string): string {
  const keep = new Set<string>(vars.keys());
  const out: string[] = [];

  source.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      out.push(line);
      return;
    }

    const eq = line.indexOf('=');
    if (eq <= 0) {
      out.push(line);
      return;
    }

    const key = line.substring(0, eq).trim();
    if (vars.has(key)) {
      out.push(`${key}=${vars.get(key)}`);
      keep.delete(key);
    } else {
      out.push(line);
    }
  });

  keep.forEach((key) => {
    out.push(`${key}=${vars.get(key)}`);
  });

  return out.join('\n').replace(/\n+$/, '\n');
}

function main() {
  if (!existsSync(examplePath)) {
    throw new Error(`Missing ${examplePath}. Run this script from repository root.`);
  }

  const source = existsSync(envPath) ? loadFile(envPath) : loadFile(examplePath);
  const vars = parseEnv(source);
  ensureGeneratedKeys(vars);

  const updated = renderEnv(vars, source);
  writeFileSync(envPath, updated, 'utf8');

  console.log('Updated', envPath, 'with generated secure defaults where needed.');
}

main();
