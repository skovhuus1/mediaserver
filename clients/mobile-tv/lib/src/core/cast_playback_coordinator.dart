import 'dart:async';

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'cast_service.dart';
import 'models.dart';

class ActiveCastPlayback {
  const ActiveCastPlayback({
    required this.api,
    required this.media,
    required this.sessionId,
    required this.timelineOffsetMs,
    required this.durationMs,
    required this.initialPositionMs,
    this.posterUrl,
    this.sourceBitrate,
    this.sourceHeight,
    this.subtitleLabel,
  });

  final ApiClient api;
  final MediaItem media;
  final String sessionId;
  final int timelineOffsetMs;
  final int durationMs;
  final int initialPositionMs;
  final String? posterUrl;
  final int? sourceBitrate;
  final int? sourceHeight;
  final String? subtitleLabel;
}

/// Owns a remote Cast playback after the full-screen player has been closed.
///
/// The receiver keeps playing independently from Flutter. This coordinator
/// therefore keeps the server lease and playback history alive until the Cast
/// session ends or the customer explicitly stops it.
class CastPlaybackCoordinator extends ChangeNotifier {
  CastPlaybackCoordinator._() {
    if (CastService.isSupported) {
      _subscription = _cast.states.listen(_handleCastState);
      unawaited(_refreshNativeState());
    }
  }

  static final CastPlaybackCoordinator instance = CastPlaybackCoordinator._();

  final CastService _cast = CastService.instance;
  StreamSubscription<CastState>? _subscription;
  Timer? _heartbeatTimer;
  Timer? _progressTimer;
  ActiveCastPlayback? _active;
  CastState? _castState;
  bool _playerAttached = false;
  bool _stopping = false;
  int _positionMs = 0;
  String? _error;

  ActiveCastPlayback? get active => _active;
  CastState? get castState => _castState;
  bool get hasActive => _active != null;
  bool get playerAttached => _playerAttached;
  bool get isStopping => _stopping;
  bool get isPlaying => _castState?.runtimeState == 'playing';
  bool get isBuffering => _castState?.runtimeState == 'buffering';
  String? get error => _error;
  int get positionMs => _positionMs;
  int get durationMs => _active?.durationMs ?? 0;
  String get runtimeState => _castState?.runtimeState ?? 'starting';
  String get deviceName => _castState?.deviceName ?? 'Chromecast';

  bool owns(String sessionId) => _active?.sessionId == sessionId;

  void activate({
    required ApiClient api,
    required MediaItem media,
    required PlaybackAuthorization authorization,
    required int timelineOffsetMs,
    required int durationMs,
    required int positionMs,
    String? posterUrl,
    String? subtitleLabel,
  }) {
    final previous = _active;
    if (previous != null && previous.sessionId != authorization.sessionId) {
      unawaited(_releaseServerSession(previous, saveProgress: true));
    }
    _active = ActiveCastPlayback(
      api: api,
      media: media,
      sessionId: authorization.sessionId,
      timelineOffsetMs: timelineOffsetMs,
      durationMs: durationMs,
      initialPositionMs: positionMs,
      posterUrl: posterUrl,
      sourceBitrate: authorization.sourceBitrate,
      sourceHeight: authorization.sourceHeight,
      subtitleLabel: subtitleLabel,
    );
    _positionMs = positionMs;
    _playerAttached = true;
    _stopping = false;
    _error = null;
    _stopTimers();
    unawaited(_refreshNativeState());
    notifyListeners();
  }

  void detachPlayer() {
    if (_active == null) return;
    _playerAttached = false;
    _startTimers();
    notifyListeners();
  }

  Future<void> playPause() async {
    if (_active == null || _stopping) return;
    try {
      if (isPlaying) {
        await _cast.pause();
      } else {
        await _cast.play();
      }
      _error = null;
    } catch (_) {
      _error = 'Chromecast kunne ikke styres.';
      notifyListeners();
    }
  }

  Future<void> seek(int absolutePositionMs) async {
    final active = _active;
    if (active == null || _stopping) return;
    final maximum = active.durationMs > 0
        ? active.durationMs
        : absolutePositionMs;
    final absolute = absolutePositionMs.clamp(0, maximum).toInt();
    final receiverPosition = (absolute - active.timelineOffsetMs)
        .clamp(0, maximum)
        .toInt();
    try {
      await _cast.seek(receiverPosition);
      _positionMs = absolute;
      _error = null;
      notifyListeners();
      unawaited(_saveProgress());
    } catch (_) {
      _error = 'Chromecast kunne ikke spole.';
      notifyListeners();
    }
  }

  Future<void> stop() async {
    final active = _active;
    if (active == null || _stopping) return;
    _stopping = true;
    _stopTimers();
    notifyListeners();
    await _saveProgress();
    try {
      await _cast.stop();
    } catch (_) {
      // Server cleanup must still run when the receiver has disappeared.
    }
    await _releaseServerSession(active, saveProgress: false);
    _clear();
  }

  Future<void> _refreshNativeState() async {
    try {
      _handleCastState(await _cast.currentState());
    } catch (_) {
      // Native session events remain the source of truth after startup.
    }
  }

  void _handleCastState(CastState state) {
    _castState = state;
    final active = _active;
    if (active != null && state.connected) {
      _positionMs = active.timelineOffsetMs + state.positionMs;
    }
    final ended = {
      'sessionEnded',
      'sessionStartFailed',
      'sessionResumeFailed',
    }.contains(state.event);
    if (active != null && ended && !_stopping) {
      if (_playerAttached) {
        // PlayerScreen resumes the existing logical session locally.
        _clear();
      } else {
        unawaited(_finishDetachedSession(active));
      }
      return;
    }
    if (active != null &&
        !_playerAttached &&
        !_stopping &&
        state.runtimeState == 'idle') {
      unawaited(_finishDetachedSession(active));
      return;
    }
    notifyListeners();
  }

  Future<void> _finishDetachedSession(ActiveCastPlayback active) async {
    if (_stopping || _active?.sessionId != active.sessionId) return;
    _stopping = true;
    _stopTimers();
    await _saveProgress();
    await _releaseServerSession(active, saveProgress: false);
    _clear();
  }

  void _startTimers() {
    _stopTimers();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => unawaited(_heartbeat()),
    );
    _progressTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => unawaited(_saveProgress()),
    );
    unawaited(_heartbeat());
  }

  void _stopTimers() {
    _heartbeatTimer?.cancel();
    _progressTimer?.cancel();
    _heartbeatTimer = null;
    _progressTimer = null;
  }

  Future<void> _heartbeat() async {
    final active = _active;
    if (active == null || _playerAttached || _stopping) return;
    try {
      await active.api
          .patchJson('/playback/sessions/${active.sessionId}/heartbeat', {
            'runtimeState': switch (runtimeState) {
              'playing' || 'paused' || 'buffering' => runtimeState,
              _ => 'starting',
            },
            'positionMs': _positionMs,
            if (active.durationMs > 0) 'durationMs': active.durationMs,
            'currentBitrate': active.sourceBitrate,
            'currentHeight': active.sourceHeight,
            'bufferAheadMs': null,
            'playbackRate': 1,
            'subtitleTrack': active.subtitleLabel,
          });
      _error = null;
    } catch (_) {
      _error = 'Serverens Cast-heartbeat kunne ikke sendes.';
      notifyListeners();
    }
  }

  Future<void> _saveProgress() async {
    final active = _active;
    if (active == null) return;
    try {
      await active.api
          .patchJson('/playback/sessions/${active.sessionId}/progress', {
            'positionMs': _positionMs,
            if (active.durationMs > 0) 'durationMs': active.durationMs,
          });
    } catch (_) {
      // A following heartbeat or server-side lease cleanup will recover.
    }
  }

  Future<void> _releaseServerSession(
    ActiveCastPlayback active, {
    required bool saveProgress,
  }) async {
    if (saveProgress) {
      try {
        await active.api
            .patchJson('/playback/sessions/${active.sessionId}/progress', {
              'positionMs': _positionMs,
              if (active.durationMs > 0) 'durationMs': active.durationMs,
            });
      } catch (_) {}
    }
    try {
      await active.api.deleteJson(
        '/playback/sessions/${active.sessionId}/cast-handoff',
      );
    } catch (_) {}
    try {
      await active.api.deleteJson('/playback/sessions/${active.sessionId}');
    } catch (_) {
      // The server lease is the final cleanup fallback.
    }
  }

  void _clear() {
    _stopTimers();
    _active = null;
    _playerAttached = false;
    _stopping = false;
    _positionMs = 0;
    _error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _stopTimers();
    unawaited(_subscription?.cancel());
    super.dispose();
  }
}
