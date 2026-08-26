import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../shared_core/ui_tokens/tv_design_tokens.dart';

class TvOptionOverlay<T> extends StatelessWidget {
  const TvOptionOverlay({
    required this.playbackTitle,
    required this.panelTitle,
    required this.panelDescription,
    required this.previewText,
    required this.choices,
    this.playbackSubtitle,
    super.key,
  });

  final String playbackTitle;
  final String? playbackSubtitle;
  final String panelTitle;
  final String panelDescription;
  final String previewText;
  final List<TvPlaybackChoice<T>> choices;

  @override
  Widget build(BuildContext context) {
    final selectedIndex = choices.indexWhere((choice) => choice.selected);
    final autofocusIndex = selectedIndex < 0 ? 0 : selectedIndex;

    return Material(
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [
              Color(0xFA000000),
              Color(0xEE070A0F),
              Color(0x99101820),
              Color(0x24000000),
            ],
            stops: [0, 0.38, 0.70, 1],
          ),
        ),
        child: SafeArea(
          minimum: const EdgeInsets.fromLTRB(52, 30, 52, 34),
          child: FocusTraversalGroup(
            policy: OrderedTraversalPolicy(),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 392,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _TvPlaybackOptionEyebrow(label: 'AFSPILNING'),
                      const SizedBox(height: 10),
                      Text(
                        playbackTitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 38,
                          height: 0.95,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1.6,
                        ),
                      ),
                      if (playbackSubtitle case final subtitle?) ...[
                        const SizedBox(height: 8),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Color(0xCCFFFFFF),
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                      const SizedBox(height: 26),
                      Text(
                        panelTitle,
                        style: TextStyle(
                          color: Color(0xFFFFE8A3),
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        panelDescription,
                        style: const TextStyle(
                          color: Color(0xB8FFFFFF),
                          height: 1.32,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        width: 326,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0x66000000),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0x33FFFFFF)),
                        ),
                        child: Text(
                          previewText,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            shadows: [
                              Shadow(
                                color: Colors.black,
                                blurRadius: 8,
                                offset: Offset(0, 2),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                Align(
                  alignment: Alignment.centerRight,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                      maxWidth: 430,
                      maxHeight: 570,
                    ),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: const Color(0xE6070A0F),
                        borderRadius: BorderRadius.circular(
                          TvDesignTokens.panelRadius,
                        ),
                        border: Border.all(color: const Color(0x55FFE8A3)),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0xCC000000),
                            blurRadius: 46,
                            offset: Offset(0, 20),
                          ),
                        ],
                      ),
                      child: CustomScrollView(
                        shrinkWrap: true,
                        slivers: [
                          const SliverToBoxAdapter(
                            child: Padding(
                              padding: EdgeInsets.fromLTRB(20, 18, 20, 10),
                              child: _TvPlaybackOptionEyebrow(label: 'VÆLG'),
                            ),
                          ),
                          SliverPadding(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                            sliver: SliverList.builder(
                              itemCount: choices.length,
                              itemBuilder: (context, index) =>
                                  FocusTraversalOrder(
                                    order: NumericFocusOrder(index.toDouble()),
                                    child: TvPlaybackChoiceTile<T>(
                                      choice: choices[index],
                                      autofocus: index == autofocusIndex,
                                    ),
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
        ),
      ),
    );
  }
}

class TvPlaybackChoice<T> {
  const TvPlaybackChoice({
    required this.value,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selected,
  });

  final T value;
  final String title;
  final String subtitle;
  final IconData icon;
  final bool selected;
}

class _TvPlaybackOptionEyebrow extends StatelessWidget {
  const _TvPlaybackOptionEyebrow({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Container(
        width: 4,
        height: 18,
        decoration: BoxDecoration(
          color: TvDesignTokens.gold,
          borderRadius: BorderRadius.circular(999),
        ),
      ),
      const SizedBox(width: 9),
      Text(
        label,
        style: const TextStyle(
          color: Color(0xFFFFE8A3),
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 1.6,
        ),
      ),
    ],
  );
}

class TvPlaybackChoiceTile<T> extends StatefulWidget {
  const TvPlaybackChoiceTile({
    required this.choice,
    required this.autofocus,
    super.key,
  });

  final TvPlaybackChoice<T> choice;
  final bool autofocus;

  @override
  State<TvPlaybackChoiceTile<T>> createState() =>
      TvPlaybackChoiceTileState<T>();
}

class TvPlaybackChoiceTileState<T> extends State<TvPlaybackChoiceTile<T>> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final choice = widget.choice;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AnimatedScale(
        duration: const Duration(milliseconds: 115),
        scale: _focused ? 1.025 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 115),
          decoration: BoxDecoration(
            color: _focused
                ? const Color(0xFFFFE8A3)
                : choice.selected
                ? const Color(0xFF241B10)
                : const Color(0xC80E1319),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: _focused
                  ? Colors.white
                  : choice.selected
                  ? const Color(0xCCFFC857)
                  : const Color(0x4039414A),
              width: _focused ? 2 : 1,
            ),
            boxShadow: _focused
                ? const [
                    BoxShadow(
                      color: Color(0x55FFC857),
                      blurRadius: 22,
                      offset: Offset(0, 10),
                    ),
                  ]
                : const [],
          ),
          child: Shortcuts(
            shortcuts: const {
              SingleActivator(LogicalKeyboardKey.enter): ActivateIntent(),
              SingleActivator(LogicalKeyboardKey.numpadEnter):
                  ActivateIntent(),
              SingleActivator(LogicalKeyboardKey.select): ActivateIntent(),
              SingleActivator(LogicalKeyboardKey.space): ActivateIntent(),
            },
            child: Semantics(
              button: true,
              selected: choice.selected,
              child: InkWell(
                autofocus: widget.autofocus,
                borderRadius: BorderRadius.circular(18),
                onFocusChange: (focused) {
                  setState(() => _focused = focused);
                  if (!focused) return;
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (!mounted) return;
                    Scrollable.ensureVisible(
                      context,
                      alignment: 0.5,
                      duration: const Duration(milliseconds: 120),
                    );
                  });
                },
                onTap: () => Navigator.of(context).pop(choice.value),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _focused
                              ? const Color(0x22000000)
                              : const Color(0x1AFFC857),
                        ),
                        child: Icon(
                          choice.icon,
                          size: 21,
                          color: _focused
                              ? const Color(0xFF090806)
                              : TvDesignTokens.gold,
                        ),
                      ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              choice.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: _focused
                                    ? const Color(0xFF090806)
                                    : Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              choice.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: _focused
                                    ? const Color(0xAA090806)
                                    : Colors.white60,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (choice.selected)
                        Icon(
                          Icons.check_circle_rounded,
                          color: _focused
                              ? const Color(0xFF090806)
                              : TvDesignTokens.gold,
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
