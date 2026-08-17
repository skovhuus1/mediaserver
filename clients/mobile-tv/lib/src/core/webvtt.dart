class WebVttCue {
  const WebVttCue({required this.start, required this.end, required this.text});

  final Duration start;
  final Duration end;
  final String text;

  bool contains(Duration position) => position >= start && position < end;
}

List<WebVttCue> parseWebVtt(String input) {
  final normalized = input
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceFirst('\ufeff', '');
  final blocks = normalized.split(RegExp(r'\n{2,}'));
  final cues = <WebVttCue>[];
  for (final rawBlock in blocks) {
    final lines = rawBlock
        .split('\n')
        .map((line) => line.trimRight())
        .where((line) => line.isNotEmpty)
        .toList();
    if (lines.isEmpty || lines.first == 'WEBVTT') continue;
    final timingIndex = lines.indexWhere((line) => line.contains('-->'));
    if (timingIndex < 0 || timingIndex + 1 >= lines.length) continue;
    final timing = lines[timingIndex].split('-->');
    if (timing.length != 2) continue;
    final start = _timestamp(timing[0].trim());
    final end = _timestamp(timing[1].trim().split(RegExp(r'\s+')).first);
    if (start == null || end == null || end <= start) continue;
    final text = lines
        .skip(timingIndex + 1)
        .join('\n')
        .replaceAll(RegExp(r'<[^>]+>'), '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
    if (text.isNotEmpty) {
      cues.add(WebVttCue(start: start, end: end, text: text));
    }
  }
  cues.sort((a, b) => a.start.compareTo(b.start));
  return cues;
}

Duration? _timestamp(String value) {
  final parts = value.replaceAll(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  final seconds = double.tryParse(parts.last);
  final minutes = int.tryParse(parts[parts.length - 2]);
  final hours = parts.length == 3 ? int.tryParse(parts.first) : 0;
  if (seconds == null || minutes == null || hours == null) return null;
  return Duration(
    milliseconds: ((hours * 3600 + minutes * 60 + seconds) * 1000).round(),
  );
}
