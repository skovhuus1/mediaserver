import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/playback_platform.dart';
import '../../shared_core/playback/playback_session_controller.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../../widgets/broadcast_subtitle.dart';
import '../widgets/tv_option_overlay.dart';

class TvPlayerScreen extends StatefulWidget {
  const TvPlayerScreen({
    required this.api,
    required this.media,
    required this.resumePositionMs,
    this.subtitleSelection,
    super.key,
  });

  final ApiClient api;
  final MediaItem media;
  final int resumePositionMs;
  final SubtitleQueueSelection? subtitleSelection;

  @override
  State<TvPlayerScreen> createState() => _TvPlayerScreenState();
}

class _TvPlayerScreenState extends State<TvPlayerScreen> {
  PlaybackSessionController? _controller;
  bool _openingNext = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_controller != null) return;
    final mediaQuery = MediaQuery.of(context);
    final controller = PlaybackSessionController(
      api: widget.api,
      media: widget.media,
      resumePositionMs: widget.resumePositionMs,
      screenHeight: mediaQuery.size.height,
      devicePixelRatio: mediaQuery.devicePixelRatio,
      subtitleSelection: widget.subtitleSelection,
    );
    _controller = controller;
    controller.addListener(_onPlaybackChanged);
    unawaited(controller.initialize());
  }

  void _onPlaybackChanged() {
    final next = _controller?.state.nextItem;
    if (next == null || _openingNext || !mounted) return;
    _openingNext = true;
    unawaited(_openNext(next));
  }

  Future<void> _openNext(PlaybackQueueItem next) async {
    final controller = _controller;
    if (controller == null) return;
    if (!mounted) return;
    unawaited(controller.finish());
    await Navigator.of(context).pushReplacement<void, void>(
      MaterialPageRoute(
        builder: (_) => TvPlayerScreen(
          api: widget.api,
          media: next.media,
          resumePositionMs: next.resumePositionMs,
          subtitleSelection: next.subtitleSelection,
        ),
      ),
    );
  }

  @override
  void dispose() {
    final controller = _controller;
    controller?.removeListener(_onPlaybackChanged);
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return TvPlaybackScaffold(
      controller: controller,
      title: _cleanTitle(widget.media.displayTitle),
      subtitle: widget.media.isEpisode ? widget.media.episodeLabel : null,
      live: false,
    );
  }
}

class TvPlaybackScaffold extends StatefulWidget {
  const TvPlaybackScaffold({
    required this.controller,
    required this.title,
    this.subtitle,
    this.live = false,
    this.onPreviousChannel,
    this.onNextChannel,
    super.key,
  });

  final TvPlaybackController controller;
  final String title;
  final String? subtitle;
  final bool live;
  final Future<void> Function()? onPreviousChannel;
  final Future<void> Function()? onNextChannel;

  @override
  State<TvPlaybackScaffold> createState() => _TvPlaybackScaffoldState();
}

class _TvPlaybackScaffoldState extends State<TvPlaybackScaffold>
    with WidgetsBindingObserver {
  final FocusNode _rootFocus = FocusNode(debugLabel: 'tv-player-root');
  late final List<FocusNode> _primaryNodes = List.generate(
    3,
    (index) => FocusNode(debugLabel: 'tv-player-primary-$index'),
  );
  late final List<FocusNode> _secondaryNodes = List.generate(
    5,
    (index) => FocusNode(debugLabel: 'tv-player-secondary-$index'),
  );
  final FocusNode _markerNode = FocusNode(debugLabel: 'tv-player-skip-marker');
  final FocusNode _nextNode = FocusNode(debugLabel: 'tv-player-next-episode');
  final FocusNode _errorRetryNode = FocusNode(
    debugLabel: 'tv-player-error-retry',
  );
  Timer? _hideTimer;
  Timer? _seekFeedbackTimer;
  Timer? _awakeTimer;
  _TvSeekFeedbackData? _seekFeedback;
  bool _controlsVisible = true;
  bool _closing = false;
  bool _keepScreenOnActive = false;
  int _row = 0;
  int _index = 1;
  String? _focusedError;

  PlaybackViewState get state => widget.controller.state;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.controller.addListener(_changed);
    _setPlaybackAwake(true);
    _awakeTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _reassertPlaybackAwake(),
    );
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _requestControlFocus();
    });
    _scheduleHide();
  }

  @override
  void didUpdateWidget(covariant TvPlaybackScaffold oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller == widget.controller) return;
    oldWidget.controller.removeListener(_changed);
    widget.controller.addListener(_changed);
    _setPlaybackAwake(true);
  }

  void _changed() {
    if (!mounted) return;
    final error = state.error;
    if (error != null && error != _focusedError) {
      _focusedError = error;
      _hideTimer?.cancel();
      _controlsVisible = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _errorRetryNode.canRequestFocus) {
          _errorRetryNode.requestFocus();
        }
      });
    } else if (error == null) {
      _focusedError = null;
    }
    if (state.initialized || state.playing || state.buffering) {
      _setPlaybackAwake(true);
    }
    if (_row == -1 && state.activeMarker == null) {
      _row = 0;
      _index = 1;
    }
    if (_row == -2 && state.nextEpisodeCountdown == null) {
      _row = 0;
      _index = 1;
    }
    setState(() {});
    if (_controlsVisible &&
        state.playing &&
        !state.buffering &&
        state.error == null &&
        !(_hideTimer?.isActive ?? false)) {
      _scheduleHide();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycleState) {
    if (lifecycleState != AppLifecycleState.resumed || _closing) return;
    _reassertPlaybackAwake();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  void _setPlaybackAwake(bool active) {
    if (_keepScreenOnActive == active) return;
    _keepScreenOnActive = active;
    unawaited(PlaybackPlatform.instance.setKeepScreenOn(active));
  }

  void _reassertPlaybackAwake() {
    if (_keepScreenOnActive) {
      unawaited(PlaybackPlatform.instance.setKeepScreenOn(true));
    }
  }

  void _showControls({bool requestFocus = true}) {
    if (!_controlsVisible) setState(() => _controlsVisible = true);
    if (requestFocus) _requestControlFocus();
    _scheduleHide();
  }

  void _hideControls() {
    _hideTimer?.cancel();
    _row = 0;
    _index = 1;
    setState(() => _controlsVisible = false);
    _rootFocus.requestFocus();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && state.playing && !state.buffering && state.error == null) {
        _hideControls();
      }
    });
  }

  void _remoteSeek(Duration delta) {
    if (!state.seekable) {
      _showSeekFeedback(
        const _TvSeekFeedbackData(
          icon: Icons.sensors_rounded,
          label: 'LIVE',
          subtitle: 'Streamen kan ikke spoles',
        ),
      );
      return;
    }
    unawaited(widget.controller.seekBy(delta));
    _showSeekFeedback(
      _TvSeekFeedbackData(
        icon: delta.isNegative
            ? Icons.replay_10_rounded
            : widget.live
            ? Icons.forward_10_rounded
            : Icons.forward_30_rounded,
        label: delta.isNegative
            ? '10 sek. tilbage'
            : widget.live
            ? '10 sek. frem'
            : '30 sek. frem',
        subtitle: _seekTargetLabel(delta),
      ),
    );
  }

  String _seekTargetLabel(Duration delta) {
    if (state.duration <= Duration.zero) return 'Spoler';
    final target = state.position + delta;
    final clamped = target < Duration.zero
        ? Duration.zero
        : target > state.duration
        ? state.duration
        : target;
    return _clock(clamped);
  }

  void _showSeekFeedback(_TvSeekFeedbackData feedback) {
    _seekFeedbackTimer?.cancel();
    setState(() => _seekFeedback = feedback);
    _seekFeedbackTimer = Timer(const Duration(milliseconds: 820), () {
      if (mounted) setState(() => _seekFeedback = null);
    });
  }

  void _requestControlFocus() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_controlsVisible) return;
      final FocusNode target;
      if (_row == -1 && state.activeMarker != null) {
        target = _markerNode;
      } else if (_row == -2 && state.nextEpisodeCountdown != null) {
        target = _nextNode;
      } else {
        final nodes = _row == 0 ? _primaryNodes : _secondaryNodes;
        target = nodes[_index.clamp(0, nodes.length - 1)];
      }
      if (target.canRequestFocus) target.requestFocus();
    });
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.escape ||
        key == LogicalKeyboardKey.goBack ||
        key == LogicalKeyboardKey.browserBack) {
      unawaited(_handleBack());
      return KeyEventResult.handled;
    }
    if (state.error != null) {
      if (key == LogicalKeyboardKey.enter ||
          key == LogicalKeyboardKey.numpadEnter ||
          key == LogicalKeyboardKey.select ||
          key == LogicalKeyboardKey.space) {
        unawaited(widget.controller.retry());
      } else if (_errorRetryNode.canRequestFocus) {
        _errorRetryNode.requestFocus();
      }
      return KeyEventResult.handled;
    }
    if (!_controlsVisible) {
      if (key == LogicalKeyboardKey.arrowLeft) {
        _remoteSeek(const Duration(seconds: -10));
        return KeyEventResult.handled;
      }
      if (key == LogicalKeyboardKey.arrowRight) {
        _remoteSeek(Duration(seconds: widget.live ? 10 : 30));
        return KeyEventResult.handled;
      }
      if (key == LogicalKeyboardKey.arrowUp &&
          widget.onPreviousChannel != null) {
        unawaited(widget.onPreviousChannel!());
        _showControls(requestFocus: false);
        return KeyEventResult.handled;
      }
      if (key == LogicalKeyboardKey.arrowDown && widget.onNextChannel != null) {
        unawaited(widget.onNextChannel!());
        _showControls(requestFocus: false);
        return KeyEventResult.handled;
      }
      if (key == LogicalKeyboardKey.enter ||
          key == LogicalKeyboardKey.numpadEnter ||
          key == LogicalKeyboardKey.select ||
          key == LogicalKeyboardKey.space) {
        _showControls();
        return KeyEventResult.handled;
      }
      _showControls();
      return KeyEventResult.handled;
    }

    _scheduleHide();
    if (key == LogicalKeyboardKey.arrowUp) {
      if (_row == 1) {
        _row = 0;
        _index = _index.clamp(0, _primaryNodes.length - 1);
      } else if (state.activeMarker != null) {
        _row = -1;
      } else if (state.nextEpisodeCountdown != null) {
        _row = -2;
      }
      _requestControlFocus();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowDown) {
      if (_row < 0) {
        _row = 0;
        _index = 1;
      } else {
        _row = 1;
        _index = _index.clamp(0, _secondaryNodes.length - 1);
      }
      _requestControlFocus();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowLeft) {
      if (_row == -2 && state.activeMarker != null) {
        _row = -1;
      } else if (_row == 1 && _index == 0) {
        _row = 0;
        _index = _primaryNodes.length - 1;
      } else if (_row >= 0) {
        final nodes = _row == 0 ? _primaryNodes : _secondaryNodes;
        _index = (_index - 1).clamp(0, nodes.length - 1);
      }
      _requestControlFocus();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowRight) {
      if (_row == -1 && state.nextEpisodeCountdown != null) {
        _row = -2;
      } else if (_row == 0 && _index == _primaryNodes.length - 1) {
        _row = 1;
        _index = 0;
      } else if (_row >= 0) {
        final nodes = _row == 0 ? _primaryNodes : _secondaryNodes;
        _index = (_index + 1).clamp(0, nodes.length - 1);
      }
      _requestControlFocus();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  Future<void> _handleBack() async {
    if (_closing) return;
    _closing = true;
    _hideTimer?.cancel();
    _seekFeedbackTimer?.cancel();
    _setPlaybackAwake(false);
    unawaited(widget.controller.finish());
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _showSubtitles() async {
    final controller = widget.controller;
    if (controller is! PlaybackSessionController) return;
    final tracks =
        controller.state.authorization?.subtitleTracks ??
        const <SubtitleTrack>[];
    const off = '__off__';
    const shiftEarlier = '__shift_earlier__';
    const shiftLater = '__shift_later__';
    const shiftReset = '__shift_reset__';
    _hideTimer?.cancel();
    final selected = await showDialog<String>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.18),
      builder: (_) => TvOptionOverlay<String>(
        playbackTitle: widget.title,
        playbackSubtitle: widget.subtitle,
        panelTitle: 'Undertekster',
        panelDescription: tracks.isEmpty
            ? 'Der blev ikke fundet undertekstspor til denne titel.'
            : 'Vælg spor eller forskyd teksttimingen frem og tilbage i små trin.',
        previewText: 'Synk: ${_subtitleOffsetLabel(state.subtitleOffset)}',
        choices: [
          TvPlaybackChoice<String>(
            value: shiftEarlier,
            title: 'Vis tekst tidligere',
            subtitle:
                '+0,5 sek. · nu ${_subtitleOffsetLabel(state.subtitleOffset)}',
            icon: Icons.keyboard_double_arrow_left_rounded,
            selected: false,
          ),
          TvPlaybackChoice<String>(
            value: shiftLater,
            title: 'Vis tekst senere',
            subtitle:
                '-0,5 sek. · nu ${_subtitleOffsetLabel(state.subtitleOffset)}',
            icon: Icons.keyboard_double_arrow_right_rounded,
            selected: false,
          ),
          TvPlaybackChoice<String>(
            value: shiftReset,
            title: 'Nulstil forskydning',
            subtitle: 'Tilbage til normal timing',
            icon: Icons.sync_rounded,
            selected: false,
          ),
          TvPlaybackChoice<String>(
            value: off,
            title: 'Fra',
            subtitle: 'Afspil uden undertekster',
            icon: Icons.subtitles_off_rounded,
            selected: state.selectedSubtitle == null,
          ),
          for (final track in tracks)
            TvPlaybackChoice<String>(
              value: track.id,
              title: track.label,
              subtitle: _subtitleTrackMeta(track),
              icon: track.forced
                  ? Icons.g_translate_rounded
                  : Icons.subtitles_rounded,
              selected: state.selectedSubtitle?.id == track.id,
            ),
        ],
      ),
    );
    if (selected == null || !mounted) {
      if (mounted) _showControls();
      return;
    }
    if (selected == shiftEarlier) {
      await controller.adjustSubtitleOffset(const Duration(milliseconds: 500));
      _showControls();
      return;
    }
    if (selected == shiftLater) {
      await controller.adjustSubtitleOffset(const Duration(milliseconds: -500));
      _showControls();
      return;
    }
    if (selected == shiftReset) {
      await controller.resetSubtitleOffset();
      _showControls();
      return;
    }
    await controller.selectSubtitle(
      selected == off
          ? null
          : tracks.where((track) => track.id == selected).firstOrNull,
    );
    _showControls();
  }

  Future<void> _showAudio() async {
    final controller = widget.controller;
    if (controller is! PlaybackSessionController) return;
    final tracks =
        controller.state.authorization?.audioTracks ??
        const <PlaybackAudioTrack>[];
    _hideTimer?.cancel();
    final selected = await showDialog<PlaybackAudioTrack>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.18),
      builder: (_) => TvOptionOverlay<PlaybackAudioTrack>(
        playbackTitle: widget.title,
        playbackSubtitle: widget.subtitle,
        panelTitle: 'Lydspor',
        panelDescription: tracks.isEmpty
            ? 'Der blev ikke fundet alternative lydspor.'
            : 'Skifter lydspor på den aktuelle stream og bevarer positionen.',
        previewText: state.selectedAudioTrack?.label ?? 'Vælg lydspor',
        choices: [
          for (final track in tracks)
            TvPlaybackChoice<PlaybackAudioTrack>(
              value: track,
              title: track.label,
              subtitle: _audioTrackMeta(track),
              icon: Icons.audiotrack_rounded,
              selected:
                  state.selectedAudioTrack?.id == track.id || track.selected,
            ),
        ],
      ),
    );
    if (selected != null) await controller.selectAudioTrack(selected);
    _showControls();
  }

  Future<void> _showQuality() async {
    final controller = widget.controller;
    if (controller is! PlaybackSessionController) return;
    final auth = controller.state.authorization;
    if (auth == null) return;
    final renditionsByHeight = <int, Rendition>{};
    for (final rendition in auth.renditions) {
      if (rendition.height <= 0) continue;
      renditionsByHeight[rendition.height] = rendition;
    }
    final ordered = renditionsByHeight.values.toList()
      ..sort((a, b) => b.height.compareTo(a.height));

    final selectedValue = switch (controller.currentQualityMode) {
      'original' => 'original',
      'auto' => 'auto',
      _ => controller.currentFixedQualityHeight?.toString(),
    };

    _hideTimer?.cancel();
    final selected = await showDialog<String>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.18),
      builder: (_) => TvOptionOverlay<String>(
        playbackTitle: widget.title,
        playbackSubtitle: widget.subtitle,
        panelTitle: 'Kvalitet',
        panelDescription:
            'Auto tilpasser streamen efter buffer og netværk. Original forsøger kildefilen.',
        previewText: state.qualityLabel.isEmpty
            ? 'Automatisk kvalitet'
            : state.qualityLabel,
        choices: [
          TvPlaybackChoice<String>(
            value: 'auto',
            title: 'Auto',
            subtitle: 'Tilpas automatisk efter forbindelse og buffer',
            icon: Icons.auto_awesome,
            selected: 'auto' == selectedValue,
          ),
          TvPlaybackChoice<String>(
            value: 'original',
            title: 'Original',
            subtitle: 'Brug kildekvalitet når enheden og planen tillader det',
            icon: Icons.high_quality,
            selected: 'original' == selectedValue,
          ),
          for (final rendition in ordered)
            TvPlaybackChoice<String>(
              value: '${rendition.height}',
              title: '${rendition.height}p',
              subtitle: _qualityMeta(rendition),
              icon: Icons.hd_outlined,
              selected: selectedValue == '${rendition.height}',
            ),
        ],
      ),
    );
    if (selected != null) await controller.selectQuality(selected);
    _showControls();
  }

  Future<void> _showUpscale() async {
    final controller = widget.controller;
    if (controller is! PlaybackSessionController) return;
    final serverTarget = _serverUpscaleTarget(controller.state.authorization);
    _hideTimer?.cancel();
    final selected = await showDialog<String>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.18),
      builder: (_) => TvOptionOverlay<String>(
        playbackTitle: widget.title,
        playbackSubtitle: widget.subtitle,
        panelTitle: 'Opskalering',
        panelDescription:
            'Server-opskalering laver en ny FFmpeg-stream i højere opløsning. TV-hardware-skalering er ikke en app-styret kvalitetsforbedring.',
        previewText: state.upscaleLabel.isEmpty
            ? 'Opskalering: Fra'
            : state.upscaleLabel,
        choices: [
          TvPlaybackChoice<String>(
            value: 'server',
            title: serverTarget == null ? 'Server' : 'Server ${serverTarget}p',
            subtitle: serverTarget == null
                ? 'Bed serveren levere en opskaleret stream når muligt'
                : 'Tving en opskaleret FFmpeg-stream til ${serverTarget}p',
            icon: Icons.dns_rounded,
            selected: controller.currentUpscaleMode == 'server',
          ),
          TvPlaybackChoice<String>(
            value: 'off',
            title: 'Fra',
            subtitle: 'Brug streamens valgte opløsning uden ekstra opskalering',
            icon: Icons.block_rounded,
            selected: controller.currentUpscaleMode == 'off',
          ),
        ],
      ),
    );
    if (selected != null) await controller.selectUpscaleMode(selected);
    _showControls();
  }

  void _cycleSpeed() {
    const values = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    final current = values.indexWhere(
      (value) => (value - state.playbackRate).abs() < 0.01,
    );
    final next =
        values[current < 0 || current == values.length - 1 ? 0 : current + 1];
    unawaited(widget.controller.setPlaybackRate(next));
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    _hideTimer?.cancel();
    _seekFeedbackTimer?.cancel();
    _awakeTimer?.cancel();
    _rootFocus.dispose();
    for (final node in [
      ..._primaryNodes,
      ..._secondaryNodes,
      _markerNode,
      _nextNode,
      _errorRetryNode,
    ]) {
      node.dispose();
    }
    WidgetsBinding.instance.removeObserver(this);
    _setPlaybackAwake(false);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = widget.controller.video;
    return PopScope(
      key: const ValueKey('tv-player-pop-scope'),
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) unawaited(_handleBack());
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Focus(
          focusNode: _rootFocus,
          autofocus: true,
          onKeyEvent: _handleKey,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (video?.value.isInitialized == true)
                Center(
                  child: AspectRatio(
                    aspectRatio: video!.value.aspectRatio == 0
                        ? 16 / 9
                        : video.value.aspectRatio,
                    child: VideoPlayer(video, key: ValueKey(video)),
                  ),
                )
              else
                const ColoredBox(color: Colors.black),
              if (state.subtitleText.isNotEmpty)
                BroadcastSubtitle(
                  text: state.subtitleText,
                  style: state.subtitleStyle,
                  textColor: state.subtitleTextColor,
                  sizePercent: state.subtitleSizePercent,
                  bottomOffsetPercent: state.subtitleBottomOffsetPercent,
                ),
              AnimatedOpacity(
                opacity:
                    _controlsVisible ||
                        state.loading ||
                        state.buffering ||
                        state.error != null
                    ? 1
                    : 0,
                duration: const Duration(milliseconds: 180),
                child: _buildOverlay(),
              ),
              _TvSeekFeedbackOverlay(feedback: _seekFeedback),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOverlay() {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0x78000000),
            Color(0x00000000),
            Color(0xD9000000),
            Color(0xFF000000),
          ],
          stops: [0, 0.46, 0.78, 1],
        ),
      ),
      child: SafeArea(
        minimum: const EdgeInsets.fromLTRB(42, 12, 42, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.2,
                        ),
                      ),
                      if (widget.subtitle != null)
                        Text(
                          widget.subtitle!,
                          style: const TextStyle(color: Colors.white60),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xD9040506),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: const Color(0x55FFE8A3)),
                  ),
                  child: Text(
                    widget.live
                        ? 'LIVE'
                        : state.qualityChanging
                        ? 'Skifter kvalitet'
                        : state.audioChanging
                        ? 'Skifter lyd'
                        : state.qualityLabel.isEmpty
                        ? state.status
                        : state.qualityLabel,
                    style: const TextStyle(
                      color: Color(0xFFFFE8A3),
                      fontWeight: FontWeight.w900,
                      fontSize: 11.5,
                    ),
                  ),
                ),
              ],
            ),
            const Spacer(),
            if (state.error != null)
              Center(
                child: _TvPlayerMessage(
                  message: state.error!,
                  icon: Icons.error_outline,
                  actionLabel: 'Prøv igen',
                  onPressed: widget.controller.retry,
                  actionFocusNode: _errorRetryNode,
                ),
              )
            else if (state.loading || !state.initialized)
              Center(
                child: _TvPlayerMessage(
                  message: state.status,
                  icon: widget.live ? Icons.live_tv : Icons.play_circle,
                ),
              )
            else ...[
              if (state.activeMarker != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: _TvPlayerButton(
                    focusNode: _markerNode,
                    label: switch (state.activeMarker!.kind) {
                      'intro' => 'Spring intro over',
                      'recap' => 'Spring resumé over',
                      'credits' => 'Spring rulletekster over',
                      _ => 'Spring videre',
                    },
                    icon: Icons.skip_next,
                    onFocus: () => _row = -1,
                    onPressed: () => widget.controller.seekTo(
                      Duration(milliseconds: state.activeMarker!.endMs),
                    ),
                  ),
                ),
              if (state.nextEpisodeCountdown != null)
                Align(
                  alignment: Alignment.centerRight,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: _TvPlayerButton(
                      focusNode: _nextNode,
                      label:
                          'Næste episode om ${state.nextEpisodeCountdown} sek.',
                      icon: Icons.play_arrow,
                      onFocus: () => _row = -2,
                      onPressed: widget.controller is PlaybackSessionController
                          ? () =>
                                (widget.controller as PlaybackSessionController)
                                    .playNextEpisode()
                          : null,
                    ),
                  ),
                ),
              _buildControlDeck(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildControlDeck() {
    return Transform.translate(
      offset: const Offset(0, 8),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 960),
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 4, 10, 5),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xEA14191F), Color(0xEA05070A)],
              ),
              borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
              border: Border.all(color: const Color(0x40FFE8A3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0xCC000000),
                  blurRadius: 32,
                  offset: Offset(0, 14),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (state.buffering) ...[
                  const _TvPlayerStatusLine(
                    icon: Icons.hourglass_top_rounded,
                    label: 'Bufferer streamen',
                  ),
                  const SizedBox(height: 6),
                ],
                _buildTimeline(),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _TvPlayerButton(
                        focusNode: _primaryNodes[0],
                        label: '10 sek. tilbage',
                        icon: Icons.replay_10_rounded,
                        iconOnly: true,
                        onFocus: () {
                          _row = 0;
                          _index = 0;
                        },
                        onPressed: state.seekable
                            ? () => widget.controller.seekBy(
                                const Duration(seconds: -10),
                              )
                            : null,
                      ),
                      const SizedBox(width: 8),
                      _TvPlayerButton(
                        focusNode: _primaryNodes[1],
                        label: state.playing ? 'Pause' : 'Afspil',
                        icon: state.playing
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        primary: true,
                        iconOnly: true,
                        large: true,
                        onFocus: () {
                          _row = 0;
                          _index = 1;
                        },
                        onPressed: widget.controller.togglePlayback,
                      ),
                      const SizedBox(width: 8),
                      _TvPlayerButton(
                        focusNode: _primaryNodes[2],
                        label: widget.live ? '10 sek. frem' : '30 sek. frem',
                        icon: widget.live
                            ? Icons.forward_10_rounded
                            : Icons.forward_30_rounded,
                        iconOnly: true,
                        onFocus: () {
                          _row = 0;
                          _index = 2;
                        },
                        onPressed: state.seekable
                            ? () => widget.controller.seekBy(
                                Duration(seconds: widget.live ? 10 : 30),
                              )
                            : null,
                      ),
                      const SizedBox(width: 14),
                      Container(width: 1, height: 28, color: Colors.white12),
                      const SizedBox(width: 12),
                      _TvPlayerButton(
                        focusNode: _secondaryNodes[0],
                        label: state.subtitleOffset == Duration.zero
                            ? state.selectedSubtitle?.label ?? 'Undertekster'
                            : 'Tekst ${_subtitleOffsetLabel(state.subtitleOffset)}',
                        icon: Icons.subtitles_rounded,
                        onFocus: () {
                          _row = 1;
                          _index = 0;
                        },
                        onPressed:
                            widget.controller is PlaybackSessionController
                            ? _showSubtitles
                            : null,
                      ),
                      const SizedBox(width: 8),
                      _TvPlayerButton(
                        focusNode: _secondaryNodes[1],
                        label: state.audioChanging
                            ? 'Skifter lyd'
                            : state.selectedAudioTrack?.label ?? 'Lydspor',
                        icon: Icons.audiotrack_rounded,
                        onFocus: () {
                          _row = 1;
                          _index = 1;
                        },
                        onPressed:
                            widget.controller is PlaybackSessionController &&
                                (state.authorization?.audioTracks.isNotEmpty ??
                                    false)
                            ? _showAudio
                            : null,
                      ),
                      const SizedBox(width: 8),
                      _TvPlayerButton(
                        focusNode: _secondaryNodes[2],
                        label: widget.live
                            ? 'Live-kvalitet'
                            : state.qualityChanging
                            ? 'Skifter kvalitet'
                            : state.qualityLabel.isEmpty
                            ? 'Kvalitet'
                            : state.qualityLabel,
                        icon: Icons.tune_rounded,
                        onFocus: () {
                          _row = 1;
                          _index = 2;
                        },
                        onPressed:
                            widget.controller is PlaybackSessionController
                            ? _showQuality
                            : null,
                      ),
                      const SizedBox(width: 8),
                      _TvPlayerButton(
                        focusNode: _secondaryNodes[3],
                        label: state.qualityChanging
                            ? 'Skifter opskalering'
                            : state.upscaleLabel.isEmpty
                            ? 'Opskalering'
                            : state.upscaleLabel,
                        icon: Icons.auto_fix_high_rounded,
                        onFocus: () {
                          _row = 1;
                          _index = 3;
                        },
                        onPressed:
                            widget.controller is PlaybackSessionController
                            ? _showUpscale
                            : null,
                      ),
                      const SizedBox(width: 8),
                      _TvPlayerButton(
                        focusNode: _secondaryNodes[4],
                        label: '${state.playbackRate.toStringAsFixed(2)}x',
                        icon: Icons.speed_rounded,
                        onFocus: () {
                          _row = 1;
                          _index = 4;
                        },
                        onPressed: widget.live ? null : _cycleSpeed,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTimeline() {
    final durationMs = math.max(1, state.duration.inMilliseconds);
    final progress = state.position.inMilliseconds
        .clamp(0, durationMs)
        .toDouble();
    final bufferedMs = math.max(
      0.0,
      math.min(
        durationMs.toDouble(),
        state.bufferedPosition.inMilliseconds.toDouble(),
      ),
    );
    final buffered = bufferedMs / durationMs;
    return Row(
      children: [
        SizedBox(
          width: 58,
          child: Text(
            _clock(state.position),
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: SizedBox(
            height: 5,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(height: 5, color: const Color(0x33FFFFFF)),
                  if (!widget.live || state.seekable)
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: math.max(0, math.min(1, buffered)),
                          alignment: Alignment.centerLeft,
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: TvDesignTokens.cyan,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (!widget.live || state.seekable)
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: math.max(
                            0,
                            math.min(1, progress / durationMs),
                          ),
                          alignment: Alignment.centerLeft,
                          child: Container(
                            height: 5,
                            decoration: BoxDecoration(
                              color: TvDesignTokens.focusFill,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 64,
          child: Text(
            widget.live && !state.seekable ? 'LIVE' : _clock(state.duration),
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }

  String _subtitleTrackMeta(SubtitleTrack track) {
    final parts = [
      if (track.language.trim().isNotEmpty) track.language.toUpperCase(),
      track.isText ? 'Tekstspor' : 'Kræver indbrænding',
      if (track.forced) 'Tvungen',
    ];
    return parts.join(' · ');
  }

  String _subtitleOffsetLabel(Duration offset) {
    final ms = offset.inMilliseconds;
    if (ms == 0) return '0,0 sek.';
    final seconds = (ms.abs() / 1000).toStringAsFixed(1).replaceAll('.', ',');
    return ms > 0 ? 'tidligere $seconds sek.' : 'senere $seconds sek.';
  }

  String _audioTrackMeta(PlaybackAudioTrack track) {
    final parts = [
      if (track.language.trim().isNotEmpty) track.language.toUpperCase(),
      if ((track.codec ?? '').trim().isNotEmpty) track.codec!,
      if ((track.channels ?? 0) > 0) '${track.channels} kanaler',
      if (track.isDefault) 'Standard',
    ];
    return parts.isEmpty ? 'Lydspor' : parts.join(' · ');
  }

  String _qualityMeta(Rendition rendition) {
    final parts = [
      '${(rendition.bitrate / 1000000).toStringAsFixed(1)} Mbps',
      rendition.hdr ? 'HDR' : 'SDR',
      if (rendition.upscaled) 'Opskaleret',
    ];
    return parts.join(' · ');
  }

  int? _serverUpscaleTarget(PlaybackAuthorization? authorization) {
    if (authorization == null) return null;
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
}

class _TvSeekFeedbackData {
  const _TvSeekFeedbackData({
    required this.icon,
    required this.label,
    required this.subtitle,
  });

  final IconData icon;
  final String label;
  final String subtitle;
}

class _TvSeekFeedbackOverlay extends StatelessWidget {
  const _TvSeekFeedbackOverlay({required this.feedback});

  final _TvSeekFeedbackData? feedback;

  @override
  Widget build(BuildContext context) {
    final data = feedback;
    return IgnorePointer(
      child: Opacity(
        opacity: data == null ? 0 : 1,
        child: Center(
          child: AnimatedScale(
            scale: data == null ? 0.92 : 1,
            duration: const Duration(milliseconds: 140),
            curve: Curves.easeOutBack,
            child: data == null
                ? const SizedBox.shrink()
                : Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 22,
                      vertical: 18,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xD9080B10),
                      borderRadius: BorderRadius.circular(26),
                      border: Border.all(
                        color: const Color(0x8CFFE8A3),
                        width: 1.3,
                      ),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0xCC000000),
                          blurRadius: 32,
                          offset: Offset(0, 16),
                        ),
                        BoxShadow(color: Color(0x44FFE8A3), blurRadius: 24),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          data.icon,
                          color: TvDesignTokens.focusFill,
                          size: 48,
                        ),
                        const SizedBox(width: 14),
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              data.label,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.4,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              data.subtitle,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _TvPlayerStatusLine extends StatelessWidget {
  const _TvPlayerStatusLine({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xFF101215),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: const Color(0x553B3325)),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: TvDesignTokens.gold),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    ),
  );
}

class _TvPlayerButton extends StatefulWidget {
  const _TvPlayerButton({
    required this.label,
    required this.icon,
    this.onPressed,
    this.focusNode,
    this.onFocus,
    this.primary = false,
    this.iconOnly = false,
    this.large = false,
  });

  final String label;
  final IconData icon;
  final FutureOr<void> Function()? onPressed;
  final FocusNode? focusNode;
  final VoidCallback? onFocus;
  final bool primary;
  final bool iconOnly;
  final bool large;

  @override
  State<_TvPlayerButton> createState() => _TvPlayerButtonState();
}

class _TvPlayerButtonState extends State<_TvPlayerButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: widget.focusNode,
      onFocusChange: (value) {
        setState(() => _focused = value);
        if (value) widget.onFocus?.call();
      },
      onKeyEvent: (_, event) {
        if (event is KeyDownEvent &&
            (event.logicalKey == LogicalKeyboardKey.enter ||
                event.logicalKey == LogicalKeyboardKey.numpadEnter ||
                event.logicalKey == LogicalKeyboardKey.space ||
                event.logicalKey == LogicalKeyboardKey.select)) {
          final action = widget.onPressed;
          if (action != null) unawaited(Future<void>.sync(action));
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: GestureDetector(
        onTap: widget.onPressed == null
            ? null
            : () => unawaited(Future<void>.sync(widget.onPressed!)),
        child: AnimatedScale(
          scale: _focused ? 1.028 : 1,
          duration: TvDesignTokens.focusAnimationDuration,
          child: AnimatedContainer(
            duration: TvDesignTokens.focusAnimationDuration,
            constraints: widget.iconOnly
                ? null
                : const BoxConstraints(maxWidth: 172, minHeight: 34),
            width: widget.iconOnly ? (widget.large ? 46 : 38) : null,
            height: widget.iconOnly ? (widget.large ? 46 : 38) : null,
            padding: widget.iconOnly
                ? EdgeInsets.zero
                : const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
            decoration: BoxDecoration(
              color: widget.onPressed == null
                  ? const Color(0x221A1D21)
                  : _focused
                  ? TvDesignTokens.focusFill
                  : widget.primary
                  ? TvDesignTokens.gold
                  : const Color(0xD00C1118),
              borderRadius: BorderRadius.circular(widget.iconOnly ? 999 : 999),
              border: Border.all(
                color: _focused
                    ? const Color(0xFFFFFFFF)
                    : widget.primary
                    ? const Color(0x99FFE8A3)
                    : const Color(0x3DFFE8A3),
                width: _focused ? 2 : 1,
              ),
              boxShadow: _focused
                  ? const [
                      BoxShadow(
                        color: Color(0x78FFC857),
                        blurRadius: 16,
                        offset: Offset(0, 7),
                      ),
                    ]
                  : const [],
            ),
            child: Semantics(
              button: true,
              label: widget.label,
              child: widget.iconOnly
                  ? Icon(
                      widget.icon,
                      size: widget.large ? 27 : 22,
                      color: _focused || widget.primary
                          ? const Color(0xFF090806)
                          : Colors.white,
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          widget.icon,
                          size: 15,
                          color: _focused || widget.primary
                              ? const Color(0xFF090806)
                              : Colors.white,
                        ),
                        const SizedBox(width: 7),
                        Flexible(
                          child: Text(
                            widget.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: _focused || widget.primary
                                  ? const Color(0xFF090806)
                                  : Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 10.8,
                            ),
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
}

class _TvPlayerMessage extends StatelessWidget {
  const _TvPlayerMessage({
    required this.message,
    required this.icon,
    this.actionLabel,
    this.onPressed,
    this.actionFocusNode,
  });

  final String message;
  final IconData icon;
  final String? actionLabel;
  final Future<void> Function()? onPressed;
  final FocusNode? actionFocusNode;

  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(maxWidth: 560),
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xEE121923), Color(0xEE070A0F)],
      ),
      borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
      border: Border.all(color: const Color(0x55FFE8A3)),
      boxShadow: const [
        BoxShadow(
          color: Color(0xB8000000),
          blurRadius: 42,
          offset: Offset(0, 18),
        ),
      ],
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 52, color: TvDesignTokens.gold),
        const SizedBox(height: 16),
        if (onPressed == null) const CircularProgressIndicator(),
        if (onPressed == null) const SizedBox(height: 16),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        if (onPressed != null) ...[
          const SizedBox(height: 18),
          _TvPlayerButton(
            label: actionLabel ?? 'Prøv igen',
            icon: Icons.refresh,
            primary: true,
            onPressed: onPressed,
            focusNode: actionFocusNode,
          ),
        ],
      ],
    ),
  );
}

String _clock(Duration value) {
  final total = math.max(0, value.inSeconds);
  final hours = total ~/ 3600;
  final minutes = (total % 3600) ~/ 60;
  final seconds = total % 60;
  return hours > 0
      ? '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}'
      : '$minutes:${seconds.toString().padLeft(2, '0')}';
}

String _cleanTitle(String value) => value
    .replaceAll(
      RegExp(r'\.(mkv|mp4|m4v|mov|avi|webm)$', caseSensitive: false),
      '',
    )
    .trim();
