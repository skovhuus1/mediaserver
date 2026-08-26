import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../../core/api_client.dart';
import '../../shared_core/live_tv_recording_contract.dart';
import '../../shared_core/playback/recording_playback_controller.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';

class TvRecordingsScreen extends StatefulWidget {
  const TvRecordingsScreen({required this.api, this.recordings, super.key});

  final ApiClient api;
  final LiveTvRecordingContract? recordings;

  @override
  State<TvRecordingsScreen> createState() => _TvRecordingsScreenState();
}

enum _RecordingAction { play, cancel, remove }

class _TvRecordingsScreenState extends State<TvRecordingsScreen> {
  final FocusNode _root = FocusNode(debugLabel: 'tv-recordings-root');
  final List<FocusNode> _nodes = [];
  late final LiveTvRecordingContract _recordings;
  List<LiveTvRecording> _items = const [];
  int _selected = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _recordings = widget.recordings ?? LiveTvRecordingUseCase(api: widget.api);
    unawaited(_load());
  }

  void _syncNodes(int count) {
    while (_nodes.length > count) {
      _nodes.removeLast().dispose();
    }
    while (_nodes.length < count) {
      final index = _nodes.length;
      final node = FocusNode(debugLabel: 'tv-recording-$index');
      node.addListener(() {
        if (node.hasFocus && mounted) setState(() => _selected = index);
      });
      _nodes.add(node);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _recordings.load();
      if (!mounted) return;
      _items = items;
      _syncNodes(items.length + 1);
      setState(() => _loading = false);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _nodes.isNotEmpty) {
          _nodes[_selected.clamp(0, _nodes.length - 1)].requestFocus();
        }
      });
    } catch (failure) {
      if (!mounted) return;
      _syncNodes(1);
      setState(() {
        _loading = false;
        _error = failure is ApiException
            ? failure.message
            : 'Optagelserne kunne ikke indlæses.';
      });
    }
  }

  KeyEventResult _key(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowUp:
        _focus(_selected - 1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        _focus(_selected + 1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.numpadEnter:
      case LogicalKeyboardKey.select:
      case LogicalKeyboardKey.space:
        unawaited(_activate());
        return KeyEventResult.handled;
      case LogicalKeyboardKey.escape:
      case LogicalKeyboardKey.goBack:
      case LogicalKeyboardKey.browserBack:
        unawaited(Navigator.of(context).maybePop());
        return KeyEventResult.handled;
      default:
        return KeyEventResult.ignored;
    }
  }

  void _focus(int index) {
    if (_nodes.isEmpty) return;
    _nodes[index.clamp(0, _nodes.length - 1)].requestFocus();
  }

  Future<void> _activate() async {
    if (_selected == 0) return _load();
    final recording = _items.elementAtOrNull(_selected - 1);
    if (recording == null) return;
    final action = await showDialog<_RecordingAction>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(recording.title),
        content: Text(
          '${recording.channelName} · ${recording.statusLabel}'
          '${recording.error == null ? '' : '\n\n${recording.error}'}',
        ),
        actions: [
          if (recording.ready)
            FilledButton.icon(
              autofocus: true,
              onPressed: () => Navigator.pop(context, _RecordingAction.play),
              icon: const Icon(Icons.play_arrow_rounded),
              label: const Text('Afspil'),
            ),
          if (recording.cancellable)
            OutlinedButton(
              autofocus: !recording.ready,
              onPressed: () => Navigator.pop(context, _RecordingAction.cancel),
              child: const Text('Annuller optagelse'),
            ),
          if (recording.removable)
            TextButton(
              onPressed: () => Navigator.pop(context, _RecordingAction.remove),
              child: const Text('Slet'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Luk'),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    try {
      switch (action) {
        case _RecordingAction.play:
          final authorization = await _recordings.authorizePlayback(
            recording.id,
          );
          if (!mounted) return;
          await Navigator.of(context).push<void>(
            MaterialPageRoute(
              builder: (_) => _TvRecordingPlayerScreen(
                title: recording.title,
                authorization: authorization,
              ),
            ),
          );
        case _RecordingAction.cancel:
          await _recordings.cancel(recording.id);
        case _RecordingAction.remove:
          await _recordings.remove(recording.id);
      }
      await _load();
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
  }

  @override
  void dispose() {
    _root.dispose();
    for (final node in _nodes) {
      node.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Optagelser')),
      body: Focus(
        focusNode: _root,
        onKeyEvent: _key,
        child: _loading && _items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : ListView.separated(
                padding: const EdgeInsets.all(
                  TvDesignTokens.pageHorizontalPadding,
                ),
                itemCount: _items.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (_, index) {
                  if (index == 0) {
                    return _RecordingTile(
                      focusNode: _nodes[index],
                      focused: _selected == index,
                      icon: Icons.refresh_rounded,
                      title: 'Opdater optagelser',
                      subtitle: _error ?? '${_items.length} optagelser',
                    );
                  }
                  final item = _items[index - 1];
                  return _RecordingTile(
                    focusNode: _nodes[index],
                    focused: _selected == index,
                    icon: item.ready
                        ? Icons.play_circle_outline
                        : item.cancellable
                        ? Icons.fiber_manual_record
                        : Icons.error_outline,
                    title: item.title,
                    subtitle:
                        '${item.channelName} · ${item.statusLabel} · ${_date(item.startsAt)}',
                    progress: item.status == 'recording' ? item.progress : null,
                  );
                },
              ),
      ),
    );
  }

  String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')} '
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
}

class _RecordingTile extends StatelessWidget {
  const _RecordingTile({
    required this.focusNode,
    required this.focused,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.progress,
  });

  final FocusNode focusNode;
  final bool focused;
  final IconData icon;
  final String title;
  final String subtitle;
  final double? progress;

  @override
  Widget build(BuildContext context) => AnimatedScale(
    scale: focused ? 1.015 : 1,
    duration: TvDesignTokens.focusAnimationDuration,
    child: InkWell(
      focusNode: focusNode,
      onTap: focusNode.requestFocus,
      borderRadius: BorderRadius.circular(8),
      child: AnimatedContainer(
        duration: TvDesignTokens.focusAnimationDuration,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: focused ? const Color(0xFF17130D) : const Color(0xFF090B0E),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: focused ? const Color(0xFFFFF4D0) : const Color(0xFF332D21),
            width: focused ? TvDesignTokens.focusBorderWidth : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(icon, size: 34, color: const Color(0xFFF7C35F)),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(subtitle, style: const TextStyle(color: Colors.white60)),
                  if (progress != null) ...[
                    const SizedBox(height: 10),
                    LinearProgressIndicator(value: progress!.clamp(0, 1)),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded),
          ],
        ),
      ),
    ),
  );
}

class _TvRecordingPlayerScreen extends StatefulWidget {
  const _TvRecordingPlayerScreen({
    required this.title,
    required this.authorization,
  });

  final String title;
  final LiveTvRecordingAuthorization authorization;

  @override
  State<_TvRecordingPlayerScreen> createState() =>
      _TvRecordingPlayerScreenState();
}

class _TvRecordingPlayerScreenState extends State<_TvRecordingPlayerScreen> {
  late final RecordingPlaybackController _controller;
  final FocusNode _root = FocusNode(debugLabel: 'tv-recording-player');
  Timer? _overlayTimer;
  bool _overlay = true;
  bool _closing = false;

  @override
  void initState() {
    super.initState();
    _controller = RecordingPlaybackController(
      authorization: widget.authorization,
    )..addListener(_changed);
    unawaited(_controller.initialize());
    _showOverlay();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _showOverlay() {
    _overlayTimer?.cancel();
    if (mounted) setState(() => _overlay = true);
    _overlayTimer = Timer(const Duration(seconds: 5), () {
      if (mounted) setState(() => _overlay = false);
    });
  }

  KeyEventResult _key(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    _showOverlay();
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowLeft:
        unawaited(_controller.seekBy(const Duration(seconds: -10)));
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        unawaited(_controller.seekBy(const Duration(seconds: 30)));
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.numpadEnter:
      case LogicalKeyboardKey.select:
      case LogicalKeyboardKey.space:
        unawaited(_controller.togglePlayback());
        return KeyEventResult.handled;
      case LogicalKeyboardKey.escape:
      case LogicalKeyboardKey.goBack:
      case LogicalKeyboardKey.browserBack:
        if (_overlay) {
          setState(() => _overlay = false);
        } else {
          unawaited(_close());
        }
        return KeyEventResult.handled;
      default:
        return KeyEventResult.ignored;
    }
  }

  Future<void> _close() async {
    if (_closing) return;
    _closing = true;
    await _controller.finish();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _overlayTimer?.cancel();
    _controller
      ..removeListener(_changed)
      ..dispose();
    _root.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = _controller.state;
    final video = _controller.video;
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Focus(
          autofocus: true,
          focusNode: _root,
          onKeyEvent: _key,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (video != null && state.initialized)
                Center(
                  child: AspectRatio(
                    aspectRatio: video.value.aspectRatio,
                    child: VideoPlayer(video),
                  ),
                )
              else
                Center(
                  child: state.error == null
                      ? const CircularProgressIndicator()
                      : Text(state.error!),
                ),
              if (_overlay)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(48, 54, 48, 34),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xF0000000)],
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.title,
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 18),
                        LinearProgressIndicator(
                          value: state.duration > Duration.zero
                              ? state.position.inMilliseconds /
                                    state.duration.inMilliseconds
                              : 0,
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            const Icon(Icons.replay_10_rounded),
                            const SizedBox(width: 20),
                            Icon(
                              state.playing
                                  ? Icons.pause_circle_filled
                                  : Icons.play_circle_fill,
                              size: 48,
                            ),
                            const SizedBox(width: 20),
                            const Icon(Icons.forward_30_rounded),
                            const Spacer(),
                            const Text('← −10   OK Pause   +30 →'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
