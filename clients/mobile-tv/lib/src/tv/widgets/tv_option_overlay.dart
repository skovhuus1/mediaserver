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
              Color(0xFC000000),
              Color(0xF5070B10),
              Color(0xD4121B24),
              Color(0x26000000),
            ],
            stops: [0, 0.32, 0.74, 1],
          ),
        ),
        child: SafeArea(
          minimum: const EdgeInsets.fromLTRB(42, 22, 42, 24),
          child: FocusTraversalGroup(
            policy: OrderedTraversalPolicy(),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 404,
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
                      const SizedBox(height: 24),
                      Text(
                        panelTitle,
                        style: TextStyle(
                          color: Color(0xFFFFE8A3),
                          fontSize: 20,
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
                        width: 362,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 14,
                        ),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xD0162029), Color(0xED05070A)],
                          ),
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
                      maxHeight: 600,
                    ),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xF51A232C), Color(0xFC06080B)],
                        ),
                        borderRadius: BorderRadius.circular(
                          TvDesignTokens.panelRadius,
                        ),
                        border: Border.all(color: const Color(0x3DFFFFFF)),
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

class TvPlaybackInfoRow {
  const TvPlaybackInfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;
}

class TvPlaybackInfoOverlay extends StatelessWidget {
  const TvPlaybackInfoOverlay({
    required this.playbackTitle,
    required this.rows,
    this.playbackSubtitle,
    super.key,
  });

  final String playbackTitle;
  final String? playbackSubtitle;
  final List<TvPlaybackInfoRow> rows;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
            colors: [
              Color(0xFC000000),
              Color(0xF5070B10),
              Color(0xD4121B24),
              Color(0x26000000),
            ],
            stops: [0, 0.32, 0.74, 1],
          ),
        ),
        child: SafeArea(
          minimum: const EdgeInsets.fromLTRB(42, 22, 42, 24),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 404,
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
                        letterSpacing: -1.5,
                      ),
                    ),
                    if (playbackSubtitle case final subtitle?) ...[
                      const SizedBox(height: 8),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          color: Color(0xCCFFFFFF),
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                    const SizedBox(height: 28),
                    const Text(
                      'Afspilningsinfo',
                      style: TextStyle(
                        color: TvDesignTokens.goldSoft,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Aktuelle oplysninger fra playeren. Session-id og adgangstokens vises aldrig.',
                      style: TextStyle(
                        color: Color(0xB8FFFFFF),
                        height: 1.35,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const Spacer(),
                    const Row(
                      children: [
                        Icon(
                          Icons.keyboard_return_rounded,
                          color: TvDesignTokens.goldSoft,
                          size: 18,
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Back vender tilbage til playeren',
                          style: TextStyle(
                            color: TvDesignTokens.textMuted,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  width: 510,
                  constraints: const BoxConstraints(maxHeight: 610),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [Color(0xF51A232C), Color(0xFC06080B)],
                    ),
                    borderRadius: BorderRadius.circular(
                      TvDesignTokens.panelRadius,
                    ),
                    border: Border.all(color: const Color(0x3DFFFFFF)),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0xCC000000),
                        blurRadius: 46,
                        offset: Offset(0, 20),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: _TvPlaybackOptionEyebrow(label: 'AKTUELT'),
                      ),
                      const SizedBox(height: 10),
                      for (final row in rows) _TvPlaybackInfoTile(row: row),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.icon(
                          autofocus: true,
                          onPressed: () => Navigator.of(context).pop(),
                          icon: const Icon(Icons.check_rounded),
                          label: const Text('Færdig'),
                        ),
                      ),
                    ],
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

class _TvPlaybackInfoTile extends StatelessWidget {
  const _TvPlaybackInfoTile({required this.row});

  final TvPlaybackInfoRow row;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xA60D1319),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x26FFFFFF)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0x1FFFD978),
            ),
            child: Icon(row.icon, color: TvDesignTokens.goldSoft, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              row.label,
              style: const TextStyle(
                color: TvDesignTokens.textMuted,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              row.value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13.5,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
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
      padding: const EdgeInsets.only(bottom: 6),
      child: AnimatedScale(
        duration: const Duration(milliseconds: 115),
        scale: _focused ? 1.018 : 1,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 115),
          decoration: BoxDecoration(
            color: _focused
                ? const Color(0xFFFFE8A3)
                : choice.selected
                ? const Color(0xFF241B10)
                : const Color(0xD00D1319),
            borderRadius: BorderRadius.circular(13),
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
              SingleActivator(LogicalKeyboardKey.numpadEnter): ActivateIntent(),
              SingleActivator(LogicalKeyboardKey.select): ActivateIntent(),
              SingleActivator(LogicalKeyboardKey.space): ActivateIntent(),
            },
            child: Semantics(
              button: true,
              selected: choice.selected,
              child: InkWell(
                autofocus: widget.autofocus,
                borderRadius: BorderRadius.circular(13),
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
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _focused
                              ? const Color(0x22000000)
                              : const Color(0x1AFFC857),
                        ),
                        child: Icon(
                          choice.icon,
                          size: 20,
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
