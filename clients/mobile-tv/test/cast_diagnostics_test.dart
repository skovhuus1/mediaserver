import 'package:flutter_test/flutter_test.dart';

import 'package:boltbytes_media/src/core/cast_service.dart';

void main() {
  test('parses a custom receiver and active Cast session', () {
    final diagnostics = CastDiagnostics.fromValue({
      'available': true,
      'connected': true,
      'receiverApplicationId': 'A1B2C3D4',
      'receiverMode': 'custom',
      'runtimeState': 'playing',
      'deviceName': 'Stuen',
      'mediaTitle': 'Pilot',
      'contentType': 'application/x-mpegURL',
    });

    expect(diagnostics.available, isTrue);
    expect(diagnostics.connected, isTrue);
    expect(diagnostics.receiverApplicationId, 'A1B2C3D4');
    expect(diagnostics.receiverMode, 'custom');
    expect(diagnostics.runtimeState, 'playing');
    expect(diagnostics.deviceName, 'Stuen');
    expect(diagnostics.mediaTitle, 'Pilot');
  });

  test('uses safe defaults for unavailable native diagnostics', () {
    final diagnostics = CastDiagnostics.fromValue(null);

    expect(diagnostics.available, isFalse);
    expect(diagnostics.connected, isFalse);
    expect(diagnostics.receiverApplicationId, isEmpty);
    expect(diagnostics.receiverMode, 'default');
    expect(diagnostics.runtimeState, 'unknown');
  });
}
