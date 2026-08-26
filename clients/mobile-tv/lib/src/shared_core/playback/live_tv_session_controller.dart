import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';

import '../../core/playback_platform.dart';
import '../live_tv_contract.dart';
import 'playback_session_controller.dart';
import 'playback_tuning.dart';

class LiveTvSessionController extends ChangeNotifier
    implements TvPlaybackController {
  LiveTvSessionController({
    required this.liveTv,
    required LiveTvChannel channel,
    // ignore: prefer_initializing_formals
  }) : _channel = channel,
       _state = PlaybackViewState.initial.copyWith(
         status: 'Finder en ledig TV-forbindelse...',
       );

  final LiveTvContract liveTv;
  LiveTvChannel _channel;
  LiveTvChannel get channel => _channel;
  LiveTvSession? _session;
  LiveTvSession? get session => _session;
  VideoPlayerController? _video;
  Timer? _heartbeatTimer;
  Timer? _uiTimer;
  Future<void>? _initialization;
  Future<void>? _finishOperation;
  bool _released = false;
  bool _disposed = false;

  PlaybackViewState _state;
  @override
  PlaybackViewState get state => _state;

  @override
  VideoPlayerController? get video => _video;

  @override
  Future<void> initialize() => _initialization ??= _authorize();

  Future<void> _authorize() async {
    _setState(
      _state.copyWith(
        status: 'Finder en ledig TV-forbindelse...',
        loading: true,
        buffering: true,
        error: null,
        released: false,
      ),
    );
    try {
      final session = await liveTv.authorize(_channel.id);
      _session = session;
      _released = false;
      await _prepare(session);
    } catch (failure) {
      _setState(
        _state.copyWith(
          loading: false,
          buffering: false,
          error: failure is Exception
              ? failure.toString().replaceFirst('Exception: ', '')
              : 'Live TV kunne ikke startes.',
        ),
      );
    }
  }

  Future<void> _prepare(LiveTvSession session) async {
    var ready = session.ready;
    for (var attempt = 0; !ready && attempt < 60; attempt++) {
      if (_disposed || _session?.leaseId != session.leaseId) return;
      _setState(_state.copyWith(status: 'Klargør ${_channel.name}...'));
      await Future<void>.delayed(const Duration(seconds: 1));
      final status = await liveTv.pollStatus(session);
      if (status.failed) {
        throw Exception(status.message ?? 'Live TV-streamen fejlede.');
      }
      ready = status.ready;
    }
    if (!ready) {
      throw Exception('Live TV-streamen blev ikke klar inden for 60 sekunder.');
    }
    await _openVideo(session);
  }

  Future<void> _openVideo(LiveTvSession session) async {
    final previous = _video;
    if (previous != null) {
      previous.removeListener(_onVideoChanged);
      await previous.dispose();
    }
    final tuning = await PlaybackTuningStore.instance.load();
    await PlaybackPlatform.instance.configureTvVideoPlayer(
      true,
      bufferProfile: tuning.bufferProfile,
      upscaleMode: tuning.upscaleMode,
    );
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(session.streamUrl),
      formatHint: session.contentType.toLowerCase().contains('mpegurl')
          ? VideoFormat.hls
          : VideoFormat.other,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: false),
    );
    _video = controller;
    await controller.initialize();
    if (_disposed || _session?.leaseId != session.leaseId) {
      await controller.dispose();
      return;
    }
    controller.addListener(_onVideoChanged);
    await controller.play();
    _startTimers();
    _onVideoChanged();
  }

  void _startTimers() {
    _heartbeatTimer?.cancel();
    _uiTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => unawaited(_heartbeat()),
    );
    _uiTimer = Timer.periodic(
      const Duration(milliseconds: 300),
      (_) => _onVideoChanged(),
    );
    unawaited(_heartbeat());
  }

  void _onVideoChanged() {
    final controller = _video;
    if (controller == null || !controller.value.isInitialized) return;
    final duration = controller.value.duration;
    final position = controller.value.position;
    final bufferedAhead = _bufferAhead(position, controller.value.buffered);
    final seekable = duration > const Duration(seconds: 30);
    _setState(
      _state.copyWith(
        status: 'Live',
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
        seekable: seekable,
        playbackRate: controller.value.playbackSpeed,
        qualityLabel:
            _session?.method.replaceAll('_', ' ').toUpperCase() ?? 'LIVE',
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

  Future<void> _heartbeat() async {
    final session = _session;
    final controller = _video;
    if (session == null || _released) return;
    try {
      await liveTv.heartbeat(
        session,
        runtimeState: controller?.value.isBuffering == true
            ? 'buffering'
            : controller?.value.isPlaying == true
            ? 'playing'
            : 'paused',
      );
    } catch (_) {}
  }

  Future<void> switchChannel(LiveTvDirection direction) async {
    final current = _session;
    if (current == null || _state.loading) return;
    _setState(
      _state.copyWith(
        status: 'Skifter kanal...',
        loading: true,
        buffering: true,
        error: null,
      ),
    );
    try {
      final result = await liveTv.switchChannel(current, _channel, direction);
      _channel = result.channel;
      _session = result.session;
      await _prepare(result.session);
    } catch (failure) {
      _setState(
        _state.copyWith(
          loading: false,
          buffering: false,
          error: failure.toString().replaceFirst('Exception: ', ''),
        ),
      );
    }
  }

  @override
  Future<void> togglePlayback() async {
    final controller = _video;
    if (controller == null) return;
    if (controller.value.isPlaying) {
      await controller.pause();
    } else {
      await controller.play();
    }
    _onVideoChanged();
  }

  @override
  Future<void> seekBy(Duration delta) {
    if (!_state.seekable) return Future<void>.value();
    return seekTo(_state.position + delta);
  }

  @override
  Future<void> seekTo(Duration position) async {
    final controller = _video;
    if (controller == null || !_state.seekable) return;
    final target = position < Duration.zero
        ? Duration.zero
        : position > controller.value.duration
        ? controller.value.duration
        : position;
    await controller.seekTo(target);
    _onVideoChanged();
  }

  @override
  Future<void> setPlaybackRate(double rate) async {
    final normalized = rate.clamp(0.5, 2).toDouble();
    await _video?.setPlaybackSpeed(normalized);
    _onVideoChanged();
  }

  @override
  Future<void> retry() async {
    await _release();
    final previous = _video;
    _video = null;
    if (previous != null) {
      previous.removeListener(_onVideoChanged);
      await previous.dispose();
    }
    _released = false;
    _finishOperation = null;
    _initialization = null;
    await _authorize();
  }

  Future<void> _release() async {
    final session = _session;
    if (session == null || _released) return;
    _released = true;
    _setState(_state.copyWith(released: true));
    try {
      await liveTv.release(session);
    } catch (_) {}
  }

  @override
  Future<void> finish() => _finishOperation ??= _finish();

  Future<void> _finish() async {
    _heartbeatTimer?.cancel();
    _uiTimer?.cancel();
    _setState(_state.copyWith(finishing: true));
    await _release();
  }

  void _setState(PlaybackViewState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _heartbeatTimer?.cancel();
    _uiTimer?.cancel();
    final controller = _video;
    if (controller != null) controller.removeListener(_onVideoChanged);
    unawaited(finish().whenComplete(() => controller?.dispose()));
    _disposed = true;
    super.dispose();
  }
}
