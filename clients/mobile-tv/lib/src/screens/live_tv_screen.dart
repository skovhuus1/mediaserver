import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../core/api_client.dart';
import '../core/brand_theme.dart';
import '../core/models.dart';

class LiveTvView extends StatefulWidget {
  const LiveTvView({required this.api, super.key});

  final ApiClient api;

  @override
  State<LiveTvView> createState() => _LiveTvViewState();
}

class _LiveTvViewState extends State<LiveTvView> {
  LiveTvGuide? guide;
  LiveTvChannel? selected;
  String selectedGroup = '';
  bool favoritesOnly = false;
  bool loading = true;
  String? error;
  int page = 1;
  Timer? refreshTimer;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    refreshTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => unawaited(_load(silent: true)),
    );
  }

  @override
  void dispose() {
    refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }
    final now = DateTime.now().toUtc();
    final query = <String, String>{
      'from': now.subtract(const Duration(minutes: 30)).toIso8601String(),
      'to': now.add(const Duration(hours: 12)).toIso8601String(),
      'page': '$page',
      'pageSize': '75',
      if (selectedGroup.isNotEmpty) 'group': selectedGroup,
      if (favoritesOnly) 'favorites': 'true',
    };
    try {
      final result = LiveTvGuide.fromJson(
        await widget.api.getJson(
          '/live-tv/guide?${Uri(queryParameters: query).query}',
        ),
      );
      if (!mounted) return;
      setState(() {
        guide = result;
        selected = result.channels.firstWhere(
          (channel) => channel.id == selected?.id,
          orElse: () => result.channels.firstOrNull ?? LiveTvChannel.empty,
        );
        if (selected?.id.isEmpty ?? true) selected = null;
        loading = false;
        error = null;
      });
    } on ApiException catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = failure.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = 'Live TV-guiden kunne ikke indlæses.';
      });
    }
  }

  Future<void> _toggleFavorite(LiveTvChannel channel) async {
    try {
      if (channel.favorite) {
        await widget.api.deleteJson('/live-tv/favorites/${channel.id}');
      } else {
        await widget.api.putJson('/live-tv/favorites/${channel.id}');
      }
      if (!mounted) return;
      setState(() => channel.favorite = !channel.favorite);
    } on ApiException catch (failure) {
      if (mounted) setState(() => error = failure.message);
    }
  }

  Future<void> _watch(LiveTvChannel channel) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => LiveTvPlayerScreen(api: widget.api, channel: channel),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (loading && guide == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null && guide == null) {
      return _LiveTvError(message: error!, onRetry: _load);
    }
    final data = guide;
    final channels = data?.channels ?? const <LiveTvChannel>[];
    final groups = [const LiveTvGroup(name: '', count: 0), ...?data?.groups];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(28, 18, 28, 10),
          child: Row(
            children: [
              const Icon(
                Icons.live_tv_rounded,
                color: BoltColors.primaryBright,
                size: 30,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TV lige nu',
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    Text(
                      '${data?.availableTotal ?? 0} kanaler fra din server',
                      style: const TextStyle(color: Colors.white60),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Opdater guide',
                onPressed: loading ? null : _load,
                icon: loading
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 5),
            children: [
              _LiveFilterChip(
                label: 'Favoritter',
                icon: Icons.favorite,
                selected: favoritesOnly,
                onPressed: () {
                  setState(() {
                    favoritesOnly = !favoritesOnly;
                    page = 1;
                  });
                  unawaited(_load());
                },
              ),
              for (final group in groups)
                _LiveFilterChip(
                  label: group.name.isEmpty ? 'Alle' : group.name,
                  count: group.name.isEmpty
                      ? data?.availableTotal ?? 0
                      : group.count,
                  selected: !favoritesOnly && selectedGroup == group.name,
                  onPressed: () {
                    setState(() {
                      favoritesOnly = false;
                      selectedGroup = group.name;
                      page = 1;
                    });
                    unawaited(_load());
                  },
                ),
            ],
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 4, 28, 8),
            child: Text(
              error!,
              style: const TextStyle(color: BoltColors.error),
            ),
          ),
        Expanded(
          child: channels.isEmpty
              ? const _LiveTvEmpty()
              : LayoutBuilder(
                  builder: (context, constraints) {
                    final split = constraints.maxWidth >= 920;
                    final list = ListView.separated(
                      padding: const EdgeInsets.fromLTRB(28, 12, 18, 36),
                      itemCount: channels.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (_, index) {
                        final channel = channels[index];
                        return _LiveChannelTile(
                          channel: channel,
                          autofocus: index == 0,
                          selected: selected?.id == channel.id,
                          onFocus: () => setState(() => selected = channel),
                          onPressed: () => _watch(channel),
                        );
                      },
                    );
                    if (!split) return list;
                    return Row(
                      children: [
                        SizedBox(width: 430, child: list),
                        const VerticalDivider(width: 1),
                        Expanded(
                          child: _LiveChannelDetail(
                            channel: selected ?? channels.first,
                            onWatch: _watch,
                            onFavorite: _toggleFavorite,
                          ),
                        ),
                      ],
                    );
                  },
                ),
        ),
        if ((data?.totalPages ?? 1) > 1)
          Padding(
            padding: const EdgeInsets.fromLTRB(28, 6, 28, 18),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                OutlinedButton(
                  onPressed: page <= 1
                      ? null
                      : () {
                          setState(() => page -= 1);
                          unawaited(_load());
                        },
                  child: const Text('Forrige'),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  child: Text('Side $page af ${data?.totalPages ?? 1}'),
                ),
                OutlinedButton(
                  onPressed: page >= (data?.totalPages ?? 1)
                      ? null
                      : () {
                          setState(() => page += 1);
                          unawaited(_load());
                        },
                  child: const Text('Næste'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class LiveTvPlayerScreen extends StatefulWidget {
  const LiveTvPlayerScreen({
    required this.api,
    required this.channel,
    super.key,
  });

  final ApiClient api;
  final LiveTvChannel channel;

  @override
  State<LiveTvPlayerScreen> createState() => _LiveTvPlayerScreenState();
}

class _LiveTvPlayerScreenState extends State<LiveTvPlayerScreen> {
  VideoPlayerController? video;
  LiveTvSession? session;
  late LiveTvChannel channel;
  Timer? heartbeatTimer;
  String status = 'Finder en ledig TV-forbindelse...';
  String? error;
  bool controlsVisible = true;
  bool released = false;

  @override
  void initState() {
    super.initState();
    channel = widget.channel;
    unawaited(_authorize());
  }

  Future<void> _authorize() async {
    await _release();
    if (!mounted) return;
    setState(() {
      error = null;
      status = 'Finder en ledig TV-forbindelse...';
      released = false;
    });
    try {
      final next = LiveTvSession.fromJson(
        await widget.api.postJson('/live-tv/playback/authorize', {
          'channelId': channel.id,
          'preferredMethod': 'auto',
        }),
      );
      if (!mounted) return;
      session = next;
      await _prepare(next);
    } on ApiException catch (failure) {
      if (mounted) setState(() => error = failure.message);
    } catch (_) {
      if (mounted) setState(() => error = 'Live TV kunne ikke startes.');
    }
  }

  Future<void> _prepare(LiveTvSession current) async {
    var ready = current.status == 'ready' || current.status == 'active';
    for (var attempt = 0; !ready && attempt < 60; attempt += 1) {
      if (!mounted || session?.leaseId != current.leaseId) return;
      setState(() => status = 'Klargør ${channel.name}...');
      await Future<void>.delayed(const Duration(seconds: 1));
      final result = jsonMap(await widget.api.getJson(current.statusUrl));
      final nextStatus = stringValue(result['status']) ?? 'preparing';
      if (nextStatus == 'failed') {
        throw ApiException(
          stringValue(result['error']) ?? 'Live TV-streamen fejlede.',
        );
      }
      ready = nextStatus == 'ready' || nextStatus == 'active';
    }
    if (!ready) {
      throw const ApiException(
        'Live TV-streamen blev ikke klar inden for 60 sekunder.',
      );
    }
    await _openVideo(current);
  }

  Future<void> _openVideo(LiveTvSession current) async {
    final previous = video;
    video = null;
    await previous?.dispose();
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(current.streamUrl),
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: false),
    );
    await controller.initialize();
    if (!mounted || session?.leaseId != current.leaseId) {
      await controller.dispose();
      return;
    }
    controller.addListener(_videoChanged);
    video = controller;
    await controller.play();
    _startHeartbeat();
    setState(() => status = 'Live');
  }

  void _videoChanged() {
    if (mounted) setState(() {});
  }

  void _startHeartbeat() {
    heartbeatTimer?.cancel();
    heartbeatTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => unawaited(_heartbeat()),
    );
    unawaited(_heartbeat());
  }

  Future<void> _heartbeat() async {
    final current = session;
    if (current == null || released) return;
    try {
      await widget.api.patchJson(current.heartbeatUrl, {
        'runtimeState': video?.value.isBuffering == true
            ? 'buffering'
            : video?.value.isPlaying == true
            ? 'playing'
            : 'paused',
        'bufferAheadMs': 0,
        'stallCount': 0,
      });
    } catch (_) {}
  }

  Future<void> _switch(String direction) async {
    final current = session;
    if (current == null) return;
    try {
      setState(() => status = 'Skifter kanal...');
      final neighbor = LiveTvChannel.fromJson(
        await widget.api.getJson(
          '/live-tv/guide/channels/${channel.id}/neighbor?direction=$direction',
        ),
      );
      final next = LiveTvSession.fromJson(
        await widget.api
            .postJson('/live-tv/playback/leases/${current.leaseId}/switch', {
              'channelId': neighbor.id,
              'streamToken': current.streamToken,
              'preferredMethod': 'auto',
            }),
      );
      if (!mounted) return;
      channel = neighbor;
      session = next;
      await _prepare(next);
    } on ApiException catch (failure) {
      if (mounted) setState(() => error = failure.message);
    }
  }

  Future<void> _release() async {
    final current = session;
    heartbeatTimer?.cancel();
    if (current == null || released) return;
    released = true;
    try {
      await widget.api.deleteJson(current.releaseUrl);
    } catch (_) {}
  }

  void _togglePause() {
    final controller = video;
    if (controller == null) return;
    controller.value.isPlaying ? controller.pause() : controller.play();
    setState(() => controlsVisible = true);
  }

  void _seek(Duration delta) {
    final controller = video;
    if (controller == null || !controller.value.isInitialized) return;
    final target = controller.value.position + delta;
    final end = controller.value.duration;
    controller.seekTo(
      target < Duration.zero
          ? Duration.zero
          : target > end
          ? end
          : target,
    );
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    controlsVisible = true;
    if (event.logicalKey == LogicalKeyboardKey.select ||
        event.logicalKey == LogicalKeyboardKey.enter ||
        event.logicalKey == LogicalKeyboardKey.space) {
      _togglePause();
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowUp) {
      unawaited(_switch('previous'));
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
      unawaited(_switch('next'));
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
      _seek(const Duration(seconds: -10));
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
      _seek(const Duration(seconds: 10));
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  void dispose() {
    heartbeatTimer?.cancel();
    video?.removeListener(_videoChanged);
    unawaited(video?.dispose());
    unawaited(_release());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = video;
    final currentProgram = channel.currentProgram;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) unawaited(_release());
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Focus(
          autofocus: true,
          onKeyEvent: _handleKey,
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (controller?.value.isInitialized == true)
                Center(
                  child: AspectRatio(
                    aspectRatio: controller!.value.aspectRatio == 0
                        ? 16 / 9
                        : controller.value.aspectRatio,
                    child: VideoPlayer(controller),
                  ),
                ),
              if (controller == null)
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      colors: [Color(0xFF173E68), BoltColors.background],
                    ),
                  ),
                ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x99000000),
                      Colors.transparent,
                      Color(0xCC000000),
                    ],
                  ),
                ),
              ),
              if (error != null)
                Center(
                  child: _LiveTvError(message: error!, onRetry: _authorize),
                )
              else if (controller == null)
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.live_tv_rounded,
                        color: BoltColors.primaryBright,
                        size: 68,
                      ),
                      const SizedBox(height: 20),
                      const CircularProgressIndicator(),
                      const SizedBox(height: 18),
                      Text(status, style: const TextStyle(fontSize: 20)),
                    ],
                  ),
                ),
              if (controlsVisible && error == null) ...[
                Positioned(
                  left: 34,
                  right: 34,
                  top: 26,
                  child: Row(
                    children: [
                      _ChannelLogo(channel: channel, size: 58),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              channel.name,
                              style: const TextStyle(
                                fontSize: 25,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            Text(
                              currentProgram?.title ?? 'Live TV',
                              style: const TextStyle(color: Colors.white70),
                            ),
                          ],
                        ),
                      ),
                      const Text(
                        'LIVE',
                        style: TextStyle(
                          color: BoltColors.primaryBright,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 34,
                  right: 34,
                  bottom: 26,
                  child: Column(
                    children: [
                      if (controller?.value.isInitialized == true)
                        VideoProgressIndicator(
                          controller!,
                          allowScrubbing: true,
                          colors: const VideoProgressColors(
                            playedColor: BoltColors.primary,
                            bufferedColor: Color(0x8877BBFF),
                            backgroundColor: Colors.white24,
                          ),
                        ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          const Icon(Icons.keyboard_arrow_up),
                          const Text('Forrige kanal'),
                          const SizedBox(width: 20),
                          Icon(
                            controller?.value.isPlaying == true
                                ? Icons.pause_circle_filled
                                : Icons.play_circle_fill,
                            color: BoltColors.primaryBright,
                            size: 38,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            controller?.value.isPlaying == true
                                ? 'OK: Pause'
                                : 'OK: Afspil',
                          ),
                          const SizedBox(width: 20),
                          const Icon(Icons.keyboard_arrow_down),
                          const Text('Næste kanal'),
                          const Spacer(),
                          Text(
                            session?.method
                                    .replaceAll('_', ' ')
                                    .toUpperCase() ??
                                status.toUpperCase(),
                            style: const TextStyle(color: Colors.white60),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _LiveChannelTile extends StatefulWidget {
  const _LiveChannelTile({
    required this.channel,
    required this.autofocus,
    required this.selected,
    required this.onFocus,
    required this.onPressed,
  });

  final LiveTvChannel channel;
  final bool autofocus;
  final bool selected;
  final VoidCallback onFocus;
  final VoidCallback onPressed;

  @override
  State<_LiveChannelTile> createState() => _LiveChannelTileState();
}

class _LiveChannelTileState extends State<_LiveChannelTile> {
  bool focused = false;

  @override
  Widget build(BuildContext context) {
    final program = widget.channel.currentProgram;
    return InkWell(
      key: ValueKey('live-channel-${widget.channel.id}'),
      autofocus: widget.autofocus,
      onTap: widget.onPressed,
      onFocusChange: (value) {
        setState(() => focused = value);
        if (value) {
          widget.onFocus();
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              Scrollable.ensureVisible(
                context,
                alignment: 0.5,
                duration: const Duration(milliseconds: 160),
              );
            }
          });
        }
      },
      borderRadius: BorderRadius.circular(14),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 130),
        height: 82,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: focused
              ? BoltColors.panelRaised
              : widget.selected
              ? BoltColors.panel
              : BoltColors.backgroundRaised,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: focused ? BoltColors.focus : BoltColors.line,
            width: focused ? 3 : 1,
          ),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 36,
              child: Text(
                '${widget.channel.number ?? '•'}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: BoltColors.primaryBright,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            _ChannelLogo(channel: widget.channel, size: 50),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.channel.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    program?.title ?? 'Ingen programdata',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.play_arrow_rounded),
          ],
        ),
      ),
    );
  }
}

class _LiveChannelDetail extends StatelessWidget {
  const _LiveChannelDetail({
    required this.channel,
    required this.onWatch,
    required this.onFavorite,
  });

  final LiveTvChannel channel;
  final ValueChanged<LiveTvChannel> onWatch;
  final ValueChanged<LiveTvChannel> onFavorite;

  @override
  Widget build(BuildContext context) => Padding(
    key: ValueKey('live-detail-${channel.id}'),
    padding: const EdgeInsets.fromLTRB(28, 24, 32, 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _ChannelLogo(channel: channel, size: 76),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    channel.name,
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  Text(
                    channel.groupName ?? 'Live TV',
                    style: const TextStyle(color: Colors.white60),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        Row(
          children: [
            FilledButton.icon(
              onPressed: () => onWatch(channel),
              icon: const Icon(Icons.play_arrow),
              label: const Text('Se kanal'),
            ),
            const SizedBox(width: 12),
            OutlinedButton.icon(
              onPressed: () => onFavorite(channel),
              icon: Icon(
                channel.favorite ? Icons.favorite : Icons.favorite_border,
              ),
              label: Text(channel.favorite ? 'Favorit' : 'Tilføj favorit'),
            ),
          ],
        ),
        const SizedBox(height: 26),
        const Text(
          'Nu og senere',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 10),
        Expanded(
          child: channel.programs.isEmpty
              ? const Text(
                  'Ingen EPG-data. Kanalnavn og gruppe kommer fra M3U-kilden.',
                  style: TextStyle(color: Colors.white60),
                )
              : ListView.separated(
                  itemCount: channel.programs.take(8).length,
                  separatorBuilder: (_, _) => const Divider(),
                  itemBuilder: (_, index) {
                    final program = channel.programs[index];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: SizedBox(
                        width: 92,
                        child: Text(
                          '${_clock(program.startsAt)}–${_clock(program.endsAt)}',
                          style: TextStyle(
                            color: program.isCurrent
                                ? BoltColors.primaryBright
                                : Colors.white60,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      title: Text(program.title),
                      subtitle: program.subtitle == null
                          ? null
                          : Text(program.subtitle!),
                    );
                  },
                ),
        ),
      ],
    ),
  );
}

class _ChannelLogo extends StatelessWidget {
  const _ChannelLogo({required this.channel, required this.size});
  final LiveTvChannel channel;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    padding: const EdgeInsets.all(7),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
    ),
    child: channel.logoUrl == null
        ? const Icon(Icons.live_tv, color: BoltColors.panel)
        : Image.network(
            channel.logoUrl!,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) =>
                const Icon(Icons.live_tv, color: BoltColors.panel),
          ),
  );
}

class _LiveFilterChip extends StatelessWidget {
  const _LiveFilterChip({
    required this.label,
    required this.selected,
    required this.onPressed,
    this.count,
    this.icon,
  });
  final String label;
  final int? count;
  final IconData? icon;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: FilterChip(
      selected: selected,
      showCheckmark: false,
      avatar: icon == null ? null : Icon(icon, size: 16),
      label: Text(count == null ? label : '$label  $count'),
      onSelected: (_) => onPressed(),
    ),
  );
}

class _LiveTvError extends StatelessWidget {
  const _LiveTvError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.signal_wifi_bad, color: BoltColors.error, size: 54),
        const SizedBox(height: 16),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Prøv igen'),
        ),
      ],
    ),
  );
}

class _LiveTvEmpty extends StatelessWidget {
  const _LiveTvEmpty();

  @override
  Widget build(BuildContext context) => const Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.live_tv_outlined, size: 64, color: Colors.white38),
        SizedBox(height: 16),
        Text('Ingen kanaler i denne visning'),
        SizedBox(height: 6),
        Text(
          'Vælg en anden gruppe eller bed administratoren importere M3U-kilden.',
          style: TextStyle(color: Colors.white60),
        ),
      ],
    ),
  );
}

class LiveTvGuide {
  const LiveTvGuide({
    required this.availableTotal,
    required this.total,
    required this.page,
    required this.totalPages,
    required this.groups,
    required this.channels,
  });

  final int availableTotal;
  final int total;
  final int page;
  final int totalPages;
  final List<LiveTvGroup> groups;
  final List<LiveTvChannel> channels;

  factory LiveTvGuide.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvGuide(
      availableTotal: intValue(json['availableTotal']) ?? 0,
      total: intValue(json['total']) ?? 0,
      page: intValue(json['page']) ?? 1,
      totalPages: intValue(json['totalPages']) ?? 1,
      groups: jsonList(
        json['groups'],
      ).map(LiveTvGroup.fromJson).toList(growable: false),
      channels: jsonList(json['channels'])
          .map(LiveTvChannel.fromJson)
          .where((channel) => channel.id.isNotEmpty)
          .toList(growable: false),
    );
  }
}

class LiveTvGroup {
  const LiveTvGroup({required this.name, required this.count});
  final String name;
  final int count;

  factory LiveTvGroup.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvGroup(
      name: stringValue(json['name']) ?? '',
      count: intValue(json['count']) ?? 0,
    );
  }
}

class LiveTvChannel {
  LiveTvChannel({
    required this.id,
    required this.name,
    required this.number,
    required this.logoUrl,
    required this.groupName,
    required this.favorite,
    required this.programs,
  });

  static final empty = LiveTvChannel(
    id: '',
    name: '',
    number: null,
    logoUrl: null,
    groupName: null,
    favorite: false,
    programs: const [],
  );

  final String id;
  final String name;
  final int? number;
  final String? logoUrl;
  final String? groupName;
  bool favorite;
  final List<LiveTvProgram> programs;

  LiveTvProgram? get currentProgram =>
      programs.where((program) => program.isCurrent).firstOrNull;

  factory LiveTvChannel.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvChannel(
      id: stringValue(json['id']) ?? '',
      name: stringValue(json['name']) ?? 'Ukendt kanal',
      number: intValue(json['number']),
      logoUrl: stringValue(json['logoUrl']),
      groupName: stringValue(json['groupName']),
      favorite: boolValue(json['favorite']),
      programs: jsonList(
        json['programs'],
      ).map(LiveTvProgram.fromJson).toList(growable: false),
    );
  }
}

class LiveTvProgram {
  const LiveTvProgram({
    required this.id,
    required this.startsAt,
    required this.endsAt,
    required this.title,
    required this.subtitle,
  });

  final String id;
  final DateTime startsAt;
  final DateTime endsAt;
  final String title;
  final String? subtitle;

  bool get isCurrent {
    final now = DateTime.now();
    return !startsAt.isAfter(now) && endsAt.isAfter(now);
  }

  factory LiveTvProgram.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvProgram(
      id: stringValue(json['id']) ?? '',
      startsAt:
          DateTime.tryParse(stringValue(json['startsAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      endsAt:
          DateTime.tryParse(stringValue(json['endsAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      title: stringValue(json['title']) ?? 'Programinformation',
      subtitle: stringValue(json['subtitle']),
    );
  }
}

class LiveTvSession {
  const LiveTvSession({
    required this.leaseId,
    required this.method,
    required this.status,
    required this.streamToken,
    required this.streamUrl,
    required this.statusUrl,
    required this.heartbeatUrl,
    required this.releaseUrl,
  });

  final String leaseId;
  final String method;
  final String status;
  final String streamToken;
  final String streamUrl;
  final String statusUrl;
  final String heartbeatUrl;
  final String releaseUrl;

  factory LiveTvSession.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvSession(
      leaseId: stringValue(json['leaseId']) ?? '',
      method: stringValue(json['method']) ?? 'auto',
      status: stringValue(json['status']) ?? 'preparing',
      streamToken: stringValue(json['streamToken']) ?? '',
      streamUrl: stringValue(json['streamUrl']) ?? '',
      statusUrl: stringValue(json['statusUrl']) ?? '',
      heartbeatUrl: stringValue(json['heartbeatUrl']) ?? '',
      releaseUrl: stringValue(json['releaseUrl']) ?? '',
    );
  }
}

String _clock(DateTime value) =>
    '${value.toLocal().hour.toString().padLeft(2, '0')}:${value.toLocal().minute.toString().padLeft(2, '0')}';
