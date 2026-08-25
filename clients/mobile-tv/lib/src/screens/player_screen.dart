import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../core/api_client.dart';
import '../core/brand_theme.dart';
import '../core/models.dart';
import '../shared_core/playback/playback_session_controller.dart';
import '../widgets/broadcast_subtitle.dart';
import '../widgets/playback_option_sheet.dart';

/// Touch-first facade over the shared VOD session engine.
///
/// Authorization, polling, heartbeat, progress, retry, autoplay and terminal
/// release belong exclusively to [PlaybackSessionController].
class PlayerScreen extends StatefulWidget {
  const PlayerScreen({
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
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  PlaybackSessionController? _controller;
  Timer? _hideTimer;
  Future<void>? _closeOperation;
  bool _controlsVisible = true;
  bool _openingNext = false;

  PlaybackViewState get state =>
      _controller?.state ?? PlaybackViewState.initial;

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
    _scheduleHide();
    unawaited(
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky),
    );
  }

  void _onPlaybackChanged() {
    if (!mounted) return;
    setState(() {});
    final next = _controller?.state.nextItem;
    if (next != null && !_openingNext) {
      _openingNext = true;
      unawaited(_openNext(next));
    }
  }

  Future<void> _openNext(PlaybackQueueItem next) async {
    await _controller?.finish();
    if (!mounted) return;
    await Navigator.of(context).pushReplacement<void, void>(
      MaterialPageRoute(
        builder: (_) => PlayerScreen(
          api: widget.api,
          media: next.media,
          resumePositionMs: next.resumePositionMs,
          subtitleSelection: next.subtitleSelection,
        ),
      ),
    );
  }

  void _showControls() {
    if (!_controlsVisible) setState(() => _controlsVisible = true);
    _scheduleHide();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && state.playing && !state.buffering && state.error == null) {
        setState(() => _controlsVisible = false);
      }
    });
  }

  Future<void> _close() => _closeOperation ??= _finishAndClose();

  Future<void> _finishAndClose() async {
    await _controller?.finish();
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _selectSubtitles() async {
    final controller = _controller;
    final tracks =
        state.authorization?.subtitleTracks ?? const <SubtitleTrack>[];
    if (controller == null) return;
    const off = '__off__';
    final selected = await showPlaybackOptionSheet<String>(
      context: context,
      tv: false,
      title: 'Undertekster',
      description: tracks.isEmpty
          ? 'Der blev ikke fundet undertekster.'
          : 'Vælg det spor, der skal bruges under afspilning.',
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
    SubtitleTrack? selectedTrack;
    if (selected != off) {
      for (final track in tracks) {
        if (track.id == selected) selectedTrack = track;
      }
    }
    await controller.selectSubtitle(selectedTrack);
    _showControls();
  }

  Future<void> _selectQuality() async {
    final controller = _controller;
    final authorization = state.authorization;
    if (controller == null || authorization == null) return;
    final renditions = <int, Rendition>{};
    for (final rendition in authorization.renditions) {
      renditions[rendition.height] = rendition;
    }
    final ordered = renditions.values.toList()
      ..sort((left, right) => right.height.compareTo(left.height));
    final selected = await showPlaybackOptionSheet<String>(
      context: context,
      tv: false,
      title: 'Kvalitet',
      description: 'Automatisk tilpasser streamen efter buffer og netværk.',
      options: [
        const PlaybackOption<String>(
          value: 'auto',
          title: 'Automatisk',
          icon: Icons.auto_awesome,
        ),
        const PlaybackOption<String>(
          value: 'original',
          title: 'Original',
          icon: Icons.high_quality,
        ),
        for (final rendition in ordered)
          PlaybackOption<String>(
            value: '${rendition.height}',
            title: '${rendition.height}p',
            subtitle:
                '${(rendition.bitrate / 1000000).toStringAsFixed(1)} Mbps · ${rendition.hdr ? 'HDR' : 'SDR'}',
            icon: Icons.hd_outlined,
          ),
      ],
    );
    if (selected != null) await controller.selectQuality(selected);
    _showControls();
  }

  Future<void> _selectSpeed() async {
    final controller = _controller;
    if (controller == null) return;
    const speeds = <double>[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    final selected = await showPlaybackOptionSheet<double>(
      context: context,
      tv: false,
      title: 'Afspilningshastighed',
      description: 'Vælg hastighed for den aktuelle afspilning.',
      options: [
        for (final speed in speeds)
          PlaybackOption<double>(
            value: speed,
            title:
                '${speed.toStringAsFixed(speed == speed.roundToDouble() ? 0 : 2)}x',
            icon: Icons.speed,
            selected: (speed - state.playbackRate).abs() < 0.01,
          ),
      ],
    );
    if (selected != null) await controller.setPlaybackRate(selected);
    _showControls();
  }

  @override
  void dispose() {
    final controller = _controller;
    _hideTimer?.cancel();
    controller?.removeListener(_onPlaybackChanged);
    controller?.dispose();
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = _controller?.video;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (_, _) => unawaited(_close()),
      child: Scaffold(
        backgroundColor: Colors.black,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _showControls,
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
                child: IgnorePointer(
                  ignoring:
                      !_controlsVisible &&
                      !state.loading &&
                      !state.buffering &&
                      state.error == null,
                  child: _buildOverlay(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOverlay() => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xD0000000), Colors.transparent, Color(0xEC000000)],
        stops: [0, 0.45, 1],
      ),
    ),
    child: SafeArea(
      minimum: const EdgeInsets.all(12),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                tooltip: 'Tilbage',
                onPressed: _close,
                icon: const Icon(Icons.arrow_back),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _cleanTitle(widget.media.displayTitle),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    if (widget.media.isEpisode)
                      Text(
                        widget.media.episodeLabel,
                        style: const TextStyle(color: Colors.white60),
                      ),
                  ],
                ),
              ),
              if (state.qualityLabel.isNotEmpty)
                Text(
                  state.qualityLabel,
                  style: const TextStyle(
                    color: BoltColors.primaryBright,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          const Spacer(),
          if (state.error != null)
            _MobilePlayerMessage(
              message: state.error!,
              actionLabel: 'Prøv igen',
              onPressed: _controller?.retry,
            )
          else if (state.loading || !state.initialized)
            _MobilePlayerMessage(message: state.status)
          else ...[
            if (state.activeMarker != null)
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  onPressed: () => _controller?.seekTo(
                    Duration(milliseconds: state.activeMarker!.endMs),
                  ),
                  icon: const Icon(Icons.skip_next),
                  label: Text(
                    switch (state.activeMarker!.kind) {
                      'intro' => 'Spring intro over',
                      'recap' => 'Spring resumé over',
                      'credits' => 'Spring rulletekster over',
                      _ => 'Spring videre',
                    },
                  ),
                ),
              ),
            if (state.nextEpisodeCountdown != null)
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  onPressed: _controller?.playNextEpisode,
                  icon: const Icon(Icons.play_arrow),
                  label: Text(
                    'Næste episode om ${state.nextEpisodeCountdown} sek.',
                  ),
                ),
              ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton.filledTonal(
                  tooltip: '10 sekunder tilbage',
                  onPressed: state.seekable
                      ? () => _controller?.seekBy(const Duration(seconds: -10))
                      : null,
                  icon: const Icon(Icons.replay_10),
                ),
                const SizedBox(width: 18),
                IconButton.filled(
                  tooltip: state.playing ? 'Pause' : 'Afspil',
                  iconSize: 42,
                  onPressed: _controller?.togglePlayback,
                  icon: Icon(state.playing ? Icons.pause : Icons.play_arrow),
                ),
                const SizedBox(width: 18),
                IconButton.filledTonal(
                  tooltip: '30 sekunder frem',
                  onPressed: state.seekable
                      ? () => _controller?.seekBy(const Duration(seconds: 30))
                      : null,
                  icon: const Icon(Icons.forward_30),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildTimeline(),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  tooltip: 'Undertekster',
                  onPressed: _selectSubtitles,
                  icon: const Icon(Icons.subtitles_outlined),
                ),
                IconButton(
                  tooltip: 'Kvalitet',
                  onPressed: _selectQuality,
                  icon: const Icon(Icons.hd_outlined),
                ),
                TextButton.icon(
                  onPressed: _selectSpeed,
                  icon: const Icon(Icons.speed),
                  label: Text('${state.playbackRate.toStringAsFixed(2)}x'),
                ),
              ],
            ),
          ],
        ],
      ),
    ),
  );

  Widget _buildTimeline() {
    final durationMs = math.max(1, state.duration.inMilliseconds);
    final positionMs = state.position.inMilliseconds.clamp(0, durationMs);
    return Row(
      children: [
        Text(_clock(state.position)),
        Expanded(
          child: Slider(
            value: positionMs.toDouble(),
            max: durationMs.toDouble(),
            onChanged: state.seekable
                ? (value) => unawaited(
                    _controller!.seekTo(Duration(milliseconds: value.round())),
                  )
                : null,
          ),
        ),
        Text(_clock(state.duration)),
      ],
    );
  }
}

class _MobilePlayerMessage extends StatelessWidget {
  const _MobilePlayerMessage({
    required this.message,
    this.actionLabel,
    this.onPressed,
  });

  final String message;
  final String? actionLabel;
  final Future<void> Function()? onPressed;

  @override
  Widget build(BuildContext context) => Center(
    child: Container(
      constraints: const BoxConstraints(maxWidth: 420),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: const Color(0xE6101B27),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (onPressed == null) const CircularProgressIndicator(),
          if (onPressed == null) const SizedBox(height: 16),
          Text(message, textAlign: TextAlign.center),
          if (onPressed != null) ...[
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onPressed,
              icon: const Icon(Icons.refresh),
              label: Text(actionLabel ?? 'Prøv igen'),
            ),
          ],
        ],
      ),
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
