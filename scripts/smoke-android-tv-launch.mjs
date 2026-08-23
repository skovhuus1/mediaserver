import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageId = "com.boltbytes.boltbytes_media";
const activity = `${packageId}/.MainActivity`;
const apkPath = resolve(process.argv[2] ?? "");
const timeoutSeconds = Number.parseInt(process.env.BB_ANDROID_SMOKE_TIMEOUT ?? "20", 10);

if (!process.argv[2] || !existsSync(apkPath)) {
  throw new Error("Brug: node scripts/smoke-android-tv-launch.mjs <app-tv-release.apk>");
}

function findAdb() {
  const sdkRoots = [process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME].filter(Boolean);
  for (const root of sdkRoots) {
    const candidate = join(root, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
    if (existsSync(candidate)) return candidate;
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(directory, process.platform === "win32" ? "adb.exe" : "adb");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("adb blev ikke fundet i ANDROID_SDK_ROOT, ANDROID_HOME eller PATH");
}

const adb = findAdb();
const serial = process.env.ANDROID_SERIAL;
const prefix = serial ? ["-s", serial] : [];

function run(args, { allowFailure = false } = {}) {
  const result = spawnSync(adb, [...prefix, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`adb ${args.join(" ")} fejlede:\n${result.stderr || result.stdout}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

run(["wait-for-device"]);
console.log(run(["install", "-r", apkPath]));
run(["logcat", "-c"]);
run(["shell", "am", "force-stop", packageId]);
console.log(
  run([
    "shell", "am", "start", "-W", "-n", activity,
    "-a", "android.intent.action.MAIN",
    "-c", "android.intent.category.LEANBACK_LAUNCHER",
  ]),
);

const deadline = Date.now() + timeoutSeconds * 1000;
let pid = "";
while (Date.now() < deadline) {
  sleep(1000);
  pid = run(["shell", "pidof", packageId], { allowFailure: true }).trim();
  if (!pid) break;
}

const crashBuffer = run(["logcat", "-b", "crash", "-d", "-v", "threadtime"], {
  allowFailure: true,
});
const appCrash = crashBuffer.includes(`Process: ${packageId}`);
if (!pid || appCrash) {
  throw new Error(
    `TV launch smoke fejlede: processen overlevede ikke ${timeoutSeconds}s.\n${crashBuffer}`,
  );
}

const resumed = run(["shell", "dumpsys", "activity", "activities"], {
  allowFailure: true,
});
if (!resumed.includes(activity)) {
  throw new Error(`TV launch smoke fejlede: ${activity} er ikke aktiv efter launch`);
}

console.log(`TV launch smoke bestået: PID ${pid}, ${activity} er aktiv.`);
