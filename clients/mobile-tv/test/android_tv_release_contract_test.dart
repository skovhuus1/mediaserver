import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TV flavor has an independently installable Android identity', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    expect(gradle, contains('applicationId = "com.boltbytes.boltbytes_media"'));
    expect(gradle, contains('applicationIdSuffix = ".tv"'));
  });

  test('TV manifest is a remote-first Leanback application', () {
    final manifest = File(
      'android/app/src/tv/AndroidManifest.xml',
    ).readAsStringSync();
    expect(manifest, contains('android.software.leanback'));
    expect(manifest, contains('android.intent.category.LEANBACK_LAUNCHER'));
    expect(manifest, contains('android.hardware.touchscreen'));
    expect(manifest, contains('android:required="false"'));
    expect(manifest, contains('android:banner="@drawable/tv_banner"'));
    expect(
      manifest,
      contains('tools:node="remove"'),
      reason: 'TV must not initialize the mobile Google Cast sender provider.',
    );
  });

  test('TV playback keeps the Android window awake while active', () {
    final bridge = File(
      'android/app/src/main/kotlin/com/boltbytes/boltbytes_media/PlaybackBridge.kt',
    ).readAsStringSync();
    final activity = File(
      'android/app/src/main/kotlin/com/boltbytes/boltbytes_media/MainActivity.kt',
    ).readAsStringSync();

    expect(bridge, contains('WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON'));
    expect(bridge, contains('decorView.keepScreenOn = enabled'));
    expect(bridge, contains('fun reapplyKeepScreenOn()'));
    expect(bridge, contains('keepScreenOnApplied == enabled'));
    expect(activity, contains('override fun onResume()'));
    expect(activity, contains('override fun onWindowFocusChanged'));
    expect(activity, contains('playbackBridge?.reapplyKeepScreenOn()'));
  });

  test('TV quality ceiling updates are idempotent', () {
    final player = File(
      'third_party/video_player_android/android/src/main/java/io/flutter/plugins/videoplayer/VideoPlayer.java',
    ).readAsStringSync();
    expect(player, contains('boltBytesAutoMaximumHeight == height'));
    expect(player, contains('boltBytesAutoMaximumHeight = height'));
  });

  test('CI always couples each flavor to its explicit Dart entrypoint', () {
    final root = Directory.current.parent.parent;
    final ci = File(
      '${root.path}/.github/workflows/flutter-client.yml',
    ).readAsStringSync();
    final mobile = File(
      '${root.path}/.github/workflows/android-mobile-release.yml',
    ).readAsStringSync();
    final tv = File(
      '${root.path}/.github/workflows/android-tv-release.yml',
    ).readAsStringSync();

    expect(ci, contains('--flavor mobile -t lib/main_mobile.dart'));
    expect(ci, contains('--flavor tv -t lib/main_tv.dart'));
    expect(mobile, contains('--flavor mobile -t lib/main_mobile.dart'));
    expect(tv, contains('--flavor tv -t lib/main_tv.dart'));
    expect(mobile, contains('android-mobile-v*'));
    expect(tv, contains('android-tv-v*'));
    expect(tv, contains('FIREBASE_TV_DART_DEFINES_BASE64'));
    expect(mobile, contains('scripts/android-version-code.mjs'));
    expect(tv, contains('scripts/android-version-code.mjs'));
    expect(mobile, contains('GITHUB_RUN_ATTEMPT'));
    expect(tv, contains('GITHUB_RUN_ATTEMPT'));
    expect(mobile, isNot(contains(r'BUILD_NUMBER=$GITHUB_RUN_NUMBER')));
    expect(tv, isNot(contains(r'BUILD_NUMBER=$GITHUB_RUN_NUMBER')));
    expect(
      tv,
      contains('TV release server must be https://media.boltbytes.com/api/v1'),
    );
  });

  test('entrypoints own runtime identity and use the canonical URL define', () {
    final mobileMain = File('lib/main_mobile.dart').readAsStringSync();
    final tvMain = File('lib/main_tv.dart').readAsStringSync();
    final config = File('lib/src/core/app_config.dart').readAsStringSync();

    expect(mobileMain, contains('AppRuntimeConfig.mobile()'));
    expect(tvMain, contains('AppRuntimeConfig.tv()'));
    expect(config, contains('BB_MEDIA_DEFAULT_SERVER_URL'));
    expect(config, isNot(contains('BB_MEDIA_API_URL')));
    expect(config, contains('ServerEndpointPolicy.fixed'));
  });

  test('Flutter baseline uses the deterministic high version code', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('version: 0.3.0+100030001'));
  });

  test('TV smoke gate targets only the TV package', () {
    final root = Directory.current.parent.parent;
    final smoke = File(
      '${root.path}/scripts/smoke-android-tv-launch.mjs',
    ).readAsStringSync();
    expect(smoke, contains('com.boltbytes.boltbytes_media.tv'));
    expect(smoke, contains('android.intent.category.LEANBACK_LAUNCHER'));
  });
}
