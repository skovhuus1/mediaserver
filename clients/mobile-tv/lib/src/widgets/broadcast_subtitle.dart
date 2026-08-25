import 'package:flutter/material.dart';

double subtitleFontSize(double viewportHeight, int sizePercent) =>
    (viewportHeight * 0.036 * (sizePercent.clamp(75, 150) / 100)).clamp(
      22.0,
      52.0,
    );

double subtitleBottomPadding(double viewportHeight, int offsetPercent) =>
    (viewportHeight * (offsetPercent.clamp(4, 20) / 100)).clamp(
      24.0,
      viewportHeight * 0.2,
    );

Color subtitleColor(String value) {
  final normalized = value.trim().replaceFirst('#', '');
  final parsed = int.tryParse(normalized, radix: 16);
  return parsed == null || normalized.length != 6
      ? Colors.white
      : Color(0xFF000000 | parsed);
}

class BroadcastSubtitle extends StatelessWidget {
  const BroadcastSubtitle({
    required this.text,
    required this.style,
    required this.textColor,
    required this.sizePercent,
    required this.bottomOffsetPercent,
    super.key,
  });

  final String text;
  final String style;
  final String textColor;
  final int sizePercent;
  final int bottomOffsetPercent;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final fontSize = subtitleFontSize(constraints.maxHeight, sizePercent);
      final foreground = subtitleColor(textColor);
      final baseStyle = TextStyle(
        color: foreground,
        fontSize: fontSize,
        height: 1.12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
      );
      final outlined = Stack(
        alignment: Alignment.center,
        children: [
          Text(
            text,
            key: const ValueKey('broadcast-subtitle-outline'),
            textAlign: TextAlign.center,
            style: baseStyle.copyWith(
              foreground: Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = (fontSize * 0.095).clamp(2.0, 4.5)
                ..strokeJoin = StrokeJoin.round
                ..color = Colors.black.withValues(alpha: 0.96),
            ),
          ),
          Text(
            text,
            key: const ValueKey('broadcast-subtitle-text'),
            textAlign: TextAlign.center,
            style: baseStyle.copyWith(
              shadows: const [
                Shadow(
                  color: Colors.black,
                  blurRadius: 4,
                  offset: Offset(0, 2),
                ),
              ],
            ),
          ),
        ],
      );
      final background = switch (style) {
        'solid_box' => Colors.black.withValues(alpha: 0.82),
        'line_box' => Colors.black.withValues(alpha: 0.42),
        _ => Colors.transparent,
      };
      return SafeArea(
        minimum: EdgeInsets.only(
          bottom: subtitleBottomPadding(
            constraints.maxHeight,
            bottomOffsetPercent,
          ),
        ),
        child: Align(
          alignment: Alignment.bottomCenter,
          child: FractionallySizedBox(
            widthFactor: 0.82,
            child: Container(
              key: const ValueKey('broadcast-subtitle'),
              padding: background == Colors.transparent
                  ? EdgeInsets.zero
                  : EdgeInsets.symmetric(
                      horizontal: fontSize * 0.34,
                      vertical: fontSize * 0.14,
                    ),
              decoration: BoxDecoration(
                color: background,
                borderRadius: BorderRadius.circular(fontSize * 0.18),
              ),
              child: outlined,
            ),
          ),
        ),
      );
    },
  );
}
