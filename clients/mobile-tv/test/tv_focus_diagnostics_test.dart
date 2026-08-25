import 'package:boltbytes_media/src/tv/tv_focus_diagnostics.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('TV focus diagnostics records directional input to frame', (
    tester,
  ) async {
    final samples = <TvFocusLatencySample>[];
    final timestamps = <int>[100000, 150000].iterator;
    final focusNode = FocusNode(debugLabel: 'diagnostic-focus');
    addTearDown(focusNode.dispose);
    await tester.pumpWidget(
      TvFocusDiagnostics(
        enabled: true,
        reporter: samples.add,
        nowMicros: () {
          timestamps.moveNext();
          return timestamps.current;
        },
        child: MaterialApp(
          home: Scaffold(
            body: Focus(focusNode: focusNode, child: const SizedBox.expand()),
          ),
        ),
      ),
    );
    focusNode.requestFocus();
    await tester.pump();
    expect(focusNode.hasPrimaryFocus, isTrue);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();

    expect(samples, hasLength(1));
    expect(samples.single.key, LogicalKeyboardKey.arrowRight);
    expect(samples.single.latency, const Duration(milliseconds: 50));
  });
}
