import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Brug: npm run version:set -- <major.minor.patch>');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifests = ['package.json', 'services/api/package.json', 'services/worker/package.json', 'web/admin/package.json', 'shared/contracts/package.json'];
for (const relative of manifests) {
  const path = resolve(root, relative);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.version = version;
  if (manifest.dependencies?.['@boltbytes/contracts'] && !manifest.dependencies['@boltbytes/contracts'].startsWith('file:')) manifest.dependencies['@boltbytes/contracts'] = version;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

const lockPath = resolve(root, 'package-lock.json');
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
lock.version = version;
for (const key of ['', 'services/api', 'services/worker', 'web/admin', 'shared/contracts']) {
  if (!lock.packages?.[key]) continue;
  lock.packages[key].version = version;
  if (lock.packages[key].dependencies?.['@boltbytes/contracts'] && !lock.packages[key].dependencies['@boltbytes/contracts'].startsWith('file:')) lock.packages[key].dependencies['@boltbytes/contracts'] = version;
}
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const releasePath = resolve(root, 'shared/contracts/src/release.ts');
const release = await readFile(releasePath, 'utf8');
await writeFile(releasePath, release.replace(/BB_MEDIA_VERSION = '[^']+'/u, `BB_MEDIA_VERSION = '${version}'`));

const flutterManifestPath = resolve(root, 'clients/mobile-tv/pubspec.yaml');
const flutterManifest = await readFile(flutterManifestPath, 'utf8');
const flutterVersionMatch = flutterManifest.match(/^version:\s*([^+\s]+)(?:\+(\d+))?\s*$/mu);
if (!flutterVersionMatch) throw new Error('clients/mobile-tv/pubspec.yaml mangler et gyldigt version-felt');
const currentFlutterVersion = flutterVersionMatch[1];
const currentBuildNumber = Number.parseInt(flutterVersionMatch[2] ?? '0', 10);
const nextBuildNumber = currentFlutterVersion === version
  ? Math.max(1, currentBuildNumber)
  : Math.max(1, currentBuildNumber + 1);
await writeFile(
  flutterManifestPath,
  flutterManifest.replace(
    /^version:\s*[^\r\n]+$/mu,
    `version: ${version}+${nextBuildNumber}`,
  ),
);
console.log(`BoltBytes Media Server version sat til ${version}.`);
