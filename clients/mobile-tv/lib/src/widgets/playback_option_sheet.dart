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
      barrierColor: Colors.black.withValues(alpha: 0.68),
      builder: (_) => Dialog(
        alignment: Alignment.centerRight,
        insetPadding: const EdgeInsets.fromLTRB(32, 32, 54, 32),
        backgroundColor: Colors.transparent,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520, maxHeight: 760),
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
      color: const Color(0xFF0B1726),
      borderRadius: BorderRadius.circular(tv ? 24 : 18),
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(tv ? 24 : 18),
          border: Border.all(color: const Color(0x334DD9FF)),
          boxShadow: const [
            BoxShadow(color: Color(0x66000000), blurRadius: 34),
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
                    tv ? 28 : 20,
                    tv ? 28 : 12,
                    tv ? 28 : 20,
                    18,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: tv ? 28 : 22,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        description,
                        style: const TextStyle(
                          color: Colors.white60,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  tv ? 16 : 10,
                  0,
                  tv ? 16 : 10,
                  tv ? 20 : 12,
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
      padding: const EdgeInsets.only(bottom: 8),
      child: AnimatedScale(
        duration: const Duration(milliseconds: 110),
        scale: _focused && widget.tv ? 1.025 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 110),
          decoration: BoxDecoration(
            color: _focused
                ? const Color(0xFF123A55)
                : option.selected
                ? const Color(0xFF102A3D)
                : const Color(0xFF101D2C),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _focused
                  ? const Color(0xFF4DD9FF)
                  : option.selected
                  ? const Color(0x665DDBFF)
                  : const Color(0x1FFFFFFF),
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
                borderRadius: BorderRadius.circular(14),
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
                    horizontal: widget.tv ? 20 : 16,
                    vertical: widget.tv ? 15 : 12,
                  ),
                  child: Row(
                    children: [
                      Icon(option.icon, color: const Color(0xFF76E4FF)),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              option.title,
                              style: TextStyle(
                                fontSize: widget.tv ? 18 : 16,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            if (option.subtitle case final subtitle?) ...[
                              const SizedBox(height: 3),
                              Text(
                                subtitle,
                                style: const TextStyle(color: Colors.white60),
                              ),
                            ],
                          ],
                        ),
                      ),
                      if (option.selected)
                        const Icon(
                          Icons.check_circle,
                          color: Color(0xFF4DD9FF),
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
