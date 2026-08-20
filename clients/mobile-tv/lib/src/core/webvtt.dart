class WebVttCue {
  const WebVttCue({required this.start, required this.end, required this.text});

  final Duration start;
  final Duration end;
  final String text;

  bool contains(Duration position) => position >= start && position < end;
}

List<WebVttCue> parseSubtitles(String input) {
  final normalized = input
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceFirst('\ufeff', '');
  if (RegExp(r'^\[Script Info\]', multiLine: true).hasMatch(normalized)) {
    return parseSubStationAlpha(normalized);
  }
  if (RegExp(r'\bDialogue:\s', caseSensitive: false).hasMatch(normalized)) {
    return parseSubStationAlpha(normalized);
  }
  if (normalized.contains('-->') && normalized.contains('WEBVTT')) {
    return parseWebVttBody(normalized);
  }
  if (RegExp(r'^\s*\d+\s*$', multiLine: true).hasMatch(normalized)) {
    return parseSubRip(normalized);
  }
  return parseWebVttBody(normalized);
}

List<WebVttCue> parseWebVtt(String input) => parseSubtitles(input);

List<WebVttCue> parseWebVttBody(String input) {
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

List<WebVttCue> parseSubRip(String input) {
  final normalized = input
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceFirst('\ufeff', '');
  final blocks = normalized.split(RegExp(r'\n{2,}'));
  final cues = <WebVttCue>[];
  for (final rawBlock in blocks) {
    final lines = rawBlock
        .split('\n')
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty)
        .toList();
    if (lines.length < 3) continue;
    final timingIndex = lines.indexWhere((line) => line.contains('-->'));
    if (timingIndex < 1 || timingIndex + 1 >= lines.length) continue;
    final timing = lines[timingIndex]
        .split('-->')
        .map((value) => value.trim())
        .toList(growable: false);
    if (timing.length != 2) continue;
    final start = _timestamp(timing[0]);
    final end = _timestamp(timing[1].split(RegExp(r'\s+')).first);
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

List<WebVttCue> parseSubStationAlpha(String input) {
  final normalized = input
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replaceFirst('\ufeff', '');
  final lines = normalized.split('\n');
  final cues = <WebVttCue>[];
  var inEvents = false;
  for (final rawLine in lines) {
    final line = rawLine.trim();
    if (line.isEmpty) continue;
    if (line.toLowerCase() == '[events]') {
      inEvents = true;
      continue;
    }
    if (!inEvents || !line.startsWith('Dialogue:')) continue;
    final payload = line.substring('Dialogue:'.length).trim();
    final fields = <String>[];
    var commaCount = 0;
    var last = 0;
    for (var index = 0; index < payload.length; index++) {
      if (payload[index] == ',' && commaCount < 8) {
        fields.add(payload.substring(last, index));
        last = index + 1;
        commaCount++;
      }
    }
    fields.add(payload.substring(last));
    if (fields.length < 9) continue;
    final start = _timestamp(fields[1]);
    final end = _timestamp(fields[2]);
    if (start == null || end == null || end <= start) continue;
    final text = fields
        .sublist(8)
        .join(',')
        .replaceAll(RegExp(r'\{[^}]*\}'), '')
        .replaceAll('\\N', '\n')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
    final cleaned = text.trim();
    if (cleaned.isNotEmpty) {
      cues.add(WebVttCue(start: start, end: end, text: cleaned));
    }
  }
  cues.sort((a, b) => a.start.compareTo(b.start));
  return cues;
}
