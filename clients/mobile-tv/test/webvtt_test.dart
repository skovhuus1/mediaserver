import 'package:boltbytes_media/src/core/webvtt.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses WebVTT timestamps, identifiers and text markup', () {
    const source = '''WEBVTT

intro
00:00:01.250 --> 00:00:03.500 align:center
<i>God aften</i>

00:01:02,000 --> 00:01:04,250
FBI &amp; venner
''';

    final cues = parseWebVtt(source);

    expect(cues, hasLength(2));
    expect(cues.first.start, const Duration(milliseconds: 1250));
    expect(cues.first.text, 'God aften');
    expect(cues.last.start, const Duration(minutes: 1, seconds: 2));
    expect(cues.last.text, 'FBI & venner');
    expect(cues.last.contains(const Duration(minutes: 1, seconds: 3)), isTrue);
  });

  test('ignores malformed and reversed cues', () {
    const source = '''WEBVTT

ikke en cue

00:00:05.000 --> 00:00:03.000
Forkert
''';

    expect(parseWebVtt(source), isEmpty);
  });
}
