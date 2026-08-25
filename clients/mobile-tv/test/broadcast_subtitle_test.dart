import 'package:boltbytes_media/src/widgets/broadcast_subtitle.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('broadcast sizing remains inside TV-safe bounds', () {
    expect(subtitleFontSize(720, 100), inInclusiveRange(22, 52));
    expect(subtitleFontSize(2160, 150), 52);
    expect(subtitleBottomPadding(1080, 6), closeTo(64.8, 0.01));
  });

  testWidgets(
    'broadcast style renders outline and text without an opaque box',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: SizedBox.expand(
            child: BroadcastSubtitle(
              text: 'En almindelig TV-undertekst',
              style: 'broadcast',
              textColor: '#FFFFFF',
              sizePercent: 100,
              bottomOffsetPercent: 6,
            ),
          ),
        ),
      );

      expect(
        find.byKey(const ValueKey('broadcast-subtitle-outline')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('broadcast-subtitle-text')),
        findsOneWidget,
      );
      final container = tester.widget<Container>(
        find.byKey(const ValueKey('broadcast-subtitle')),
      );
      expect((container.decoration as BoxDecoration).color, Colors.transparent);
      expect(tester.takeException(), isNull);
    },
  );
}
