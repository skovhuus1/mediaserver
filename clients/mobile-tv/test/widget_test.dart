import 'package:boltbytes_media/src/widgets/brand.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('brand lockup renders the product identity', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: BrandLockup())),
    );

    expect(find.text('BoltBytes'), findsOneWidget);
    expect(find.text('MEDIA SERVER'), findsOneWidget);
    expect(find.byType(CustomPaint), findsWidgets);
  });
}
