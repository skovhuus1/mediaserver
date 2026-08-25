import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';

import '../../core/playback_platform.dart';
import '../live_tv_recording_contract.dart';
import 'playback_session_controller.dart';
import 'playback_tuning.dart';

class RecordingPlaybackController extends ChangeNotifier
    implements TvPlaybackController {
  RecordingPlaybackController({required this.authorization});

  final LiveTvRecordingAuthorization authorization;
  PlaybackViewState _state = PlaybackViewState.initial;
  VideoPlayerController? _video;
  Future<void>? _initialization;
  Future<void>? _finishOperation;
  bool _disposed = false;

  @override
  PlaybackViewState get state => _state;
  @override
  VideoPlayerController? get video => _video;

  @override
  Future<void> initialize() => _initialization ??= _open();

  Future<void> _open() async {
    try {
      final tuning = await PlaybackTuningStore.instance.load();
      await PlaybackPlatform.instance.configureTvVideoPlayer(
        true,
        bufferProfile: tuning.bufferProfile,
        upscaleMode: tuning.upscaleMode,
      );
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(authorization.streamUrl),
      );
      _video = controller;
      await controller.initialize();
      controller.addListener(_changed);
      await controller.play();
      _changed();
    } catch (failure) {
      _emit(
        _state.copyWith(
          loading: false,
          buffering: false,
          error: 'Optagelsen kunne ikke afspilles: $failure',
        ),
      );
    }
  }

  void _changed() {
    final controller = _video;
    if (controller == null || !controller.value.isInitialized) return;
    final duration = controller.value.duration;
    final position = controller.value.position;
    final bufferedAhead = _bufferAhead(position, controller.value.buffered);
    _emit(
      _state.copyWith(
        status: 'TV-optagelse',
        loading: false,
        buffering: controller.value.isBuffering,
        playing: controller.value.isPlaying,
        initialized: true,
        position: position,
        bufferedPosition: Duration(
          milliseconds: math.min(
            duration.inMilliseconds,
            position.inMilliseconds + bufferedAhead,
          ),
        ),
        duration: duration,
        seekable: duration > Duration.zero,
        playbackRate: controller.value.playbackSpeed,
      ),
    );
  }

  int _bufferAhead(Duration position, List<DurationRange> buffered) {
    for (final range in buffered) {
      if (position >= range.start && position <= range.end) {
        return math.max(0, (range.end - position).inMilliseconds);
      }
    }
    return 0;
  }

  @override
  Future<void> togglePlayback() async {
    final controller = _video;
    if (controller == null) return;
    controller.value.isPlaying
        ? await controller.pause()
        : await controller.play();
    _changed();
  }

  @override
  Future<void> seekBy(Duration delta) => seekTo(_state.position + delta);

  @override
  Future<void> seekTo(Duration position) async {
    final controller = _video;
    if (controller == null || !_state.seekable) return;
    final target = position.inMilliseconds
        .clamp(0, _state.duration.inMilliseconds)
        .toInt();
    await controller.seekTo(Duration(milliseconds: target));
    _changed();
  }

  @override
  Future<void> setPlaybackRate(double rate) async {
    final value = rate.clamp(0.5, 2).toDouble();
    await _video?.setPlaybackSpeed(value);
    _changed();
  }

  @override
  Future<void> retry() async {
    await finish();
    _finishOperation = null;
    _initialization = null;
    _state = PlaybackViewState.initial;
    await initialize();
  }

  @override
  Future<void> finish() => _finishOperation ??= _finish();

  Future<void> _finish() async {
    final controller = _video;
    _video = null;
    if (controller != null) {
      controller.removeListener(_changed);
      await controller.pause().catchError((_) {});
      await controller.dispose();
    }
    await PlaybackPlatform.instance.clear().catchError((_) {});
    _emit(_state.copyWith(playing: false, finishing: true, released: true));
  }

  void _emit(PlaybackViewState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(finish());
    super.dispose();
  }
}
