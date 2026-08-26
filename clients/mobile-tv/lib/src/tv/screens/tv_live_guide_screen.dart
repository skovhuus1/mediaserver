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
  static const double _channelWidth = 202;
  static const double _rowHeight = 52;

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
      key == LogicalKeyboardKey.enter ||
      key == LogicalKeyboardKey.numpadEnter ||
      key == LogicalKeyboardKey.select ||
      key == LogicalKeyboardKey.space;

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
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color(0xFF111821),
                Color(0xFF06090E),
                TvDesignTokens.background,
              ],
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                left: -180,
                top: -170,
                width: 640,
                height: 430,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      colors: [
                        TvDesignTokens.cyan.withValues(alpha: 0.16),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                right: -220,
                bottom: -180,
                width: 640,
                height: 420,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      colors: [
                        TvDesignTokens.gold.withValues(alpha: 0.12),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
              SafeArea(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildHeader(),
                    _buildProgramInfo(),
                    _buildFilters(),
                    if (_error != null) _buildErrorBanner(),
                    const SizedBox(height: 8),
                    Expanded(
                      child: _loading && _guide == null
                          ? _buildLoadingState()
                          : _channels.isEmpty
                          ? _buildEmptyState()
                          : _buildGuide(),
                    ),
                    if ((_guide?.totalPages ?? 1) > 1) _buildPaging(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final activeFilter = _favoritesOnly
        ? 'Favoritter'
        : _group.isEmpty
        ? 'Alle kanaler'
        : _group;
    return Container(
      margin: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        8,
        TvDesignTokens.pageHorizontalPadding,
        6,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xF20E151D), Color(0xE8070A0F)],
        ),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: Colors.white10),
        boxShadow: const [
          BoxShadow(
            color: Color(0x59000000),
            blurRadius: 18,
            offset: Offset(0, 9),
          ),
        ],
      ),
      child: Row(
        children: [
          const Text(
            'Live TV',
            style: TextStyle(
              color: TvDesignTokens.goldSoft,
              fontSize: 12.5,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.1,
            ),
          ),
          const SizedBox(width: 10),
          _toolbarChip('I dag'),
          const SizedBox(width: 5),
          _toolbarChip(activeFilter),
          const SizedBox(width: 5),
          _toolbarChip('${_guide?.availableTotal ?? 0} kanaler'),
          const Spacer(),
          Text(
            _clock(DateTime.now()),
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 11.5,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(width: 10),
          const Icon(Icons.chevron_left_rounded, color: Colors.white54),
          const Icon(Icons.chevron_right_rounded, color: Colors.white54),
        ],
      ),
    );
  }

  Widget _toolbarChip(String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.055),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
    ),
    child: Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(
        color: Colors.white70,
        fontSize: 10.5,
        fontWeight: FontWeight.w800,
      ),
    ),
  );

  Widget _buildFilters() => SizedBox(
    height: 32,
    child: ListView.separated(
      padding: const EdgeInsets.symmetric(
        horizontal: TvDesignTokens.pageHorizontalPadding,
      ),
      scrollDirection: Axis.horizontal,
      itemCount: _filters.length,
      separatorBuilder: (_, _) => const SizedBox(width: 5),
      itemBuilder: (_, index) {
        final filter = _filters[index];
        final focused = _zone == _GuideZone.filters && index == _filterIndex;
        final selected =
            filter.group == _group && filter.favoritesOnly == _favoritesOnly;
        return AnimatedContainer(
          duration: TvDesignTokens.focusAnimationDuration,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: focused
                ? TvDesignTokens.goldSoft
                : selected
                ? Colors.white.withValues(alpha: 0.105)
                : Colors.white.withValues(alpha: 0.035),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: focused
                  ? Colors.white
                  : selected
                  ? TvDesignTokens.gold.withValues(alpha: 0.45)
                  : Colors.white.withValues(alpha: 0.10),
              width: focused ? 2 : 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                filter.favoritesOnly
                    ? Icons.favorite_rounded
                    : filter.group.isEmpty
                    ? Icons.grid_view_rounded
                    : Icons.label_rounded,
                size: 12,
                color: focused ? const Color(0xFF11100B) : Colors.white60,
              ),
              const SizedBox(width: 7),
              Text(
                filter.label,
                style: TextStyle(
                  color: focused ? const Color(0xFF11100B) : Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        );
      },
    ),
  );

  Widget _buildErrorBanner() => Container(
    margin: const EdgeInsets.fromLTRB(
      TvDesignTokens.pageHorizontalPadding,
      8,
      TvDesignTokens.pageHorizontalPadding,
      0,
    ),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: BoltColors.error.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: BoltColors.error.withValues(alpha: 0.35)),
    ),
    child: Row(
      children: [
        const Icon(Icons.warning_amber_rounded, color: BoltColors.error),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            _error!,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFFFFA3A8),
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );

  Widget _buildLoadingState() => Center(
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
      decoration: BoxDecoration(
        color: TvDesignTokens.surfaceGlass,
        borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
        border: Border.all(color: TvDesignTokens.panelBorderSoft),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2.5),
          ),
          SizedBox(width: 14),
          Text(
            'Indlæser TV-guide',
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ],
      ),
    ),
  );

  Widget _buildEmptyState() => Center(
    child: Container(
      width: 470,
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(
        color: TvDesignTokens.surfaceGlass,
        borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
        border: Border.all(color: TvDesignTokens.panelBorderSoft),
      ),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.live_tv_rounded, color: TvDesignTokens.goldSoft, size: 42),
          SizedBox(height: 12),
          Text(
            'Ingen kanaler i denne visning',
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
          ),
          SizedBox(height: 6),
          Text(
            'Skift filter eller prøv igen når guiden er opdateret.',
            textAlign: TextAlign.center,
            style: TextStyle(color: TvDesignTokens.textMuted),
          ),
        ],
      ),
    ),
  );

  Widget _buildGuide() {
    return Container(
      margin: const EdgeInsets.symmetric(
        horizontal: TvDesignTokens.pageHorizontalPadding,
      ),
      decoration: BoxDecoration(
        color: const Color(0xD80A0F15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.075)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          SizedBox(
            height: 30,
            child: Row(
              children: [
                Container(
                  width: _channelWidth,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.045),
                    border: Border(
                      right: BorderSide(
                        color: Colors.white.withValues(alpha: 0.07),
                      ),
                    ),
                  ),
                  alignment: Alignment.centerLeft,
                  child: Row(
                    children: [
                      const Text(
                        'Channels',
                        style: TextStyle(
                          color: Colors.white60,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        '${_channels.length}',
                        style: const TextStyle(
                          color: TvDesignTokens.goldSoft,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ],
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
                          Positioned.fill(
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.026),
                              ),
                            ),
                          ),
                          for (
                            var index = 0;
                            index <=
                                _windowEnd.difference(_windowStart).inMinutes ~/
                                    30;
                            index++
                          )
                            Positioned(
                              left: index * TvDesignTokens.epgHalfHourWidth + 9,
                              top: 7,
                              child: Text(
                                _clock(
                                  _windowStart.add(
                                    Duration(minutes: index * 30),
                                  ),
                                ),
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10.8,
                                  fontWeight: FontWeight.w800,
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
      ),
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
          margin: EdgeInsets.zero,
          padding: const EdgeInsets.symmetric(horizontal: 9),
          decoration: BoxDecoration(
            gradient: selectedRow && _program < 0
                ? const LinearGradient(
                    colors: [Color(0xFFFFE8A3), Color(0xFFFFC857)],
                  )
                : selectedRow
                ? const LinearGradient(
                    colors: [Color(0xCC162333), Color(0xAA0B1017)],
                  )
                : null,
            color: selectedRow ? null : Colors.white.withValues(alpha: 0.032),
            borderRadius: BorderRadius.zero,
            border: Border.all(
              color: selectedRow
                  ? TvDesignTokens.goldSoft
                  : Colors.white.withValues(alpha: 0.055),
              width: selectedRow ? 2 : 1,
            ),
            boxShadow: selectedRow
                ? const [
                    BoxShadow(
                      color: Color(0x3DFFC857),
                      blurRadius: 16,
                      offset: Offset(0, 7),
                    ),
                  ]
                : const [],
          ),
          child: Row(
            children: [
              SizedBox(
                width: 31,
                child: Text(
                  '${channel.number ?? '•'}',
                  style: TextStyle(
                    color: selectedRow && _program < 0
                        ? const Color(0xFF11100B)
                        : const Color(0xFFF7C35F),
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              _ChannelLogo(channel: channel),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  channel.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: selectedRow && _program < 0
                        ? const Color(0xFF11100B)
                        : Colors.white,
                    fontWeight: FontWeight.w900,
                    fontSize: 12.5,
                  ),
                ),
              ),
              Icon(
                channel.favorite ? Icons.favorite : Icons.favorite_border,
                size: 18,
                color: selectedRow && _program < 0
                    ? const Color(0xFF11100B)
                    : channel.favorite
                    ? BoltColors.error
                    : Colors.white30,
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
                    Positioned.fill(
                      child: CustomPaint(
                        painter: _GuideGridPainter(
                          halfHourWidth: TvDesignTokens.epgHalfHourWidth,
                        ),
                      ),
                    ),
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
      top: 0,
      width: width - 6,
      height: _rowHeight,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 2, 5, 2),
        child: AnimatedContainer(
          duration: TvDesignTokens.focusAnimationDuration,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: focused
                  ? const [Color(0xFFFFF1B8), Color(0xFFFFC857)]
                  : program.isCurrent
                  ? const [Color(0xE036414B), Color(0xC9232B33)]
                  : [
                      Colors.white.withValues(alpha: 0.085),
                      Colors.white.withValues(alpha: 0.045),
                    ],
            ),
            borderRadius: BorderRadius.circular(3),
            border: Border.all(
              color: focused
                  ? Colors.white
                  : program.isCurrent
                  ? TvDesignTokens.gold.withValues(alpha: 0.28)
                  : Colors.white.withValues(alpha: 0.035),
              width: focused ? 2 : 1,
            ),
            boxShadow: focused
                ? const [
                    BoxShadow(
                      color: Color(0x55FFC857),
                      blurRadius: 20,
                      offset: Offset(0, 8),
                    ),
                  ]
                : const [],
          ),
          child: Stack(
            children: [
              Positioned.fill(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      program.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: focused ? const Color(0xFF11100B) : Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 10.8,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      '${_clock(program.startsAt)}-${_clock(program.endsAt)}',
                      style: TextStyle(
                        color: focused
                            ? const Color(0xB311100B)
                            : Colors.white54,
                        fontSize: 9.8,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              if (program.isCurrent)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      minHeight: 3,
                      value: _programProgress(program),
                      backgroundColor: focused
                          ? const Color(0x3311100B)
                          : Colors.white.withValues(alpha: 0.10),
                      valueColor: AlwaysStoppedAnimation<Color>(
                        focused ? const Color(0xFF11100B) : TvDesignTokens.cyan,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  double _programProgress(LiveTvProgram program) {
    final total = program.endsAt.difference(program.startsAt).inMilliseconds;
    if (total <= 0) return 0;
    final elapsed = DateTime.now().difference(program.startsAt).inMilliseconds;
    return (elapsed / total).clamp(0.0, 1.0).toDouble();
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
        width: 3,
        decoration: const BoxDecoration(
          color: Color(0xFFFF5964),
          boxShadow: [BoxShadow(color: Color(0xAAFF5964), blurRadius: 10)],
        ),
      ),
    );
  }

  Widget _buildPaging() => Padding(
    padding: const EdgeInsets.symmetric(
      horizontal: TvDesignTokens.pageHorizontalPadding,
      vertical: 6,
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
          child: Text(
            'Side $_page af ${_guide?.totalPages ?? 1}',
            style: const TextStyle(
              color: TvDesignTokens.textMuted,
              fontWeight: FontWeight.w800,
            ),
          ),
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
    final isChannelAction = _program < 0 && channel != null;
    return Container(
      height: 98,
      margin: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        0,
        TvDesignTokens.pageHorizontalPadding,
        8,
      ),
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xF318222C), Color(0xF20A0F15)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 26,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        children: [
          _FeaturedChannelLogo(channel: channel),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (program?.isCurrent == true)
                      Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: BoltColors.error.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'LIVE NU',
                          style: TextStyle(
                            color: Color(0xFFFF8F8F),
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.1,
                          ),
                        ),
                      ),
                    Flexible(
                      child: Text(
                        program?.title ?? channel?.name ?? 'Live TV',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 16.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  program == null
                      ? channel?.name ?? 'Guide'
                      : '${_clock(program.startsAt)} til ${_clock(program.endsAt)} · ${_programDuration(program)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: TvDesignTokens.textMuted,
                    fontSize: 11.2,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  program?.subtitle ??
                      (isChannelAction
                          ? 'Tryk OK for at skifte favoritstatus.'
                          : program?.isFuture == true
                          ? 'Tryk OK for programdetaljer.'
                          : 'Tryk OK for at se kanalen. Brug pilene til at skifte program og kanal.'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white70,
                    height: 1.25,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          _FeaturedProgramPlate(
            channel: channel,
            program: program,
            progress: program?.isCurrent == true
                ? _programProgress(program!)
                : null,
          ),
          const SizedBox(width: 10),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _hintChip('↑↓', 'Kanal'),
              const SizedBox(height: 4),
              _hintChip('←→', 'Program'),
              const SizedBox(height: 4),
              _hintChip('OK', 'Vælg'),
            ],
          ),
        ],
      ),
    );
  }

  String _programDuration(LiveTvProgram program) {
    final minutes = program.endsAt.difference(program.startsAt).inMinutes;
    if (minutes <= 0) return 'Live';
    final remaining = program.endsAt.difference(DateTime.now()).inMinutes;
    if (program.isCurrent && remaining > 0) return '$remaining min tilbage';
    if (minutes >= 60) {
      final hours = minutes ~/ 60;
      final rest = minutes % 60;
      return rest == 0 ? '$hours t' : '$hours t $rest min';
    }
    return '$minutes min';
  }

  Widget _hintChip(String key, String label) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.055),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          key,
          style: const TextStyle(
            color: TvDesignTokens.goldSoft,
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(
            color: TvDesignTokens.textMuted,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
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

class _GuideGridPainter extends CustomPainter {
  const _GuideGridPainter({required this.halfHourWidth});

  final double halfHourWidth;

  @override
  void paint(Canvas canvas, Size size) {
    final horizontal = Paint()
      ..color = Colors.white.withValues(alpha: 0.035)
      ..strokeWidth = 1;
    final vertical = Paint()
      ..color = Colors.white.withValues(alpha: 0.045)
      ..strokeWidth = 1;
    canvas.drawLine(Offset.zero, Offset(size.width, 0), horizontal);
    canvas.drawLine(
      Offset(0, size.height),
      Offset(size.width, size.height),
      horizontal,
    );
    for (double x = 0; x <= size.width; x += halfHourWidth) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), vertical);
    }
  }

  @override
  bool shouldRepaint(covariant _GuideGridPainter oldDelegate) =>
      oldDelegate.halfHourWidth != halfHourWidth;
}

class _FeaturedChannelLogo extends StatelessWidget {
  const _FeaturedChannelLogo({required this.channel});

  final LiveTvChannel? channel;

  @override
  Widget build(BuildContext context) => Container(
    width: 80,
    height: 80,
    padding: const EdgeInsets.all(8),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF26313C), Color(0xFF111820)],
      ),
      borderRadius: BorderRadius.circular(9),
      border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      boxShadow: const [
        BoxShadow(
          color: Color(0x66000000),
          blurRadius: 18,
          offset: Offset(0, 9),
        ),
      ],
    ),
    child: channel?.logoUrl == null
        ? const Icon(
            Icons.live_tv_rounded,
            color: TvDesignTokens.gold,
            size: 38,
          )
        : Image.network(
            channel!.logoUrl!,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const Icon(
              Icons.live_tv_rounded,
              color: TvDesignTokens.gold,
              size: 38,
            ),
          ),
  );
}

class _FeaturedProgramPlate extends StatelessWidget {
  const _FeaturedProgramPlate({
    required this.channel,
    required this.program,
    required this.progress,
  });

  final LiveTvChannel? channel;
  final LiveTvProgram? program;
  final double? progress;

  @override
  Widget build(BuildContext context) => Container(
    width: 226,
    height: 80,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(9),
      border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      boxShadow: const [
        BoxShadow(
          color: Color(0x66000000),
          blurRadius: 18,
          offset: Offset(0, 9),
        ),
      ],
    ),
    child: Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                TvDesignTokens.gold.withValues(alpha: 0.30),
                TvDesignTokens.cyan.withValues(alpha: 0.14),
                const Color(0xFF0A0F15),
              ],
            ),
          ),
        ),
        Positioned(
          right: -18,
          top: -18,
          width: 112,
          height: 112,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.060),
            ),
          ),
        ),
        Center(
          child: Opacity(
            opacity: 0.34,
            child: channel?.logoUrl == null
                ? const Icon(Icons.play_circle_outline_rounded, size: 54)
                : Image.network(
                    channel!.logoUrl!,
                    width: 80,
                    height: 46,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const Icon(Icons.play_circle_outline_rounded, size: 54),
                  ),
          ),
        ),
        Positioned(
          left: 10,
          right: 10,
          bottom: 8,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                channel?.name ?? 'Live TV',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10.8,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 3),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 3,
                  value: progress ?? 0,
                  backgroundColor: Colors.white.withValues(alpha: 0.14),
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    TvDesignTokens.goldSoft,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (program?.isCurrent == true)
          Positioned(
            top: 7,
            left: 8,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: BoltColors.error.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: BoltColors.error.withValues(alpha: 0.34),
                ),
              ),
              child: const Text(
                'LIVE',
                style: TextStyle(
                  color: Color(0xFFFFA3A8),
                  fontSize: 8.8,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

class _ChannelLogo extends StatelessWidget {
  const _ChannelLogo({required this.channel});
  final LiveTvChannel channel;

  @override
  Widget build(BuildContext context) => Container(
    width: 28,
    height: 28,
    padding: const EdgeInsets.all(3),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(7),
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
