import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifests = ['package.json', 'services/api/package.json', 'services/worker/package.json', 'web/admin/package.json', 'shared/contracts/package.json'];
const parsed = await Promise.all(manifests.map(async (relative) => [relative, JSON.parse(await readFile(resolve(root, relative), 'utf8'))]));
const version = parsed[0][1].version;
const errors = [];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) errors.push(`Ugyldig SemVer i package.json: ${version}`);
for (const [relative, manifest] of parsed) if (manifest.version !== version) errors.push(`${relative} har ${manifest.version}, forventede ${version}`);
const admin = parsed.find(([relative]) => relative === 'web/admin/package.json')?.[1];
if (admin?.dependencies?.['@boltbytes/contracts'] !== version) errors.push(`web/admin kræver contracts ${admin?.dependencies?.['@boltbytes/contracts']}, forventede ${version}`);
const release = await readFile(resolve(root, 'shared/contracts/src/release.ts'), 'utf8');
if (!release.includes(`BB_MEDIA_VERSION = '${version}'`)) errors.push('Den offentlige health-version matcher ikke package-versionen');
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
if (lock.version !== version || lock.packages?.['']?.version !== version) errors.push('package-lock.json matcher ikke releaseversionen');
for (const key of ['services/api', 'services/worker', 'web/admin', 'shared/contracts']) if (lock.packages?.[key]?.version !== version) errors.push(`package-lock workspace ${key} matcher ikke ${version}`);
const flutterManifest = await readFile(resolve(root, 'clients/mobile-tv/pubspec.yaml'), 'utf8');
const flutterVersionMatch = flutterManifest.match(/^version:\s*([^+\s]+)(?:\+(\d+))?\s*$/mu);
if (!flutterVersionMatch) {
  errors.push('clients/mobile-tv/pubspec.yaml mangler et gyldigt version-felt');
} else {
  if (flutterVersionMatch[1] !== version) errors.push(`Flutter-klienten har ${flutterVersionMatch[1]}, forventede ${version}`);
  if (!/^\d+$/u.test(flutterVersionMatch[2] ?? '') || Number(flutterVersionMatch[2]) < 1) errors.push('Flutter-klienten mangler et positivt Android buildnummer');
}
const readme = await readFile(resolve(root, 'README.md'), 'utf8');
if (!readme.includes(`Aktuel release: **${version}**`)) errors.push(`README.md viser ikke aktuel release ${version}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Releaseversion ${version} er konsistent i workspaces, lockfil, API-kontrakt, Flutter-klient og README.`);
