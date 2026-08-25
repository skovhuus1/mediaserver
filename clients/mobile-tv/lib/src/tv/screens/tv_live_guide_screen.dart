import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/brand_theme.dart';
import '../../shared_core/live_tv_contract.dart';
import '../../shared_core/live_tv_recording_contract.dart';
import '../../shared_core/playback/live_tv_session_controller.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import 'tv_player_screen.dart';

enum _GuideZone { filters, grid, paging }

class TvLiveGuideScreen extends StatefulWidget {
  const TvLiveGuideScreen({
    required this.api,
    this.liveTv,
    this.recordings,
    super.key,
  });

  final ApiClient api;
  final LiveTvContract? liveTv;
  final LiveTvRecordingContract? recordings;

  @override
  State<TvLiveGuideScreen> createState() => _TvLiveGuideScreenState();
}

class _TvLiveGuideScreenState extends State<TvLiveGuideScreen> {
  static const double _channelWidth = 286;
  static const double _rowHeight = 88;

  final FocusNode _root = FocusNode(debugLabel: 'tv-live-guide-root');
  final ScrollController _vertical = ScrollController();
  final ScrollController _timeline = ScrollController();
  late final LiveTvContract _liveTv;
  late final LiveTvRecordingContract _recordings;
  LiveTvGuide? _guide;
  Timer? _refreshTimer;
  _GuideZone _zone = _GuideZone.grid;
  int _filterIndex = 1;
  int _row = 0;
  int _program = 0;
  int _pagingIndex = 0;
  int _page = 1;
  String _group = '';
  bool _favoritesOnly = false;
  bool _loading = true;
  String? _error;
  late DateTime _windowStart;
  late DateTime _windowEnd;

  List<LiveTvChannel> get _channels =>
      _guide?.channels ?? const <LiveTvChannel>[];

  List<_GuideFilter> get _filters => [
    const _GuideFilter(label: 'Favoritter', group: '', favoritesOnly: true),
    const _GuideFilter(label: 'Alle', group: '', favoritesOnly: false),
    for (final group in _guide?.groups ?? const <LiveTvGroup>[])
      _GuideFilter(
        label: '${group.name}  ${group.count}',
        group: group.name,
        favoritesOnly: false,
      ),
  ];

  @override
  void initState() {
    super.initState();
    _liveTv = widget.liveTv ?? LiveTvUseCase(api: widget.api);
    _recordings = widget.recordings ?? LiveTvRecordingUseCase(api: widget.api);
    _setWindow();
    _timeline.addListener(_timelineChanged);
    unawaited(_load());
    _refreshTimer = Timer.periodic(
      const Duration(minutes: 1),
      (_) => unawaited(_load(silent: true)),
    );
  }

  void _setWindow() {
    final now = DateTime.now();
    _windowStart = DateTime(
      now.year,
      now.month,
      now.day,
      now.hour,
      now.minute < 30 ? 0 : 30,
    ).subtract(const Duration(minutes: 30));
    _windowEnd = _windowStart.add(const Duration(hours: 12));
  }

  void _timelineChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _load({bool silent = false}) async {
    final selectedChannel = _channels.elementAtOrNull(_row)?.id;
    final selectedProgram = _channels
        .elementAtOrNull(_row)
        ?.programs
        .elementAtOrNull(_program)
        ?.id;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final guide = await _liveTv.loadGuide(
        from: _windowStart,
        to: _windowEnd,
        page: _page,
        group: _group,
        favoritesOnly: _favoritesOnly,
      );
      if (!mounted) return;
      setState(() {
        _guide = guide;
        _page = guide.page;
        _row = selectedChannel == null
            ? 0
            : guide.channels.indexWhere(
                (channel) => channel.id == selectedChannel,
              );
        if (_row < 0) _row = 0;
        final programs = guide.channels.elementAtOrNull(_row)?.programs ?? [];
        _program = selectedProgram == null
            ? _currentProgramIndex(programs)
            : programs.indexWhere((program) => program.id == selectedProgram);
        if (_program < 0) _program = _currentProgramIndex(programs);
        _loading = false;
        _error = null;
      });
      _ensureVisible();
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = failure.toString();
      });
    }
  }

  int _currentProgramIndex(List<LiveTvProgram> programs) {
    final current = programs.indexWhere((program) => program.isCurrent);
    return current < 0 ? 0 : current;
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.escape ||
        key == LogicalKeyboardKey.goBack ||
        key == LogicalKeyboardKey.browserBack) {
      unawaited(Navigator.of(context).maybePop());
      return KeyEventResult.handled;
    }
    switch (_zone) {
      case _GuideZone.filters:
        if (key == LogicalKeyboardKey.arrowLeft) {
          setState(
            () =>
                _filterIndex = (_filterIndex - 1).clamp(0, _filters.length - 1),
          );
        } else if (key == LogicalKeyboardKey.arrowRight) {
          setState(
            () =>
                _filterIndex = (_filterIndex + 1).clamp(0, _filters.length - 1),
          );
        } else if (key == LogicalKeyboardKey.arrowDown) {
          setState(() => _zone = _GuideZone.grid);
        } else if (_isActivate(key)) {
          unawaited(_applyFilter());
        } else {
          return KeyEventResult.ignored;
        }
      case _GuideZone.grid:
        if (key == LogicalKeyboardKey.arrowUp) {
          if (_row == 0) {
            setState(() => _zone = _GuideZone.filters);
          } else {
            setState(() => _row -= 1);
            _normalizeProgram();
            _ensureVisible();
          }
        } else if (key == LogicalKeyboardKey.arrowDown) {
          if (_row >= _channels.length - 1) {
            if ((_guide?.totalPages ?? 1) > 1) {
              setState(() => _zone = _GuideZone.paging);
            }
          } else {
            setState(() => _row += 1);
            _normalizeProgram();
            _ensureVisible();
          }
        } else if (key == LogicalKeyboardKey.arrowLeft) {
          setState(() => _program = (_program - 1).clamp(-1, 1 << 20));
          _ensureVisible();
        } else if (key == LogicalKeyboardKey.arrowRight) {
          final count = _channels.elementAtOrNull(_row)?.programs.length ?? 0;
          setState(
            () => _program = (_program + 1).clamp(-1, math.max(-1, count - 1)),
          );
          _ensureVisible();
        } else if (_isActivate(key)) {
          unawaited(_activateGrid());
        } else {
          return KeyEventResult.ignored;
        }
      case _GuideZone.paging:
        if (key == LogicalKeyboardKey.arrowLeft) {
          setState(() => _pagingIndex = 0);
        } else if (key == LogicalKeyboardKey.arrowRight) {
          setState(() => _pagingIndex = 1);
        } else if (key == LogicalKeyboardKey.arrowUp) {
          setState(() => _zone = _GuideZone.grid);
        } else if (_isActivate(key)) {
          unawaited(_changePage(_pagingIndex == 0 ? -1 : 1));
        } else {
          return KeyEventResult.ignored;
        }
    }
    return KeyEventResult.handled;
  }

  bool _isActivate(LogicalKeyboardKey key) =>
      key == LogicalKeyboardKey.enter || key == LogicalKeyboardKey.select;

  void _normalizeProgram() {
    final programs = _channels.elementAtOrNull(_row)?.programs ?? [];
    _program = _program.clamp(-1, math.max(-1, programs.length - 1));
  }

  Future<void> _applyFilter() async {
    final filter = _filters[_filterIndex];
    _group = filter.group;
    _favoritesOnly = filter.favoritesOnly;
    _page = 1;
    await _load();
  }

  Future<void> _changePage(int delta) async {
    final pages = _guide?.totalPages ?? 1;
    final next = (_page + delta).clamp(1, pages);
    if (next == _page) return;
    _page = next;
    _row = 0;
    _program = 0;
    await _load();
  }

  Future<void> _activateGrid() async {
    final channel = _channels.elementAtOrNull(_row);
    if (channel == null) return;
    if (_program < 0) {
      await _liveTv.setFavorite(channel.id, favorite: !channel.favorite);
      channel.favorite = !channel.favorite;
      if (mounted) setState(() {});
      return;
    }
    final program = channel.programs.elementAtOrNull(_program);
    if (program?.isFuture == true) {
      final schedule = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(program!.title),
          content: Text(
            '${_clock(program.startsAt)}–${_clock(program.endsAt)}\n\n${program.subtitle ?? 'Programmet er ikke startet endnu.'}',
          ),
          actions: [
            FilledButton.icon(
              autofocus: true,
              onPressed: () => Navigator.of(context).pop(true),
              icon: const Icon(Icons.fiber_manual_record),
              label: const Text('Optag'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Luk'),
            ),
          ],
        ),
      );
      if (schedule == true && program!.id.isNotEmpty) {
        try {
          await _recordings.scheduleProgram(program.id);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Optagelsen er planlagt.')),
            );
          }
        } on ApiException catch (failure) {
          if (mounted) {
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text(failure.message)));
          }
        }
      }
      return;
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvLivePlayerScreen(liveTv: _liveTv, channel: channel),
      ),
    );
  }

  void _ensureVisible() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_vertical.hasClients) {
        final target = (_row * _rowHeight)
            .clamp(0, _vertical.position.maxScrollExtent)
            .toDouble();
        unawaited(
          _vertical.animateTo(
            target,
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOut,
          ),
        );
      }
      if (_timeline.hasClients && _program >= 0) {
        final program = _channels
            .elementAtOrNull(_row)
            ?.programs
            .elementAtOrNull(_program);
        if (program != null) {
          final offset =
              program.startsAt.difference(_windowStart).inMinutes /
                  30 *
                  TvDesignTokens.epgHalfHourWidth -
              180;
          unawaited(
            _timeline.animateTo(
              offset.clamp(0, _timeline.position.maxScrollExtent).toDouble(),
              duration: const Duration(milliseconds: 170),
              curve: Curves.easeOut,
            ),
          );
        }
      }
    });
  }

  double get _timelineWidth =>
      _windowEnd.difference(_windowStart).inMinutes /
      30 *
      TvDesignTokens.epgHalfHourWidth;

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _timeline.removeListener(_timelineChanged);
    _timeline.dispose();
    _vertical.dispose();
    _root.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TvDesignTokens.background,
      body: Focus(
        focusNode: _root,
        autofocus: true,
        onKeyEvent: _handleKey,
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  TvDesignTokens.pageHorizontalPadding,
                  20,
                  TvDesignTokens.pageHorizontalPadding,
                  12,
                ),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 11,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: BoltColors.error.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: BoltColors.error.withValues(alpha: 0.32),
                        ),
                      ),
                      child: const Text(
                        'LIVE',
                        style: TextStyle(
                          color: Color(0xFFFF6A73),
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Text(
                      'TV-guide',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${_guide?.availableTotal ?? 0} kanaler · ${_clock(DateTime.now())}',
                      style: const TextStyle(color: Colors.white60),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 52,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(
                    horizontal: TvDesignTokens.pageHorizontalPadding,
                  ),
                  scrollDirection: Axis.horizontal,
                  itemCount: _filters.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (_, index) {
                    final filter = _filters[index];
                    final focused =
                        _zone == _GuideZone.filters && index == _filterIndex;
                    final selected =
                        filter.group == _group &&
                        filter.favoritesOnly == _favoritesOnly;
                    return AnimatedContainer(
                      duration: TvDesignTokens.focusAnimationDuration,
                      padding: const EdgeInsets.symmetric(horizontal: 17),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: focused
                            ? const Color(0xFF332A1A)
                            : selected
                            ? const Color(0x66332A1A)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(
                          color: focused
                              ? TvDesignTokens.goldSoft
                              : selected
                              ? Colors.white24
                              : Colors.white12,
                          width: focused ? 2 : 1,
                        ),
                      ),
                      child: Text(
                        filter.label,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    );
                  },
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: TvDesignTokens.pageHorizontalPadding,
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: BoltColors.error),
                  ),
                ),
              const SizedBox(height: 10),
              Expanded(
                child: _loading && _guide == null
                    ? const Center(child: CircularProgressIndicator())
                    : _channels.isEmpty
                    ? const Center(
                        child: Text('Ingen kanaler i denne visning.'),
                      )
                    : _buildGuide(),
              ),
              if ((_guide?.totalPages ?? 1) > 1) _buildPaging(),
              _buildProgramInfo(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGuide() {
    return Column(
      children: [
        SizedBox(
          height: 48,
          child: Row(
            children: [
              Container(
                width: _channelWidth,
                padding: const EdgeInsets.only(
                  left: TvDesignTokens.pageHorizontalPadding,
                ),
                alignment: Alignment.centerLeft,
                child: const Text(
                  'KANALER',
                  style: TextStyle(
                    color: Colors.white54,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.6,
                  ),
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  controller: _timeline,
                  scrollDirection: Axis.horizontal,
                  child: SizedBox(
                    width: _timelineWidth,
                    child: Stack(
                      children: [
                        for (
                          var index = 0;
                          index <=
                              _windowEnd.difference(_windowStart).inMinutes ~/
                                  30;
                          index++
                        )
                          Positioned(
                            left: index * TvDesignTokens.epgHalfHourWidth + 8,
                            top: 14,
                            child: Text(
                              _clock(
                                _windowStart.add(Duration(minutes: index * 30)),
                              ),
                              style: const TextStyle(
                                color: Colors.white54,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            controller: _vertical,
            itemCount: _channels.length,
            itemExtent: _rowHeight,
            itemBuilder: (_, index) => _buildChannelRow(index),
          ),
        ),
      ],
    );
  }

  Widget _buildChannelRow(int index) {
    final channel = _channels[index];
    final selectedRow = _zone == _GuideZone.grid && index == _row;
    final timelineOffset = _timeline.hasClients ? _timeline.offset : 0.0;
    return Row(
      children: [
        AnimatedContainer(
          duration: TvDesignTokens.focusAnimationDuration,
          width: _channelWidth,
          margin: const EdgeInsets.fromLTRB(
            TvDesignTokens.pageHorizontalPadding,
            1,
            8,
            1,
          ),
          padding: const EdgeInsets.symmetric(horizontal: 11),
          decoration: BoxDecoration(
            color: selectedRow && _program < 0
                ? const Color(0xDD2B2417)
                : Colors.white.withValues(alpha: 0.035),
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
            border: Border.all(
              color: selectedRow && _program < 0
                  ? TvDesignTokens.goldSoft
                  : Colors.transparent,
              width: selectedRow && _program < 0 ? 2 : 0,
            ),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 36,
                child: Text(
                  '${channel.number ?? '•'}',
                  style: const TextStyle(
                    color: Color(0xFFF7C35F),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              _ChannelLogo(channel: channel),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  channel.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              Icon(
                channel.favorite ? Icons.favorite : Icons.favorite_border,
                size: 18,
                color: channel.favorite ? BoltColors.error : Colors.white30,
              ),
            ],
          ),
        ),
        Expanded(
          child: ClipRect(
            child: Transform.translate(
              offset: Offset(-timelineOffset, 0),
              child: SizedBox(
                width: _timelineWidth,
                height: _rowHeight,
                child: Stack(
                  children: [
                    for (
                      var programIndex = 0;
                      programIndex < channel.programs.length;
                      programIndex++
                    )
                      _buildProgram(
                        channel.programs[programIndex],
                        selectedRow && _program == programIndex,
                      ),
                    _nowMarker(),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProgram(LiveTvProgram program, bool focused) {
    final left =
        program.startsAt.difference(_windowStart).inMinutes /
        30 *
        TvDesignTokens.epgHalfHourWidth;
    final width = math.max(
      90.0,
      program.endsAt.difference(program.startsAt).inMinutes /
          30 *
          TvDesignTokens.epgHalfHourWidth,
    );
    return Positioned(
      left: left,
      top: 4,
      width: width - 6,
      height: _rowHeight - 8,
      child: AnimatedContainer(
        duration: TvDesignTokens.focusAnimationDuration,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: focused
                ? const [Color(0xFF332A1A), Color(0xFF11151B)]
                : program.isCurrent
                ? const [Color(0xB8211A10), Color(0x8811161C)]
                : [
                    Colors.white.withValues(alpha: 0.055),
                    Colors.white.withValues(alpha: 0.028),
                  ],
          ),
          borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
          border: Border.all(
            color: focused
                ? TvDesignTokens.goldSoft
                : program.isCurrent
                ? Colors.white24
                : Colors.transparent,
            width: focused ? 2 : 1,
          ),
          boxShadow: focused
              ? const [
                  BoxShadow(
                    color: Color(0x44F7C35F),
                    blurRadius: 18,
                    offset: Offset(0, 7),
                  ),
                ]
              : const [],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              program.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            Text(
              '${_clock(program.startsAt)}–${_clock(program.endsAt)}',
              style: const TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  Widget _nowMarker() {
    final now = DateTime.now();
    if (now.isBefore(_windowStart) || now.isAfter(_windowEnd)) {
      return const SizedBox.shrink();
    }
    final left =
        now.difference(_windowStart).inMinutes /
        30 *
        TvDesignTokens.epgHalfHourWidth;
    return Positioned(
      left: left,
      top: 0,
      bottom: 0,
      child: Container(
        width: 2,
        decoration: const BoxDecoration(
          color: Color(0xFFFF5964),
          boxShadow: [BoxShadow(color: Color(0xAAFF5964), blurRadius: 8)],
        ),
      ),
    );
  }

  Widget _buildPaging() => Padding(
    padding: const EdgeInsets.symmetric(
      horizontal: TvDesignTokens.pageHorizontalPadding,
      vertical: 8,
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _PageButton(
          label: 'Forrige',
          focused: _zone == _GuideZone.paging && _pagingIndex == 0,
          enabled: _page > 1,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text('Side $_page af ${_guide?.totalPages ?? 1}'),
        ),
        _PageButton(
          label: 'Næste',
          focused: _zone == _GuideZone.paging && _pagingIndex == 1,
          enabled: _page < (_guide?.totalPages ?? 1),
        ),
      ],
    ),
  );

  Widget _buildProgramInfo() {
    final channel = _channels.elementAtOrNull(_row);
    final program = channel?.programs.elementAtOrNull(_program);
    return Container(
      height: 84,
      padding: const EdgeInsets.symmetric(
        horizontal: TvDesignTokens.pageHorizontalPadding,
      ),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xD9090B0E), TvDesignTokens.background],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  program?.title ?? channel?.name ?? 'Live TV',
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  program?.subtitle ??
                      (program?.isFuture == true
                          ? 'Tryk OK for programdetaljer'
                          : _program < 0
                          ? 'Tryk OK for at skifte favoritstatus'
                          : 'Tryk OK for at se kanalen'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white60),
                ),
              ],
            ),
          ),
          const Text(
            '↑↓ Kanal   ←→ Program   OK Vælg',
            style: TextStyle(
              color: TvDesignTokens.textMuted,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class TvLivePlayerScreen extends StatefulWidget {
  const TvLivePlayerScreen({
    required this.liveTv,
    required this.channel,
    super.key,
  });

  final LiveTvContract liveTv;
  final LiveTvChannel channel;

  @override
  State<TvLivePlayerScreen> createState() => _TvLivePlayerScreenState();
}

class _TvLivePlayerScreenState extends State<TvLivePlayerScreen> {
  late final LiveTvSessionController _controller;

  @override
  void initState() {
    super.initState();
    _controller = LiveTvSessionController(
      liveTv: widget.liveTv,
      channel: widget.channel,
    )..addListener(_changed);
    unawaited(_controller.initialize());
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TvPlaybackScaffold(
    controller: _controller,
    title: _controller.channel.name,
    subtitle: _controller.channel.currentProgram?.title ?? 'Live TV',
    live: true,
    onPreviousChannel: () =>
        _controller.switchChannel(LiveTvDirection.previous),
    onNextChannel: () => _controller.switchChannel(LiveTvDirection.next),
  );
}

class _GuideFilter {
  const _GuideFilter({
    required this.label,
    required this.group,
    required this.favoritesOnly,
  });

  final String label;
  final String group;
  final bool favoritesOnly;
}

class _ChannelLogo extends StatelessWidget {
  const _ChannelLogo({required this.channel});
  final LiveTvChannel channel;

  @override
  Widget build(BuildContext context) => Container(
    width: 42,
    height: 42,
    padding: const EdgeInsets.all(5),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
    ),
    child: channel.logoUrl == null
        ? const Icon(Icons.live_tv, color: Color(0xFF17130D))
        : Image.network(
            channel.logoUrl!,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) =>
                const Icon(Icons.live_tv, color: Color(0xFF17130D)),
          ),
  );
}

class _PageButton extends StatelessWidget {
  const _PageButton({
    required this.label,
    required this.focused,
    required this.enabled,
  });

  final String label;
  final bool focused;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
    decoration: BoxDecoration(
      color: !enabled
          ? Colors.white.withValues(alpha: 0.035)
          : focused
          ? const Color(0xFF362F22)
          : Colors.white.withValues(alpha: 0.06),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(
        color: focused ? const Color(0xFFFFF4D0) : Colors.white12,
        width: focused ? 2 : 1,
      ),
    ),
    child: Text(
      label,
      style: TextStyle(
        color: enabled ? Colors.white : Colors.white30,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

String _clock(DateTime value) {
  final local = value.toLocal();
  return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
