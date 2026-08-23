import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workDatabaseHeader = /^androidx\.work\.impl\.WorkDatabase_Impl -> [^:]+:$/mu;
const classHeader = /^[^\s#][^\r\n]*:$/mu;
const noArgConstructor = /^\s+.*void <init>\(\).* -> <init>$/mu;

export function assertAndroidShrinkerMapping(mapping) {
  const match = workDatabaseHeader.exec(mapping);
  if (!match) {
    throw new Error("R8 mapping mangler androidx.work.impl.WorkDatabase_Impl");
  }

  const remainder = mapping.slice(match.index + match[0].length);
  const nextClass = classHeader.exec(remainder);
  const classBody = nextClass ? remainder.slice(0, nextClass.index) : remainder;
  if (!noArgConstructor.test(classBody)) {
    throw new Error(
      "R8 fjernede WorkDatabase_Impl.<init>(); release-APK'en vil crashe under AndroidX Startup",
    );
  }

  return true;
}

async function main() {
  const mappingPath = process.argv[2];
  if (!mappingPath) {
    throw new Error("Brug: node scripts/assert-android-shrinker.mjs <mapping.txt>");
  }
  const mapping = await readFile(resolve(mappingPath), "utf8");
  assertAndroidShrinkerMapping(mapping);
  console.log("Android shrinker gate: WorkDatabase_Impl.<init>() er bevaret.");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
