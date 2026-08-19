import 'package:boltbytes_media/src/core/offline_downloads.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'parses profile-scoped server download and keeps local transfer state',
    () {
      final local = OfflineDownloadRecord(
        id: 'download-id',
        mediaId: 'media-id',
        profileId: 'profile-id',
        title: 'Pilot',
        qualityHeight: 720,
        status: 'downloading',
        progress: 42,
        licenseExpiresAt: DateTime.utc(2026, 9),
        tokenExpiresAt: DateTime.utc(2026, 8, 21),
        durationMs: 3600000,
        positionMs: 120000,
        nativeDownloadId: 123,
      );
      final parsed = OfflineDownloadRecord.fromServer({
        'id': 'download-id',
        'mediaId': 'media-id',
        'profileId': 'profile-id',
        'status': 'ready',
        'progress': 100,
        'qualityHeight': 720,
        'licenseExpiresAt': '2026-09-01T00:00:00.000Z',
        'downloadTokenExpiresAt': '2026-08-21T00:00:00.000Z',
        'media': {
          'title': 'Pilot',
          'seriesTitle': 'FBI',
          'seasonNumber': 1,
          'episodeNumber': 1,
          'durationMs': 3600000,
        },
      }, local: local);
      expect(parsed.status, 'downloading');
      expect(parsed.progress, 42);
      expect(parsed.nativeDownloadId, 123);
      expect(parsed.positionMs, 120000);
      expect(parsed.displayTitle, 'FBI · S01E01');
    },
  );

  test('expired licenses are never playable', () {
    final record = OfflineDownloadRecord(
      id: 'download-id',
      mediaId: 'media-id',
      profileId: 'profile-id',
      title: 'Film',
      qualityHeight: 1080,
      status: 'downloaded',
      progress: 100,
      licenseExpiresAt: DateTime.fromMillisecondsSinceEpoch(0),
      tokenExpiresAt: DateTime.fromMillisecondsSinceEpoch(0),
      durationMs: 1,
      positionMs: 0,
      localPath: 'missing.mp4',
    );
    expect(record.licenseValid, isFalse);
    expect(record.playable, isFalse);
  });

  test('only the device-encrypted container is accepted for playback', () {
    expect(isEncryptedOfflinePath('/data/offline/item.bbenc'), isTrue);
    expect(isEncryptedOfflinePath('/data/offline/item.mp4'), isFalse);
    expect(isEncryptedOfflinePath(null), isFalse);
  });
}
