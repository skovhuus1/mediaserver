import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageId = "com.boltbytes.boltbytes_media.tv";
const activity = `${packageId}/com.boltbytes.boltbytes_media.MainActivity`;
const apkPath = resolve(process.argv[2] ?? "");
const timeoutSeconds = Number.parseInt(process.env.BB_ANDROID_SMOKE_TIMEOUT ?? "60", 10);
const startupDeadlineMs = Number.parseInt(process.env.BB_ANDROID_STARTUP_DEADLINE_MS ?? "8000", 10);
const clearData = (process.env.BB_ANDROID_SMOKE_CLEAR_DATA ?? "true").toLowerCase() === "true";
const rebootDevice = (process.env.BB_ANDROID_SMOKE_REBOOT ?? "false").toLowerCase() === "true";
const requireFocusDiagnostics = (process.env.BB_ANDROID_REQUIRE_FOCUS_DIAGNOSTICS ?? "false").toLowerCase() === "true";
const dpadSequence = (process.env.BB_ANDROID_SMOKE_DPAD_SEQUENCE ??
  "KEYCODE_DPAD_RIGHT,KEYCODE_DPAD_LEFT,KEYCODE_DPAD_DOWN,KEYCODE_DPAD_UP")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!process.argv[2] || !existsSync(apkPath)) {
  throw new Error("Brug: node scripts/smoke-android-tv-launch.mjs <app-tv-release.apk>");
}

function findAdb() {
  const sdkRoots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.env.USERPROFILE
      ? join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk")
      : null,
  ].filter(Boolean);
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
if (clearData) console.log(run(["shell", "pm", "clear", packageId]));
if (rebootDevice) {
  run(["reboot"], { allowFailure: true });
  run(["wait-for-device"]);
  sleep(5000);
}
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
let resumed = "";
let startupElapsedMs = null;
while (Date.now() < deadline) {
  sleep(1000);
  pid = run(["shell", "pidof", packageId], { allowFailure: true }).trim();
  resumed = run(["shell", "dumpsys", "activity", "activities"], {
    allowFailure: true,
  });
  const startupLog = run(["logcat", "-d", "-v", "brief"], {
    allowFailure: true,
  });
  const startupMatches = [...startupLog.matchAll(/BB_STARTUP_READY destination=\w+ elapsedMs=(\d+)/g)];
  if (startupMatches.length > 0) startupElapsedMs = Number.parseInt(startupMatches.at(-1)[1], 10);
  if (pid && resumed.includes(activity) && startupElapsedMs != null) break;
}

if (!pid || !resumed.includes(activity) || startupElapsedMs == null) {
  throw new Error(
    `TV launch smoke fejlede: aktivitet og startup-markor blev ikke klar inden ${timeoutSeconds}s.`,
  );
}
if (startupElapsedMs > startupDeadlineMs) {
  throw new Error(`TV startup brugte ${startupElapsedMs} ms; gransen er ${startupDeadlineMs} ms.`);
}
console.log(`TV startup bestået efter ${startupElapsedMs} ms.`);

for (const keyCode of dpadSequence) {
  run(["shell", "input", "keyevent", keyCode]);
  sleep(150);
}
console.log(`D-pad smoke sendte ${dpadSequence.length} input: ${dpadSequence.join(", ")}`);
sleep(2000);
pid = run(["shell", "pidof", packageId], { allowFailure: true }).trim();

const crashBuffer = run(["logcat", "-b", "crash", "-d", "-v", "threadtime"], {
  allowFailure: true,
});
const systemLog = run(["logcat", "-d", "-v", "threadtime"], {
  allowFailure: true,
});
const appCrash = crashBuffer.includes(`Process: ${packageId}`);
const appAnr =
  systemLog.includes(`ANR in ${packageId}`) ||
  systemLog.includes(`ANR in ActivityRecord`) && systemLog.includes(packageId);
const focusSamples = [...systemLog.matchAll(/BB_TV_FOCUS_LATENCY_MS=([0-9.]+)/g)].map((match) => Number(match[1]));
if (requireFocusDiagnostics && focusSamples.length === 0) {
  throw new Error("TV focus diagnostics var kraevet, men ingen samples blev registreret.");
}
if (focusSamples.some((value) => value >= 100)) {
  throw new Error(`TV focus latency overskred 100 ms: ${Math.max(...focusSamples)} ms.`);
}
if (!pid || appCrash || appAnr) {
  throw new Error(
    `TV launch smoke fejlede efter D-pad-input.\n${crashBuffer}`,
  );
}

resumed = run(["shell", "dumpsys", "activity", "activities"], {
  allowFailure: true,
});
if (!resumed.includes(activity)) {
  throw new Error(`TV launch smoke fejlede: ${activity} er ikke aktiv efter launch`);
}

console.log(`TV launch smoke bestået: PID ${pid}, ${activity} er aktiv.`);
