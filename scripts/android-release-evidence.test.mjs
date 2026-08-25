import assert from "node:assert/strict";
import test from "node:test";
import { parseApkSignerOutput, parseBundleManifest, parseKeytoolFingerprint, validateArtifactSet } from "./android-release-evidence.mjs";
import { assertAndroidShrinkerMapping } from "./assert-android-shrinker.mjs";

const certificate = "a".repeat(64);
const manifests = {
  mobile: '<category android:name="android.intent.category.LAUNCHER" /><meta-data android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME" android:value="com.boltbytes.CastOptionsProvider" />',
  tv: '<uses-feature android:name="android.software.leanback" android:required="true" /><uses-feature android:name="android.hardware.touchscreen" android:required="false" /><application android:banner="@drawable/tv_banner"><category android:name="android.intent.category.LEANBACK_LAUNCHER" /><meta-data android:name="io.flutter.embedding.android.EnableImpeller" android:value="false" /></application>',
};

function artifact(variant, overrides = {}) {
  return { packageId: variant === "tv" ? "com.boltbytes.boltbytes_media.tv" : "com.boltbytes.boltbytes_media", versionName: "1.2.3", versionCode: "42", sha256: `${variant}-hash`, manifest: manifests[variant], signing: { certificateSha256: certificate, distinguishedName: "CN=BoltBytes Media,O=BoltBytes", debugCertificate: false, verifiedV1: true, verifiedV2: true, verifiedV3: true, verifiedV4: false }, ...overrides };
}

function validate(overrides = {}) {
  return validateArtifactSet({ mobile: artifact("mobile", overrides.mobile), tv: artifact("tv", overrides.tv), aab: overrides.aab, expected: { version: "1.2.3", buildNumber: "42" }, allowDebugSigning: overrides.allowDebugSigning });
}

test("accepts distinct mobile and TV flavors", () => assert.equal(validate().passed, true));
test("accepts independently certified mobile and TV artifacts", () => {
  assert.equal(validateArtifactSet({ mobile: artifact("mobile"), expected: { version: "1.2.3", buildNumber: "42" } }).passed, true);
  assert.equal(validateArtifactSet({ tv: artifact("tv"), expected: { version: "1.2.3", buildNumber: "42" } }).passed, true);
});
test("requires distinct package identities", () => assert.equal(validate({ tv: { packageId: "com.boltbytes.boltbytes_media" } }).gates.find((gate) => gate.id === "tv.package")?.passed, false));
test("rejects identical APKs", () => assert.equal(validate({ tv: { sha256: "mobile-hash" } }).gates.find((gate) => gate.id === "variants.distinct")?.passed, false));
test("rejects Leanback in mobile", () => assert.equal(validate({ mobile: { manifest: `${manifests.mobile}${manifests.tv}` } }).gates.find((gate) => gate.id === "mobile.not_tv_launcher")?.passed, false));
test("requires the Cast provider only in mobile", () => {
  assert.equal(validate({ mobile: { manifest: '<category android:name="android.intent.category.LAUNCHER" />' } }).gates.find((gate) => gate.id === "mobile.cast_provider")?.passed, false);
  assert.equal(validate({ tv: { manifest: `${manifests.tv}<meta-data android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME" />` } }).gates.find((gate) => gate.id === "tv.no_cast_provider")?.passed, false);
});
test("requires Impeller to be disabled in TV artifacts", () => {
  const manifest = manifests.tv.replace('android:value="false"', 'android:value="true"');
  assert.equal(validate({ tv: { manifest } }).gates.find((gate) => gate.id === "tv.impeller_disabled")?.passed, false);
});
test("rejects production debug signing but permits explicit CI debug signing", () => {
  const signing = { ...artifact("mobile").signing, debugCertificate: true };
  assert.equal(validate({ mobile: { signing }, tv: { signing } }).passed, false);
  assert.equal(validate({ mobile: { signing }, tv: { signing }, allowDebugSigning: true }).passed, true);
});
test("rejects certificate mismatch", () => assert.equal(validate({ tv: { signing: { ...artifact("tv").signing, certificateSha256: "b".repeat(64) } } }).passed, false));
test("requires a verified matching AAB", () => {
  const aab = { variant: "tv", packageId: "com.boltbytes.boltbytes_media.tv", versionName: "1.2.3", versionCode: "42", manifest: manifests.tv, signatureVerified: true, certificateSha256: certificate };
  assert.equal(validateArtifactSet({ tv: artifact("tv"), aab, expected: { version: "1.2.3", buildNumber: "42" } }).passed, true);
  assert.equal(validateArtifactSet({ tv: artifact("tv"), aab: { ...aab, packageId: "com.example.wrong" }, expected: { version: "1.2.3", buildNumber: "42" } }).passed, false);
  assert.equal(validateArtifactSet({ tv: artifact("tv"), aab: { ...aab, signatureVerified: false }, expected: { version: "1.2.3", buildNumber: "42" } }).passed, false);
});
test("parses Android identity from bundletool manifest output", () => {
  assert.deepEqual(parseBundleManifest('<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionCode="42" android:versionName="1.2.3" package="com.boltbytes.boltbytes_media.tv" />'), { packageId: "com.boltbytes.boltbytes_media.tv", versionName: "1.2.3", versionCode: "42" });
});
test("parses signing fingerprints", () => {
  const parsed = parseApkSignerOutput("Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\nSigner #1 certificate DN: CN=BoltBytes Media,O=BoltBytes\nSigner #1 certificate SHA-256 digest: AA:BB:CC");
  assert.equal(parsed.certificateSha256, "aabbcc");
  assert.equal(parsed.verifiedV2, true);
  assert.equal(parsed.verifiedV3, true);
  assert.equal(parseKeytoolFingerprint("SHA256: AA:BB:CC"), "aabbcc");
});

test("requires the reflected WorkManager database constructor after R8", () => {
  const header = "androidx.work.impl.WorkDatabase_Impl -> androidx.work.impl.WorkDatabase_Impl:";
  assert.equal(
    assertAndroidShrinkerMapping(`${header}\n    1:1:void <init>():45:45 -> <init>\nandroidx.work.impl.WorkLauncher -> a:`),
    true,
  );
  assert.throws(
    () => assertAndroidShrinkerMapping(`${header}\n    1:1:void clearAllTables():200:200 -> a\nandroidx.work.impl.WorkLauncher -> a:`),
    /R8 fjernede WorkDatabase_Impl/,
  );
});
