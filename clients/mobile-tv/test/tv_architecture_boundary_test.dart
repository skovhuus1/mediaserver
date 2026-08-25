import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TV UI never imports mobile screen implementations', () {
    final tvRoot = Directory('lib/src/tv');
    final forbidden = <String>[];
    final importPattern = RegExp(
      r'''import\s+['"][^'"]*(?:\.\./)+screens/[^'"]+['"]''',
    );

    for (final entity in tvRoot.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final source = entity.readAsStringSync();
      if (importPattern.hasMatch(source)) forbidden.add(entity.path);
    }

    expect(
      forbidden,
      isEmpty,
      reason:
          'TV is a separate UI shell. Move shared behavior to shared_core '
          'instead of importing lib/src/screens: ${forbidden.join(', ')}',
    );
  });
}
