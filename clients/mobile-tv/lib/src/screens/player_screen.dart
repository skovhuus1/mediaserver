import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../core/cast_service.dart';
import '../core/cast_playback_coordinator.dart';
import '../core/models.dart';
import '../core/playback_platform.dart';
import '../core/webvtt.dart';
import '../widgets/brand.dart';

class PlayerScreen extends StatefulWidget {
  const PlayerScreen({
    required this.api,
    required this.media,
    required this.resumePositionMs,
    super.key,
  });

  final ApiClient api;
  final MediaItem media;
  final int resumePositionMs;

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen>
    with WidgetsBindingObserver {
  VideoPlayerController? _video;
  PlaybackAuthorization? _authorization;
  SubtitleTrack? _subtitle;
  List<WebVttCue> _cues = const [];
  String _cueText = '';
  String _status = 'Autoriserer afspilning...';
  String? _error;
  int _timelineOffsetMs = 0;
  bool _controls = true;
  bool _buffering = true;
  bool _released = false;
  bool _completed = false;
  Timer? _heartbeatTimer;
  Timer? _progressTimer;
  Timer? _uiTimer;
  Timer? _hideTimer;
  final CastService _cast = CastService.instance;
  StreamSubscription<CastState>? _castSubscription;
  bool _casting = false;
  bool _castStarting = false;
  bool _handoffAccepted = false;
  bool _finishing = false;
  int _castPositionMs = 0;
  String _castRuntimeState = 'paused';
  String? _castDeviceName;
  Map<String, int> _castTrackIds = const {};
  final PlaybackPlatform _platform = PlaybackPlatform.instance;
  StreamSubscription<PlaybackPlatformCommand>? _platformSubscription;
  List<_TimelineMarker> _markers = const [];
  _TimelineMarker? _activeMarker;
  Timer? _nextEpisodeTimer;
  int? _nextEpisodeCountdown;
  bool _autoplaySuppressed = false;
  bool _recovering = false;
  int _reconnectAttempts = 0;
  DateTime _lastPlatformUpdate = DateTime.fromMillisecondsSinceEpoch(0);
  bool _inPictureInPicture = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (CastService.isSupported) {
      _castSubscription = _cast.states.listen(
        (state) => unawaited(_handleCastState(state)),
        onError: (_) {},
      );
    }
    _platformSubscription = _platform.commands.listen(_handlePlatformCommand);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_start(widget.resumePositionMs));
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      unawaited(_saveProgress());
      unawaited(_syncPlatform(force: true));
    }
    if (state == AppLifecycleState.resumed) {
      unawaited(_syncPlatform(force: true));
      if (_video?.value.hasError == true) unawaited(_recoverPlayback());
    }
  }

  Future<void> _start(int startPositionMs) async {
    final mediaQuery = MediaQuery.of(context);
    setState(() {
      _status = 'Autoriserer afspilning...';
      _error = null;
      _buffering = true;
      _released = false;
    });
    try {
      final contextJson = jsonMap(
        await widget.api.getJson('/playback/context'),
      );
      final profileId = stringValue(contextJson['profileId']);
      final deviceId = stringValue(contextJson['deviceId']);
      if (profileId == null || deviceId == null) {
        throw const ApiException(
          'Den aktive profil eller enhed mangler. Log ind igen.',
        );
      }
      final authorization = PlaybackAuthorization.fromJson(
        await widget.api.postJson('/playback/authorize', {
          'profileId': profileId,
          'mediaId': widget.media.id,
          'deviceId': deviceId,
          'startPositionMs': math.max(0, startPositionMs),
          'capabilities': {
            'screenHeight':
                (mediaQuery.size.height * mediaQuery.devicePixelRatio)
                    .round()
                    .clamp(240, 4320),
            'devicePixelRatio': mediaQuery.devicePixelRatio.clamp(0.5, 4),
            'supportedCodecs': const ['h264', 'hevc'],
            'supportedAudioCodecs': const ['aac'],
            'supportedContainers': const ['mov', 'mp4', 'matroska', 'mpegts'],
            'supportsHdr': false,
          },
        }),
      );
      if (authorization.sessionId.isEmpty || authorization.streamUrl.isEmpty) {
        throw const ApiException(
          'Serveren returnerede ingen afspillelig stream.',
        );
      }
      _authorization = authorization;
      await _loadPlaybackAssets();
      _timelineOffsetMs = authorization.isDirectPlay ? 0 : startPositionMs;
      await _prepareController(
        authorization,
        directPlaySeekMs: startPositionMs,
      );
      await _selectDefaultSubtitle();
      await _attachToConnectedCast();
      _startTimers();
      _scheduleHide();
    } on ApiException catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = failure.message;
        _buffering = false;
      });
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _error = 'Afspilningen kunne ikke startes: $failure';
        _buffering = false;
      });
    }
  }

  Future<void> _prepareController(
    PlaybackAuthorization authorization, {
    int directPlaySeekMs = 0,
  }) async {
    if (authorization.transcodeStatusUrl != null) {
      await _waitUntilReady(authorization.transcodeStatusUrl!);
    }
    if (!mounted) return;
    setState(
      () => _status = authorization.isDirectPlay
          ? 'Åbner originalfilen...'
          : 'Forbereder adaptiv stream...',
    );
    final previous = _video;
    final controller = VideoPlayerController.networkUrl(
      widget.api.endpoint(authorization.streamUrl),
      formatHint: authorization.isHls ? VideoFormat.hls : null,
      videoPlayerOptions: VideoPlayerOptions(
        mixWithOthers: false,
        allowBackgroundPlayback: true,
      ),
    );
    _video = controller;
    await previous?.dispose();
    await controller.initialize();
    if (authorization.isDirectPlay && directPlaySeekMs > 0) {
      await controller.seekTo(Duration(milliseconds: directPlaySeekMs));
    }
    await controller.setPlaybackSpeed(authorization.preferences.playbackRate);
    await controller.play();
    _reconnectAttempts = 0;
    if (!mounted) return;
    setState(() {
      _buffering = false;
      _status = authorization.isDirectPlay
          ? 'Direct Play'
          : authorization.method == 'direct_stream'
          ? 'Direct Stream'
          : 'Transcoding';
    });
  }

  Future<void> _waitUntilReady(String statusUrl) async {
    for (var attempt = 0; attempt < 180; attempt++) {
      final status = jsonMap(await widget.api.getJson(statusUrl));
      final state = stringValue(status['state']) ?? 'queued';
      if (state == 'ready') return;
      if (state == 'failed') {
        throw ApiException(
          stringValue(status['message']) ??
              'FFmpeg kunne ikke forberede streamen.',
        );
      }
      if (mounted) {
        setState(
          () => _status =
              stringValue(status['message']) ?? 'FFmpeg forbereder streamen...',
        );
      }
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    throw const ApiException('Streamen blev ikke klar inden for tre minutter.');
  }

  void _startTimers() {
    _heartbeatTimer?.cancel();
    _progressTimer?.cancel();
    _uiTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => unawaited(_heartbeat()),
    );
    _progressTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => unawaited(_saveProgress()),
    );
    _uiTimer = Timer.periodic(
      const Duration(milliseconds: 250),
      (_) => _tick(),
    );
  }

  void _tick() {
    if (_casting) {
      if (mounted && _controls) setState(() {});
      return;
    }
    final video = _video;
    if (!mounted || video == null || !video.value.isInitialized) return;
    final value = video.value;
    if (value.hasError && !_recovering) {
      unawaited(_recoverPlayback());
      return;
    }
    final nextCue = _cues
        .where(
          (cue) => cue.contains(Duration(milliseconds: _absolutePositionMs)),
        )
        .map((cue) => cue.text)
        .join('\n');
    final changed = nextCue != _cueText || value.isBuffering != _buffering;
    if (changed) {
      setState(() {
        _cueText = nextCue;
        _buffering = value.isBuffering;
      });
    } else if (_controls) {
      setState(() {});
    }
    if (value.isCompleted && !_completed) {
      _completed = true;
      unawaited(_playNextEpisode());
    }
    _updateMarkers();
    unawaited(_syncPlatform());
  }

  Future<void> _loadPlaybackAssets() async {
    try {
      final assets = jsonMap(
        await widget.api.getJson('/media/${widget.media.id}/playback-assets'),
      );
      _markers = jsonList(assets['markers'])
          .map(_TimelineMarker.fromJson)
          .where((marker) => marker.endMs > marker.startMs)
          .toList(growable: false);
    } catch (_) {
      _markers = const [];
    }
  }

  void _updateMarkers() {
    final position = _absolutePositionMs;
    final next = _markers
        .where(
          (marker) =>
              position >= marker.startMs - 750 && position < marker.endMs,
        )
        .firstOrNull;
    if (next?.kind == _activeMarker?.kind &&
        next?.startMs == _activeMarker?.startMs) {
      return;
    }
    _activeMarker = next;
    if (next?.kind == 'credits' &&
        widget.media.isEpisode &&
        _authorization?.preferences.autoplayNext == true &&
        !_autoplaySuppressed) {
      _startNextEpisodeCountdown();
    } else {
      _cancelNextEpisodeCountdown();
    }
    if (mounted) setState(() {});
  }

  void _startNextEpisodeCountdown() {
    if (_nextEpisodeCountdown != null) return;
    _nextEpisodeCountdown = 10;
    _nextEpisodeTimer?.cancel();
    _nextEpisodeTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      final current = _nextEpisodeCountdown ?? 0;
      if (current <= 1) {
        timer.cancel();
        _nextEpisodeCountdown = null;
        unawaited(_playNextEpisode());
      } else {
        setState(() => _nextEpisodeCountdown = current - 1);
      }
    });
  }

  void _cancelNextEpisodeCountdown({bool suppress = false}) {
    _nextEpisodeTimer?.cancel();
    _nextEpisodeTimer = null;
    _nextEpisodeCountdown = null;
    if (suppress) _autoplaySuppressed = true;
  }

  Future<void> _playNextEpisode({bool automatic = true}) async {
    final auth = _authorization;
    if (auth == null || !widget.media.isEpisode) return;
    if (automatic && !auth.preferences.autoplayNext) return;
    _cancelNextEpisodeCountdown();
    try {
      await widget.api
          .patchJson('/playback/sessions/${auth.sessionId}/progress', {
            'positionMs': _durationMs,
            if (_durationMs > 0) 'durationMs': _durationMs,
            'completed': true,
          });
      final query = <String, String>{'afterMediaId': widget.media.id};
      if (widget.media.seriesMetadataProviderId?.isNotEmpty == true) {
        query['seriesMetadataProviderId'] =
            widget.media.seriesMetadataProviderId!;
      } else if (widget.media.seriesDisplayTitle?.isNotEmpty == true) {
        query['seriesDisplayTitle'] = widget.media.seriesDisplayTitle!;
      } else if (widget.media.seriesTitle?.isNotEmpty == true) {
        query['seriesTitle'] = widget.media.seriesTitle!;
      } else {
        return;
      }
      final next = jsonMap(
        await widget.api.getJson(
          '/playback/history/series-next?${Uri(queryParameters: query).query}',
        ),
      );
      if (next.isEmpty) {
        if (mounted) setState(() => _status = 'Serien er færdig');
        return;
      }
      final media = MediaItem.fromJson(next['media']);
      if (media.id.isEmpty || !mounted) return;
      if (_casting || CastPlaybackCoordinator.instance.owns(auth.sessionId)) {
        await CastPlaybackCoordinator.instance.stop();
      } else {
        await _release();
      }
      _finishing = true;
      if (!mounted) return;
      await Navigator.of(context).pushReplacement<void, void>(
        MaterialPageRoute(
          builder: (_) => PlayerScreen(
            api: widget.api,
            media: media,
            resumePositionMs: intValue(next['resumePositionMs']) ?? 0,
          ),
        ),
      );
    } catch (_) {
      if (mounted) setState(() => _status = 'Næste episode kunne ikke startes');
    }
  }

  Future<void> _recoverPlayback() async {
    if (_recovering || _released || _reconnectAttempts >= 3) return;
    _recovering = true;
    _reconnectAttempts += 1;
    final position = _absolutePositionMs;
    if (mounted) {
      setState(() {
        _buffering = true;
        _status = 'Genopretter stream ($_reconnectAttempts/3)...';
      });
    }
    await _saveProgress();
    await _release();
    await _video?.dispose();
    _video = null;
    await Future<void>.delayed(Duration(seconds: _reconnectAttempts));
    _released = false;
    _finishing = false;
    _recovering = false;
    if (mounted) await _start(position);
  }

  void _handlePlatformCommand(PlaybackPlatformCommand command) {
    if (!mounted) return;
    switch (command.event) {
      case 'play':
        if (!(_video?.value.isPlaying ?? false)) _togglePlayback();
      case 'pause':
        if (_video?.value.isPlaying ?? false) _togglePlayback();
      case 'seek':
        if (command.positionMs != null) unawaited(_seekTo(command.positionMs!));
      case 'forward':
        unawaited(_seekTo(_absolutePositionMs + 10000));
      case 'rewind':
        unawaited(_seekTo(_absolutePositionMs - 10000));
      case 'stop':
        unawaited(_close());
      case 'pipChanged':
        setState(() {
          _inPictureInPicture = command.inPictureInPicture;
          if (_inPictureInPicture) _controls = false;
        });
    }
  }

  Future<void> _syncPlatform({bool force = false}) async {
    final now = DateTime.now();
    if (!force &&
        now.difference(_lastPlatformUpdate) < const Duration(seconds: 1)) {
      return;
    }
    _lastPlatformUpdate = now;
    final video = _video;
    final playing = _casting
        ? _castRuntimeState == 'playing'
        : video?.value.isPlaying ?? false;
    final size = video?.value.size;
    try {
      await _platform.update(
        title: widget.media.displayTitle,
        subtitle: widget.media.isEpisode ? widget.media.episodeLabel : _status,
        playing: playing,
        buffering: _buffering,
        positionMs: _absolutePositionMs,
        durationMs: _durationMs,
        playbackRate: video?.value.playbackSpeed ?? 1,
        allowPictureInPicture: !AppConfig.isTvBuild && !_casting,
        videoWidth: size?.width.round() ?? 16,
        videoHeight: size?.height.round() ?? 9,
      );
    } catch (_) {}
  }

  Future<void> _enterPictureInPicture() async {
    _controls = false;
    await _syncPlatform(force: true);
    try {
      await _platform.enterPictureInPicture();
    } catch (_) {
      if (mounted) {
        setState(
          () =>
              _error = 'Picture-in-Picture er ikke tilgængelig på denne enhed.',
        );
      }
    }
  }

  int get _absolutePositionMs {
    if (_casting) return math.max(0, _castPositionMs);
    final local = _video?.value.position.inMilliseconds ?? 0;
    return math.max(0, _timelineOffsetMs + local);
  }

  int get _durationMs {
    final known = widget.media.durationMs ?? widget.media.progress?.durationMs;
    if (known != null && known > 0) return known;
    return _timelineOffsetMs + (_video?.value.duration.inMilliseconds ?? 0);
  }

  int get _bufferAheadMs {
    final video = _video;
    if (video == null || video.value.buffered.isEmpty) return 0;
    final position = video.value.position;
    for (final range in video.value.buffered) {
      if (position >= range.start && position <= range.end) {
        return math.max(0, (range.end - position).inMilliseconds);
      }
    }
    return 0;
  }

  Future<void> _heartbeat() async {
    final auth = _authorization;
    final video = _video;
    if (auth == null || _released) return;
    if (_casting) {
      try {
        await widget.api
            .patchJson('/playback/sessions/${auth.sessionId}/heartbeat', {
              'runtimeState': switch (_castRuntimeState) {
                'playing' || 'paused' || 'buffering' => _castRuntimeState,
                _ => 'starting',
              },
              'positionMs': _absolutePositionMs,
              'durationMs': _durationMs > 0 ? _durationMs : null,
              'currentBitrate': auth.sourceBitrate,
              'currentHeight': auth.sourceHeight,
              'bufferAheadMs': null,
              'playbackRate': 1,
              'subtitleTrack': _subtitle?.label,
            });
      } catch (_) {
        // The custom receiver and next mobile heartbeat both renew the lease.
      }
      return;
    }
    if (video == null) return;
    final rendition = auth.renditions
        .where((item) => (item.height - video.value.size.height).abs() < 32)
        .firstOrNull;
    try {
      await widget.api
          .patchJson('/playback/sessions/${auth.sessionId}/heartbeat', {
            'runtimeState': video.value.isBuffering
                ? 'buffering'
                : video.value.isPlaying
                ? 'playing'
                : 'paused',
            'positionMs': _absolutePositionMs,
            'durationMs': _durationMs > 0 ? _durationMs : null,
            'currentBitrate': rendition?.bitrate ?? auth.sourceBitrate,
            'currentHeight': rendition?.height ?? auth.sourceHeight,
            'bufferAheadMs': _bufferAheadMs,
            'playbackRate': video.value.playbackSpeed,
            'subtitleTrack': _subtitle?.label,
          });
    } catch (_) {
      // The next heartbeat or token refresh recovers transient network loss.
    }
  }

  Future<void> _saveProgress() async {
    final auth = _authorization;
    if (auth == null || _released) return;
    try {
      await widget.api
          .patchJson('/playback/sessions/${auth.sessionId}/progress', {
            'positionMs': _absolutePositionMs,
            if (_durationMs > 0) 'durationMs': _durationMs,
          });
    } catch (_) {
      // Progress is retried on the next interval and again during cleanup.
    }
  }

  Future<void> _selectDefaultSubtitle() async {
    final auth = _authorization;
    if (auth == null || auth.preferences.subtitleMode == 'off') return;
    SubtitleTrack? selected;
    for (final language in auth.preferences.preferredSubtitleLanguages) {
      selected = auth.subtitleTracks
          .where(
            (track) =>
                _language(track.language) == _language(language) &&
                track.isText,
          )
          .firstOrNull;
      if (selected != null) break;
    }
    selected ??= auth.subtitleTracks.where((track) => track.isText).firstOrNull;
    if (selected != null) await _setSubtitle(selected);
  }

  Future<void> _attachToConnectedCast() async {
    if (!CastService.isSupported) return;
    try {
      final state = await _cast.currentState();
      if (!mounted) return;
      _castDeviceName = state.deviceName;
      if (state.connected) await _beginCast();
    } catch (_) {
      // Discovery remains available through the native route button.
    }
  }

  Future<void> _handleCastState(CastState state) async {
    if (!mounted) return;
    final ended =
        _casting &&
        {
          'sessionEnded',
          'sessionStartFailed',
          'sessionResumeFailed',
        }.contains(state.event);
    setState(() {
      _castDeviceName = state.deviceName ?? _castDeviceName;
      if (_casting && state.positionMs > 0) {
        _castPositionMs = _timelineOffsetMs + state.positionMs;
      }
      if (_casting && state.runtimeState != 'unknown') {
        _castRuntimeState = state.runtimeState;
        _buffering = state.isBuffering;
        _status = state.event == 'sessionSuspended'
            ? 'Chromecast genopretter forbindelsen...'
            : 'Chromecast${_castDeviceName == null ? '' : ' · $_castDeviceName'}';
      }
    });
    if (ended) {
      await _resumeAfterCast();
    } else if (state.connected &&
        !_casting &&
        !_castStarting &&
        {'sessionStarted', 'sessionResumed'}.contains(state.event)) {
      await _beginCast();
    }
  }

  Future<void> _beginCast({bool forceReload = false}) async {
    final auth = _authorization;
    if (auth == null || _castStarting || (_casting && !forceReload)) return;
    _castStarting = true;
    var accepted = false;
    final absolutePosition = _absolutePositionMs;
    final localPosition = math.max(0, absolutePosition - _timelineOffsetMs);
    try {
      final state = await _cast.currentState();
      if (!state.connected) return;
      if (mounted) {
        setState(() {
          _status = 'Forbereder Chromecast...';
          _buffering = true;
        });
      }
      await _saveProgress();
      final handoff = jsonMap(
        await widget.api.postJson(
          '/playback/sessions/${auth.sessionId}/cast-handoff',
          {'streamToken': auth.streamToken},
        ),
      );
      accepted = true;
      _handoffAccepted = true;
      final castSubtitles = jsonList(handoff['subtitleTracks'])
          .map(SubtitleTrack.fromJson)
          .where((track) => track.isText)
          .toList(growable: false);
      final trackIds = <String, int>{};
      final tracks = <CastLoadTrack>[];
      for (var index = 0; index < castSubtitles.length; index++) {
        final track = castSubtitles[index];
        final castId = index + 1;
        trackIds[track.id] = castId;
        tracks.add(
          CastLoadTrack(
            id: castId,
            contentUrl: track.src!,
            label: track.label,
            language: track.language,
          ),
        );
      }
      _castTrackIds = trackIds;
      final selectedTrackId = _subtitle == null
          ? null
          : _castTrackIds[_subtitle!.id];
      final poster = widget.api.absoluteMediaUrl(
        widget.media.posterPath,
        imageSize: 'w500',
      );
      await _cast.loadMedia(
        contentUrl: stringValue(handoff['streamUrl']) ?? '',
        contentType:
            stringValue(handoff['contentType']) ?? 'application/x-mpegURL',
        title: widget.media.displayTitle,
        subtitle: widget.media.isEpisode ? widget.media.episodeLabel : _status,
        posterUrl: poster.isEmpty ? null : poster,
        positionMs: localPosition,
        durationMs: math.max(0, _durationMs - _timelineOffsetMs),
        tracks: tracks,
        activeTrackIds: selectedTrackId == null ? const [] : [selectedTrackId],
        customData: {
          'heartbeatUrl': handoff['heartbeatUrl'],
          'timelineOffsetMs': _timelineOffsetMs,
          'fullDurationMs': _durationMs > 0 ? _durationMs : null,
          'currentBitrate': auth.sourceBitrate,
          'currentHeight': auth.sourceHeight,
          'subtitleTrack': _subtitle?.label,
        },
      );
      CastPlaybackCoordinator.instance.activate(
        api: widget.api,
        media: widget.media,
        authorization: auth,
        timelineOffsetMs: _timelineOffsetMs,
        durationMs: _durationMs,
        positionMs: absolutePosition,
        posterUrl: poster.isEmpty ? null : poster,
        subtitleLabel: _subtitle?.label,
      );
      await _video?.pause();
      if (!mounted) return;
      setState(() {
        _casting = true;
        _castPositionMs = absolutePosition;
        _castRuntimeState = 'playing';
        _buffering = false;
        _status =
            'Chromecast${state.deviceName == null ? '' : ' · ${state.deviceName}'}';
      });
    } on PlatformException catch (failure) {
      if (accepted) await _cancelCastHandoff();
      _showCastMessage(failure.message ?? 'Chromecast kunne ikke starte.');
    } on ApiException catch (failure) {
      if (accepted) await _cancelCastHandoff();
      _showCastMessage(failure.message);
    } finally {
      _castStarting = false;
      if (mounted && !_casting) setState(() => _buffering = false);
    }
  }

  Future<void> _cancelCastHandoff() async {
    final auth = _authorization;
    _handoffAccepted = false;
    if (auth == null) return;
    try {
      await widget.api.deleteJson(
        '/playback/sessions/${auth.sessionId}/cast-handoff',
      );
    } catch (_) {}
  }

  Future<void> _resumeAfterCast() async {
    final resumeAt = _castPositionMs;
    _casting = false;
    _castRuntimeState = 'paused';
    await _cancelCastHandoff();
    if (!mounted || resumeAt >= _durationMs - 1_000) return;
    setState(() {
      _status = 'Chromecast afbrudt · fortsætter lokalt';
      _buffering = true;
    });
    await _seekTo(resumeAt);
    await _video?.play();
  }

  void _showCastMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _language(String value) =>
      value.toLowerCase().split(RegExp('[-_]')).first;

  Future<void> _setSubtitle(SubtitleTrack? track) async {
    if (_casting && (track == null || track.isText)) {
      try {
        await _cast.setTextTrack(
          track == null ? null : _castTrackIds[track.id],
        );
        if (!mounted) return;
        setState(() {
          _subtitle = track;
          _cues = const [];
          _cueText = '';
        });
      } on PlatformException catch (failure) {
        _showCastMessage(
          failure.message ?? 'Chromecast kunne ikke skifte undertekst.',
        );
      }
      return;
    }
    if (track == null) {
      setState(() {
        _subtitle = null;
        _cues = const [];
        _cueText = '';
      });
      return;
    }
    if (!track.isText) {
      await _reconfigure(_absolutePositionMs, burnInTrack: track);
      return;
    }
    setState(() {
      _subtitle = track;
      _cueText = '';
    });
    try {
      final text = await widget.api.getText(track.src!);
      if (!mounted || _subtitle?.id != track.id) return;
      setState(() => _cues = parseWebVtt(text));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _cues = const [];
        _error = 'Undertekstsporet kunne ikke indlæses.';
      });
    }
  }

  Future<void> _reconfigure(
    int positionMs, {
    SubtitleTrack? burnInTrack,
  }) async {
    final auth = _authorization;
    if (auth == null) return;
    _revealControls();
    setState(() {
      _buffering = true;
      _status = burnInTrack == null
          ? 'Søger i streamen...'
          : 'Forbereder billed-undertekster...';
    });
    try {
      await _saveProgress();
      final result = jsonMap(
        await widget.api
            .patchJson('/playback/sessions/${auth.sessionId}/configuration', {
              'streamToken': auth.streamToken,
              'burnIn': burnInTrack != null,
              if (burnInTrack != null) 'subtitleTrackId': burnInTrack.id,
              'forceTranscode': true,
              'startPositionMs': math.max(0, positionMs),
            }),
      );
      final next = auth.copyWith(
        method: stringValue(result['method']) ?? 'transcode',
        streamUrl: stringValue(result['streamUrl']) ?? auth.streamUrl,
        contentType:
            stringValue(result['contentType']) ?? 'application/x-mpegURL',
        transcodeStatusUrl: stringValue(result['transcodeStatusUrl']),
      );
      _authorization = next;
      _timelineOffsetMs = positionMs;
      if (burnInTrack != null) {
        _subtitle = burnInTrack;
        _cues = const [];
        _cueText = '';
      }
      if (_casting) {
        await _beginCast(forceReload: true);
      } else {
        await _prepareController(next);
      }
    } on ApiException catch (failure) {
      if (!mounted) return;
      setState(() {
        _buffering = false;
        _error = failure.message;
      });
    }
  }

  Future<void> _seekTo(int targetMs) async {
    final video = _video;
    final auth = _authorization;
    if (video == null || auth == null) return;
    final target = targetMs.clamp(0, math.max(_durationMs, 0)).toInt();
    if (_casting) {
      await _cast.seek(math.max(0, target - _timelineOffsetMs));
      setState(() => _castPositionMs = target);
      return;
    }
    if (auth.isDirectPlay) {
      await video.seekTo(Duration(milliseconds: target));
      return;
    }
    final local = target - _timelineOffsetMs;
    final buffered = video.value.buffered.any(
      (range) =>
          Duration(milliseconds: local) >= range.start &&
          Duration(milliseconds: local) <= range.end,
    );
    if (local >= 0 && buffered) {
      await video.seekTo(Duration(milliseconds: local));
    } else {
      await _reconfigure(
        target,
        burnInTrack: _subtitle?.isText == false ? _subtitle : null,
      );
    }
  }

  Future<void> _changeQuality(String value) async {
    if (_casting) {
      _showCastMessage(
        'Chromecast bruger streamens adaptive kvalitet. Afbryd Cast for at ændre enhedens kvalitetsprofil.',
      );
      return;
    }
    final position = _absolutePositionMs;
    final body = <String, dynamic>{};
    if (value == 'auto' || value == 'original') {
      body['qualityMode'] = value;
    } else {
      body['qualityMode'] = 'fixed';
      body['fixedQualityHeight'] = int.parse(value);
    }
    try {
      await widget.api.patchJson('/devices/me/preferences', body);
      await _saveProgress();
      await _release();
      await _video?.dispose();
      _video = null;
      _authorization = null;
      await _start(position);
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
  }

  void _togglePlayback() {
    if (_casting) {
      if (_castRuntimeState == 'playing') {
        unawaited(_cast.pause());
        setState(() => _castRuntimeState = 'paused');
      } else {
        unawaited(_cast.play());
        setState(() => _castRuntimeState = 'playing');
      }
      _revealControls();
      return;
    }
    final video = _video;
    if (video == null) return;
    video.value.isPlaying ? unawaited(video.pause()) : unawaited(video.play());
    _revealControls();
  }

  void _revealControls() {
    if (mounted) setState(() => _controls = true);
    _scheduleHide();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 3), () {
      if (mounted && (_video?.value.isPlaying ?? false) && !_buffering) {
        setState(() => _controls = false);
      }
    });
  }

  Future<void> _release() async {
    final auth = _authorization;
    if (auth == null || _released) return;
    _released = true;
    try {
      await widget.api.deleteJson('/playback/sessions/${auth.sessionId}');
    } catch (_) {
      // The lease expires server-side if the final release cannot be delivered.
    }
  }

  Future<void> _finishPlayback() async {
    if (_finishing) return;
    _finishing = true;
    await _saveProgress();
    final auth = _authorization;
    if ((_casting || _handoffAccepted) &&
        auth != null &&
        CastPlaybackCoordinator.instance.owns(auth.sessionId)) {
      CastPlaybackCoordinator.instance.detachPlayer();
      return;
    }
    if (_casting || _handoffAccepted) {
      try {
        await _cast.stop();
      } catch (_) {}
      _casting = false;
      await _cancelCastHandoff();
    }
    await _release();
    await _platform.clear().catchError((_) {});
  }

  Future<void> _close() async {
    await _finishPlayback();
    if (mounted) Navigator.pop(context);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _heartbeatTimer?.cancel();
    _progressTimer?.cancel();
    _uiTimer?.cancel();
    _hideTimer?.cancel();
    _nextEpisodeTimer?.cancel();
    unawaited(_castSubscription?.cancel());
    unawaited(_platformSubscription?.cancel());
    unawaited(_platform.clear());
    unawaited(_finishPlayback());
    unawaited(_video?.dispose());
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = _video;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) {
          unawaited(_finishPlayback());
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Focus(
          autofocus: true,
          onKeyEvent: (_, event) {
            if (event is! KeyDownEvent) return KeyEventResult.ignored;
            if (event.logicalKey == LogicalKeyboardKey.select ||
                event.logicalKey == LogicalKeyboardKey.enter ||
                event.logicalKey == LogicalKeyboardKey.space) {
              _togglePlayback();
              return KeyEventResult.handled;
            }
            if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
              unawaited(_seekTo(_absolutePositionMs - 10000));
              return KeyEventResult.handled;
            }
            if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
              unawaited(_seekTo(_absolutePositionMs + 10000));
              return KeyEventResult.handled;
            }
            _revealControls();
            return KeyEventResult.ignored;
          },
          child: MouseRegion(
            onHover: (_) => _revealControls(),
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _revealControls,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (video != null && video.value.isInitialized)
                    Center(
                      child: AspectRatio(
                        aspectRatio: video.value.aspectRatio == 0
                            ? 16 / 9
                            : video.value.aspectRatio,
                        child: VideoPlayer(video),
                      ),
                    )
                  else
                    const ColoredBox(color: Colors.black),
                  if (_cueText.isNotEmpty)
                    Align(
                      alignment: const Alignment(0, 0.72),
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 980),
                        margin: const EdgeInsets.symmetric(horizontal: 24),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 9,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.78),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _cueText,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 22,
                            height: 1.25,
                            shadows: [
                              Shadow(color: Colors.black, blurRadius: 4),
                            ],
                          ),
                        ),
                      ),
                    ),
                  AnimatedOpacity(
                    opacity: _controls || _error != null || _buffering ? 1 : 0,
                    duration: const Duration(milliseconds: 180),
                    child: IgnorePointer(
                      ignoring: !_controls && _error == null && !_buffering,
                      child: _controlsOverlay(),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _controlsOverlay() {
    final video = _video;
    final playing = _casting
        ? _castRuntimeState == 'playing'
        : video?.value.isPlaying ?? false;
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xB8000000), Colors.transparent, Color(0xE6000000)],
          stops: [0, 0.48, 1],
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              child: Row(
                children: [
                  IconButton(
                    onPressed: _close,
                    icon: const Icon(Icons.arrow_back),
                    tooltip: 'Tilbage',
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.media.displayTitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 20,
                          ),
                        ),
                        if (widget.media.isEpisode)
                          Text(
                            widget.media.episodeLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white60),
                          ),
                      ],
                    ),
                  ),
                  const CastRouteButton(),
                  const SizedBox(width: 8),
                  _PlaybackBadge(
                    status: _status,
                    authorization: _authorization,
                  ),
                ],
              ),
            ),
            const Spacer(),
            if (_activeMarker != null && !_buffering && _error == null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Wrap(
                  spacing: 10,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: () => _seekTo(_activeMarker!.endMs),
                      icon: const Icon(Icons.skip_next),
                      label: Text(switch (_activeMarker!.kind) {
                        'intro' => 'Spring intro over',
                        'recap' => 'Spring recap over',
                        _ => 'Spring rulletekster over',
                      }),
                    ),
                    if (_activeMarker!.kind == 'credits' &&
                        _nextEpisodeCountdown != null)
                      FilledButton.icon(
                        onPressed: () => _playNextEpisode(automatic: false),
                        icon: const Icon(Icons.play_arrow),
                        label: Text(
                          'Næste episode om $_nextEpisodeCountdown sek.',
                        ),
                      ),
                    if (_nextEpisodeCountdown != null)
                      OutlinedButton(
                        onPressed: () => setState(
                          () => _cancelNextEpisodeCountdown(suppress: true),
                        ),
                        child: const Text('Bliv her'),
                      ),
                  ],
                ),
              ),
            if (_error != null)
              Container(
                constraints: const BoxConstraints(maxWidth: 580),
                margin: const EdgeInsets.all(24),
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xEE1A1013),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: () => _start(_absolutePositionMs),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Prøv igen'),
                    ),
                  ],
                ),
              )
            else if (_buffering)
              Column(
                children: [
                  const BrandMark(size: 72),
                  const SizedBox(height: 18),
                  const SizedBox(width: 220, child: LinearProgressIndicator()),
                  const SizedBox(height: 12),
                  Text(_status),
                ],
              )
            else
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    iconSize: 34,
                    onPressed: () => _seekTo(_absolutePositionMs - 10000),
                    icon: const Icon(Icons.replay_10),
                    tooltip: '10 sekunder tilbage',
                  ),
                  const SizedBox(width: 20),
                  FilledButton.tonalIcon(
                    onPressed: _togglePlayback,
                    icon: Icon(
                      playing ? Icons.pause : Icons.play_arrow,
                      size: 38,
                    ),
                    label: Text(playing ? 'Pause' : 'Afspil'),
                  ),
                  const SizedBox(width: 20),
                  IconButton(
                    iconSize: 34,
                    onPressed: () => _seekTo(_absolutePositionMs + 10000),
                    icon: const Icon(Icons.forward_10),
                    tooltip: '10 sekunder frem',
                  ),
                ],
              ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.fromLTRB(22, 0, 22, 12),
              child: Column(
                children: [
                  Row(
                    children: [
                      Text(_time(_absolutePositionMs)),
                      Expanded(
                        child: Slider(
                          min: 0,
                          max: math.max(1, _durationMs).toDouble(),
                          value: _absolutePositionMs
                              .clamp(0, math.max(1, _durationMs))
                              .toDouble(),
                          onChangeStart: (_) => _hideTimer?.cancel(),
                          onChanged: (_) {},
                          onChangeEnd: (value) => _seekTo(value.round()),
                        ),
                      ),
                      Text(_time(_durationMs)),
                    ],
                  ),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      TextButton.icon(
                        onPressed: _showSubtitles,
                        icon: const Icon(Icons.subtitles_outlined),
                        label: Text(_subtitle?.label ?? 'Undertekster'),
                      ),
                      const SizedBox(width: 10),
                      TextButton.icon(
                        onPressed: _showQuality,
                        icon: const Icon(Icons.tune),
                        label: const Text('Kvalitet'),
                      ),
                      if (!AppConfig.isTvBuild && !_casting) ...[
                        const SizedBox(width: 10),
                        TextButton.icon(
                          onPressed: _enterPictureInPicture,
                          icon: const Icon(Icons.picture_in_picture_alt),
                          label: const Text('PiP'),
                        ),
                      ],
                      const SizedBox(width: 10),
                      TextButton.icon(
                        onPressed: () {
                          final current = video?.value.playbackSpeed ?? 1;
                          final next = current >= 2 ? 0.5 : current + 0.25;
                          unawaited(video?.setPlaybackSpeed(next));
                        },
                        icon: const Icon(Icons.speed),
                        label: Text(
                          '${video?.value.playbackSpeed.toStringAsFixed(2) ?? '1.00'}x',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSubtitles() {
    final tracks = _authorization?.subtitleTracks ?? const <SubtitleTrack>[];
    _hideTimer?.cancel();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: RadioGroup<String?>(
          groupValue: _subtitle?.id,
          onChanged: (value) {
            Navigator.pop(context);
            final selected = tracks
                .where((track) => track.id == value)
                .firstOrNull;
            unawaited(_setSubtitle(selected));
          },
          child: ListView(
            shrinkWrap: true,
            children: [
              const ListTile(
                title: Text(
                  'Undertekster',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              const RadioListTile<String?>(value: null, title: Text('Fra')),
              for (final track in tracks)
                RadioListTile<String?>(
                  value: track.id,
                  title: Text(track.label),
                  subtitle: Text(
                    '${track.language.toUpperCase()} · ${track.isText ? 'WebVTT' : 'Indbrændt'}',
                  ),
                ),
            ],
          ),
        ),
      ),
    ).whenComplete(_scheduleHide);
  }

  void _showQuality() {
    final auth = _authorization;
    if (auth == null) return;
    _hideTimer?.cancel();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const ListTile(
              title: Text(
                'Kvalitet',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              subtitle: Text(
                'Auto bruger Androids native adaptive HLS-afspiller.',
              ),
            ),
            ListTile(
              leading: const Icon(Icons.auto_awesome),
              title: const Text('Automatisk'),
              subtitle: const Text(
                'Tilpasser kvalitet efter buffer og netværk',
              ),
              trailing: auth.preferences.qualityMode == 'auto'
                  ? const Icon(Icons.check)
                  : null,
              onTap: () {
                Navigator.pop(context);
                unawaited(_changeQuality('auto'));
              },
            ),
            ListTile(
              leading: const Icon(Icons.high_quality),
              title: const Text('Original'),
              subtitle: const Text('Direct Play når filen er kompatibel'),
              trailing: auth.preferences.qualityMode == 'original'
                  ? const Icon(Icons.check)
                  : null,
              onTap: () {
                Navigator.pop(context);
                unawaited(_changeQuality('original'));
              },
            ),
            for (final rendition in auth.renditions.reversed)
              ListTile(
                leading: const Icon(Icons.hd_outlined),
                title: Text(
                  '${rendition.height}p${rendition.upscaled ? ' · Opskaleret' : ''}',
                ),
                subtitle: Text(
                  '${(rendition.bitrate / 1000000).toStringAsFixed(1)} Mbps · ${rendition.hdr ? 'HDR' : 'SDR'}',
                ),
                onTap: () {
                  Navigator.pop(context);
                  unawaited(_changeQuality('${rendition.height}'));
                },
              ),
          ],
        ),
      ),
    ).whenComplete(_scheduleHide);
  }

  String _time(int milliseconds) {
    final total = math.max(0, milliseconds ~/ 1000);
    final hours = total ~/ 3600;
    final minutes = (total % 3600) ~/ 60;
    final seconds = total % 60;
    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }
}

class _TimelineMarker {
  const _TimelineMarker({
    required this.kind,
    required this.startMs,
    required this.endMs,
  });
  final String kind;
  final int startMs;
  final int endMs;

  factory _TimelineMarker.fromJson(dynamic value) {
    final json = jsonMap(value);
    return _TimelineMarker(
      kind: stringValue(json['kind']) ?? 'unknown',
      startMs: intValue(json['startMs']) ?? 0,
      endMs: intValue(json['endMs']) ?? 0,
    );
  }
}

class _PlaybackBadge extends StatelessWidget {
  const _PlaybackBadge({required this.status, required this.authorization});

  final String status;
  final PlaybackAuthorization? authorization;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.black54,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: Colors.white24),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          status,
          style: TextStyle(
            color: Theme.of(context).colorScheme.secondary,
            fontWeight: FontWeight.w800,
          ),
        ),
        if (authorization != null)
          Text(
            '${authorization!.sourceHeight ?? 0}p · ${authorization!.sourceBitrate == null ? '?' : (authorization!.sourceBitrate! / 1000000).toStringAsFixed(1)} Mbps',
            style: const TextStyle(fontSize: 11, color: Colors.white60),
          ),
      ],
    ),
  );
}
