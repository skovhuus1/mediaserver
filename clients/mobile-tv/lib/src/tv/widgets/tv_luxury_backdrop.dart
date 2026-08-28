import 'package:flutter/material.dart';

/// Static cinematic depth for TV pages without expensive runtime blur or
/// continuous animation on lower-powered Android TV hardware.
class TvLuxuryBackdrop extends StatelessWidget {
  const TvLuxuryBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: const [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                stops: [0, 0.44, 1],
                colors: [
                  Color(0xFF101821),
                  Color(0xFF070B10),
                  Color(0xFF030507),
                ],
              ),
            ),
          ),
          Align(
            alignment: Alignment.topRight,
            child: FractionallySizedBox(
              widthFactor: 0.56,
              heightFactor: 0.52,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(0.45, -0.5),
                    radius: 1.08,
                    colors: [Color(0x24346E8A), Color(0x0010161D)],
                  ),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomLeft,
            child: FractionallySizedBox(
              widthFactor: 0.48,
              heightFactor: 0.44,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(-0.55, 0.72),
                    radius: 1.12,
                    colors: [Color(0x1AFFC857), Color(0x00000000)],
                  ),
                ),
              ),
            ),
          ),
          CustomPaint(painter: _LuxuryLinesPainter()),
        ],
      ),
    );
  }
}

class _LuxuryLinesPainter extends CustomPainter {
  const _LuxuryLinesPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final architectural = Paint()
      ..color = const Color(0x078EDCFF)
      ..strokeWidth = 0.8
      ..style = PaintingStyle.stroke;
    final horizon = Paint()
      ..color = const Color(0x0D586C7A)
      ..strokeWidth = 0.8;
    final accent = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0x00FFD978), Color(0x66FFD978), Color(0x00FFD978)],
      ).createShader(Rect.fromLTWH(0, 0, size.width * 0.56, 1))
      ..strokeWidth = 1.15;

    final upperPlane = Path()
      ..moveTo(size.width * 0.42, 0)
      ..lineTo(size.width * 0.76, size.height * 0.42)
      ..lineTo(size.width, size.height * 0.42);
    final lowerPlane = Path()
      ..moveTo(0, size.height * 0.82)
      ..lineTo(size.width * 0.34, size.height * 0.56)
      ..lineTo(size.width * 0.68, size.height);
    canvas.drawPath(upperPlane, architectural);
    canvas.drawPath(lowerPlane, architectural);
    canvas.drawLine(
      Offset(size.width * 0.07, 0),
      Offset(size.width * 0.07, size.height),
      horizon,
    );
    canvas.drawLine(
      Offset(0, size.height * 0.86),
      Offset(size.width, size.height * 0.86),
      horizon,
    );
    canvas.drawLine(
      Offset(size.width * 0.035, 0),
      Offset(size.width * 0.595, 0),
      accent,
    );
  }

  @override
  bool shouldRepaint(covariant _LuxuryLinesPainter oldDelegate) => false;
}
