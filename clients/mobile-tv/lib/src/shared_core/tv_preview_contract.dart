import 'dart:typed_data';

import '../core/api_client.dart';
import '../core/models.dart';

class TvPreviewCue {
  const TvPreviewCue({
    required this.startMs,
    required this.endMs,
    required this.sheet,
    required this.column,
    required this.row,
  });

  final int startMs;
  final int endMs;
  final int sheet;
  final int column;
  final int row;

  factory TvPreviewCue.fromJson(dynamic value) {
    final json = jsonMap(value);
    return TvPreviewCue(
      startMs: intValue(json['startMs']) ?? 0,
      endMs: intValue(json['endMs']) ?? 0,
      sheet: intValue(json['sheet']) ?? 0,
      column: intValue(json['column']) ?? 0,
      row: intValue(json['row']) ?? 0,
    );
  }
}

class TvPreviewManifest {
  const TvPreviewManifest({
    required this.tileWidth,
    required this.tileHeight,
    required this.columns,
    required this.rows,
    required this.sheetCount,
    required this.durationMs,
    required this.cues,
  });

  final int tileWidth;
  final int tileHeight;
  final int columns;
  final int rows;
  final int sheetCount;
  final int durationMs;
  final List<TvPreviewCue> cues;

  static TvPreviewManifest? fromPayload(dynamic value) {
    final root = jsonMap(value);
    final trickplay = jsonMap(root['trickplay']);
    if (trickplay.isEmpty) return null;
    final tileWidth = intValue(trickplay['tileWidth']) ?? 0;
    final tileHeight = intValue(trickplay['tileHeight']) ?? 0;
    final columns = intValue(trickplay['columns']) ?? 0;
    final rows = intValue(trickplay['rows']) ?? 0;
    final sheetCount = intValue(trickplay['sheetCount']) ?? 0;
    final durationMs = intValue(trickplay['durationMs']) ?? 0;
    final cues = jsonList(trickplay['cues'])
        .map(TvPreviewCue.fromJson)
        .where(
          (cue) =>
              cue.endMs > cue.startMs &&
              cue.sheet >= 0 &&
              cue.sheet < sheetCount &&
              cue.column >= 0 &&
              cue.column < columns &&
              cue.row >= 0 &&
              cue.row < rows,
        )
        .toList(growable: false)
      ..sort((a, b) => a.startMs.compareTo(b.startMs));
    if (tileWidth <= 0 ||
        tileHeight <= 0 ||
        columns <= 0 ||
        rows <= 0 ||
        sheetCount <= 0 ||
        cues.isEmpty) {
      return null;
    }
    return TvPreviewManifest(
      tileWidth: tileWidth,
      tileHeight: tileHeight,
      columns: columns,
      rows: rows,
      sheetCount: sheetCount,
      durationMs: durationMs,
      cues: cues,
    );
  }

  List<TvPreviewCue> previewWindow({int maxFrames = 10}) {
    if (cues.isEmpty || maxFrames <= 0) return const [];
    final target = durationMs > 0 ? (durationMs * 0.14).round() : 0;
    var start = cues.indexWhere((cue) => cue.startMs >= target);
    if (start < 0) start = 0;
    final sheet = cues[start].sheet;
    final result = <TvPreviewCue>[];
    for (var index = start; index < cues.length; index += 1) {
      final cue = cues[index];
      if (cue.sheet != sheet) break;
      result.add(cue);
      if (result.length >= maxFrames) break;
    }
    if (result.length >= 3) return result;
    return cues
        .where((cue) => cue.sheet == cues.first.sheet)
        .take(maxFrames)
        .toList(growable: false);
  }
}

class TvPreviewContract {
  TvPreviewContract(this.api);

  static final Expando<TvPreviewContract> _shared =
      Expando<TvPreviewContract>('tv-preview-contract');

  factory TvPreviewContract.shared(ApiClient api) {
    final existing = _shared[api];
    if (existing != null) return existing;
    final created = TvPreviewContract(api);
    _shared[api] = created;
    return created;
  }

  final ApiClient api;
  final Map<String, TvPreviewManifest?> _manifests = {};
  final Map<String, Uint8List> _sheets = {};

  Future<TvPreviewManifest?> loadManifest(String mediaId) async {
    if (_manifests.containsKey(mediaId)) return _manifests[mediaId];
    final payload = await api.getJson(
      '/media/${Uri.encodeComponent(mediaId)}/playback-assets',
    );
    final manifest = TvPreviewManifest.fromPayload(payload);
    if (_manifests.length >= 64) _manifests.remove(_manifests.keys.first);
    _manifests[mediaId] = manifest;
    return manifest;
  }

  Future<Uint8List> loadSheet(String mediaId, int sheet) async {
    final key = '$mediaId:$sheet';
    final cached = _sheets[key];
    if (cached != null) return cached;
    final bytes = Uint8List.fromList(
      await api.getBytes(
        '/media/${Uri.encodeComponent(mediaId)}/trickplay/$sheet',
      ),
    );
    if (_sheets.length >= 12) _sheets.remove(_sheets.keys.first);
    _sheets[key] = bytes;
    return bytes;
  }
}
