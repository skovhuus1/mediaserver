import 'dart:math' as math;

import 'package:flutter/material.dart';

class BrandMark extends StatelessWidget {
  const BrandMark({this.size = 40, super.key});

  final double size;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _BrandPainter());
}

class BrandLockup extends StatelessWidget {
  const BrandLockup({
    this.compact = false,
    this.onTap,
    this.tooltip,
    super.key,
  });

  final bool compact;
  final VoidCallback? onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final logo = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        BrandMark(size: compact ? 34 : 46),
        SizedBox(width: compact ? 9 : 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'BoltBytes',
              style: TextStyle(
                fontSize: compact ? 18 : 24,
                height: 1,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.8,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'MEDIA SERVER',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                fontSize: compact ? 7 : 8,
                color: Colors.white54,
              ),
            ),
          ],
        ),
      ],
    );
    if (onTap == null) return logo;
    return Tooltip(
      message: tooltip ?? 'Gå til forsiden',
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: logo,
      ),
    );
  }
}

class _BrandPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide * 0.46;
    final shell = Path();
    for (var index = 0; index < 6; index++) {
      final angle = -math.pi / 2 + index * math.pi / 3;
      final point = center + Offset(math.cos(angle), math.sin(angle)) * radius;
      index == 0
          ? shell.moveTo(point.dx, point.dy)
          : shell.lineTo(point.dx, point.dy);
    }
    shell.close();
    final gradient = const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFFB780FF), Color(0xFF6E3BC7), Color(0xFF43E7C4)],
    ).createShader(Offset.zero & size);
    canvas.drawPath(shell, Paint()..shader = gradient);
    canvas.drawPath(
      shell,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.shortestSide * 0.055
        ..color = Colors.white.withValues(alpha: 0.35),
    );
    canvas.drawCircle(
      center,
      radius * 0.42,
      Paint()..color = const Color(0xFF0B0F15).withValues(alpha: 0.62),
    );
    canvas.drawCircle(
      center,
      radius * 0.16,
      Paint()..color = Colors.white.withValues(alpha: 0.86),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
