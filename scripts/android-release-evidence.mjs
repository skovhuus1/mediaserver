import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const PACKAGE_ID = "com.boltbytes.boltbytes_media";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
    values[argument.slice(2)] = value;
    index += 1;
  }
  return values;
}

function normalizeFingerprint(value) {
  return value.replaceAll(":", "").replaceAll(" ", "").toLowerCase();
}

export function parseApkSignerOutput(output) {
  const fingerprint = output.match(/certificate SHA-256 digest:\s*([0-9a-f:]+)/i)?.[1];
  const distinguishedName = output.match(/certificate DN:\s*(.+)/i)?.[1]?.trim() ?? "";
  const scheme = (version) =>
    output.match(new RegExp(`Verified using v${version} scheme[^:]*:\\s*(true|false)`, "i"))?.[1]?.toLowerCase() === "true";
  return {
    certificateSha256: fingerprint ? normalizeFingerprint(fingerprint) : null,
    distinguishedName,
    debugCertificate: /CN=Android Debug/i.test(distinguishedName),
    verifiedV1: scheme(1),
    verifiedV2: scheme(2),
    verifiedV3: scheme(3),
    verifiedV4: scheme(4),
  };
}

export function parseKeytoolFingerprint(output) {
  const fingerprint = output.match(/SHA256:\s*([0-9a-f:]+)/i)?.[1];
  return fingerprint ? normalizeFingerprint(fingerprint) : null;
}

function hasRequiredFeature(manifest, name) {
  const tags = manifest.match(/<uses-feature\b[^>]*>/g) ?? [];
  return tags.some((tag) => tag.includes(`android:name=\"${name}\"`) && tag.includes('android:required="true"'));
}

function hasMetadataValue(manifest, name, value) {
  const tags = manifest.match(/<meta-data\b[^>]*>/g) ?? [];
  return tags.some((tag) => tag.includes(`android:name=\"${name}\"`) && tag.includes(`android:value=\"${value}\"`));
}

export function validateArtifactSet({ mobile, tv, aab, expected, allowDebugSigning = false }) {
  const gates = [];
  const gate = (id, passed, detail) => gates.push({ id, passed: Boolean(passed), detail });
  for (const [variant, artifact] of [["mobile", mobile], ["tv", tv]]) {
    gate(`${variant}.package`, artifact.packageId === PACKAGE_ID, `${artifact.packageId} == ${PACKAGE_ID}`);
    gate(`${variant}.version_name`, artifact.versionName === expected.version, `${artifact.versionName} == ${expected.version}`);
    gate(`${variant}.version_code`, String(artifact.versionCode) === String(expected.buildNumber), `${artifact.versionCode} == ${expected.buildNumber}`);
    gate(`${variant}.certificate`, Boolean(artifact.signing.certificateSha256), "Signing certificate is readable");
    gate(`${variant}.modern_signature`, artifact.signing.verifiedV2 || artifact.signing.verifiedV3, "APK Signature Scheme v2 or newer verified");
    gate(`${variant}.release_certificate`, allowDebugSigning || !artifact.signing.debugCertificate, allowDebugSigning ? "Debug certificate explicitly allowed for CI" : "Android Debug certificate is forbidden");
    gate(`${variant}.install_packages`, !artifact.manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES"), "REQUEST_INSTALL_PACKAGES is absent");
  }
  gate("mobile.launcher", mobile.manifest.includes("android.intent.category.LAUNCHER"), "Mobile exposes the touch launcher");
  gate("mobile.not_tv_launcher", !mobile.manifest.includes("android.intent.category.LEANBACK_LAUNCHER"), "Mobile does not expose the TV launcher");
  gate("mobile.cast_provider", mobile.manifest.includes("com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"), "Mobile initializes the Google Cast sender provider");
  gate("tv.launcher", tv.manifest.includes("android.intent.category.LEANBACK_LAUNCHER"), "TV exposes the Leanback launcher");
  gate("tv.leanback_required", hasRequiredFeature(tv.manifest, "android.software.leanback"), "TV requires android.software.leanback");
  gate("tv.impeller_disabled", hasMetadataValue(tv.manifest, "io.flutter.embedding.android.EnableImpeller", "false"), "TV disables Impeller for broad graphics-driver compatibility");
  gate("tv.no_cast_provider", !tv.manifest.includes("com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"), "TV does not initialize the mobile Cast sender provider");
  gate("variants.distinct", mobile.sha256 !== tv.sha256, "Mobile and TV APK hashes differ");
  gate("variants.same_certificate", mobile.signing.certificateSha256 === tv.signing.certificateSha256, "Mobile and TV certificates match");
  if (aab) {
    gate("aab.signature", aab.signatureVerified, "AAB JAR signature verified");
    gate("aab.same_certificate", aab.certificateSha256 === mobile.signing.certificateSha256, "AAB and APK certificates match");
  }
  return { passed: gates.every((entry) => entry.passed), gates };
}

function versionDirectories(directory) {
  if (!directory || !existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

function resolveTool(name) {
  const isAndroidBatch = name === "apkanalyzer" || name === "apksigner";
  const executable = process.platform === "win32" ? `${name}${isAndroidBatch ? ".bat" : ".exe"}` : name;
  const sdkCandidates = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk") : null,
    process.env.HOME ? join(process.env.HOME, "Android", "Sdk") : null,
  ].filter(Boolean);
  const sdk = sdkCandidates.find((candidate) => existsSync(candidate));
  const javaHome = process.env.JAVA_HOME;
  const candidates = [];
  if (name === "apkanalyzer" && sdk) {
    for (const directory of ["latest", ...versionDirectories(join(sdk, "cmdline-tools"))]) candidates.push(join(sdk, "cmdline-tools", directory, "bin", executable));
    candidates.push(join(sdk, "tools", "bin", executable));
  }
  if (name === "apksigner" && sdk) {
    for (const directory of versionDirectories(join(sdk, "build-tools"))) candidates.push(join(sdk, "build-tools", directory, executable));
  }
  if ((name === "keytool" || name === "jarsigner") && javaHome) candidates.push(join(javaHome, "bin", executable));
  return candidates.find((candidate) => existsSync(candidate)) ?? name;
}

function run(tool, args) {
  const isWindowsBatch = process.platform === "win32" && /\.(bat|cmd)$/i.test(tool);
  const executable = isWindowsBatch ? (process.env.ComSpec ?? "cmd.exe") : tool;
  const commandArguments = isWindowsBatch ? ["/d", "/s", "/c", tool, ...args] : args;
  const result = spawnSync(executable, commandArguments, { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${basename(tool)} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function hash(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function inspectApk(filePath, variant, tools) {
  const command = (name) => run(tools.apkanalyzer, ["manifest", name, filePath]).trim();
  const manifest = command("print");
  return {
    variant,
    file: basename(filePath),
    path: filePath,
    bytes: readFileSync(filePath).byteLength,
    sha256: hash(filePath),
    packageId: command("application-id"),
    versionName: command("version-name"),
    versionCode: command("version-code"),
    minSdk: command("min-sdk"),
    targetSdk: command("target-sdk"),
    manifest,
    signing: parseApkSignerOutput(run(tools.apksigner, ["verify", "--verbose", "--print-certs", filePath])),
  };
}

function inspectAab(filePath, tools) {
  run(tools.jarsigner, ["-verify", "-strict", filePath]);
  return {
    variant: "google-play",
    file: basename(filePath),
    path: filePath,
    bytes: readFileSync(filePath).byteLength,
    sha256: hash(filePath),
    signatureVerified: true,
    certificateSha256: parseKeytoolFingerprint(run(tools.keytool, ["-printcert", "-jarfile", filePath])),
  };
}

function publicArtifact(artifact, repository, version) {
  const { path: _path, manifest: _manifest, ...fields } = artifact;
  return { ...fields, downloadUrl: `https://github.com/${repository}/releases/download/android-v${version}/${artifact.file}` };
}

function evidenceMarkdown(manifest) {
  const artifacts = manifest.artifacts.map((artifact) => `| ${artifact.variant} | ${artifact.file} | ${artifact.bytes} | \`${artifact.sha256}\` |`);
  const gates = manifest.validation.gates.map((gate) => `- ${gate.passed ? "PASS" : "FAIL"} \`${gate.id}\`: ${gate.detail}`);
  return [`# Android release evidence ${manifest.version.name}+${manifest.version.buildNumber}`, "", `Source: \`${manifest.source.repository}@${manifest.source.commit}\``, `Generated: ${manifest.generatedAt}`, "", "| Variant | Artifact | Bytes | SHA-256 |", "| --- | --- | ---: | --- |", ...artifacts, "", "## Automated gates", "", ...gates, "", "Physical mobile, Android TV and Chromecast certification is tracked outside this automated gate.", ""].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  for (const required of ["mobile", "tv", "version", "build-number", "commit", "repository", "output-dir"]) if (!args[required]) throw new Error(`Missing required --${required}`);
  const mobilePath = resolve(args.mobile);
  const tvPath = resolve(args.tv);
  const aabPath = args.aab ? resolve(args.aab) : null;
  for (const filePath of [mobilePath, tvPath, aabPath].filter(Boolean)) if (!existsSync(filePath)) throw new Error(`Artifact does not exist: ${filePath}`);
  const tools = { apkanalyzer: resolveTool("apkanalyzer"), apksigner: resolveTool("apksigner"), keytool: resolveTool("keytool"), jarsigner: resolveTool("jarsigner") };
  const mobile = inspectApk(mobilePath, "mobile", tools);
  const tv = inspectApk(tvPath, "tv", tools);
  const aab = aabPath ? inspectAab(aabPath, tools) : null;
  const validation = validateArtifactSet({ mobile, tv, aab, expected: { version: args.version, buildNumber: args["build-number"] }, allowDebugSigning: args["allow-debug-signing"] === "true" });
  const manifest = {
    schemaVersion: 1,
    product: "BoltBytes Media Android",
    packageId: PACKAGE_ID,
    generatedAt: new Date().toISOString(),
    version: { name: args.version, buildNumber: Number(args["build-number"]) },
    source: { repository: args.repository, commit: args.commit, ref: process.env.GITHUB_REF ?? null, runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null },
    artifacts: [mobile, tv, aab].filter(Boolean).map((artifact) => publicArtifact(artifact, args.repository, args.version)),
    validation,
  };
  const outputDirectory = resolve(args["output-dir"]);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "RELEASE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outputDirectory, "RELEASE_EVIDENCE.md"), evidenceMarkdown(manifest));
  writeFileSync(join(outputDirectory, "SHA256SUMS.txt"), `${manifest.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}`).join("\n")}\n`);
  if (!validation.passed) {
    const failures = validation.gates.filter((gate) => !gate.passed).map((gate) => `${gate.id}: ${gate.detail}`);
    throw new Error(`Android release gate failed:\n- ${failures.join("\n- ")}`);
  }
  process.stdout.write(`Android release gate passed with ${manifest.artifacts.length} artifacts.\n`);
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
