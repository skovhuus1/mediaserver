import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/brand_theme.dart';
import '../../shared_core/notification_contract.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../widgets/tv_premium_layout.dart';

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
      case LogicalKeyboardKey.numpadEnter:
      case LogicalKeyboardKey.select:
      case LogicalKeyboardKey.space:
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
    final unread = _notifications.unreadCount(_items);
    return TvPageScaffold(
      focusNode: _root,
      autofocus: true,
      onKeyEvent: _handleKey,
      eyebrow: 'AKTIVITET',
      title: 'Notifikationer',
      subtitle: 'Beskeder, statusændringer og nye hændelser',
      icon: Icons.notifications_rounded,
      trailing: TvStatusPill(
        label: unread == 1 ? '1 ulæst' : '$unread ulæste',
        icon: unread > 0
            ? Icons.notifications_active_rounded
            : Icons.done_all_rounded,
        emphasized: unread > 0,
      ),
      footer: _items.isEmpty
          ? null
          : Align(
              alignment: Alignment.centerLeft,
              child: TvActionPill(
                label: 'Markér alle som læst',
                icon: Icons.done_all_rounded,
                focused: _actionFocused,
                primary: true,
              ),
            ),
      body: Column(
        children: [
          if (_error != null) ...[
            TvInlineNotice(message: _error!, error: true),
            const SizedBox(height: 12),
          ],
          Expanded(
            child: _loading
                ? const TvStateView(
                    icon: Icons.notifications_outlined,
                    title: 'Henter notifikationer',
                    message: 'Synkroniserer beskeder fra serveren.',
                    busy: true,
                  )
                : _items.isEmpty
                ? const TvStateView(
                    icon: Icons.notifications_none_rounded,
                    title: 'Alt er stille',
                    message: 'Nye beskeder og statusændringer vises her.',
                  )
                : Row(
                    children: [
                      SizedBox(
                        width: 440,
                        child: ListView.separated(
                          padding: const EdgeInsets.only(bottom: 10),
                          itemCount: _items.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, index) {
                            final item = _items[index];
                            final focused =
                                !_actionFocused && index == _index;
                            return AnimatedScale(
                              scale: focused ? 1.018 : 1,
                              duration:
                                  TvDesignTokens.focusAnimationDuration,
                              child: AnimatedContainer(
                                duration:
                                    TvDesignTokens.focusAnimationDuration,
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 15,
                                  vertical: 13,
                                ),
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.centerLeft,
                                    end: Alignment.centerRight,
                                    colors: focused
                                        ? const [
                                            Color(0xFF302719),
                                            Color(0xF0111820),
                                          ]
                                        : item.unread
                                        ? const [
                                            Color(0xD9131A21),
                                            Color(0xD9080C10),
                                          ]
                                        : const [
                                            Color(0xB80C1117),
                                            Color(0xA807090C),
                                          ],
                                  ),
                                  borderRadius: BorderRadius.circular(
                                    TvDesignTokens.chromeRadius,
                                  ),
                                  border: Border.all(
                                    color: focused
                                        ? TvDesignTokens.goldSoft
                                        : item.unread
                                        ? const Color(0x4465C58A)
                                        : TvDesignTokens.panelBorderSoft,
                                    width: focused ? 2 : 1,
                                  ),
                                  boxShadow: focused
                                      ? const [
                                          BoxShadow(
                                            color: Color(0x44000000),
                                            blurRadius: 18,
                                            offset: Offset(0, 8),
                                          ),
                                        ]
                                      : const [],
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 38,
                                      height: 38,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: item.unread
                                            ? const Color(0x2265C58A)
                                            : Colors.white.withValues(
                                                alpha: 0.04,
                                              ),
                                      ),
                                      child: Icon(
                                        item.unread
                                            ? Icons.notifications_active_rounded
                                            : Icons.notifications_none_rounded,
                                        size: 20,
                                        color: item.unread
                                            ? BoltColors.success
                                            : Colors.white38,
                                      ),
                                    ),
                                    const SizedBox(width: 13),
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
                                              fontSize: 16.5,
                                              fontWeight: item.unread
                                                  ? FontWeight.w900
                                                  : FontWeight.w600,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            _date(item.createdAt),
                                            style: const TextStyle(
                                              color: TvDesignTokens.textMuted,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (item.unread)
                                      const Icon(
                                        Icons.circle,
                                        size: 8,
                                        color: TvDesignTokens.gold,
                                      ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 18),
                      Expanded(
                        child: TvPanel(
                          padding: const EdgeInsets.all(26),
                          selected: selected?.unread ?? false,
                          child: selected == null
                              ? const SizedBox.shrink()
                              : Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        TvStatusPill(
                                          label: _date(selected.createdAt),
                                          icon: Icons.schedule_rounded,
                                        ),
                                        const Spacer(),
                                        if (selected.unread)
                                          const TvStatusPill(
                                            label: 'Ulæst',
                                            icon:
                                                Icons.mark_email_unread_rounded,
                                            emphasized: true,
                                          ),
                                      ],
                                    ),
                                    const SizedBox(height: 24),
                                    Text(
                                      selected.title,
                                      style: const TextStyle(
                                        fontSize: 30,
                                        height: 1.05,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: -0.5,
                                      ),
                                    ),
                                    const SizedBox(height: 16),
                                    Text(
                                      selected.body,
                                      style: const TextStyle(
                                        fontSize: 17,
                                        height: 1.45,
                                        color: Colors.white70,
                                      ),
                                    ),
                                    const Spacer(),
                                    if (selected.unread)
                                      const Text(
                                        'OK  ·  Markér som læst',
                                        style: TextStyle(
                                          color: TvDesignTokens.goldSoft,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                  ],
                                ),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

int mathMax(int left, int right) => left > right ? left : right;

String _date(DateTime value) {
  final local = value.toLocal();
  return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}.${local.year} · ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
}
