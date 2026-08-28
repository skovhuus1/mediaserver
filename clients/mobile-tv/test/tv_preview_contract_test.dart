import 'package:flutter_test/flutter_test.dart';
import 'package:boltbytes_media/src/shared_core/tv_preview_contract.dart';

void main() {
  test('parses a path-free trickplay manifest and selects one sheet', () {
    final manifest = TvPreviewManifest.fromPayload({
      'trickplay': {
        'tileWidth': 320,
        'tileHeight': 180,
        'columns': 5,
        'rows': 5,
        'sheetCount': 2,
        'durationMs': 300000,
        'cues': List.generate(30, (index) {
          final sheet = index ~/ 25;
          final local = index % 25;
          return {
            'startMs': index * 10000,
            'endMs': (index + 1) * 10000,
            'sheet': sheet,
            'column': local % 5,
            'row': local ~/ 5,
          };
        }),
      },
    });

    expect(manifest, isNotNull);
    final window = manifest!.previewWindow(maxFrames: 8);
    expect(window, hasLength(8));
    expect(window.map((cue) => cue.sheet).toSet(), hasLength(1));
    expect(window.first.startMs, greaterThanOrEqualTo(40000));
  });

  test('rejects invalid or unavailable trickplay data', () {
    expect(TvPreviewManifest.fromPayload({'trickplay': null}), isNull);
    expect(
      TvPreviewManifest.fromPayload({
        'trickplay': {
          'tileWidth': 0,
          'tileHeight': 180,
          'columns': 5,
          'rows': 5,
          'sheetCount': 1,
          'durationMs': 10000,
          'cues': const [],
        },
      }),
      isNull,
    );
  });
}
