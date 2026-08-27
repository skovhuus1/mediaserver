import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../../core/app_config.dart';
import '../../core/offline_downloads.dart';
import '../../core/playback_platform.dart';
import '../offline_library_contract.dart';
import 'playback_session_controller.dart';
import 'playback_tuning.dart';

abstract interface class OfflinePlaybackSource {
  Future<Uri> serve(OfflineDownloadRecord record);
  Future<void> stop();
}

class MethodChannelOfflinePlaybackSource implements OfflinePlaybackSource {
  const MethodChannelOfflinePlaybackSource();

  static const _channel = MethodChannel('boltbytes.media/offline_downloads');

  @override
  Future<Uri> serve(OfflineDownloadRecord record) async {
    final response = await _channel.invokeMapMethod<String, dynamic>('serve', {
      'id': record.id,
      'localPath': record.localPath,
      'licenseExpiresAtMs': record.licenseExpiresAt.millisecondsSinceEpoch,
    });
    final value = response?['url']?.toString();
    if (value == null || value.isEmpty) {
      throw StateError('Den krypterede offlinefil kunne ikke åbnes.');
    }
    return Uri.parse(value);
  }

  @override
  Future<void> stop() => _channel.invokeMethod<void>('stopServe');
}

class OfflinePlaybackController extends ChangeNotifier
    implements TvPlaybackController {
  OfflinePlaybackController({
    required this.library,
    required this.record,
    OfflinePlaybackSource? source,
  }) : _source = source ?? const MethodChannelOfflinePlaybackSource(),
       _state = PlaybackViewState.initial.copyWith(
         status: 'Åbner offlinefil...',
       );

  final OfflineLibraryContract library;
  final OfflineDownloadRecord record;
  final OfflinePlaybackSource _source;

  PlaybackViewState _state;
  @override
  PlaybackViewState get state => _state;

  VideoPlayerController? _video;
  @override
  VideoPlayerController? get video => _video;

  Future<void>? _initialization;
  Future<void>? _finishOperation;
  bool _disposed = false;
  int _lastSavedSecond = -1;

  @override
  Future<void> initialize() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    final path = record.localPath;
    if (path == null ||
        !File(path).existsSync() ||
        !record.licenseValid ||
        !isEncryptedOfflinePath(path)) {
      _setState(
        _state.copyWith(
          loading: false,
          buffering: false,
          error: 'Offlinefilen eller licensen er ikke længere gyldig.',
        ),
      );
      return;
    }
    try {
      final uri = await _source.serve(record);
      final tuning = await PlaybackTuningStore.instance.load();
      await PlaybackPlatform.instance.configureTvVideoPlayer(
        true,
        bufferProfile: tuning.bufferProfile,
        upscaleMode: tuning.upscaleMode,
      );
      final controller = VideoPlayerController.networkUrl(
        uri,
        viewType: AppConfig.isTvBuild
            ? VideoViewType.platformView
            : VideoViewType.textureView,
        videoPlayerOptions: VideoPlayerOptions(allowBackgroundPlayback: true),
      );
      _video = controller;
      await controller.initialize();
      if (record.positionMs > 0 &&
          record.positionMs < controller.value.duration.inMilliseconds) {
        await controller.seekTo(Duration(milliseconds: record.positionMs));
      }
      controller.addListener(_onVideoChanged);
      await controller.play();
      _onVideoChanged();
    } catch (failure) {
      _setState(
        _state.copyWith(
          loading: false,
          buffering: false,
          error: failure.toString().replaceFirst('Bad state: ', ''),
        ),
      );
    }
  }

  void _onVideoChanged() {
    final controller = _video;
    if (controller == null || !controller.value.isInitialized) return;
    final second = controller.value.position.inSeconds;
    if (second > 0 && second % 10 == 0 && second != _lastSavedSecond) {
      _lastSavedSecond = second;
      unawaited(_saveProgress());
    }
    final position = controller.value.position;
    final duration = controller.value.duration;
    final bufferAhead = _bufferAhead(position, controller.value.buffered);
    _setState(
      _state.copyWith(
        status: 'Offline',
        loading: false,
        buffering: controller.value.isBuffering,
        playing: controller.value.isPlaying,
        initialized: true,
        position: position,
        bufferedPosition: Duration(
          milliseconds: math.min(
            duration.inMilliseconds,
            position.inMilliseconds + bufferAhead,
          ),
        ),
        duration: duration,
        seekable: duration > Duration.zero,
        playbackRate: controller.value.playbackSpeed,
        qualityLabel: '${record.qualityHeight}p · OFFLINE',
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

  Future<void> _saveProgress() async {
    final controller = _video;
    if (controller == null) return;
    final duration = controller.value.duration;
    final position = controller.value.position;
    try {
      await library.saveProgress(
        record,
        position.inMilliseconds,
        completed: duration > Duration.zero && position >= duration * 0.9,
      );
    } catch (_) {
      // Progress persistence must never interrupt local playback.
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
  Future<void> seekBy(Duration delta) => seekTo(_state.position + delta);

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
    await _video?.setPlaybackSpeed(rate.clamp(0.5, 2).toDouble());
    _onVideoChanged();
  }

  @override
  Future<void> retry() async {
    final controller = _video;
    if (controller != null) {
      controller.removeListener(_onVideoChanged);
      await controller.dispose();
    }
    _video = null;
    await _source.stop().catchError((_) {});
    _finishOperation = null;
    _initialization = null;
    await _initialize();
  }

  @override
  Future<void> finish() => _finishOperation ??= _finish();

  Future<void> _finish() async {
    _setState(_state.copyWith(finishing: true));
    final controller = _video;
    final position = controller?.value.position ?? _state.position;
    final duration = controller?.value.duration ?? _state.duration;
    _video = null;
    if (controller != null) {
      controller.removeListener(_onVideoChanged);
      try {
        await controller.pause();
      } catch (_) {}
      try {
        await controller.dispose();
      } catch (_) {}
    }
    await _source.stop().catchError((_) {});
    if (position > Duration.zero) {
      try {
        await library.saveProgress(
          record,
          position.inMilliseconds,
          completed: duration > Duration.zero && position >= duration * 0.9,
        );
      } catch (_) {
        // Local resources are already released; persistence is best effort.
      }
    }
    _setState(_state.copyWith(released: true));
  }

  void _setState(PlaybackViewState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    unawaited(finish());
    _disposed = true;
    super.dispose();
  }
}
