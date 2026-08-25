import 'package:flutter/material.dart';

import '../../shared_core/ui_tokens/tv_design_tokens.dart';

class TvCinematicChrome extends StatelessWidget {
  const TvCinematicChrome({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                TvDesignTokens.background,
                Color(0xFF071019),
                Color(0xFF120D07),
                TvDesignTokens.background,
              ],
              stops: [0, 0.38, 0.72, 1],
            ),
          ),
        ),
        const Positioned(
          top: -340,
          right: -230,
          child: _TvAmbientOrb(size: 760, color: Color(0x204EA1FF)),
        ),
        const Positioned(
          bottom: -360,
          left: -130,
          child: _TvAmbientOrb(size: 720, color: Color(0x2EFFC857)),
        ),
        Positioned.fill(child: CustomPaint(painter: _TvCinemaTexturePainter())),
        Positioned.fill(
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  radius: 1.18,
                  center: Alignment.topCenter,
                  colors: [
                    Colors.white.withValues(alpha: 0.045),
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.58),
                  ],
                  stops: const [0, 0.48, 1],
                ),
              ),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

class TvGlassSurface extends StatelessWidget {
  const TvGlassSurface({
    required this.child,
    this.padding = EdgeInsets.zero,
    this.radius = TvDesignTokens.panelRadius,
    this.focused = false,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final bool focused;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: TvDesignTokens.focusAnimationDuration,
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: focused
              ? const [Color(0x33221A0A), Color(0xEE0A0F15)]
              : const [Color(0xCC111820), Color(0xB8070A0F)],
        ),
        border: Border.all(
          color: focused
              ? TvDesignTokens.goldSoft
              : TvDesignTokens.panelBorderSoft,
          width: focused ? TvDesignTokens.focusBorderWidth : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: focused ? const Color(0x55FFC857) : const Color(0x8F000000),
            blurRadius: focused ? 32 : 24,
            offset: Offset(0, focused ? 14 : 10),
          ),
        ],
      ),
      child: child,
    );
  }
}

class TvFocusChrome extends StatelessWidget {
  const TvFocusChrome({
    required this.focused,
    required this.child,
    this.radius = TvDesignTokens.panelRadius,
    super.key,
  });

  final bool focused;
  final Widget child;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: focused ? TvDesignTokens.focusScale : 1,
      duration: TvDesignTokens.focusAnimationDuration,
      curve: Curves.easeOutCubic,
      child: AnimatedContainer(
        duration: TvDesignTokens.focusAnimationDuration,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: focused
              ? const [
                  BoxShadow(
                    color: Color(0x66FFC857),
                    blurRadius: 28,
                    offset: Offset(0, 13),
                  ),
                ]
              : const [],
        ),
        child: child,
      ),
    );
  }
}

class TvSectionHeader extends StatelessWidget {
  const TvSectionHeader({required this.title, this.subtitle, super.key});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        0,
        TvDesignTokens.pageHorizontalPadding,
        8,
      ),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 22,
            decoration: BoxDecoration(
              color: TvDesignTokens.gold,
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: TvDesignTokens.sectionTitleSize,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.25,
            ),
          ),
          if (subtitle case final value?) ...[
            const SizedBox(width: 12),
            Text(
              value,
              style: const TextStyle(
                color: TvDesignTokens.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class TvEmptyState extends StatelessWidget {
  const TvEmptyState({
    required this.title,
    required this.message,
    this.icon = Icons.movie_filter_outlined,
    super.key,
  });

  final String title;
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return TvGlassSurface(
      padding: const EdgeInsets.all(22),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: TvDesignTokens.goldSoft, size: 30),
          const SizedBox(width: 14),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                message,
                style: const TextStyle(
                  color: TvDesignTokens.textMuted,
                  fontSize: TvDesignTokens.bodyTextSize,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TvAmbientOrb extends StatelessWidget {
  const _TvAmbientOrb({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, Colors.transparent]),
      ),
    ),
  );
}

class _TvCinemaTexturePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final linePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.018)
      ..strokeWidth = 1;
    for (var y = 0.0; y < size.height; y += 72) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y + 18), linePaint);
    }
    final vignette = Paint()
      ..shader = RadialGradient(
        colors: [Colors.transparent, Colors.black.withValues(alpha: 0.38)],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, vignette);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
