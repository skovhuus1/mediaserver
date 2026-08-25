import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAndroidVersionIsNewer,
  compareStableVersions,
  computeAndroidVersionCode,
  parseStableAndroidVersion,
} from "./android-version-code.mjs";

test("derives the current Android baseline from stable semver", () => {
  assert.equal(computeAndroidVersionCode("0.2.13", 1), 100_021_301);
});

test("reserves two digits for workflow retries", () => {
  assert.equal(computeAndroidVersionCode("1.2.3", 2), 101_020_302);
  assert.ok(computeAndroidVersionCode("1.2.4", 1) > computeAndroidVersionCode("1.2.3", 99));
});

test("accepts the largest supported version below the Play limit", () => {
  assert.equal(computeAndroidVersionCode("1999.99.99", 99), 2_099_999_999);
});

test("rejects prereleases and values outside reserved ranges", () => {
  assert.throws(() => parseStableAndroidVersion("1.2.3-beta.1"), /numeric semver/);
  assert.throws(() => computeAndroidVersionCode("1.100.0", 1), /supported bounds/);
  assert.throws(() => computeAndroidVersionCode("1.2.3", 100), /1 to 99/);
});

test("rejects reused and backwards product versions", () => {
  assert.equal(compareStableVersions("2.0.0", "1.99.99"), 1);
  assert.throws(() => assertAndroidVersionIsNewer("1.2.3", "1.2.3"), /must be newer/);
  assert.throws(() => assertAndroidVersionIsNewer("1.2.2", "1.2.3"), /must be newer/);
});
