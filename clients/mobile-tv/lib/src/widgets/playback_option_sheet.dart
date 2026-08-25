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
      barrierColor: Colors.black.withValues(alpha: 0.62),
      builder: (_) => Dialog(
        alignment: Alignment.centerRight,
        insetPadding: const EdgeInsets.fromLTRB(32, 26, 48, 26),
        backgroundColor: Colors.transparent,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420, maxHeight: 660),
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
      color: tv ? const Color(0xF4070A0F) : const Color(0xFF0B1726),
      borderRadius: BorderRadius.circular(tv ? 22 : 18),
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: tv
              ? const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xF6151A20), Color(0xF006080C)],
                )
              : null,
          borderRadius: BorderRadius.circular(tv ? 22 : 18),
          border: Border.all(
            color: tv ? const Color(0x66FFE8A3) : const Color(0x334DD9FF),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0xB8000000),
              blurRadius: 46,
              offset: Offset(0, 20),
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
                    tv ? 20 : 20,
                    tv ? 18 : 12,
                    tv ? 20 : 20,
                    tv ? 13 : 18,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: tv ? 22 : 22,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.35,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        description,
                        style: TextStyle(
                          color: tv ? const Color(0xFF9FB1C1) : Colors.white60,
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
                  tv ? 10 : 10,
                  0,
                  tv ? 10 : 10,
                  tv ? 10 : 12,
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
        duration: const Duration(milliseconds: 105),
        scale: _focused && widget.tv ? 1.025 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 105),
          decoration: BoxDecoration(
            color: _focused
                ? const Color(0xFFFFE8A3)
                : option.selected
                ? const Color(0xFF21190D)
                : const Color(0xE60A0E14),
            borderRadius: BorderRadius.circular(widget.tv ? 16 : 8),
            border: Border.all(
              color: _focused
                  ? Colors.white
                  : option.selected
                  ? const Color(0xAAFFC857)
                  : const Color(0x4039414A),
              width: _focused ? 2 : 1,
            ),
            boxShadow: _focused && widget.tv
                ? const [
                    BoxShadow(
                      color: Color(0x55FFC857),
                      blurRadius: 18,
                      offset: Offset(0, 8),
                    ),
                  ]
                : const [],
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
                borderRadius: BorderRadius.circular(widget.tv ? 16 : 8),
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
                    horizontal: widget.tv ? 14 : 16,
                    vertical: widget.tv ? 10 : 12,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        option.icon,
                        size: widget.tv ? 20 : null,
                        color: _focused
                            ? const Color(0xFF090806)
                            : const Color(0xFFFFC857),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              option.title,
                              style: TextStyle(
                                fontSize: widget.tv ? 15 : 16,
                                fontWeight: FontWeight.w900,
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
                        Icon(
                          Icons.check_circle,
                          color: _focused
                              ? const Color(0xFF090806)
                              : const Color(0xFFFFC857),
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
