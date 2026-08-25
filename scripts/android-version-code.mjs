import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE = 100_000_000;
const MAX_ANDROID_VERSION_CODE = 2_100_000_000;

export function parseStableAndroidVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version ?? "");
  if (!match) {
    throw new Error(`Android releases require numeric semver: ${version}`);
  }
  const [, majorValue, minorValue, patchValue] = match;
  const major = Number.parseInt(majorValue, 10);
  const minor = Number.parseInt(minorValue, 10);
  const patch = Number.parseInt(patchValue, 10);
  if (major > 1999 || minor > 99 || patch > 99) {
    throw new Error(
      `Android semver is outside supported bounds: ${version} ` +
        "(major <= 1999, minor <= 99, patch <= 99)",
    );
  }
  return { major, minor, patch };
}

export function computeAndroidVersionCode(version, runAttempt = 1) {
  const { major, minor, patch } = parseStableAndroidVersion(version);
  const attempt = Number(runAttempt);
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 99) {
    throw new Error(`Workflow run attempt must be an integer from 1 to 99: ${runAttempt}`);
  }
  const code = BASE + major * 1_000_000 + minor * 10_000 + patch * 100 + attempt;
  if (code >= MAX_ANDROID_VERSION_CODE) {
    throw new Error(`Android versionCode exceeds the Play limit: ${code}`);
  }
  return code;
}

export function compareStableVersions(left, right) {
  const a = parseStableAndroidVersion(left);
  const b = parseStableAndroidVersion(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return Math.sign(a[key] - b[key]);
  }
  return 0;
}

export function assertAndroidVersionIsNewer(version, previousVersion) {
  if (previousVersion && compareStableVersions(version, previousVersion) <= 0) {
    throw new Error(
      `Android release ${version} must be newer than existing release ${previousVersion}`,
    );
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null) {
      throw new Error(
        "Usage: node scripts/android-version-code.mjs --version X.Y.Z " +
          "--attempt N [--previous-version X.Y.Z]",
      );
    }
    args[key.slice(2)] = value;
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.version || !args.attempt) throw new Error("--version and --attempt are required");
  assertAndroidVersionIsNewer(args.version, args["previous-version"]);
  const code = computeAndroidVersionCode(args.version, args.attempt);
  process.stdout.write(`${code}\n`);
  return code;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
