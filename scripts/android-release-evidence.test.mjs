import assert from "node:assert/strict";
import test from "node:test";
import { parseApkSignerOutput, parseKeytoolFingerprint, validateArtifactSet } from "./android-release-evidence.mjs";

const certificate = "a".repeat(64);
const manifests = {
  mobile: '<category android:name="android.intent.category.LAUNCHER" /><meta-data android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME" android:value="com.boltbytes.CastOptionsProvider" />',
  tv: '<uses-feature android:name="android.software.leanback" android:required="true" /><category android:name="android.intent.category.LEANBACK_LAUNCHER" /><meta-data android:name="io.flutter.embedding.android.EnableImpeller" android:value="false" />',
};

function artifact(variant, overrides = {}) {
  return { packageId: "com.boltbytes.boltbytes_media", versionName: "1.2.3", versionCode: "42", sha256: `${variant}-hash`, manifest: manifests[variant], signing: { certificateSha256: certificate, distinguishedName: "CN=BoltBytes Media,O=BoltBytes", debugCertificate: false, verifiedV1: true, verifiedV2: true, verifiedV3: true, verifiedV4: false }, ...overrides };
}

function validate(overrides = {}) {
  return validateArtifactSet({ mobile: artifact("mobile", overrides.mobile), tv: artifact("tv", overrides.tv), aab: overrides.aab, expected: { version: "1.2.3", buildNumber: "42" }, allowDebugSigning: overrides.allowDebugSigning });
}

test("accepts distinct mobile and TV flavors", () => assert.equal(validate().passed, true));
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
  assert.equal(validate({ aab: { signatureVerified: true, certificateSha256: certificate } }).passed, true);
  assert.equal(validate({ aab: { signatureVerified: false, certificateSha256: certificate } }).passed, false);
});
test("parses signing fingerprints", () => {
  const parsed = parseApkSignerOutput("Verified using v2 scheme (APK Signature Scheme v2): true\nVerified using v3 scheme (APK Signature Scheme v3): true\nSigner #1 certificate DN: CN=BoltBytes Media,O=BoltBytes\nSigner #1 certificate SHA-256 digest: AA:BB:CC");
  assert.equal(parsed.certificateSha256, "aabbcc");
  assert.equal(parsed.verifiedV2, true);
  assert.equal(parsed.verifiedV3, true);
  assert.equal(parseKeytoolFingerprint("SHA256: AA:BB:CC"), "aabbcc");
});
