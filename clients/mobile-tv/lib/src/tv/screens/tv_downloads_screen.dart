import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/brand_theme.dart';
import '../../core/offline_downloads.dart';
import '../../shared_core/offline_library_contract.dart';
import '../../shared_core/playback/offline_playback_controller.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../widgets/tv_premium_layout.dart';
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
  String? _initializationError;

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
    try {
      await _library.initialize();
      if (mounted) {
        setState(() {
          _loading = false;
          _initializationError = null;
        });
      }
    } catch (failure) {
      if (mounted) {
        setState(() {
          _loading = false;
          _initializationError = failure.toString();
        });
      }
    }
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

  int get _topActionCount => widget.onReconnect == null ? 1 : 2;

  Future<void> _activate() async {
    try {
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
    } catch (failure) {
      if (mounted) setState(() => _initializationError = failure.toString());
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
        final downloadError = _initializationError ?? _library.error;
        return TvPageScaffold(
          focusNode: _root,
          autofocus: true,
          onKeyEvent: _handleKey,
          eyebrow: widget.offline ? 'OFFLINE MODE' : 'DIT BIBLIOTEK',
          title: widget.offline ? 'Offlinebibliotek' : 'Downloads',
          subtitle: widget.offline
              ? 'Lokale titler, licenser og afspilningsstatus'
              : 'Administrér lokale kopier og se downloadstatus',
          icon: widget.offline
              ? Icons.cloud_off_rounded
              : Icons.download_for_offline_rounded,
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_library.syncing) ...[
                const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 12),
              ],
              TvStatusPill(
                label: '${records.length} titler',
                icon: Icons.video_library_outlined,
                emphasized: records.isNotEmpty,
              ),
            ],
          ),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (widget.onReconnect != null) ...[
                    _TopAction(
                      label: 'Forbind igen',
                      icon: Icons.cloud_sync_outlined,
                      focused: _topActions && _topIndex == 0,
                    ),
                    const SizedBox(width: 10),
                  ],
                  _TopAction(
                    label: 'Opdatér',
                    icon: Icons.refresh_rounded,
                    focused: _topActions && _topIndex == _topActionCount - 1,
                  ),
                ],
              ),
              if (downloadError != null) ...[
                const SizedBox(height: 12),
                TvInlineNotice(message: downloadError, error: true),
              ],
              const SizedBox(height: 14),
              Expanded(
                child: _loading
                    ? const TvStateView(
                        icon: Icons.downloading_rounded,
                        title: 'Indlæser downloads',
                        message: 'Kontrollerer lokale filer og licenser.',
                        busy: true,
                      )
                    : records.isEmpty
                    ? const TvStateView(
                        icon: Icons.download_done_rounded,
                        title: 'Ingen lokale titler endnu',
                        message:
                            'Downloadede film og afsnit vises her med status, kvalitet og licens.',
                      )
                    : ListView.separated(
                        controller: _scroll,
                        padding: const EdgeInsets.only(bottom: 12),
                        itemCount: records.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 9),
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
  Widget build(BuildContext context) =>
      TvActionPill(label: label, icon: icon, focused: focused, primary: true);
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
    height: 126,
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: focused
            ? const [Color(0xFF302719), Color(0xF0111820)]
            : const [Color(0xE80D1319), Color(0xD9070A0E)],
      ),
      borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
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
          width: 74,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFF040506),
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
            border: Border.all(color: Colors.white10),
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
  Widget build(BuildContext context) => TvActionPill(
    label: label,
    icon: icon,
    focused: focused,
    enabled: enabled,
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
