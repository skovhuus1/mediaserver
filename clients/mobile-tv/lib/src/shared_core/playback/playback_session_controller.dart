import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:video_player/video_player.dart';

import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/models.dart';
import '../../core/playback_platform.dart';
import '../../core/webvtt.dart';
import 'playback_maintenance_scheduler.dart';
import 'playback_quality_coordinator.dart';
import 'playback_tuning.dart';
import 'playback_ui_clock.dart';

const _stateUnset = Object();

abstract interface class TvPlaybackController implements Listenable {
  PlaybackViewState get state;
  VideoPlayerController? get video;
  Future<void> initialize();
  Future<void> retry();
  Future<void> togglePlayback();
  Future<void> seekBy(Duration delta);
  Future<void> seekTo(Duration position);
  Future<void> setPlaybackRate(double rate);
  Future<void> finish();
}

class PlaybackViewState {
  const PlaybackViewState({
    required this.status,
    required this.loading,
    required this.buffering,
    required this.playing,
    required this.initialized,
    required this.position,
    required this.duration,
    required this.seekable,
    required this.released,
    required this.finishing,
    required this.playbackRate,
    required this.bufferedPosition,
    required this.subtitleText,
    required this.subtitleOffset,
    required this.subtitleStyle,
    required this.subtitleTextColor,
    required this.subtitleSizePercent,
    required this.subtitleBottomOffsetPercent,
    required this.qualityLabel,
    required this.upscaleLabel,
    required this.qualityChanging,
    required this.audioChanging,
    required this.markers,
    this.error,
    this.authorization,
    this.selectedSubtitle,
    this.selectedAudioTrack,
    this.activeMarker,
    this.nextItem,
    this.nextEpisodeCountdown,
  });

  static const initial = PlaybackViewState(
    status: 'Klargør afspilning...',
    loading: true,
    buffering: true,
    playing: false,
    initialized: false,
    position: Duration.zero,
    duration: Duration.zero,
    seekable: false,
    released: false,
    finishing: false,
    playbackRate: 1,
    bufferedPosition: Duration.zero,
    subtitleText: '',
    subtitleOffset: Duration.zero,
    subtitleStyle: 'broadcast',
    subtitleTextColor: '#FFFFFF',
    subtitleSizePercent: 100,
    subtitleBottomOffsetPercent: 6,
    qualityLabel: '',
    upscaleLabel: '',
    qualityChanging: false,
    audioChanging: false,
    markers: [],
  );

  final String status;
  final String? error;
  final bool loading;
  final bool buffering;
  final bool playing;
  final bool initialized;
  final Duration position;
  final Duration duration;
  final bool seekable;
  final bool released;
  final bool finishing;
  final double playbackRate;
  final Duration bufferedPosition;
  final String subtitleText;
  final Duration subtitleOffset;
  final String subtitleStyle;
  final String subtitleTextColor;
  final int subtitleSizePercent;
  final int subtitleBottomOffsetPercent;
  final String qualityLabel;
  final String upscaleLabel;
  final bool qualityChanging;
  final bool audioChanging;
  final PlaybackAuthorization? authorization;
  final SubtitleTrack? selectedSubtitle;
  final PlaybackAudioTrack? selectedAudioTrack;
  final List<PlaybackMarker> markers;
  final PlaybackMarker? activeMarker;
  final PlaybackQueueItem? nextItem;
  final int? nextEpisodeCountdown;

  PlaybackViewState copyWith({
    String? status,
    Object? error = _stateUnset,
    bool? loading,
    bool? buffering,
    bool? playing,
    bool? initialized,
    Duration? position,
    Duration? duration,
    bool? seekable,
    bool? released,
    bool? finishing,
    double? playbackRate,
    Duration? bufferedPosition,
    String? subtitleText,
    Duration? subtitleOffset,
    String? subtitleStyle,
    String? subtitleTextColor,
    int? subtitleSizePercent,
    int? subtitleBottomOffsetPercent,
    String? qualityLabel,
    String? upscaleLabel,
    bool? qualityChanging,
    bool? audioChanging,
    Object? authorization = _stateUnset,
    Object? selectedSubtitle = _stateUnset,
    Object? selectedAudioTrack = _stateUnset,
    List<PlaybackMarker>? markers,
    Object? activeMarker = _stateUnset,
    Object? nextItem = _stateUnset,
    Object? nextEpisodeCountdown = _stateUnset,
  }) => PlaybackViewState(
    status: status ?? this.status,
    error: identical(error, _stateUnset) ? this.error : error as String?,
    loading: loading ?? this.loading,
    buffering: buffering ?? this.buffering,
    playing: playing ?? this.playing,
    initialized: initialized ?? this.initialized,
    position: position ?? this.position,
    duration: duration ?? this.duration,
    seekable: seekable ?? this.seekable,
    released: released ?? this.released,
    finishing: finishing ?? this.finishing,
    playbackRate: playbackRate ?? this.playbackRate,
    bufferedPosition: bufferedPosition ?? this.bufferedPosition,
    subtitleText: subtitleText ?? this.subtitleText,
    subtitleOffset: subtitleOffset ?? this.subtitleOffset,
    subtitleStyle: subtitleStyle ?? this.subtitleStyle,
    subtitleTextColor: subtitleTextColor ?? this.subtitleTextColor,
    subtitleSizePercent: subtitleSizePercent ?? this.subtitleSizePercent,
    subtitleBottomOffsetPercent:
        subtitleBottomOffsetPercent ?? this.subtitleBottomOffsetPercent,
    qualityLabel: qualityLabel ?? this.qualityLabel,
    upscaleLabel: upscaleLabel ?? this.upscaleLabel,
    qualityChanging: qualityChanging ?? this.qualityChanging,
    audioChanging: audioChanging ?? this.audioChanging,
    authorization: identical(authorization, _stateUnset)
        ? this.authorization
        : authorization as PlaybackAuthorization?,
    selectedSubtitle: identical(selectedSubtitle, _stateUnset)
        ? this.selectedSubtitle
        : selectedSubtitle as SubtitleTrack?,
    selectedAudioTrack: identical(selectedAudioTrack, _stateUnset)
        ? this.selectedAudioTrack
        : selectedAudioTrack as PlaybackAudioTrack?,
    markers: markers ?? this.markers,
    activeMarker: identical(activeMarker, _stateUnset)
        ? this.activeMarker
        : activeMarker as PlaybackMarker?,
    nextItem: identical(nextItem, _stateUnset)
        ? this.nextItem
        : nextItem as PlaybackQueueItem?,
    nextEpisodeCountdown: identical(nextEpisodeCountdown, _stateUnset)
        ? this.nextEpisodeCountdown
        : nextEpisodeCountdown as int?,
  );
}

class PlaybackMarker {
  const PlaybackMarker({
    required this.kind,
    required this.startMs,
    required this.endMs,
  });

  final String kind;
  final int startMs;
  final int endMs;

  factory PlaybackMarker.fromJson(dynamic value) {
    final json = jsonMap(value);
    return PlaybackMarker(
      kind: stringValue(json['kind']) ?? 'unknown',
      startMs: intValue(json['startMs']) ?? 0,
      endMs: intValue(json['endMs']) ?? 0,
    );
  }
}

class PlaybackQueueItem {
  const PlaybackQueueItem({
    required this.media,
    required this.resumePositionMs,
    required this.subtitleSelection,
  });

  final MediaItem media;
  final int resumePositionMs;
  final SubtitleQueueSelection? subtitleSelection;
}

class PlaybackAuthorizationRequest {
  PlaybackAuthorizationRequest({
    required this.profileId,
    required this.mediaId,
    required this.deviceId,
    required int startPositionMs,
    required double screenHeight,
    required double devicePixelRatio,
    required this.supportsHdr,
    this.bufferProfile = 'auto',
    this.upscaleMode = 'server',
    double? estimatedDownlinkMbps,
  }) : startPositionMs = startPositionMs.clamp(0, 2147483647).toInt(),
       screenHeight = screenHeight.round().clamp(240, 4320).toInt(),
       devicePixelRatio = devicePixelRatio.clamp(0.5, 4).toDouble(),
       estimatedDownlinkMbps = estimatedDownlinkMbps
           ?.clamp(0.1, 1000)
           .toDouble() {
    for (final entry in {
      'profileId': profileId,
      'mediaId': mediaId,
      'deviceId': deviceId,
    }.entries) {
      if (!_uuid.hasMatch(entry.value)) {
        throw ApiException(
          'Afspilningsdata er ugyldige. Åbn titlen igen og prøv på ny.',
          code: 'invalid_${entry.key}',
        );
      }
    }
  }

  static final RegExp _uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  final String profileId;
  final String mediaId;
  final String deviceId;
  final int startPositionMs;
  final int screenHeight;
  final double devicePixelRatio;
  final bool supportsHdr;
  final String bufferProfile;
  final String upscaleMode;
  final double? estimatedDownlinkMbps;

  Map<String, dynamic> toJson({bool compatibility = false}) => {
    'profileId': profileId,
    'mediaId': mediaId,
    'deviceId': deviceId,
    'startPositionMs': startPositionMs,
    'capabilities': {
      'screenHeight': screenHeight,
      'devicePixelRatio': devicePixelRatio,
      'supportedCodecs': const <String>['h264', 'hevc'],
      'supportedContainers': const <String>['mov', 'mp4', 'matroska', 'mpegts'],
      'supportsHdr': supportsHdr,
      if (estimatedDownlinkMbps != null)
        'estimatedDownlinkMbps': estimatedDownlinkMbps,
      if (!compatibility) ...{
        'supportedAudioCodecs': const <String>['aac', 'ac3', 'eac3'],
        'upscaleMode': upscaleMode,
        'bufferProfile': bufferProfile,
        'startupPolicy': AppConfig.isTvBuild ? 'baseline_first' : 'stable',
      },
    },
  };
}

class PlaybackSessionController extends ChangeNotifier
    with WidgetsBindingObserver
    implements TvPlaybackController {
  PlaybackSessionController({
    required this.api,
    required this.media,
    required this.resumePositionMs,
    required this.screenHeight,
    required this.devicePixelRatio,
    this.subtitleSelection,
    this.supportsHdr = false,
    PlaybackTuningStore? tuningStore,
  }) : _subtitleQueueSelection = subtitleSelection,
       _tuningStore = tuningStore ?? PlaybackTuningStore.instance;

  final ApiClient api;
  final MediaItem media;
  final int resumePositionMs;
  final double screenHeight;
  final double devicePixelRatio;
  final SubtitleQueueSelection? subtitleSelection;
  final bool supportsHdr;
  final PlaybackTuningStore _tuningStore;
  PlaybackTuning _tuning = const PlaybackTuning();

  PlaybackViewState _state = PlaybackViewState.initial;
  @override
  PlaybackViewState get state => _state;

  VideoPlayerController? _video;
  @override
  VideoPlayerController? get video => _video;

  PlaybackAuthorization? _authorization;
  List<WebVttCue> _cues = const [];
  double? _estimatedDownlinkMbps;
  final PlaybackMaintenanceScheduler _maintenanceScheduler =
      PlaybackMaintenanceScheduler();
  final PlaybackPlatform _platform = PlaybackPlatform.instance;
  final PlaybackUiClock _uiClock = PlaybackUiClock();
  late final PlaybackQualityCoordinator _qualityCoordinator =
      PlaybackQualityCoordinator(platform: _platform);
  Timer? _autoQualityUnlockTimer;
  Timer? _uiTimer;
  Timer? _nativeTelemetryTimer;
  Timer? _nextTimer;
  bool _nativeTelemetryPollInFlight = false;
  int _nativeTelemetryGeneration = 0;
  NativeVideoTelemetry? _latestNativeTelemetry;
  Future<void>? _initialization;
  Future<void>? _finishOperation;
  SubtitleQueueSelection? _subtitleQueueSelection;
  int _timelineOffsetMs = 0;
  int _stallCount = 0;
  bool _lastBuffering = false;
  bool _released = false;
  bool _disposed = false;
  bool _completed = false;
  bool _nextLoading = false;
  bool _qualityChanging = false;
  bool _audioChanging = false;
  bool _autoQualityUnlockRunning = false;
  bool _keepScreenOnEnabled = false;
  int _autoQualityUnlockAttempts = 0;
  int? _sessionFixedHeight;
  String? _sessionQualityMode;
  bool? _sessionAllowUpscale;
  String? _sessionUpscaleMode;

  String get currentQualityMode =>
      _sessionQualityMode ?? _authorization?.preferences.qualityMode ?? 'auto';

  int? get currentFixedQualityHeight =>
      _sessionFixedHeight ?? _authorization?.preferences.fixedQualityHeight;

  String get currentUpscaleMode {
    final mode = _normalizedUpscaleMode(
      _sessionUpscaleMode ??
          _authorization?.preferences.upscaleMode ??
          _tuning.upscaleMode,
    );
    final allowed =
        _sessionAllowUpscale ??
        _authorization?.preferences.allowUpscale ??
        (mode != 'off');
    return allowed ? mode : 'off';
  }

  bool get currentAllowUpscale => currentUpscaleMode != 'off';

  @override
  Future<void> initialize() =>
      _initialization ??= _initializeAt(math.max(0, resumePositionMs));

  Future<void> _initializeAt(int startPositionMs) async {
    WidgetsBinding.instance.addObserver(this);
    _setState(
      _state.copyWith(
        status: 'Autoriserer afspilning...',
        loading: true,
        buffering: true,
        error: null,
        released: false,
        finishing: false,
      ),
    );
    try {
      _tuning = await _tuningStore.load();
      final authorization = await _authorize(startPositionMs);
      if (authorization.sessionId.isEmpty || authorization.streamUrl.isEmpty) {
        throw const ApiException(
          'Serveren returnerede ingen afspillelig stream.',
        );
      }
      _authorization = authorization;
      _released = false;
      _sessionQualityMode ??= authorization.preferences.qualityMode;
      _sessionFixedHeight ??= authorization.preferences.fixedQualityHeight;
      _sessionAllowUpscale ??= authorization.preferences.allowUpscale;
      _sessionUpscaleMode ??= _normalizedUpscaleMode(
        authorization.preferences.upscaleMode,
      );
      _timelineOffsetMs = authorization.isDirectPlay ? 0 : startPositionMs;
      await _loadAssets();
      if (authorization.transcodeStatusUrl != null) {
        await _waitUntilReady(authorization.transcodeStatusUrl!);
      }
      await _openVideo(authorization, directPlaySeekMs: startPositionMs);
      await _selectDefaultSubtitle();
      _startTimers();
    } on ApiException catch (failure) {
      _setState(
        _state.copyWith(
          error: failure.message,
          loading: false,
          buffering: false,
        ),
      );
    } catch (failure) {
      _setState(
        _state.copyWith(
          error: 'Afspilningen kunne ikke startes: $failure',
          loading: false,
          buffering: false,
        ),
      );
    }
  }

  Future<PlaybackAuthorization> _authorize(int startPositionMs) async {
    for (var attempt = 0; attempt < 2; attempt++) {
      final context = jsonMap(await api.getJson('/playback/context'));
      final profileId = stringValue(context['profileId']);
      final deviceId = stringValue(context['deviceId']);
      if (profileId == null || deviceId == null) {
        throw const ApiException(
          'Den aktive profil eller enhed mangler. Log ind igen.',
          code: 'playback_context_missing',
        );
      }
      final request = PlaybackAuthorizationRequest(
        profileId: profileId,
        mediaId: media.id,
        deviceId: deviceId,
        startPositionMs: startPositionMs,
        screenHeight: screenHeight,
        devicePixelRatio: devicePixelRatio,
        supportsHdr: supportsHdr,
        bufferProfile: _tuning.bufferProfile,
        upscaleMode: _tuning.upscaleMode,
        estimatedDownlinkMbps: _estimatedDownlinkMbpsForPayload,
      );
      try {
        return PlaybackAuthorization.fromJson(
          await api.postJson(
            '/playback/authorize',
            request.toJson(compatibility: attempt > 0),
          ),
        );
      } on ApiException catch (failure) {
        final validationFailure =
            failure.statusCode == 400 || failure.code == 'validation_failed';
        if (attempt == 0 && validationFailure) continue;
        if (validationFailure) {
          final rawReference = failure.correlationId?.trim();
          final reference =
              rawReference == null ||
                  rawReference.isEmpty ||
                  rawReference.toLowerCase() == 'unscoped'
              ? null
              : rawReference;
          throw ApiException(
            'Serveren afviste afspilningsoplysningerne. '
            'Prøv igen${reference == null ? '.' : ' · Reference $reference'}',
            code: failure.code,
            statusCode: failure.statusCode,
            problem: failure.problem,
          );
        }
        rethrow;
      }
    }
    throw const ApiException('Afspilningen kunne ikke autoriseres.');
  }

  Future<void> _waitUntilReady(String statusUrl) async {
    for (var attempt = 0; attempt < 180; attempt++) {
      if (_disposed || _released) return;
      final status = jsonMap(await api.getJson(statusUrl));
      final value =
          stringValue(status['state']) ??
          stringValue(status['status']) ??
          'queued';
      if (value == 'ready' || value == 'active') return;
      if (value == 'failed') {
        throw ApiException(
          stringValue(status['message']) ??
              'FFmpeg kunne ikke forberede streamen.',
        );
      }
      final ready = intValue(status['readySegments']) ?? 0;
      final required = intValue(status['requiredSegments']) ?? 0;
      _setState(
        _state.copyWith(
          status: required > 0
              ? 'Forbereder stream · buffer $ready af $required'
              : stringValue(status['message']) ??
                    'FFmpeg forbereder streamen...',
        ),
      );
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    throw const ApiException('Streamen blev ikke klar inden for tre minutter.');
  }

  Future<void> _openVideo(
    PlaybackAuthorization authorization, {
    int directPlaySeekMs = 0,
  }) async {
    final previous = _video;
    if (previous != null) {
      previous.removeListener(_onVideoChanged);
      await previous.dispose();
    }
    await _platform.configureTvVideoPlayer(
      AppConfig.isTvBuild,
      bufferProfile:
          authorization.preferences.bufferProfile ?? _tuning.bufferProfile,
      upscaleMode: currentUpscaleMode,
    );
    final controller = VideoPlayerController.networkUrl(
      api.endpoint(authorization.streamUrl),
      formatHint: authorization.isHls ? VideoFormat.hls : VideoFormat.other,
      viewType: VideoViewType.textureView,
      videoPlayerOptions: VideoPlayerOptions(
        mixWithOthers: false,
        allowBackgroundPlayback: true,
      ),
    );
    _video = controller;
    await controller.initialize();
    if (authorization.isDirectPlay && directPlaySeekMs > 0) {
      await controller.seekTo(Duration(milliseconds: directPlaySeekMs));
    }
    await controller.setPlaybackSpeed(authorization.preferences.playbackRate);
    await _configureQuality(controller, authorization);
    controller.addListener(_onVideoChanged);
    await controller.play();
    final initialLocalPositionMs = authorization.isDirectPlay
        ? math.max(
            directPlaySeekMs,
            controller.value.position.inMilliseconds,
          )
        : math.max(0, controller.value.position.inMilliseconds);
    _latestNativeTelemetry = null;
    _uiClock.reset(
      positionMs: initialLocalPositionMs,
      bufferedPositionMs: initialLocalPositionMs,
      playing: true,
      buffering: false,
      playbackRate: controller.value.playbackSpeed,
    );
    _setKeepScreenOn(true);
    _authorization = authorization;
    final buffered = math.max(
      0,
      math.min(_durationMs, _absolutePositionMs + _bufferAheadMs),
    );
    _setState(
      _state.copyWith(
        status: authorization.isDirectPlay
            ? 'Direct Play'
            : authorization.method == 'direct_stream'
            ? 'Direct Stream'
            : 'Transcoding',
        loading: false,
        buffering: false,
        playing: true,
        initialized: true,
        position: Duration(milliseconds: _absolutePositionMs),
        bufferedPosition: Duration(milliseconds: buffered),
        duration: Duration(milliseconds: _durationMs),
        seekable: _durationMs > 0,
        playbackRate: controller.value.playbackSpeed,
        authorization: authorization,
        selectedAudioTrack: authorization.selectedAudioTrack,
        qualityLabel: _qualityLabel,
        upscaleLabel: _upscaleLabel,
        qualityChanging: false,
        audioChanging: false,
        subtitleStyle: authorization.preferences.subtitleStyle,
        subtitleTextColor: authorization.preferences.subtitleTextColor,
        subtitleSizePercent: authorization.preferences.subtitleSizePercent,
        subtitleBottomOffsetPercent:
            authorization.preferences.subtitleBottomOffsetPercent,
      ),
    );
  }

  void _onVideoChanged() {
    final controller = _video;
    if (controller == null || _disposed) return;
    _uiClock.setTransport(
      playing: controller.value.isPlaying,
      buffering:
          controller.value.isBuffering && !controller.value.isPlaying,
      playbackRate: controller.value.playbackSpeed,
    );
    if (controller.value.isBuffering && !_lastBuffering) {
      _stallCount += 1;
    }
    _lastBuffering = controller.value.isBuffering;
    if (controller.value.hasError) {
      final description = controller.value.errorDescription?.trim();
      _setState(
        _state.copyWith(
          error: description == null || description.isEmpty
              ? 'Afspilningen blev afbrudt af en reel playerfejl.'
              : 'Afspilningen blev afbrudt: $description',
          loading: false,
          buffering: false,
          playing: false,
          nextEpisodeCountdown: null,
        ),
      );
      return;
    }
    if (_isTerminalPlayback(controller)) _completePlayback();
  }

  void _startTimers() {
    _stopTimers();
    _maintenanceScheduler.start(
      heartbeat: _heartbeat,
      progress: () => saveProgress(),
    );
    _lastBuffering = _video?.value.isBuffering ?? false;
    _autoQualityUnlockAttempts = 0;
    _scheduleAutoQualityUnlock(const Duration(seconds: 30));
    _uiTimer = Timer.periodic(
      const Duration(milliseconds: 250),
      (_) => _tick(),
    );
    _startNativeTelemetryPolling();
    _setKeepScreenOn(true);
  }

  void _stopTimers() {
    _maintenanceScheduler.stop();
    _autoQualityUnlockTimer?.cancel();
    _uiTimer?.cancel();
    _nativeTelemetryTimer?.cancel();
    _nextTimer?.cancel();
    _autoQualityUnlockTimer = null;
    _uiTimer = null;
    _nativeTelemetryTimer = null;
    _nextTimer = null;
    _nativeTelemetryGeneration += 1;
    _nativeTelemetryPollInFlight = false;
  }

  void _startNativeTelemetryPolling() {
    final generation = ++_nativeTelemetryGeneration;
    unawaited(_refreshNativeTelemetry(generation));
    _nativeTelemetryTimer = Timer.periodic(
      const Duration(milliseconds: 750),
      (_) => unawaited(_refreshNativeTelemetry(generation)),
    );
  }

  Future<void> _refreshNativeTelemetry(int generation) async {
    if (_disposed || _nativeTelemetryPollInFlight) return;
    final controller = _video;
    if (controller == null || !controller.value.isInitialized) return;

    _nativeTelemetryPollInFlight = true;
    try {
      final telemetry = await _platform.videoTelemetry().timeout(
        const Duration(milliseconds: 800),
      );
      if (_disposed ||
          telemetry == null ||
          generation != _nativeTelemetryGeneration ||
          !identical(controller, _video) ||
          !controller.value.isInitialized) {
        return;
      }

      _latestNativeTelemetry = telemetry;
      if (telemetry.bandwidthEstimate > 0) {
        _estimatedDownlinkMbps = telemetry.bandwidthEstimate / 1000000;
      }
      _uiClock.synchronize(
        positionMs: telemetry.positionMs,
        bufferedPositionMs: telemetry.bufferedPositionMs,
        playing: telemetry.isPlaying,
        buffering:
            !telemetry.isPlaying &&
            (telemetry.isLoading || telemetry.playbackState == 2),
        playbackRate: controller.value.playbackSpeed,
      );
    } on TimeoutException {
      // A delayed native sample must never block later UI telemetry updates.
    } catch (_) {
      // Unsupported platforms keep using video_player's regular value stream.
    } finally {
      _nativeTelemetryPollInFlight = false;
    }
  }

  void _tick() {
    final controller = _video;
    final auth = _authorization;
    if (controller == null || auth == null || !controller.value.isInitialized) {
      return;
    }
    final absolute = _absolutePositionMs;
    final subtitlePositionMs = math.max(
      0,
      absolute +
          auth.preferences.subtitleTimingOffsetMs +
          _state.subtitleOffset.inMilliseconds,
    );
    final cueText = _cues
        .where(
          (cue) => cue.contains(Duration(milliseconds: subtitlePositionMs)),
        )
        .map((cue) => cue.text)
        .join('\n');
    final marker = _state.markers
        .where(
          (value) => absolute >= value.startMs - 750 && absolute < value.endMs,
        )
        .firstOrNull;
    if (marker != null &&
        _canStartNextCountdown(marker, absolute) &&
        media.isEpisode &&
        auth.preferences.autoplayNext &&
        _state.nextEpisodeCountdown == null) {
      _startNextCountdown();
    }
    if (_isTerminalPlayback(controller)) {
      _completePlayback();
      return;
    }
    final durationMs = math.max(1, _durationMs);
    final bufferedMs = math.max(
      0,
      math.min(durationMs, absolute + _bufferAheadMs),
    );
    _setState(
      _state.copyWith(
        buffering: _uiClock.buffering,
        playing: _uiClock.playing,
        position: Duration(milliseconds: absolute),
        bufferedPosition: Duration(milliseconds: bufferedMs),
        duration: Duration(milliseconds: _durationMs),
        seekable: _durationMs > 0,
        playbackRate: _uiClock.playbackRate,
        subtitleText: cueText,
        activeMarker: marker,
        qualityLabel: _qualityLabel,
      ),
    );
  }

  int get _absolutePositionMs => math.max(
    0,
    _timelineOffsetMs +
        (_uiClock.initialized
            ? _uiClock.positionMs
            : (_video?.value.position.inMilliseconds ?? 0)),
  );

  int get _durationMs {
    final known = media.durationMs ?? media.progress?.durationMs;
    if (known != null && known > 0) return known;
    return _timelineOffsetMs + (_video?.value.duration.inMilliseconds ?? 0);
  }

  Future<void> _loadAssets() async {
    try {
      final assets = jsonMap(
        await api.getJson(
          '/media/${Uri.encodeComponent(media.id)}/playback-assets',
        ),
      );
      final markers = jsonList(assets['markers'])
          .map(PlaybackMarker.fromJson)
          .where((marker) => marker.endMs > marker.startMs)
          .toList(growable: false);
      _setState(_state.copyWith(markers: markers));
    } catch (_) {
      _setState(_state.copyWith(markers: const []));
    }
  }

  Future<void> _heartbeat() async {
    final auth = _authorization;
    final controller = _video;
    if (auth == null || controller == null || _released) return;
    try {
      final telemetry =
          _latestNativeTelemetry ?? await _platform.videoTelemetry();
      final bandwidth = telemetry?.bandwidthEstimate ?? 0;
      if (bandwidth > 0) {
        _estimatedDownlinkMbps = bandwidth / 1000000;
      }
      await api.patchJson(
        '/playback/sessions/${Uri.encodeComponent(auth.sessionId)}/heartbeat',
        {
          'runtimeState': _uiClock.buffering
              ? 'buffering'
              : _uiClock.playing
              ? 'playing'
              : 'paused',
          'positionMs': _absolutePositionMs,
          if (_durationMs > 0) 'durationMs': _durationMs,
          'currentBitrate': telemetry?.bitrate ?? auth.sourceBitrate,
          'currentHeight': telemetry?.height ?? auth.sourceHeight,
          'bufferAheadMs': _bufferAheadMs,
          'stallCount': _stallCount,
          'playbackRate': controller.value.playbackSpeed,
          if (bandwidth > 0) 'bandwidthEstimate': bandwidth,
          'audioTrack': _state.selectedAudioTrack?.label,
          'subtitleTrack': _state.selectedSubtitle?.label,
        },
      );
    } catch (_) {}
  }

  void _scheduleAutoQualityUnlock(Duration delay) {
    _autoQualityUnlockTimer?.cancel();
    if (_disposed ||
        _released ||
        currentQualityMode != 'auto' ||
        !_qualityCoordinator.supportsLocalSelection) {
      return;
    }
    _autoQualityUnlockTimer = Timer(
      delay,
      () => unawaited(_unlockAutomaticQuality()),
    );
  }

  Future<void> _unlockAutomaticQuality() async {
    if (_autoQualityUnlockRunning || _disposed || _released) return;
    final auth = _authorization;
    final controller = _video;
    if (auth == null ||
        controller == null ||
        !auth.isHls ||
        !controller.value.isInitialized ||
        currentQualityMode != 'auto' ||
        !_qualityCoordinator.supportsLocalSelection) {
      return;
    }
    final stable = controller.value.isPlaying && !controller.value.isBuffering;
    if (!stable) {
      _autoQualityUnlockAttempts += 1;
      if (_autoQualityUnlockAttempts <= 18) {
        _scheduleAutoQualityUnlock(const Duration(seconds: 5));
      }
      return;
    }
    _autoQualityUnlockRunning = true;
    try {
      await _qualityCoordinator.apply(
        controller,
        selection: const PlaybackQualitySelection.automatic(),
        sourceHeight: auth.sourceHeight ?? 1080,
        renditionHeights: auth.renditions.map((rendition) => rendition.height),
      );
      _setState(
        _state.copyWith(
          status: 'Auto · Media3 styrer kvaliteten',
          qualityLabel: _qualityLabel,
        ),
      );
    } finally {
      _autoQualityUnlockRunning = false;
    }
  }

  int get _bufferAheadMs {
    if (_uiClock.initialized) return _uiClock.bufferAheadMs;
    final controller = _video;
    if (controller == null) return 0;
    for (final range in controller.value.buffered) {
      if (controller.value.position >= range.start &&
          controller.value.position <= range.end) {
        return math.max(
          0,
          (range.end - controller.value.position).inMilliseconds,
        );
      }
    }
    return 0;
  }

  bool _isTerminalPlayback(VideoPlayerController controller) {
    if (_completed || _nextLoading || !controller.value.isInitialized) {
      return false;
    }
    final streamDuration = controller.value.duration;
    final streamPosition = Duration(
      milliseconds: _uiClock.initialized
          ? _uiClock.positionMs
          : controller.value.position.inMilliseconds,
    );
    final remainingStreamMs =
        streamDuration.inMilliseconds - streamPosition.inMilliseconds;
    final knownDurationMs = _durationMs;
    final remainingKnownMs = knownDurationMs <= 0
        ? 2147483647
        : knownDurationMs - _absolutePositionMs;
    final nearStreamEnd = remainingStreamMs <= 2500;
    final nearKnownEnd = remainingKnownMs <= 2500;
    if (controller.value.isCompleted) {
      // An EVENT HLS manifest grows while FFmpeg is producing it. Media3 may
      // briefly report the current playlist edge as completed even though the
      // known movie or episode has substantial time left. Never restart or
      // complete the session from that transient edge.
      return knownDurationMs > 0 ? nearKnownEnd : nearStreamEnd;
    }
    if (!controller.value.isPlaying && !controller.value.isBuffering) {
      return knownDurationMs > 0 ? nearKnownEnd : nearStreamEnd;
    }
    return false;
  }

  bool _canStartNextCountdown(PlaybackMarker marker, int absoluteMs) {
    if (marker.kind != 'credits') return false;
    final durationMs = _durationMs;
    if (durationMs <= 0) return false;
    final remainingMs = durationMs - absoluteMs;
    final markerRemainingMs = durationMs - marker.startMs;
    return remainingMs <= 75_000 && markerRemainingMs <= 75_000;
  }

  void _setKeepScreenOn(bool enabled, {bool force = false}) {
    if (!AppConfig.isTvBuild || _disposed) return;
    if (!force && _keepScreenOnEnabled == enabled) return;
    _keepScreenOnEnabled = enabled;
    unawaited(_platform.setKeepScreenOn(enabled));
  }

  void _completePlayback() {
    if (_completed) return;
    _completed = true;
    unawaited(saveProgress(completed: true));
    final auth = _authorization;
    if (media.isEpisode && auth?.preferences.autoplayNext == true) {
      _nextTimer?.cancel();
      _setState(
        _state.copyWith(
          status: 'Starter næste afsnit...',
          loading: true,
          buffering: true,
          playing: false,
          nextEpisodeCountdown: null,
        ),
      );
      unawaited(
        _resolveNextEpisode(automatic: true, progressAlreadySaved: true),
      );
      return;
    }
    _setState(
      _state.copyWith(
        status: 'Afspilning færdig',
        loading: false,
        buffering: false,
        playing: false,
      ),
    );
  }

  Future<void> saveProgress({bool completed = false}) async {
    final auth = _authorization;
    if (auth == null || _released) return;
    try {
      await api.patchJson(
        '/playback/sessions/${Uri.encodeComponent(auth.sessionId)}/progress',
        {
          'positionMs': completed ? _durationMs : _absolutePositionMs,
          if (_durationMs > 0) 'durationMs': _durationMs,
          if (completed) 'completed': true,
        },
      );
    } catch (_) {}
  }

  @override
  Future<void> togglePlayback() async {
    final controller = _video;
    if (controller == null) return;
    if (_uiClock.playing) {
      await controller.pause();
      _uiClock.setTransport(
        playing: false,
        buffering: false,
        playbackRate: controller.value.playbackSpeed,
      );
    } else {
      await controller.play();
      _uiClock.setTransport(
        playing: true,
        buffering: false,
        playbackRate: controller.value.playbackSpeed,
      );
    }
    _tick();
  }

  @override
  Future<void> seekBy(Duration delta) =>
      seekTo(Duration(milliseconds: _absolutePositionMs) + delta);

  @override
  Future<void> seekTo(Duration position) async {
    final controller = _video;
    final auth = _authorization;
    if (controller == null || auth == null || _durationMs <= 0) return;
    final target = position.inMilliseconds.clamp(0, _durationMs).toInt();
    if (auth.isDirectPlay) {
      await controller.seekTo(Duration(milliseconds: target));
      _uiClock.seek(
        positionMs: target,
        playing: _state.playing,
        buffering: false,
        playbackRate: controller.value.playbackSpeed,
      );
    } else {
      final local = target - _timelineOffsetMs;
      final buffered = controller.value.buffered.any(
        (range) =>
            Duration(milliseconds: local) >= range.start &&
            Duration(milliseconds: local) <= range.end,
      );
      if (local >= 0 && buffered) {
        await controller.seekTo(Duration(milliseconds: local));
        _uiClock.seek(
          positionMs: local,
          playing: _state.playing,
          buffering: false,
          playbackRate: controller.value.playbackSpeed,
        );
      } else {
        await _reconfigure(
          target,
          burnInTrack: _state.selectedSubtitle?.isText == false
              ? _state.selectedSubtitle
              : null,
        );
      }
    }
    await saveProgress();
    _tick();
  }

  Future<void> selectSubtitle(SubtitleTrack? track) async {
    _subtitleQueueSelection = track == null
        ? const SubtitleQueueSelection.off()
        : SubtitleQueueSelection.fromTrack(track);
    if (track == null) {
      _cues = const [];
      _setState(
        _state.copyWith(selectedSubtitle: null, subtitleText: '', error: null),
      );
      return;
    }
    if (!track.isText) {
      await _reconfigure(_absolutePositionMs, burnInTrack: track);
      return;
    }
    if (track.src == null || track.src!.isEmpty) {
      _setState(_state.copyWith(error: 'Undertekstsporet mangler kilde-fil.'));
      return;
    }
    _setState(
      _state.copyWith(selectedSubtitle: track, subtitleText: '', error: null),
    );
    try {
      final text = await api.getText(track.src!);
      if (_state.selectedSubtitle?.id != track.id) return;
      _cues = parseSubtitles(text);
    } catch (_) {
      _cues = const [];
      _setState(
        _state.copyWith(error: 'Undertekstsporet kunne ikke indlæses.'),
      );
    }
  }

  Future<void> adjustSubtitleOffset(Duration delta) async {
    await setSubtitleOffset(_state.subtitleOffset + delta);
  }

  Future<void> resetSubtitleOffset() async {
    await setSubtitleOffset(Duration.zero);
  }

  Future<void> setSubtitleOffset(Duration offset) async {
    final clampedMs = offset.inMilliseconds.clamp(-30000, 30000).toInt();
    _setState(
      _state.copyWith(subtitleOffset: Duration(milliseconds: clampedMs)),
    );
    _tick();
  }

  Future<void> _selectDefaultSubtitle() async {
    final auth = _authorization;
    if (auth == null) return;
    final queued = _subtitleQueueSelection;
    final selected = queued == null
        ? preferredSubtitleTrack(auth.subtitleTracks, auth.preferences)
        : queued.resolve(auth.subtitleTracks);
    await selectSubtitle(selected);
  }

  Future<void> _reconfigure(
    int positionMs, {
    SubtitleTrack? burnInTrack,
    String? qualityMode,
    int? fixedQualityHeight,
    String? audioTrackId,
    bool? allowUpscale,
    String? upscaleMode,
  }) async {
    final auth = _authorization;
    if (auth == null) return;
    final preservedAudioTrackId = audioTrackId ?? auth.selectedAudioTrackId;
    final requestedQualityMode = qualityMode ?? currentQualityMode;
    final requestedFixedHeight = requestedQualityMode == 'fixed'
        ? fixedQualityHeight ?? currentFixedQualityHeight
        : null;
    final rawUpscaleMode = _normalizedUpscaleMode(
      upscaleMode ?? currentUpscaleMode,
    );
    final requestedAllowUpscale = allowUpscale ?? rawUpscaleMode != 'off';
    final requestedUpscaleMode = requestedAllowUpscale ? rawUpscaleMode : 'off';
    _setState(
      _state.copyWith(
        loading: true,
        buffering: true,
        status: burnInTrack == null
            ? 'Søger i streamen...'
            : 'Forbereder billed-undertekster...',
      ),
    );
    await saveProgress();
    final result = jsonMap(
      await api.patchJson(
        '/playback/sessions/${Uri.encodeComponent(auth.sessionId)}/configuration',
        {
          'streamToken': auth.streamToken,
          'burnIn': burnInTrack != null,
          ...?burnInTrack == null ? null : {'subtitleTrackId': burnInTrack.id},
          'qualityMode': requestedQualityMode,
          ...?requestedFixedHeight == null
              ? null
              : {'fixedQualityHeight': requestedFixedHeight},
          ...?preservedAudioTrackId == null
              ? null
              : {'audioTrackId': preservedAudioTrackId},
          'allowUpscale': requestedAllowUpscale,
          'upscaleMode': requestedUpscaleMode,
          'forceTranscode': true,
          'capabilities': _playbackCapabilitiesPayload(
            upscaleMode: requestedUpscaleMode,
            bufferProfile:
                auth.preferences.bufferProfile ?? _tuning.bufferProfile,
          ),
          'startPositionMs': math.max(0, positionMs),
        },
      ),
    );
    final adaptive = jsonMap(result['adaptiveQuality']);
    final renditions = result.containsKey('adaptiveQuality')
        ? jsonList(adaptive['renditions'])
              .map(Rendition.fromJson)
              .where((rendition) => rendition.height > 0)
              .toList(growable: false)
        : auth.renditions;
    final audioTracks = result.containsKey('audioTracks')
        ? jsonList(result['audioTracks'])
              .map(PlaybackAudioTrack.fromJson)
              .where((track) => track.id.isNotEmpty)
              .toList(growable: false)
        : auth.audioTracks;
    final selectedAudioTrackId =
        stringValue(result['selectedAudioTrackId']) ?? preservedAudioTrackId;
    final nextPreferences = auth.preferences.copyWith(
      qualityMode: requestedQualityMode,
      fixedQualityHeight: requestedFixedHeight,
      allowUpscale: requestedAllowUpscale,
      upscaleMode: requestedUpscaleMode,
    );
    final next = auth.copyWith(
      method: stringValue(result['method']) ?? 'transcode',
      streamUrl: stringValue(result['streamUrl']) ?? auth.streamUrl,
      contentType:
          stringValue(result['contentType']) ?? 'application/x-mpegURL',
      transcodeStatusUrl: stringValue(result['transcodeStatusUrl']),
      renditions: renditions,
      audioTracks: audioTracks,
      selectedAudioTrackId: selectedAudioTrackId,
      preferences: nextPreferences,
      hardwareUpscale: boolValue(
        adaptive['hardwareUpscale'],
        fallback: auth.hardwareUpscale,
      ),
    );
    _authorization = next;
    _sessionAllowUpscale = requestedAllowUpscale;
    _sessionUpscaleMode = requestedUpscaleMode;
    _timelineOffsetMs = positionMs;
    if (next.transcodeStatusUrl != null) {
      await _waitUntilReady(next.transcodeStatusUrl!);
    }
    await _openVideo(next);
    _autoQualityUnlockAttempts = 0;
    _scheduleAutoQualityUnlock(const Duration(seconds: 30));
    if (burnInTrack != null) {
      _cues = const [];
      _setState(_state.copyWith(selectedSubtitle: burnInTrack));
    }
  }

  Future<void> selectQuality(String value) async {
    if (_qualityChanging) return;
    final controller = _video;
    final auth = _authorization;
    if (controller == null || auth == null) return;
    _qualityChanging = true;
    try {
      final selection = PlaybackQualitySelection.fromValue(value);
      final sourceHeight = auth.sourceHeight ?? 1080;
      final mode = selection.mode;
      final fixedHeight = selection.fixedHeight;
      _sessionQualityMode = mode;
      _sessionFixedHeight = mode == 'original' ? null : fixedHeight;
      final directTrackSupported =
          AppConfig.isTvBuild && _qualityCoordinator.supportsLocalSelection;
      _setState(
        _state.copyWith(
          loading: !directTrackSupported,
          buffering: directTrackSupported ? controller.value.isBuffering : true,
          qualityChanging: true,
          status: 'Skifter kvalitet...',
          error: null,
        ),
      );
      if (directTrackSupported) {
        _autoQualityUnlockTimer?.cancel();
        final applied = await _qualityCoordinator.apply(
          controller,
          selection: selection,
          sourceHeight: sourceHeight,
          renditionHeights: auth.renditions.map(
            (rendition) => rendition.height,
          ),
        );
        if (applied) {
          _setState(
            _state.copyWith(
              status: 'Kvalitet: $_qualitySelectionLabel',
              loading: false,
              buffering: controller.value.isBuffering,
              qualityChanging: false,
              error: null,
              qualityLabel: _qualityLabel,
              upscaleLabel: _upscaleLabel,
            ),
          );
          _tick();
          return;
        }
      }

      await _reconfigure(
        _absolutePositionMs,
        qualityMode: mode,
        fixedQualityHeight: fixedHeight,
        audioTrackId: auth.selectedAudioTrackId,
        allowUpscale: currentAllowUpscale,
        upscaleMode: currentUpscaleMode,
      );
      _setState(
        _state.copyWith(
          status: 'Kvalitet: $_qualitySelectionLabel',
          loading: false,
          buffering: false,
          qualityChanging: false,
          error: null,
          qualityLabel: _qualityLabel,
          upscaleLabel: _upscaleLabel,
        ),
      );
    } on ApiException catch (failure) {
      _setState(
        _state.copyWith(
          error: failure.message,
          loading: false,
          buffering: false,
          qualityChanging: false,
        ),
      );
    } catch (_) {
      _setState(
        _state.copyWith(
          error: 'Kvaliteten kunne ikke skiftes.',
          loading: false,
          buffering: false,
          qualityChanging: false,
        ),
      );
    } finally {
      _qualityChanging = false;
    }
  }

  Future<void> selectAudioTrack(PlaybackAudioTrack track) async {
    if (_audioChanging) return;
    final auth = _authorization;
    if (auth == null || track.id.isEmpty) return;
    if ((auth.selectedAudioTrackId ?? auth.selectedAudioTrack?.id) ==
        track.id) {
      _setState(
        _state.copyWith(
          selectedAudioTrack: track,
          status: 'Lydspor: ${track.label}',
          error: null,
        ),
      );
      return;
    }
    _audioChanging = true;
    _setState(
      _state.copyWith(
        loading: true,
        buffering: true,
        audioChanging: true,
        status: 'Skifter lydspor...',
        error: null,
      ),
    );
    try {
      var mode = _sessionQualityMode ?? auth.preferences.qualityMode;
      var fixedHeight = mode == 'fixed'
          ? _sessionFixedHeight ?? auth.preferences.fixedQualityHeight
          : null;
      await _reconfigure(
        _absolutePositionMs,
        qualityMode: mode,
        fixedQualityHeight: fixedHeight,
        audioTrackId: track.id,
        allowUpscale: currentAllowUpscale,
        upscaleMode: currentUpscaleMode,
      );
      _setState(
        _state.copyWith(
          selectedAudioTrack: _authorization?.selectedAudioTrack ?? track,
          status: 'Lydspor: ${track.label}',
          loading: false,
          buffering: false,
          audioChanging: false,
          error: null,
          qualityLabel: _qualityLabel,
          upscaleLabel: _upscaleLabel,
        ),
      );
    } on ApiException catch (failure) {
      _setState(
        _state.copyWith(
          error: failure.message,
          loading: false,
          buffering: false,
          audioChanging: false,
        ),
      );
    } catch (_) {
      _setState(
        _state.copyWith(
          error: 'Lydsporet kunne ikke skiftes.',
          loading: false,
          buffering: false,
          audioChanging: false,
        ),
      );
    } finally {
      _audioChanging = false;
    }
  }

  Future<void> selectUpscaleMode(String value) async {
    if (_qualityChanging) return;
    final auth = _authorization;
    if (auth == null) return;
    final normalized = _normalizedUpscaleMode(value);
    final allowUpscale = normalized != 'off';
    _qualityChanging = true;
    _sessionAllowUpscale = allowUpscale;
    _sessionUpscaleMode = normalized;
    _setState(
      _state.copyWith(
        loading: true,
        buffering: true,
        qualityChanging: true,
        status: 'Skifter opskalering...',
        error: null,
      ),
    );
    try {
      final mode = _sessionQualityMode ?? auth.preferences.qualityMode;
      final fixedHeight = mode == 'fixed'
          ? _sessionFixedHeight ?? auth.preferences.fixedQualityHeight
          : null;
      await _reconfigure(
        _absolutePositionMs,
        qualityMode: mode,
        fixedQualityHeight: fixedHeight,
        audioTrackId: auth.selectedAudioTrackId,
        allowUpscale: allowUpscale,
        upscaleMode: normalized,
      );
      _setState(
        _state.copyWith(
          status: _upscaleLabel,
          loading: false,
          buffering: false,
          qualityChanging: false,
          error: null,
          qualityLabel: _qualityLabel,
          upscaleLabel: _upscaleLabel,
        ),
      );
    } on ApiException catch (failure) {
      _setState(
        _state.copyWith(
          error: failure.message,
          loading: false,
          buffering: false,
          qualityChanging: false,
        ),
      );
    } catch (_) {
      _setState(
        _state.copyWith(
          error: 'Opskalering kunne ikke skiftes.',
          loading: false,
          buffering: false,
          qualityChanging: false,
        ),
      );
    } finally {
      _qualityChanging = false;
    }
  }

  Future<void> _configureQuality(
    VideoPlayerController controller,
    PlaybackAuthorization authorization,
  ) async {
    final attached = await _qualityCoordinator.attach(
      controller,
      enabled: AppConfig.isTvBuild,
    );
    if (!attached) return;
    final mode = _sessionQualityMode ?? authorization.preferences.qualityMode;
    final selection = PlaybackQualitySelection.fromState(
      mode,
      _sessionFixedHeight ?? authorization.preferences.fixedQualityHeight,
    );
    await _qualityCoordinator.apply(
      controller,
      selection: selection,
      sourceHeight: authorization.sourceHeight ?? 1080,
      renditionHeights: authorization.renditions.map(
        (rendition) => rendition.height,
      ),
      deferAutomatic: selection.automatic,
    );
  }

  Map<String, dynamic> _playbackCapabilitiesPayload({
    required String upscaleMode,
    required String bufferProfile,
  }) => {
    'screenHeight': screenHeight,
    'devicePixelRatio': devicePixelRatio,
    'supportedCodecs': const <String>['h264', 'hevc'],
    'supportedContainers': const <String>['mov', 'mp4', 'matroska', 'mpegts'],
    'supportsHdr': supportsHdr,
    'supportedAudioCodecs': const <String>['aac', 'ac3', 'eac3'],
    'upscaleMode': upscaleMode,
    'bufferProfile': bufferProfile,
    'startupPolicy': AppConfig.isTvBuild ? 'baseline_first' : 'stable',
    if (_estimatedDownlinkMbpsForPayload != null)
      'estimatedDownlinkMbps': _estimatedDownlinkMbpsForPayload,
  };

  double? get _estimatedDownlinkMbpsForPayload {
    final value = _estimatedDownlinkMbps;
    if (value == null || !value.isFinite || value <= 0) return null;
    return value.clamp(0.1, 1000).toDouble();
  }

  int? _serverUpscaleTarget(PlaybackAuthorization authorization) {
    final sourceHeight = authorization.sourceHeight ?? 0;
    final upscaled =
        authorization.renditions
            .where(
              (rendition) =>
                  rendition.height > 0 &&
                  (rendition.upscaled || rendition.height > sourceHeight),
            )
            .map((rendition) => rendition.height)
            .toList()
          ..sort();
    if (upscaled.isNotEmpty) return upscaled.last;
    return null;
  }

  String get _qualityLabel {
    final controller = _video;
    final auth = _authorization;
    if (controller == null || auth == null) return '';
    final height = controller.value.size.height.round();
    final mode = _sessionQualityMode ?? auth.preferences.qualityMode;
    if (mode == 'fixed' && _sessionFixedHeight != null) {
      final actual = _highestRenditionHeight(auth);
      if (actual != null && actual < _sessionFixedHeight!) {
        return '${actual}p · Fast tilpasset';
      }
      return '${_sessionFixedHeight}p · Fast';
    }
    if (mode == 'original' && (auth.sourceHeight ?? 0) > 0) {
      return '${auth.sourceHeight}p · Original';
    }
    if (height <= 0) return _qualitySelectionLabel;
    final label = mode == 'auto'
        ? 'Auto'
        : mode == 'original'
        ? 'Original'
        : 'Fast';
    return '${height}p · $label';
  }

  String get _qualitySelectionLabel {
    final auth = _authorization;
    final mode = _sessionQualityMode ?? auth?.preferences.qualityMode ?? 'auto';
    if (mode == 'auto') return 'Automatisk';
    if (mode == 'original') {
      final height = auth?.sourceHeight;
      return height == null || height <= 0 ? 'Original' : 'Original ${height}p';
    }
    final fixed = _sessionFixedHeight ?? auth?.preferences.fixedQualityHeight;
    return fixed == null ? 'Fast kvalitet' : '${fixed}p';
  }

  int? _highestRenditionHeight(PlaybackAuthorization authorization) {
    final heights =
        authorization.renditions
            .where((rendition) => rendition.height > 0)
            .map((rendition) => rendition.height)
            .toList()
          ..sort();
    return heights.isEmpty ? null : heights.last;
  }

  String get _upscaleLabel {
    final mode = currentUpscaleMode;
    if (mode == 'off') return 'Opskalering: Fra';
    if (mode == 'server') {
      final auth = _authorization;
      final target = auth == null ? null : _serverUpscaleTarget(auth);
      return target == null
          ? 'Opskalering: Server'
          : 'Opskalering: Server ${target}p';
    }
    return 'Opskalering: Server';
  }

  String _normalizedUpscaleMode(String? value) => switch (value) {
    'server' => 'server',
    'device' => 'server',
    _ => 'off',
  };

  @override
  Future<void> setPlaybackRate(double rate) async {
    final normalized = rate.clamp(0.5, 2).toDouble();
    await _video?.setPlaybackSpeed(normalized);
    _uiClock.setTransport(
      playing: _uiClock.playing,
      buffering: _uiClock.buffering,
      playbackRate: normalized,
    );
    _setState(_state.copyWith(playbackRate: normalized));
  }

  void _startNextCountdown() {
    if (_state.nextEpisodeCountdown != null || _nextLoading) return;
    _setState(_state.copyWith(nextEpisodeCountdown: 10));
    _nextTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final value = _state.nextEpisodeCountdown ?? 0;
      if (value <= 1) {
        timer.cancel();
        _setState(_state.copyWith(nextEpisodeCountdown: null));
        unawaited(_resolveNextEpisode(automatic: true));
      } else {
        _setState(_state.copyWith(nextEpisodeCountdown: value - 1));
      }
    });
  }

  Future<void> playNextEpisode() => _resolveNextEpisode(automatic: false);

  Future<void> _resolveNextEpisode({
    required bool automatic,
    bool progressAlreadySaved = false,
  }) async {
    final auth = _authorization;
    if (_nextLoading || auth == null || !media.isEpisode) return;
    if (automatic && !auth.preferences.autoplayNext) return;
    _nextLoading = true;
    _nextTimer?.cancel();
    try {
      if (!progressAlreadySaved) await saveProgress(completed: true);
      final query = <String, String>{'afterMediaId': media.id};
      if (media.seriesMetadataProviderId?.isNotEmpty == true) {
        query['seriesMetadataProviderId'] = media.seriesMetadataProviderId!;
      } else if (media.seriesDisplayTitle?.isNotEmpty == true) {
        query['seriesDisplayTitle'] = media.seriesDisplayTitle!;
      } else if (media.seriesTitle?.isNotEmpty == true) {
        query['seriesTitle'] = media.seriesTitle!;
      }
      final next = jsonMap(
        await api.getJson(
          '/playback/history/series-next?${Uri(queryParameters: query).query}',
        ),
      );
      if (next.isEmpty) {
        _setState(
          _state.copyWith(
            status: 'Serien er færdig',
            loading: false,
            buffering: false,
            playing: false,
          ),
        );
        return;
      }
      final nextMediaPayload = jsonMap(next['media']).isEmpty
          ? next
          : next['media'];
      final nextMedia = MediaItem.fromJson(nextMediaPayload);
      if (nextMedia.id.isEmpty) return;
      _setState(
        _state.copyWith(
          nextItem: PlaybackQueueItem(
            media: nextMedia,
            resumePositionMs: intValue(next['resumePositionMs']) ?? 0,
            subtitleSelection: _subtitleQueueSelection,
          ),
          nextEpisodeCountdown: null,
        ),
      );
    } catch (_) {
      _setState(
        _state.copyWith(
          status: 'Næste episode kunne ikke startes',
          loading: false,
          buffering: false,
          playing: false,
        ),
      );
    } finally {
      _nextLoading = false;
    }
  }

  @override
  Future<void> retry() => _restartAtCurrentPosition();

  Future<void> _restartAtCurrentPosition() async {
    final position = _absolutePositionMs;
    _setState(
      _state.copyWith(
        status: 'Genoptager afspilningen...',
        error: null,
        loading: true,
        buffering: true,
        playing: false,
        nextEpisodeCountdown: null,
      ),
    );
    _stopTimers();
    await saveProgress();
    await _release();
    final previous = _video;
    _video = null;
    if (previous != null) {
      previous.removeListener(_onVideoChanged);
      await previous.dispose();
    }
    _released = false;
    _initialization = null;
    _finishOperation = null;
    _completed = false;
    await _initializeAt(position);
  }

  Future<void> _release() async {
    final auth = _authorization;
    if (auth == null || _released) return;
    _released = true;
    _setState(_state.copyWith(released: true));
    try {
      await api.deleteJson(
        '/playback/sessions/${Uri.encodeComponent(auth.sessionId)}',
      );
    } catch (_) {}
  }

  @override
  Future<void> finish() => _finishOperation ??= _finish();

  Future<void> _finish() async {
    if (_state.finishing) return;
    _setState(_state.copyWith(finishing: true));
    _stopTimers();
    _setKeepScreenOn(false);
    await saveProgress();
    await _release();
    await _platform.clear().catchError((_) {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _setKeepScreenOn(true, force: true);
    }
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      unawaited(saveProgress());
    }
  }

  void _setState(PlaybackViewState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    WidgetsBinding.instance.removeObserver(this);
    _stopTimers();
    final controller = _video;
    if (controller != null) controller.removeListener(_onVideoChanged);
    unawaited(finish().whenComplete(() => controller?.dispose()));
    _disposed = true;
    super.dispose();
  }
}
