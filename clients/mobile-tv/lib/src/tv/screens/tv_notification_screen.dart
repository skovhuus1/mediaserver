import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/brand_theme.dart';
import '../../shared_core/notification_contract.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';

class TvNotificationScreen extends StatefulWidget {
  const TvNotificationScreen({
    required this.api,
    this.notifications,
    super.key,
  });

  final ApiClient api;
  final NotificationContract? notifications;

  @override
  State<TvNotificationScreen> createState() => _TvNotificationScreenState();
}

class _TvNotificationScreenState extends State<TvNotificationScreen> {
  final FocusNode _root = FocusNode(debugLabel: 'tv-notifications-root');
  late final NotificationContract _notifications;
  List<ClientNotification> _items = const [];
  int _index = 0;
  bool _actionFocused = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _notifications =
        widget.notifications ?? NotificationUseCase(api: widget.api);
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _notifications.load();
      if (!mounted) return;
      setState(() {
        _items = items;
        _index = _index.clamp(0, mathMax(0, items.length - 1));
        _loading = false;
      });
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = failure.toString();
      });
    }
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowUp:
        if (_actionFocused) {
          setState(() => _actionFocused = false);
        } else {
          setState(
            () => _index = (_index - 1).clamp(0, mathMax(0, _items.length - 1)),
          );
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        if (_items.isEmpty || _index >= _items.length - 1) {
          setState(() => _actionFocused = true);
        } else {
          setState(() => _index += 1);
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.select:
        if (_actionFocused) {
          unawaited(_markAllRead());
        } else {
          unawaited(_markSelectedRead());
        }
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

  Future<void> _markSelectedRead() async {
    final item = _items.elementAtOrNull(_index);
    if (item == null || !item.unread) return;
    try {
      await _notifications.markRead(item.id);
      if (!mounted) return;
      setState(() {
        _items = [
          for (final value in _items)
            value.id == item.id
                ? value.copyWith(readAt: DateTime.now())
                : value,
        ];
      });
    } catch (failure) {
      if (mounted) setState(() => _error = failure.toString());
    }
  }

  Future<void> _markAllRead() async {
    try {
      await _notifications.markAllRead();
      if (!mounted) return;
      final now = DateTime.now();
      setState(() {
        _items = _items
            .map((item) => item.unread ? item.copyWith(readAt: now) : item)
            .toList(growable: false);
      });
    } catch (failure) {
      if (mounted) setState(() => _error = failure.toString());
    }
  }

  @override
  void dispose() {
    _root.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selected = _items.elementAtOrNull(_index);
    return Scaffold(
      backgroundColor: Colors.transparent,
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
                          color: TvDesignTokens.gold.withValues(alpha: 0.24),
                        ),
                      ),
                      child: const Icon(
                        Icons.notifications_outlined,
                        size: 29,
                        color: TvDesignTokens.goldSoft,
                      ),
                    ),
                    const SizedBox(width: 13),
                    const Text(
                      'Notifikationer',
                      style: TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${_notifications.unreadCount(_items)} ulæste',
                      style: const TextStyle(color: Colors.white60),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: BoltColors.error),
                    ),
                  ),
                Expanded(
                  child: _loading
                      ? const Center(child: CircularProgressIndicator())
                      : _items.isEmpty
                      ? const Center(child: Text('Ingen notifikationer endnu.'))
                      : Row(
                          children: [
                            SizedBox(
                              width: 500,
                              child: ListView.separated(
                                itemCount: _items.length,
                                separatorBuilder: (_, _) =>
                                    const SizedBox(height: 9),
                                itemBuilder: (_, index) {
                                  final item = _items[index];
                                  final focused =
                                      !_actionFocused && index == _index;
                                  return AnimatedContainer(
                                    duration:
                                        TvDesignTokens.focusAnimationDuration,
                                    padding: const EdgeInsets.all(15),
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.centerLeft,
                                        end: Alignment.centerRight,
                                        colors: focused
                                            ? const [
                                                Color(0xFF2B2417),
                                                Color(0xFF0D1014),
                                              ]
                                            : const [
                                                Color(0xCC090B0E),
                                                Color(0x9907090C),
                                              ],
                                      ),
                                      borderRadius: BorderRadius.circular(
                                        TvDesignTokens.chromeRadius,
                                      ),
                                      border: Border.all(
                                        color: focused
                                            ? TvDesignTokens.goldSoft
                                            : TvDesignTokens.panelBorderSoft,
                                        width: focused ? 2 : 1,
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        Icon(
                                          item.unread
                                              ? Icons.notifications_active
                                              : Icons.notifications_none,
                                          color: item.unread
                                              ? BoltColors.success
                                              : Colors.white38,
                                        ),
                                        const SizedBox(width: 14),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                item.title,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                  fontSize: 18,
                                                  fontWeight: item.unread
                                                      ? FontWeight.w900
                                                      : FontWeight.w600,
                                                ),
                                              ),
                                              const SizedBox(height: 5),
                                              Text(
                                                _date(item.createdAt),
                                                style: const TextStyle(
                                                  color: Colors.white54,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                            ),
                            const SizedBox(width: 22),
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.all(24),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                    colors: [
                                      Color(0xF00B0F14),
                                      Color(0xE807090C),
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(
                                    TvDesignTokens.panelRadius,
                                  ),
                                  border: Border.all(
                                    color: TvDesignTokens.panelBorderSoft,
                                  ),
                                  boxShadow: const [
                                    BoxShadow(
                                      color: Color(0x88000000),
                                      blurRadius: 30,
                                      offset: Offset(0, 16),
                                    ),
                                  ],
                                ),
                                child: selected == null
                                    ? const SizedBox.shrink()
                                    : Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            selected.title,
                                            style: const TextStyle(
                                              fontSize: 30,
                                              fontWeight: FontWeight.w900,
                                            ),
                                          ),
                                          const SizedBox(height: 18),
                                          Text(
                                            selected.body,
                                            style: const TextStyle(
                                              fontSize: 19,
                                              height: 1.5,
                                              color: Colors.white70,
                                            ),
                                          ),
                                          const Spacer(),
                                          if (selected.unread)
                                            const Text(
                                              'Tryk OK for at markere som læst',
                                              style: TextStyle(
                                                color: Color(0xFFF7C35F),
                                              ),
                                            ),
                                        ],
                                      ),
                              ),
                            ),
                          ],
                        ),
                ),
                const SizedBox(height: 14),
                AnimatedContainer(
                  duration: TvDesignTokens.focusAnimationDuration,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: _actionFocused
                        ? TvDesignTokens.goldSoft
                        : TvDesignTokens.surfaceRaised,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: _actionFocused
                          ? Colors.white
                          : TvDesignTokens.panelBorderSoft,
                      width: _actionFocused ? 2 : 1,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.done_all,
                        color: _actionFocused
                            ? const Color(0xFF090806)
                            : Colors.white,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        'Markér alle som læst',
                        style: TextStyle(
                          color: _actionFocused
                              ? const Color(0xFF090806)
                              : Colors.white,
                          fontWeight: FontWeight.w900,
                        ),
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
}

int mathMax(int left, int right) => left > right ? left : right;

String _date(DateTime value) {
  final local = value.toLocal();
  return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}.${local.year} · ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
