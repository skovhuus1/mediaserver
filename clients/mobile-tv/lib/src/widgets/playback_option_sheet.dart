import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class PlaybackOption<T> {
  const PlaybackOption({
    required this.value,
    required this.title,
    required this.icon,
    this.subtitle,
    this.selected = false,
  });

  final T value;
  final String title;
  final String? subtitle;
  final IconData icon;
  final bool selected;
}

Future<T?> showPlaybackOptionSheet<T>({
  required BuildContext context,
  required bool tv,
  required String title,
  required String description,
  required List<PlaybackOption<T>> options,
}) {
  final content = _PlaybackOptionSheet<T>(
    title: title,
    description: description,
    options: options,
    tv: tv,
  );
  if (tv) {
    return showDialog<T>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.72),
      builder: (_) => Dialog(
        alignment: Alignment.centerRight,
        insetPadding: const EdgeInsets.fromLTRB(32, 28, 56, 28),
        backgroundColor: Colors.transparent,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 388, maxHeight: 620),
          child: content,
        ),
      ),
    );
  }
  return showModalBottomSheet<T>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => SafeArea(child: content),
  );
}

class _PlaybackOptionSheet<T> extends StatelessWidget {
  const _PlaybackOptionSheet({
    required this.title,
    required this.description,
    required this.options,
    required this.tv,
  });

  final String title;
  final String description;
  final List<PlaybackOption<T>> options;
  final bool tv;

  @override
  Widget build(BuildContext context) {
    final selectedIndex = options.indexWhere((option) => option.selected);
    final autofocusIndex = selectedIndex < 0 ? 0 : selectedIndex;
    return Material(
      color: tv ? const Color(0xF2090A0C) : const Color(0xFF0B1726),
      borderRadius: BorderRadius.circular(tv ? 12 : 18),
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(tv ? 12 : 18),
          border: Border.all(
            color: tv ? const Color(0x88403322) : const Color(0x334DD9FF),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0xB8000000),
              blurRadius: 30,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: FocusTraversalGroup(
          policy: OrderedTraversalPolicy(),
          child: CustomScrollView(
            shrinkWrap: true,
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    tv ? 18 : 20,
                    tv ? 17 : 12,
                    tv ? 18 : 20,
                    tv ? 12 : 18,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: tv ? 23 : 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        description,
                        style: TextStyle(
                          color: Colors.white60,
                          height: 1.28,
                          fontSize: tv ? 12.5 : null,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  tv ? 9 : 10,
                  0,
                  tv ? 9 : 10,
                  tv ? 9 : 12,
                ),
                sliver: SliverList.builder(
                  itemCount: options.length,
                  itemBuilder: (context, index) => FocusTraversalOrder(
                    order: NumericFocusOrder(index.toDouble()),
                    child: _PlaybackOptionTile<T>(
                      option: options[index],
                      autofocus: index == autofocusIndex,
                      tv: tv,
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
}

class _PlaybackOptionTile<T> extends StatefulWidget {
  const _PlaybackOptionTile({
    required this.option,
    required this.autofocus,
    required this.tv,
  });

  final PlaybackOption<T> option;
  final bool autofocus;
  final bool tv;

  @override
  State<_PlaybackOptionTile<T>> createState() => _PlaybackOptionTileState<T>();
}

class _PlaybackOptionTileState<T> extends State<_PlaybackOptionTile<T>> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final option = widget.option;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: AnimatedScale(
        duration: const Duration(milliseconds: 110),
        scale: _focused && widget.tv ? 1.018 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 110),
          decoration: BoxDecoration(
            color: _focused
                ? const Color(0xFFFFF4D0)
                : option.selected
                ? const Color(0xFF221D14)
                : const Color(0xFF0A0C0F),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: _focused
                  ? Colors.white
                  : option.selected
                  ? const Color(0x99F7C35F)
                  : const Color(0x333B3325),
              width: _focused ? 2 : 1,
            ),
          ),
          child: Shortcuts(
            shortcuts: const {
              SingleActivator(LogicalKeyboardKey.select): ActivateIntent(),
            },
            child: Semantics(
              button: true,
              selected: option.selected,
              child: InkWell(
                key: ValueKey('playback-option-${option.value}'),
                autofocus: widget.autofocus,
                borderRadius: BorderRadius.circular(8),
                onFocusChange: (focused) {
                  setState(() => _focused = focused);
                  if (!focused) return;
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    Scrollable.ensureVisible(
                      context,
                      alignment: 0.5,
                      duration: const Duration(milliseconds: 150),
                    );
                  });
                },
                onTap: () => Navigator.of(context).pop(option.value),
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: widget.tv ? 13 : 16,
                    vertical: widget.tv ? 9 : 12,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        option.icon,
                        size: widget.tv ? 20 : null,
                        color: _focused
                            ? const Color(0xFF090806)
                            : const Color(0xFFF7C35F),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              option.title,
                              style: TextStyle(
                                fontSize: widget.tv ? 15.5 : 16,
                                fontWeight: FontWeight.w800,
                                color: _focused
                                    ? const Color(0xFF090806)
                                    : Colors.white,
                              ),
                            ),
                            if (option.subtitle case final subtitle?) ...[
                              const SizedBox(height: 2),
                              Text(
                                subtitle,
                                style: TextStyle(
                                  color: _focused
                                      ? const Color(0xAA090806)
                                      : Colors.white60,
                                  fontSize: widget.tv ? 12 : null,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (option.selected)
                        const Icon(
                          Icons.check_circle,
                          color: Color(0xFFF7C35F),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
