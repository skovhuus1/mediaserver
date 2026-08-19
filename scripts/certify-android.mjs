#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const options = parse(process.argv.slice(2));
if (!options.apk || !options.server) usage('Både --apk og --server er påkrævet.');
const apk = resolve(options.apk);
if (!existsSync(apk)) usage(`APK findes ikke: ${apk}`);
const adbExecutable = findAdb();
const output = resolve(options.output || `artifacts/android-certification-${Date.now()}`);
await mkdir(output, { recursive: true });

const devicesResult = adb(['devices']);
if (devicesResult.status !== 0) {
  usage(`ADB kunne ikke hente enhedslisten: ${devicesResult.stderr || devicesResult.stdout || 'ukendt fejl'}`);
}
const devices = String(devicesResult.stdout || '')
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim().split(/\s+/))
  .filter((parts) => parts[0] && parts[1] === 'device')
  .map((parts) => parts[0]);
const serial = options.serial || (devices.length === 1 ? devices[0] : null);
if (!serial) usage(`Vælg en enhed med --serial. Fundet: ${devices.join(', ') || 'ingen'}`);
const target = ['-s', serial];
const packageName = 'com.boltbytes.boltbytes_media';

const health = await fetch(new URL('/api/v1/system/health', options.server));
if (!health.ok) throw new Error(`Server health fejlede med HTTP ${health.status}`);
const install = adb([...target, 'install', '-r', apk]);
if (install.status !== 0) throw new Error(install.stderr || install.stdout);
adb([...target, 'shell', 'am', 'force-stop', packageName]);
adb([...target, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
await delay(4_000);

const evidence = {
  generatedAt: new Date().toISOString(),
  variant: options.variant || 'mobile',
  server: new URL(options.server).origin,
  serial,
  apk: basename(apk),
  apkSha256: createHash('sha256').update(await readFile(apk)).digest('hex'),
  device: {
    model: shellProp('ro.product.model'),
    manufacturer: shellProp('ro.product.manufacturer'),
    android: shellProp('ro.build.version.release'),
    sdk: shellProp('ro.build.version.sdk'),
    abi: shellProp('ro.product.cpu.abi'),
  },
};
await writeFile(resolve(output, 'environment.json'), `${JSON.stringify(evidence, null, 2)}\n`);
await writeText('package.txt', adb([...target, 'shell', 'dumpsys', 'package', packageName]).stdout);
await writeText('activity.txt', adb([...target, 'shell', 'dumpsys', 'activity', 'activities']).stdout);
await writeText('media-session.txt', adb([...target, 'shell', 'dumpsys', 'media_session']).stdout);
await writeText('logcat.txt', adb([...target, 'logcat', '-d', '-t', '2000']).stdout);
const screenshot = spawnSync(adbExecutable, [...target, 'exec-out', 'screencap', '-p'], {
  encoding: null,
  windowsHide: true,
});
if (screenshot.status === 0 && screenshot.stdout) {
  await writeFile(resolve(output, 'launch.png'), screenshot.stdout);
}
const crashText = await readFile(resolve(output, 'logcat.txt'), 'utf8');
const crashes = crashText.split(/\r?\n/).filter((line) =>
  /FATAL EXCEPTION|AndroidRuntime/.test(line) && line.includes(packageName));
await writeFile(resolve(output, 'acceptance.md'), checklist(evidence, crashes));
if (crashes.length) {
  console.error(`Certificering stoppet: ${crashes.length} crash-linjer. Se ${output}`);
  process.exitCode = 1;
} else {
  console.log(`Automatiske gates bestået. Udfør og markér de manuelle gates i ${resolve(output, 'acceptance.md')}`);
}

function adb(args) {
  return spawnSync(adbExecutable, args, { encoding: 'utf8', windowsHide: true });
}

function shellProp(name) {
  return String(adb([...target, 'shell', 'getprop', name]).stdout || '').trim();
}

function findAdb() {
  const executable = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', executable),
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', executable),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', executable),
    executable,
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    if (candidate !== executable && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['version'], { encoding: 'utf8', windowsHide: true });
    if (!result.error && result.status === 0) return candidate;
  }

  usage('ADB blev ikke fundet. Installér Android SDK Platform-Tools eller sæt ANDROID_SDK_ROOT.');
}

async function writeText(name, value) {
  await writeFile(resolve(output, name), value || 'Ingen output\n');
}

function checklist(data, crashes) {
  return `# BoltBytes Android-certificering

- Dato: ${data.generatedAt}
- Variant: ${data.variant}
- Enhed: ${data.device.manufacturer} ${data.device.model}, Android ${data.device.android}
- APK SHA-256: \`${data.apkSha256}\`
- Server: ${data.server}
- Automatiske crash-fund: ${crashes.length}

## Mobil og fælles playback

- [ ] Login, profilvalg og genstart bevarer sessionen.
- [ ] Direct Play starter, søger 20 minutter frem og genoptager korrekt.
- [ ] HLS Auto starter sømløst og manuelt niveau forbliver låst.
- [ ] Standardundertekst vises efter resume; skift og offset virker.
- [ ] PiP aktiveres, og play/pause/seek virker fra systemmediekontroller.
- [ ] Appen vender tilbage fra baggrunden uden ny reservation eller A/V-drift.

## Android TV

- [ ] D-pad kan nå alle topmenuer, kort, sæsoner, playerkontroller og tilbageknap.
- [ ] Fokus er synligt og gendannes efter player/detailvisning.
- [ ] 4K/HDR Direct Play rapporteres korrekt på kompatibelt TV.

## Chromecast

- [ ] Cast-enheden opdages på samme netværk via HTTPS.
- [ ] Handoff bevarer position og én logical session.
- [ ] Pause, seek, lydspor og WebVTT-undertekster virker fra senderen.
- [ ] Afslutning eller netværksbrud frigiver reservationen.

## Offline

- [ ] 720p og 1080p kan sættes i kø og viser worker-/transferprogress.
- [ ] Download fortsætter med appen i baggrunden.
- [ ] Flytilstand åbner offlinebiblioteket og afspiller med resume.
- [ ] Udløbet licens afvises, og online genforbindelse fornyer licensen.
- [ ] Slet download fjerner både lokal fil og server-ledger.

Gem udfyldt fil, screenshot og logfiler som release-evidens.
`;
}

function parse(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith('--')) continue;
    result[key.slice(2)] = args[index + 1];
    index += 1;
  }
  return result;
}

function usage(message) {
  console.error(message);
  console.error('Brug: node scripts/certify-android.mjs --apk <fil> --server https://media.boltbytes.com [--variant mobile|tv] [--serial ID] [--output mappe]');
  process.exit(2);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
