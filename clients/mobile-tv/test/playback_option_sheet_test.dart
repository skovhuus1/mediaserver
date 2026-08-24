import 'package:boltbytes_media/src/widgets/playback_option_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('TV playback menu supports D-pad navigation and select', (
    tester,
  ) async {
    String? selected;
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(),
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              autofocus: true,
              onPressed: () async {
                selected = await showPlaybackOptionSheet<String>(
                  context: context,
                  tv: true,
                  title: 'Kvalitet',
                  description: 'Vælg kvalitet',
                  options: const [
                    PlaybackOption(
                      value: 'auto',
                      title: 'Automatisk',
                      icon: Icons.auto_awesome,
                      selected: true,
                    ),
                    PlaybackOption(
                      value: 'original',
                      title: 'Original',
                      icon: Icons.high_quality,
                    ),
                  ],
                );
              },
              child: const Text('Åbn menu'),
            ),
          ),
        ),
      ),
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pumpAndSettle();
    expect(find.text('Kvalitet'), findsOneWidget);
    final focusedTile = FocusManager.instance.primaryFocus?.context
        ?.findAncestorWidgetOfExactType<InkWell>();
    expect(focusedTile?.key, const ValueKey('playback-option-auto'));

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pumpAndSettle();

    expect(selected, 'original');
    expect(find.text('Kvalitet'), findsNothing);
  });
}
