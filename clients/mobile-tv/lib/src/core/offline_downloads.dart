import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'models.dart';

const _unset = Object();

class OfflineDownloadRecord {
  const OfflineDownloadRecord({
    required this.id,
    required this.mediaId,
    required this.profileId,
    required this.title,
    required this.qualityHeight,
    required this.status,
    required this.progress,
    required this.licenseExpiresAt,
    required this.tokenExpiresAt,
    required this.durationMs,
    required this.positionMs,
    this.seriesTitle,
    this.seasonNumber,
    this.episodeNumber,
    this.sizeBytes,
    this.downloadUrl,
    this.nativeDownloadId,
    this.localPath,
    this.error,
  });

  final String id;
  final String mediaId;
  final String profileId;
  final String title;
  final String? seriesTitle;
  final int? seasonNumber;
  final int? episodeNumber;
  final int qualityHeight;
  final String status;
  final int progress;
  final DateTime licenseExpiresAt;
  final DateTime tokenExpiresAt;
  final int durationMs;
  final int positionMs;
  final int? sizeBytes;
  final String? downloadUrl;
  final int? nativeDownloadId;
  final String? localPath;
  final String? error;

  bool get licenseValid => licenseExpiresAt.isAfter(DateTime.now());
  bool get playable =>
      status == 'downloaded' &&
      licenseValid &&
      localPath != null &&
      File(localPath!).existsSync();

  String get displayTitle {
    if (seasonNumber == null || episodeNumber == null) return title;
    final prefix = seriesTitle?.trim().isNotEmpty == true
        ? seriesTitle!
        : title;
    return '$prefix · S${seasonNumber!.toString().padLeft(2, '0')}E${episodeNumber!.toString().padLeft(2, '0')}';
  }

  OfflineDownloadRecord copyWith({
    String? status,
    int? progress,
    DateTime? licenseExpiresAt,
    DateTime? tokenExpiresAt,
    int? positionMs,
    int? sizeBytes,
    Object? downloadUrl = _unset,
    Object? nativeDownloadId = _unset,
    Object? localPath = _unset,
    Object? error = _unset,
  }) => OfflineDownloadRecord(
    id: id,
    mediaId: mediaId,
    profileId: profileId,
    title: title,
    seriesTitle: seriesTitle,
    seasonNumber: seasonNumber,
    episodeNumber: episodeNumber,
    qualityHeight: qualityHeight,
    status: status ?? this.status,
    progress: progress ?? this.progress,
    licenseExpiresAt: licenseExpiresAt ?? this.licenseExpiresAt,
    tokenExpiresAt: tokenExpiresAt ?? this.tokenExpiresAt,
    durationMs: durationMs,
    positionMs: positionMs ?? this.positionMs,
    sizeBytes: sizeBytes ?? this.sizeBytes,
    downloadUrl: identical(downloadUrl, _unset)
        ? this.downloadUrl
        : downloadUrl as String?,
    nativeDownloadId: identical(nativeDownloadId, _unset)
        ? this.nativeDownloadId
        : nativeDownloadId as int?,
    localPath: identical(localPath, _unset)
        ? this.localPath
        : localPath as String?,
    error: identical(error, _unset) ? this.error : error as String?,
  );

  factory OfflineDownloadRecord.fromServer(
    dynamic value, {
    OfflineDownloadRecord? local,
  }) {
    final json = jsonMap(value);
    final media = jsonMap(json['media']);
    return OfflineDownloadRecord(
      id: stringValue(json['id']) ?? '',
      mediaId: stringValue(json['mediaId']) ?? '',
      profileId: stringValue(json['profileId']) ?? '',
      title: stringValue(media['title']) ?? 'Offline titel',
      seriesTitle: stringValue(media['seriesTitle']),
      seasonNumber: intValue(media['seasonNumber']),
      episodeNumber: intValue(media['episodeNumber']),
      qualityHeight: intValue(json['qualityHeight']) ?? 720,
      status: local?.status == 'downloading'
          ? 'downloading'
          : stringValue(json['status']) ?? 'queued',
      progress: local?.status == 'downloading'
          ? local!.progress
          : intValue(json['progress']) ?? 0,
      licenseExpiresAt:
          DateTime.tryParse(stringValue(json['licenseExpiresAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      tokenExpiresAt:
          DateTime.tryParse(
            stringValue(json['downloadTokenExpiresAt']) ?? '',
          ) ??
          DateTime.fromMillisecondsSinceEpoch(0),
      durationMs: intValue(media['durationMs']) ?? local?.durationMs ?? 0,
      positionMs: local?.positionMs ?? 0,
      sizeBytes: intValue(json['sizeBytes']) ?? local?.sizeBytes,
      downloadUrl: stringValue(json['downloadUrl']) ?? local?.downloadUrl,
      nativeDownloadId: local?.nativeDownloadId,
      localPath: local?.localPath,
      error: stringValue(json['error']) ?? local?.error,
    );
  }

  factory OfflineDownloadRecord.fromJson(dynamic value) {
    final json = jsonMap(value);
    return OfflineDownloadRecord(
      id: stringValue(json['id']) ?? '',
      mediaId: stringValue(json['mediaId']) ?? '',
      profileId: stringValue(json['profileId']) ?? '',
      title: stringValue(json['title']) ?? 'Offline titel',
      seriesTitle: stringValue(json['seriesTitle']),
      seasonNumber: intValue(json['seasonNumber']),
      episodeNumber: intValue(json['episodeNumber']),
      qualityHeight: intValue(json['qualityHeight']) ?? 720,
      status: stringValue(json['status']) ?? 'queued',
      progress: intValue(json['progress']) ?? 0,
      licenseExpiresAt:
          DateTime.tryParse(stringValue(json['licenseExpiresAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      tokenExpiresAt:
          DateTime.tryParse(stringValue(json['tokenExpiresAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      durationMs: intValue(json['durationMs']) ?? 0,
      positionMs: intValue(json['positionMs']) ?? 0,
      sizeBytes: intValue(json['sizeBytes']),
      downloadUrl: stringValue(json['downloadUrl']),
      nativeDownloadId: intValue(json['nativeDownloadId']),
      localPath: stringValue(json['localPath']),
      error: stringValue(json['error']),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'mediaId': mediaId,
    'profileId': profileId,
    'title': title,
    'seriesTitle': seriesTitle,
    'seasonNumber': seasonNumber,
    'episodeNumber': episodeNumber,
    'qualityHeight': qualityHeight,
    'status': status,
    'progress': progress,
    'licenseExpiresAt': licenseExpiresAt.toIso8601String(),
    'tokenExpiresAt': tokenExpiresAt.toIso8601String(),
    'durationMs': durationMs,
    'positionMs': positionMs,
    'sizeBytes': sizeBytes,
    'downloadUrl': downloadUrl,
    'nativeDownloadId': nativeDownloadId,
    'localPath': localPath,
    'error': error,
  };
}

class OfflineDownloadsManager extends ChangeNotifier {
  OfflineDownloadsManager._();

  static final instance = OfflineDownloadsManager._();
  static const _storageKey = 'bb_media_offline_downloads_v1';
  static const _channel = MethodChannel('boltbytes.media/offline_downloads');
  static const _secure = FlutterSecureStorage(aOptions: AndroidOptions());

  final List<OfflineDownloadRecord> _records = [];
  final Set<String> _pendingDeletes = {};
  ApiClient? _api;
  Timer? _timer;
  bool _loaded = false;
  bool syncing = false;
  String? error;

  List<OfflineDownloadRecord> forProfile(String? profileId) => _records
      .where((record) => record.profileId == profileId)
      .toList(growable: false);

  static Future<bool> hasPlayable(String profileId) async {
    final raw = await _secure.read(key: _storageKey);
    if (raw == null) return false;
    try {
      final root = jsonMap(jsonDecode(raw));
      return jsonList(root['records'])
          .map(OfflineDownloadRecord.fromJson)
          .any((record) => record.profileId == profileId && record.playable);
    } catch (_) {
      return false;
    }
  }

  Future<void> configure(ApiClient api, {bool online = true}) async {
    _api = api;
    await _load();
    await sync(online: online);
    _timer ??= Timer.periodic(
      const Duration(seconds: 5),
      (_) => unawaited(sync(online: online)),
    );
  }

  Future<OfflineDownloadRecord> queue(String mediaId, int qualityHeight) async {
    final api = _api;
    if (api == null) throw const ApiException('Downloadservice er ikke klar.');
    final response = await api.postJson('/offline-downloads', {
      'mediaId': mediaId,
      'qualityHeight': qualityHeight,
    });
    var record = OfflineDownloadRecord.fromServer(response);
    final url = record.downloadUrl;
    if (url != null) record = record.copyWith(downloadUrl: api.endpoint(url));
    _replace(record);
    await _persist();
    notifyListeners();
    return record;
  }

  Future<void> sync({bool online = true}) async {
    if (syncing) return;
    syncing = true;
    try {
      await _load();
      final api = _api;
      if (online && api != null) {
        for (final id in _pendingDeletes.toList()) {
          try {
            await api.deleteJson('/offline-downloads/$id');
            _pendingDeletes.remove(id);
          } catch (_) {}
        }
        try {
          final serverRows = jsonList(await api.getJson('/offline-downloads'));
          for (final value in serverRows) {
            final id = stringValue(jsonMap(value)['id']);
            if (id == null || _pendingDeletes.contains(id)) continue;
            final local = _records
                .where((record) => record.id == id)
                .firstOrNull;
            _replace(OfflineDownloadRecord.fromServer(value, local: local));
          }
        } catch (_) {}
      }
      for (final record in _records.toList()) {
        if (_pendingDeletes.contains(record.id)) continue;
        var current = record;
        if (online &&
            api != null &&
            ['queued', 'preparing'].contains(current.status)) {
          try {
            current = OfflineDownloadRecord.fromServer(
              await api.getJson('/offline-downloads/${current.id}'),
              local: current,
            );
            _replace(current);
          } catch (_) {}
        }
        if (online &&
            api != null &&
            ['ready', 'downloaded'].contains(current.status)) {
          current = await _renewIfNeeded(current);
        }
        if (current.status == 'ready' && current.nativeDownloadId == null) {
          current = await _startTransfer(current);
        }
        if (current.nativeDownloadId != null && !current.playable) {
          current = await _pollTransfer(current, online: online);
        }
        if (online && api != null && current.positionMs > 0) {
          try {
            await api.patchJson('/offline-downloads/${current.id}/progress', {
              'positionMs': current.positionMs,
            });
          } catch (_) {}
        }
      }
      error = null;
      await _persist();
    } catch (failure) {
      error = 'Offline-downloads kunne ikke opdateres: $failure';
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  Future<void> saveProgress(
    OfflineDownloadRecord record,
    int positionMs, {
    bool completed = false,
  }) async {
    final updated = record.copyWith(positionMs: positionMs);
    _replace(updated);
    await _persist();
    final api = _api;
    if (api != null) {
      try {
        await api.patchJson('/offline-downloads/${record.id}/progress', {
          'positionMs': positionMs,
          'completed': completed,
        });
      } catch (_) {}
    }
  }

  Future<void> remove(OfflineDownloadRecord record) async {
    if (Platform.isAndroid) {
      await _channel.invokeMethod<void>('cancel', {
        'downloadId': record.nativeDownloadId,
        'localPath': record.localPath,
      });
    }
    _records.removeWhere((entry) => entry.id == record.id);
    _pendingDeletes.add(record.id);
    await _persist();
    notifyListeners();
    await sync();
  }

  Future<OfflineDownloadRecord> _renewIfNeeded(
    OfflineDownloadRecord record,
  ) async {
    if (record.downloadUrl != null &&
        record.tokenExpiresAt.isAfter(
          DateTime.now().add(const Duration(minutes: 30)),
        )) {
      return record;
    }
    final api = _api!;
    var renewed = OfflineDownloadRecord.fromServer(
      await api.postJson('/offline-downloads/${record.id}/renew'),
      local: record,
    );
    if (renewed.downloadUrl != null) {
      renewed = renewed.copyWith(
        downloadUrl: api.endpoint(renewed.downloadUrl!),
      );
    }
    _replace(renewed);
    return renewed;
  }

  Future<OfflineDownloadRecord> _startTransfer(
    OfflineDownloadRecord record,
  ) async {
    if (!Platform.isAndroid || record.downloadUrl == null) return record;
    try {
      final nativeId = await _channel.invokeMethod<int>('enqueue', {
        'url': record.downloadUrl,
        'id': record.id,
        'title': record.displayTitle,
        'wifiOnly': true,
      });
      final updated = record.copyWith(
        status: 'downloading',
        progress: 0,
        nativeDownloadId: nativeId,
        error: null,
      );
      _replace(updated);
      return updated;
    } catch (failure) {
      final updated = record.copyWith(
        status: 'failed',
        error: 'Overførslen kunne ikke startes: $failure',
      );
      _replace(updated);
      return updated;
    }
  }

  Future<OfflineDownloadRecord> _pollTransfer(
    OfflineDownloadRecord record, {
    required bool online,
  }) async {
    if (!Platform.isAndroid) return record;
    final state = jsonMap(
      await _channel.invokeMethod<dynamic>('query', {
        'downloadId': record.nativeDownloadId,
      }),
    );
    final status = stringValue(state['status']) ?? 'unknown';
    final downloaded = intValue(state['downloadedBytes']) ?? 0;
    final total = intValue(state['totalBytes']) ?? record.sizeBytes ?? 0;
    final progress = total > 0
        ? (downloaded / total * 100).round().clamp(0, 99)
        : record.progress;
    if (status == 'successful') {
      final path = stringValue(state['localPath']);
      final updated = record.copyWith(
        status: 'downloaded',
        progress: 100,
        localPath: path,
        sizeBytes: total > 0 ? total : record.sizeBytes,
        error: null,
      );
      _replace(updated);
      if (online && _api != null) {
        try {
          await _api!.postJson('/offline-downloads/${record.id}/complete');
        } catch (_) {}
      }
      return updated;
    }
    if (status == 'failed' || status == 'missing') {
      final updated = record.copyWith(
        status: 'failed',
        error: 'Android-downloaden fejlede (${state['reason'] ?? status}).',
      );
      _replace(updated);
      return updated;
    }
    final updated = record.copyWith(
      status: 'downloading',
      progress: progress,
      sizeBytes: total > 0 ? total : record.sizeBytes,
    );
    _replace(updated);
    return updated;
  }

  Future<void> _load() async {
    if (_loaded) return;
    _loaded = true;
    final raw = await _secure.read(key: _storageKey);
    if (raw == null) return;
    try {
      final root = jsonMap(jsonDecode(raw));
      _records
        ..clear()
        ..addAll(
          jsonList(root['records'])
              .map(OfflineDownloadRecord.fromJson)
              .where((record) => record.id.isNotEmpty),
        );
      _pendingDeletes
        ..clear()
        ..addAll(jsonList(root['pendingDeletes']).map((value) => '$value'));
    } catch (_) {
      await _secure.delete(key: _storageKey);
    }
  }

  Future<void> _persist() => _secure.write(
    key: _storageKey,
    value: jsonEncode({
      'records': _records.map((record) => record.toJson()).toList(),
      'pendingDeletes': _pendingDeletes.toList(),
    }),
  );

  void _replace(OfflineDownloadRecord record) {
    final index = _records.indexWhere((entry) => entry.id == record.id);
    if (index < 0) {
      _records.add(record);
    } else {
      _records[index] = record;
    }
  }
}
