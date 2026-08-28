import 'dart:math' as math;

/// Monotonic playback clock for Flutter chrome and text subtitles.
///
/// Android's video surface can continue rendering while a stale platform
/// position is reported to Dart. This clock keeps UI time moving between
/// native samples and only accepts non-authoritative samples that move time
/// forwards. Explicit seeks and stream replacements remain authoritative.
class PlaybackUiClock {
  PlaybackUiClock({int Function()? elapsedMilliseconds})
    : _elapsedMilliseconds =
          elapsedMilliseconds ?? _processStopwatchElapsedMilliseconds;

  static final Stopwatch _processStopwatch = Stopwatch()..start();

  static int _processStopwatchElapsedMilliseconds() =>
      _processStopwatch.elapsedMilliseconds;

  final int Function() _elapsedMilliseconds;

  int _basePositionMs = 0;
  int _bufferedPositionMs = 0;
  int _baseElapsedMs = 0;
  bool _playing = false;
  bool _buffering = true;
  double _playbackRate = 1;
  bool _initialized = false;

  bool get initialized => _initialized;
  bool get playing => _playing;
  bool get buffering => _buffering;
  double get playbackRate => _playbackRate;

  int get positionMs {
    if (!_initialized || !_playing || _buffering) return _basePositionMs;
    final elapsed = math.max(0, _elapsedMilliseconds() - _baseElapsedMs);
    return math.max(0, _basePositionMs + (elapsed * _playbackRate).round());
  }

  int get bufferedPositionMs => math.max(positionMs, _bufferedPositionMs);

  int get bufferAheadMs => math.max(0, bufferedPositionMs - positionMs);

  void reset({
    required int positionMs,
    required int bufferedPositionMs,
    required bool playing,
    required bool buffering,
    required double playbackRate,
  }) {
    _initialized = true;
    _basePositionMs = math.max(0, positionMs);
    _bufferedPositionMs = math.max(_basePositionMs, bufferedPositionMs);
    _baseElapsedMs = _elapsedMilliseconds();
    _playing = playing;
    _buffering = buffering;
    _playbackRate = playbackRate.clamp(0.1, 4).toDouble();
  }

  void synchronize({
    required int positionMs,
    required int bufferedPositionMs,
    required bool playing,
    required bool buffering,
    required double playbackRate,
  }) {
    if (!_initialized) {
      reset(
        positionMs: positionMs,
        bufferedPositionMs: bufferedPositionMs,
        playing: playing,
        buffering: buffering,
        playbackRate: playbackRate,
      );
      return;
    }
    final current = this.positionMs;
    _basePositionMs = math.max(current, math.max(0, positionMs));
    _bufferedPositionMs = math.max(
      _basePositionMs,
      math.max(_bufferedPositionMs, bufferedPositionMs),
    );
    _baseElapsedMs = _elapsedMilliseconds();
    _playing = playing;
    _buffering = buffering;
    _playbackRate = playbackRate.clamp(0.1, 4).toDouble();
  }

  void setTransport({
    required bool playing,
    required bool buffering,
    required double playbackRate,
  }) {
    final current = positionMs;
    _basePositionMs = current;
    _baseElapsedMs = _elapsedMilliseconds();
    _playing = playing;
    _buffering = buffering;
    _playbackRate = playbackRate.clamp(0.1, 4).toDouble();
  }

  void seek({
    required int positionMs,
    int? bufferedPositionMs,
    required bool playing,
    required bool buffering,
    required double playbackRate,
  }) {
    reset(
      positionMs: positionMs,
      bufferedPositionMs: bufferedPositionMs ?? positionMs,
      playing: playing,
      buffering: buffering,
      playbackRate: playbackRate,
    );
  }
}

/// Selects native Android transport state while telemetry is arriving.
///
/// video_player can emit a delayed paused/buffering value after ExoPlayer has
/// already resumed. Keeping a short freshness window prevents that stale value
/// from stopping the UI clock while still allowing the regular controller to
/// take over when native telemetry is unavailable.
class PlaybackNativeTelemetryGate {
  PlaybackNativeTelemetryGate({
    int Function()? elapsedMilliseconds,
    this.freshness = const Duration(milliseconds: 2500),
  }) : _elapsedMilliseconds =
           elapsedMilliseconds ?? _processStopwatchElapsedMilliseconds;

  static final Stopwatch _processStopwatch = Stopwatch()..start();

  static int _processStopwatchElapsedMilliseconds() =>
      _processStopwatch.elapsedMilliseconds;

  final int Function() _elapsedMilliseconds;
  final Duration freshness;
  int? _lastSampleElapsedMs;

  bool get isFresh {
    final lastSample = _lastSampleElapsedMs;
    if (lastSample == null) return false;
    return _elapsedMilliseconds() - lastSample <= freshness.inMilliseconds;
  }

  void markSample() {
    _lastSampleElapsedMs = _elapsedMilliseconds();
  }

  void reset() {
    _lastSampleElapsedMs = null;
  }
}
