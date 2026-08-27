import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('VOD finish shares one terminal operation', () {
    final source = File(
      'lib/src/shared_core/playback/playback_session_controller.dart',
    ).readAsStringSync();
    expect(source, contains('_finishOperation ??= _finish()'));
    expect(source, contains('if (auth == null || _released) return'));
    expect(source, contains('_released = true'));
    expect(source, contains('await saveProgress()'));
  });

  test('Live and offline playback expose idempotent termination guards', () {
    final live = File(
      'lib/src/shared_core/playback/live_tv_session_controller.dart',
    ).readAsStringSync();
    final offline = File(
      'lib/src/shared_core/playback/offline_playback_controller.dart',
    ).readAsStringSync();
    expect(live, contains('_finishOperation ??='));
    expect(offline, contains('_finishOperation ??='));
  });

  test('TV VOD chrome retains seek and inactivity invariants', () {
    final source = File(
      'lib/src/tv/screens/tv_player_screen.dart',
    ).readAsStringSync();
    expect(source, contains('Duration(seconds: 5)'));
    expect(source, contains('Timer? _awakeTimer'));
    expect(source, contains('_reassertPlaybackAwake()'));
    expect(source, contains('Duration(seconds: -10)'));
    expect(source, contains('widget.live ? 10 : 30'));
  });

  test(
    'episode autoplay handles Android stream-end and sparse episode data',
    () {
      final source = File(
        'lib/src/shared_core/playback/playback_session_controller.dart',
      ).readAsStringSync();
      expect(source, contains('_isTerminalPlayback(controller)'));
      expect(source, contains("status: 'Starter næste afsnit...'"));
      expect(
        source,
        contains("final query = <String, String>{'afterMediaId': media.id}"),
      );
      expect(
        source,
        isNot(
          contains(
            r'} else {\n        return;\n      }\n      final next = jsonMap',
          ),
        ),
      );
      expect(source, contains('progressAlreadySaved: true'));
    },
  );

  test('episode autoplay ignores transient EVENT HLS playlist edges', () {
    final source = File(
      'lib/src/shared_core/playback/playback_session_controller.dart',
    ).readAsStringSync();
    expect(source, isNot(contains('_positionStalledSince')));
    expect(source, isNot(contains('_isTailStalled(controller)')));
    expect(source, contains('remainingStreamMs <= 2500'));
    expect(source, contains('remainingKnownMs <= 2500'));
    expect(source, contains('_canStartNextCountdown(marker, absolute)'));
    expect(source, contains('markerRemainingMs <= 75_000'));
    expect(source, contains('controller.value.isCompleted'));
    expect(
      source,
      contains('knownDurationMs > 0 ? nearKnownEnd : nearStreamEnd'),
    );
    expect(source, contains('controller.value.hasError'));
    expect(source, isNot(contains('_isPrematurePlaybackEnd(controller)')));
    expect(source, isNot(contains('_recoverPrematurePlaybackEnd()')));
    expect(source, isNot(contains('Streamen stoppede for tidligt')));
    expect(source, isNot(contains('_prematureEndRecovering')));
  });

  test('TV Auto unlock does not require an unreachable 15 second lead', () {
    final source = File(
      'lib/src/shared_core/playback/playback_session_controller.dart',
    ).readAsStringSync();
    expect(
      source,
      contains('_scheduleAutoQualityUnlock(const Duration(seconds: 30))'),
    );
    expect(
      source,
      contains('controller.value.isPlaying && !controller.value.isBuffering'),
    );
    expect(source, isNot(contains('_bufferAheadMs >= 15000')));
  });

  test(
    'TV playback keep-awake is edge-triggered by the playback controller',
    () {
      final source = File(
        'lib/src/shared_core/playback/playback_session_controller.dart',
      ).readAsStringSync();
      expect(source, isNot(contains('Timer? _keepAwakeTimer')));
      expect(source, isNot(contains('const Duration(seconds: 15)')));
      expect(source, isNot(contains('const Duration(seconds: 10)')));
      expect(source, contains('_setKeepScreenOn(true)'));
      expect(source, contains('_setKeepScreenOn(false)'));
      expect(source, contains('AppLifecycleState.resumed'));
      expect(source, contains('setKeepScreenOn(true)'));
    },
  );

  test('TV next episode handoff does not wait on old session finish', () {
    final source = File(
      'lib/src/tv/screens/tv_player_screen.dart',
    ).readAsStringSync();
    expect(source, contains('unawaited(controller.finish())'));
    expect(source, isNot(contains('await controller.finish();')));
  });

  test(
    'TV quality selection remains visible after a player quality change',
    () {
      final controller = File(
        'lib/src/shared_core/playback/playback_session_controller.dart',
      ).readAsStringSync();
      final player = File(
        'lib/src/tv/screens/tv_player_screen.dart',
      ).readAsStringSync();
      expect(controller, contains('String get currentQualityMode'));
      expect(controller, contains('int? get currentFixedQualityHeight'));
      expect(controller, contains('String get currentUpscaleMode'));
      expect(controller, contains("status: 'Kvalitet:"));
      expect(controller, contains('Future<void> selectAudioTrack'));
      expect(controller, contains('Future<void> selectUpscaleMode'));
      expect(controller, contains("'audioTrackId': preservedAudioTrackId"));
      expect(controller, contains("'allowUpscale': requestedAllowUpscale"));
      expect(controller, contains("'upscaleMode': requestedUpscaleMode"));
      expect(controller, isNot(contains("'/devices/me/preferences'")));
      expect(player, contains('controller.currentQualityMode'));
      expect(player, contains('controller.currentFixedQualityHeight'));
      expect(player, contains("panelTitle: 'Lydspor'"));
      expect(player, contains("panelTitle: 'Kvalitet'"));
      expect(player, contains("panelTitle: 'Opskalering'"));
      expect(player, contains('state.qualityLabel.isEmpty'));
      expect(player, contains('state.upscaleLabel.isEmpty'));
    },
  );

  test('TV playback reconfigure contract accepts upscale selections', () {
    final dto = File(
      '../../services/api/src/playback/playback.dto.ts',
    ).readAsStringSync();
    final service = File(
      '../../services/api/src/playback/playback.service.ts',
    ).readAsStringSync();
    expect(dto, contains('allowUpscale?: boolean'));
    expect(dto, contains("upscaleMode?: 'off' | 'server' | 'device'"));
    expect(service, contains('requestedAllowUpscale'));
    expect(service, contains('requestedUpscaleMode'));
    expect(service, contains('allowUpscale: requestedAllowUpscale'));
    expect(service, contains('upscaleMode: requestedUpscaleMode'));
  });
}
