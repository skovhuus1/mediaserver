import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../core/playback_platform.dart';
import '../../shared_core/playback/playback_session_controller.dart';
import '../../widgets/broadcast_subtitle.dart';
import '../../widgets/playback_option_sheet.dart';

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

class _TvPlaybackScaffoldState extends State<TvPlaybackScaffold> {
  final FocusNode _rootFocus = FocusNode(debugLabel: 'tv-player-root');
  late final List<FocusNode> _primaryNodes = List.generate(
    3,
    (index) => FocusNode(debugLabel: 'tv-player-primary-$index'),
  );
  late final List<FocusNode> _secondaryNodes = List.generate(
    4,
    (index) => FocusNode(debugLabel: 'tv-player-secondary-$index'),
  );
  final FocusNode _markerNode = FocusNode(debugLabel: 'tv-player-skip-marker');
  final FocusNode _nextNode = FocusNode(debugLabel: 'tv-player-next-episode');
  Timer? _hideTimer;
  bool _controlsVisible = true;
  bool _closing = false;
  int _row = 0;
  int _index = 1;

  PlaybackViewState get state => widget.controller.state;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
    unawaited(PlaybackPlatform.instance.setKeepScreenOn(true));
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
  }

  void _changed() {
    if (!mounted) return;
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

  void _showControls({bool requestFocus = true}) {
    if (!_controlsVisible) setState(() => _controlsVisible = true);
    if (requestFocus) _requestControlFocus();
    _scheduleHide();
  }

  void _hideControls() {
    _hideTimer?.cancel();
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
    if (key == LogicalKeyboardKey.escape) {
      unawaited(_handleBack());
      return KeyEventResult.handled;
    }
    // Android TV dispatches remote Back through the route and may also expose
    // it as a key event. PopScope is the single authority for system Back so
    // one physical press cannot both hide the overlay and close the player.
    if (key == LogicalKeyboardKey.goBack ||
        key == LogicalKeyboardKey.browserBack) {
      return KeyEventResult.ignored;
    }
    if (!_controlsVisible) {
      if (key == LogicalKeyboardKey.arrowLeft && state.seekable) {
        unawaited(widget.controller.seekBy(const Duration(seconds: -10)));
        _showControls(requestFocus: false);
        return KeyEventResult.handled;
      }
      if (key == LogicalKeyboardKey.arrowRight && state.seekable) {
        unawaited(
          widget.controller.seekBy(Duration(seconds: widget.live ? 10 : 30)),
        );
        _showControls(requestFocus: false);
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
          key == LogicalKeyboardKey.select ||
          key == LogicalKeyboardKey.space) {
        unawaited(widget.controller.togglePlayback());
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
    if (_controlsVisible && state.error == null) {
      _hideControls();
      return;
    }
    _closing = true;
    await widget.controller.finish();
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _showSubtitles() async {
    final controller = widget.controller;
    if (controller is! PlaybackSessionController) return;
    final tracks =
        controller.state.authorization?.subtitleTracks ??
        const <SubtitleTrack>[];
    const off = '__off__';
    final selected = await showPlaybackOptionSheet<String>(
      context: context,
      tv: true,
      title: 'Undertekster',
      description: tracks.isEmpty
          ? 'Der blev ikke fundet undertekster.'
          : 'Vælg et spor. Valget følger næste episode.',
      options: [
        PlaybackOption<String>(
          value: off,
          title: 'Fra',
          icon: Icons.subtitles_off_outlined,
          selected: state.selectedSubtitle == null,
        ),
        for (final track in tracks)
          PlaybackOption<String>(
            value: track.id,
            title: track.label,
            subtitle:
                '${track.language.toUpperCase()} · ${track.isText ? 'Tekst' : 'Indbrænding'}',
            icon: Icons.subtitles_outlined,
            selected: state.selectedSubtitle?.id == track.id,
          ),
      ],
    );
    if (selected == null || !mounted) return;
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
    final selected = await showPlaybackOptionSheet<PlaybackAudioTrack>(
      context: context,
      tv: true,
      title: 'Lydspor',
      description: tracks.isEmpty
          ? 'Der blev ikke fundet alternative lydspor.'
          : 'Skifter lydspor på den aktuelle stream.',
      options: [
        for (final track in tracks)
          PlaybackOption<PlaybackAudioTrack>(
            value: track,
            title: track.label,
            subtitle: [
              if (track.language.isNotEmpty) track.language.toUpperCase(),
              if ((track.codec ?? '').isNotEmpty) track.codec!,
              if ((track.channels ?? 0) > 0) '${track.channels} kanaler',
              if (track.isDefault) 'Standard',
            ].join(' · '),
            icon: Icons.audiotrack_rounded,
            selected:
                state.selectedAudioTrack?.id == track.id || track.selected,
          ),
      ],
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

    final selected = await showPlaybackOptionSheet<String>(
      context: context,
      tv: true,
      title: 'Kvalitet',
      description: 'Auto tilpasser streamen efter buffer og netværk.',
      options: [
        PlaybackOption<String>(
          value: 'auto',
          title: 'Automatisk',
          icon: Icons.auto_awesome,
          selected: 'auto' == selectedValue,
        ),
        PlaybackOption<String>(
          value: 'original',
          title: 'Original',
          icon: Icons.high_quality,
          selected: 'original' == selectedValue,
        ),
        for (final rendition in ordered)
          PlaybackOption<String>(
            value: '${rendition.height}',
            title: '${rendition.height}p',
            subtitle:
                '${(rendition.bitrate / 1000000).toStringAsFixed(1)} Mbps · ${rendition.hdr ? 'HDR' : 'SDR'}',
            icon: Icons.hd_outlined,
            selected: selectedValue == '${rendition.height}',
          ),
      ],
    );
    if (selected != null) await controller.selectQuality(selected);
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
    _rootFocus.dispose();
    for (final node in [
      ..._primaryNodes,
      ..._secondaryNodes,
      _markerNode,
      _nextNode,
    ]) {
      node.dispose();
    }
    unawaited(PlaybackPlatform.instance.setKeepScreenOn(false));
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = widget.controller.video;
    return PopScope(
      key: const ValueKey('tv-player-pop-scope'),
      canPop: false,
      onPopInvokedWithResult: (_, _) => unawaited(_handleBack()),
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
                    child: VideoPlayer(video),
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
          colors: [Color(0x8F000000), Color(0x00000000), Color(0xF9040506)],
          stops: [0, 0.58, 1],
        ),
      ),
      child: SafeArea(
        minimum: const EdgeInsets.fromLTRB(46, 14, 46, 4),
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
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0,
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
                    border: Border.all(color: const Color(0xFF3B3325)),
                  ),
                  child: Text(
                    widget.live
                        ? 'LIVE'
                        : state.qualityLabel.isEmpty
                        ? state.status
                        : state.qualityLabel,
                    style: const TextStyle(
                      color: Color(0xFFFFF4D0),
                      fontWeight: FontWeight.w900,
                      fontSize: 12.5,
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
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1180),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 7, 14, 8),
          decoration: BoxDecoration(
            color: const Color(0xE6070A0E),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0x4DFFF4D0)),
            boxShadow: const [
              BoxShadow(
                color: Color(0xB8000000),
                blurRadius: 34,
                offset: Offset(0, 12),
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
                const SizedBox(height: 7),
              ],
              _buildTimeline(),
              const SizedBox(height: 7),
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
                    const SizedBox(width: 10),
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
                    const SizedBox(width: 10),
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
                    const SizedBox(width: 18),
                    Container(width: 1, height: 32, color: Colors.white12),
                    const SizedBox(width: 14),
                    _TvPlayerButton(
                      focusNode: _secondaryNodes[0],
                      label: state.selectedSubtitle?.label ?? 'Undertekster',
                      icon: Icons.subtitles_rounded,
                      onFocus: () {
                        _row = 1;
                        _index = 0;
                      },
                      onPressed: widget.controller is PlaybackSessionController
                          ? _showSubtitles
                          : null,
                    ),
                    const SizedBox(width: 8),
                    _TvPlayerButton(
                      focusNode: _secondaryNodes[1],
                      label: state.selectedAudioTrack?.label ?? 'Lydspor',
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
                          : state.qualityLabel.isEmpty
                          ? 'Kvalitet'
                          : state.qualityLabel,
                      icon: Icons.tune_rounded,
                      onFocus: () {
                        _row = 1;
                        _index = 2;
                      },
                      onPressed: widget.controller is PlaybackSessionController
                          ? _showQuality
                          : null,
                    ),
                    const SizedBox(width: 8),
                    _TvPlayerButton(
                      focusNode: _secondaryNodes[3],
                      label: '${state.playbackRate.toStringAsFixed(2)}x',
                      icon: Icons.speed_rounded,
                      onFocus: () {
                        _row = 1;
                        _index = 3;
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
            height: 6,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Container(height: 6, color: const Color(0x33FFFFFF)),
                  if (!widget.live || state.seekable)
                    Positioned.fill(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: math.max(0, math.min(1, buffered)),
                          alignment: Alignment.centerLeft,
                          child: Container(
                            height: 6,
                            decoration: BoxDecoration(
                              color: const Color(0xFF8EDCFF),
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
                            height: 6,
                            decoration: BoxDecoration(
                              color: const Color(0xFFFFF4D0),
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
          Icon(icon, size: 14, color: const Color(0xFFF7C35F)),
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
          scale: _focused ? 1.035 : 1,
          duration: const Duration(milliseconds: 120),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 120),
            constraints: widget.iconOnly
                ? null
                : const BoxConstraints(maxWidth: 190, minHeight: 38),
            width: widget.iconOnly ? (widget.large ? 50 : 40) : null,
            height: widget.iconOnly ? (widget.large ? 50 : 40) : null,
            padding: widget.iconOnly
                ? EdgeInsets.zero
                : const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
            decoration: BoxDecoration(
              color: widget.onPressed == null
                  ? const Color(0x221A1D21)
                  : _focused
                  ? const Color(0xFFFFF4D0)
                  : widget.primary
                  ? const Color(0xFFF7C35F)
                  : const Color(0xC20D1117),
              borderRadius: BorderRadius.circular(widget.iconOnly ? 999 : 999),
              border: Border.all(
                color: _focused
                    ? const Color(0xFFFFFFFF)
                    : widget.primary
                    ? const Color(0x99FFF4D0)
                    : const Color(0x3DFFF4D0),
                width: _focused ? 2 : 1,
              ),
              boxShadow: _focused
                  ? const [
                      BoxShadow(
                        color: Color(0x8AF7C35F),
                        blurRadius: 18,
                        offset: Offset(0, 8),
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
                      size: widget.large ? 29 : 23,
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
                              fontSize: 11,
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
  });

  final String message;
  final IconData icon;
  final String? actionLabel;
  final Future<void> Function()? onPressed;

  @override
  Widget build(BuildContext context) => Container(
    constraints: const BoxConstraints(maxWidth: 620),
    padding: const EdgeInsets.all(28),
    decoration: BoxDecoration(
      color: const Color(0xE6101B27),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: const Color(0xFF332D21)),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 58, color: const Color(0xFFF7C35F)),
        const SizedBox(height: 18),
        if (onPressed == null) const CircularProgressIndicator(),
        if (onPressed == null) const SizedBox(height: 16),
        Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 20),
        ),
        if (onPressed != null) ...[
          const SizedBox(height: 18),
          _TvPlayerButton(
            label: actionLabel ?? 'Prøv igen',
            icon: Icons.refresh,
            primary: true,
            onPressed: onPressed,
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
