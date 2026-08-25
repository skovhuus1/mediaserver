import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/brand_theme.dart';
import '../../core/offline_downloads.dart';
import '../../shared_core/offline_library_contract.dart';
import '../../shared_core/playback/offline_playback_controller.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import 'tv_player_screen.dart';

class TvDownloadsScreen extends StatefulWidget {
  const TvDownloadsScreen({
    required this.api,
    required this.profileId,
    this.offline = false,
    this.onReconnect,
    this.library,
    super.key,
  });

  final ApiClient api;
  final String? profileId;
  final bool offline;
  final Future<void> Function()? onReconnect;
  final OfflineLibraryContract? library;

  @override
  State<TvDownloadsScreen> createState() => _TvDownloadsScreenState();
}

class _TvDownloadsScreenState extends State<TvDownloadsScreen> {
  final FocusNode _root = FocusNode(debugLabel: 'tv-downloads-root');
  final ScrollController _scroll = ScrollController();
  late final OfflineLibraryContract _library;
  bool _loading = true;
  bool _topActions = true;
  int _topIndex = 0;
  int _recordIndex = 0;
  int _recordAction = 0;

  List<OfflineDownloadRecord> get _records =>
      _library.recordsForProfile(widget.profileId);

  @override
  void initState() {
    super.initState();
    _library =
        widget.library ??
        OfflineLibraryUseCase(api: widget.api, online: !widget.offline);
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    await _library.initialize();
    if (mounted) setState(() => _loading = false);
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final records = _records;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowLeft:
        setState(() {
          if (_topActions) {
            _topIndex = (_topIndex - 1).clamp(0, _topActionCount - 1);
          } else {
            _recordAction = (_recordAction - 1).clamp(0, 1);
          }
        });
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        setState(() {
          if (_topActions) {
            _topIndex = (_topIndex + 1).clamp(0, _topActionCount - 1);
          } else {
            _recordAction = (_recordAction + 1).clamp(0, 1);
          }
        });
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowUp:
        setState(() {
          if (!_topActions && _recordIndex <= 0) {
            _topActions = true;
          } else if (!_topActions) {
            _recordIndex -= 1;
            _ensureVisible();
          }
        });
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        if (records.isNotEmpty) {
          setState(() {
            if (_topActions) {
              _topActions = false;
              _recordIndex = 0;
            } else {
              _recordIndex = (_recordIndex + 1).clamp(0, records.length - 1);
              _ensureVisible();
            }
          });
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.select:
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

  int get _topActionCount => widget.onReconnect == null ? 1 : 2;

  Future<void> _activate() async {
    if (_topActions) {
      if (widget.onReconnect != null && _topIndex == 0) {
        await widget.onReconnect!();
      } else {
        await _library.sync();
      }
      return;
    }
    final record = _records.elementAtOrNull(_recordIndex);
    if (record == null) return;
    if (_recordAction == 0) {
      if (!record.playable) return;
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) =>
              TvOfflinePlayerScreen(library: _library, record: record),
        ),
      );
    } else {
      await _library.remove(record);
      if (mounted) {
        setState(() {
          _recordIndex = _recordIndex.clamp(
            0,
            (_records.length - 1).clamp(0, 1 << 20),
          );
          if (_records.isEmpty) _topActions = true;
        });
      }
    }
  }

  void _ensureVisible() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final target = (_recordIndex * 154.0)
          .clamp(0, _scroll.position.maxScrollExtent)
          .toDouble();
      unawaited(
        _scroll.animateTo(
          target,
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOut,
        ),
      );
    });
  }

  @override
  void dispose() {
    _root.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _library.changes,
      builder: (context, _) {
        final records = _records;
        return Scaffold(
          backgroundColor: TvDesignTokens.background,
          body: Focus(
            focusNode: _root,
            autofocus: true,
            onKeyEvent: _handleKey,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: TvDesignTokens.pageHorizontalPadding,
                  vertical: TvDesignTokens.pageVerticalPadding,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: TvDesignTokens.gold.withValues(alpha: 0.13),
                            borderRadius: BorderRadius.circular(
                              TvDesignTokens.chromeRadius,
                            ),
                            border: Border.all(
                              color: TvDesignTokens.gold.withValues(
                                alpha: 0.24,
                              ),
                            ),
                          ),
                          child: Icon(
                            widget.offline
                                ? Icons.cloud_off
                                : Icons.download_for_offline_outlined,
                            size: 29,
                            color: TvDesignTokens.goldSoft,
                          ),
                        ),
                        const SizedBox(width: 13),
                        Text(
                          widget.offline ? 'Offlinebibliotek' : 'Downloads',
                          style: const TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.4,
                          ),
                        ),
                        const Spacer(),
                        if (_library.syncing)
                          const SizedBox.square(
                            dimension: 24,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        const SizedBox(width: 14),
                        Text(
                          '${records.length} titler',
                          style: const TextStyle(color: Colors.white60),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        if (widget.onReconnect != null) ...[
                          _TopAction(
                            label: 'Forbind igen',
                            icon: Icons.cloud_sync_outlined,
                            focused: _topActions && _topIndex == 0,
                          ),
                          const SizedBox(width: 12),
                        ],
                        _TopAction(
                          label: 'Opdatér',
                          icon: Icons.refresh,
                          focused:
                              _topActions && _topIndex == _topActionCount - 1,
                        ),
                      ],
                    ),
                    if (_library.error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(
                          _library.error!,
                          style: const TextStyle(color: BoltColors.error),
                        ),
                      ),
                    const SizedBox(height: 18),
                    Expanded(
                      child: _loading
                          ? const Center(child: CircularProgressIndicator())
                          : records.isEmpty
                          ? const Center(
                              child: Text(
                                'Ingen offline-titler endnu.',
                                style: TextStyle(
                                  color: Colors.white60,
                                  fontSize: 20,
                                ),
                              ),
                            )
                          : ListView.separated(
                              controller: _scroll,
                              itemCount: records.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(height: 9),
                              itemBuilder: (_, index) => _DownloadRow(
                                record: records[index],
                                focused: !_topActions && index == _recordIndex,
                                actionIndex: index == _recordIndex
                                    ? _recordAction
                                    : -1,
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class TvOfflinePlayerScreen extends StatefulWidget {
  const TvOfflinePlayerScreen({
    required this.library,
    required this.record,
    super.key,
  });

  final OfflineLibraryContract library;
  final OfflineDownloadRecord record;

  @override
  State<TvOfflinePlayerScreen> createState() => _TvOfflinePlayerScreenState();
}

class _TvOfflinePlayerScreenState extends State<TvOfflinePlayerScreen> {
  late final OfflinePlaybackController _controller;

  @override
  void initState() {
    super.initState();
    _controller = OfflinePlaybackController(
      library: widget.library,
      record: widget.record,
    );
    unawaited(_controller.initialize());
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TvPlaybackScaffold(
    controller: _controller,
    title: widget.record.displayTitle,
    subtitle:
        '${widget.record.qualityHeight}p · offline til ${_date(widget.record.licenseExpiresAt)}',
  );
}

class _TopAction extends StatelessWidget {
  const _TopAction({
    required this.label,
    required this.icon,
    required this.focused,
  });

  final String label;
  final IconData icon;
  final bool focused;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: TvDesignTokens.focusAnimationDuration,
    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
    decoration: BoxDecoration(
      color: focused ? TvDesignTokens.goldSoft : TvDesignTokens.surfaceRaised,
      borderRadius: BorderRadius.circular(999),
      border: Border.all(
        color: focused ? Colors.white : TvDesignTokens.panelBorderSoft,
        width: focused ? 2 : 1,
      ),
      boxShadow: focused
          ? const [
              BoxShadow(
                color: Color(0x44F7C35F),
                blurRadius: 16,
                offset: Offset(0, 7),
              ),
            ]
          : const [],
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: focused ? const Color(0xFF090806) : Colors.white),
        const SizedBox(width: 10),
        Text(
          label,
          style: TextStyle(
            color: focused ? const Color(0xFF090806) : Colors.white,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    ),
  );
}

class _DownloadRow extends StatelessWidget {
  const _DownloadRow({
    required this.record,
    required this.focused,
    required this.actionIndex,
  });

  final OfflineDownloadRecord record;
  final bool focused;
  final int actionIndex;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: TvDesignTokens.focusAnimationDuration,
    height: 128,
    padding: const EdgeInsets.all(15),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: focused
            ? const [Color(0xFF2B2417), Color(0xFF0D1014)]
            : const [Color(0xCC090B0E), Color(0x9907090C)],
      ),
      borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
      border: Border.all(
        color: focused
            ? TvDesignTokens.goldSoft
            : TvDesignTokens.panelBorderSoft,
        width: focused ? 2 : 1,
      ),
      boxShadow: focused
          ? const [
              BoxShadow(
                color: Color(0x44000000),
                blurRadius: 22,
                offset: Offset(0, 10),
              ),
            ]
          : const [],
    ),
    child: Row(
      children: [
        Container(
          width: 70,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFF040506),
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
          ),
          child: Icon(
            record.playable
                ? Icons.offline_pin
                : record.status == 'failed'
                ? Icons.error_outline
                : Icons.downloading,
            size: 36,
            color: record.playable
                ? BoltColors.success
                : record.status == 'failed'
                ? BoltColors.error
                : const Color(0xFFFFD77B),
          ),
        ),
        const SizedBox(width: 18),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                record.displayTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${record.qualityHeight}p · ${_status(record)} · ${_size(record.sizeBytes)}',
                style: const TextStyle(color: Colors.white60),
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  minHeight: 5,
                  value: record.progress.clamp(0, 100) / 100,
                  backgroundColor: Colors.white10,
                  color: record.status == 'failed'
                      ? BoltColors.error
                      : TvDesignTokens.cyan,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                record.error ??
                    'Licens ${record.licenseValid ? 'gyldig til' : 'udløbet'} ${_date(record.licenseExpiresAt)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: record.error == null
                      ? Colors.white54
                      : BoltColors.error,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 18),
        _RowAction(
          label: 'Afspil',
          icon: Icons.play_arrow,
          focused: focused && actionIndex == 0,
          enabled: record.playable,
        ),
        const SizedBox(width: 10),
        _RowAction(
          label: 'Slet',
          icon: Icons.delete_outline,
          focused: focused && actionIndex == 1,
          enabled: true,
        ),
      ],
    ),
  );
}

class _RowAction extends StatelessWidget {
  const _RowAction({
    required this.label,
    required this.icon,
    required this.focused,
    required this.enabled,
  });

  final String label;
  final IconData icon;
  final bool focused;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: !enabled
          ? Colors.white10
          : focused
          ? TvDesignTokens.goldSoft
          : const Color(0xAA040506),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(
        color: focused ? Colors.white : TvDesignTokens.panelBorderSoft,
        width: focused ? 2 : 1,
      ),
    ),
    child: Row(
      children: [
        Icon(
          icon,
          color: !enabled
              ? Colors.white30
              : focused
              ? const Color(0xFF090806)
              : Colors.white,
          size: 19,
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            color: !enabled
                ? Colors.white30
                : focused
                ? const Color(0xFF090806)
                : Colors.white,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

String _status(OfflineDownloadRecord record) => switch (record.status) {
  'queued' => 'Venter',
  'preparing' => 'Forbereder ${record.progress} %',
  'ready' => 'Klar til overførsel',
  'downloading' => 'Henter ${record.progress} %',
  'downloaded' => record.playable ? 'Klar offline' : 'Ikke afspillelig',
  'failed' => 'Fejlet',
  _ => record.status,
};

String _size(int? bytes) {
  if (bytes == null || bytes <= 0) return 'ukendt størrelse';
  if (bytes >= 1024 * 1024 * 1024) {
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }
  return '${(bytes / (1024 * 1024)).toStringAsFixed(0)} MB';
}

String _date(DateTime value) =>
    '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';
