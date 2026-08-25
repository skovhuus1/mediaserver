import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/offline_downloads.dart';

abstract interface class OfflineLibraryContract {
  Listenable get changes;
  bool get syncing;
  String? get error;
  Future<void> initialize();
  List<OfflineDownloadRecord> recordsForProfile(String? profileId);
  Future<List<OfflineDownloadRecord>> loadForProfile(String? profileId);
  Future<bool> hasPlayable(String profileId);
  Future<bool> hasAny(String profileId);
  Future<OfflineDownloadRecord> queue(String mediaId, int qualityHeight);
  Future<void> sync();
  Future<void> remove(OfflineDownloadRecord record);
  Future<void> saveProgress(
    OfflineDownloadRecord record,
    int positionMs, {
    bool completed = false,
  });
}

class OfflineLibraryUseCase implements OfflineLibraryContract {
  OfflineLibraryUseCase({
    required this.api,
    this.online = true,
    OfflineDownloadsManager? manager,
  }) : _manager = manager ?? OfflineDownloadsManager.instance;

  final ApiClient api;
  final bool online;
  final OfflineDownloadsManager _manager;
  Future<void>? _initialization;

  @override
  Listenable get changes => _manager;

  @override
  bool get syncing => _manager.syncing;

  @override
  String? get error => _manager.error;

  @override
  Future<void> initialize() =>
      _initialization ??= _manager.configure(api, online: online);

  @override
  List<OfflineDownloadRecord> recordsForProfile(String? profileId) =>
      _manager.forProfile(profileId);

  @override
  Future<List<OfflineDownloadRecord>> loadForProfile(String? profileId) async {
    await initialize();
    return recordsForProfile(profileId);
  }

  @override
  Future<bool> hasPlayable(String profileId) =>
      OfflineDownloadsManager.hasPlayable(profileId);

  @override
  Future<bool> hasAny(String profileId) =>
      OfflineDownloadsManager.hasAny(profileId);

  @override
  Future<OfflineDownloadRecord> queue(String mediaId, int qualityHeight) async {
    await initialize();
    return _manager.queue(mediaId, qualityHeight);
  }

  @override
  Future<void> sync() async {
    await initialize();
    await _manager.sync(online: online);
  }

  @override
  Future<void> remove(OfflineDownloadRecord record) => _manager.remove(record);

  @override
  Future<void> saveProgress(
    OfflineDownloadRecord record,
    int positionMs, {
    bool completed = false,
  }) => _manager.saveProgress(record, positionMs, completed: completed);
}
