import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:boltbytes_media/src/shared_core/client_preferences_contract.dart';
import 'package:boltbytes_media/src/shared_core/live_tv_contract.dart';
import 'package:boltbytes_media/src/shared_core/live_tv_recording_contract.dart';
import 'package:boltbytes_media/src/shared_core/notification_contract.dart';

void main() {
  group('TV shared-core public contracts', () {
    final contracts = <String, List<String>>{
      'lib/src/shared_core/client_preferences_contract.dart': [
        'abstract interface class ClientPreferencesContract',
        'Future<ClientPreferences> load',
        'saveProfilePreferences',
        'saveDevicePreferences',
        'checkForUpdate',
      ],
      'lib/src/shared_core/notification_contract.dart': [
        'abstract interface class NotificationContract',
        'Future<List<ClientNotification>> load',
        'markRead',
        'markAllRead',
        'unreadCount',
      ],
      'lib/src/shared_core/live_tv_contract.dart': [
        'abstract interface class LiveTvContract',
        'loadGuide',
        'setFavorite',
        'authorize',
        'pollStatus',
        'heartbeat',
        'switchChannel',
        'release',
      ],
      'lib/src/shared_core/live_tv_recording_contract.dart': [
        'abstract interface class LiveTvRecordingContract',
        'scheduleProgram',
        'authorizePlayback',
      ],
      'lib/src/shared_core/offline_library_contract.dart': [
        'abstract interface class OfflineLibraryContract',
        'loadForProfile',
        'hasPlayable',
        'queue',
        'sync',
        'remove',
        'saveProgress',
      ],
      'lib/src/shared_core/playback/playback_session_controller.dart': [
        'abstract interface class TvPlaybackController',
        'class PlaybackSessionController',
        'class PlaybackViewState',
      ],
    };

    for (final entry in contracts.entries) {
      test('${entry.key} exposes the stable surface', () {
        final source = File(entry.key).readAsStringSync();
        for (final declaration in entry.value) {
          expect(source, contains(declaration), reason: entry.key);
        }
      });
    }
  });

  test('shared use cases retain the existing backend routes', () {
    final source = [
      'lib/src/shared_core/client_preferences_contract.dart',
      'lib/src/shared_core/notification_contract.dart',
      'lib/src/shared_core/live_tv_contract.dart',
    ].map((path) => File(path).readAsStringSync()).join('\n');

    for (final route in <String>[
      '/profiles/me/preferences',
      '/devices/me/preferences',
      '/client-services/notifications',
      '/live-tv/guide',
      '/live-tv/playback/authorize',
      '/live-tv/guide/channels/',
      '/live-tv/playback/leases/',
    ]) {
      expect(source, contains(route), reason: 'Missing route contract: $route');
    }
  });

  test('TV shell owns the offline application stage', () {
    final source = File('lib/src/tv/tv_screens.dart').readAsStringSync();
    expect(source, contains('buildOfflineScreen'));
    expect(source, contains('TvDownloadsScreen'));
  });

  test('preferences parse and serialize typed profile and device values', () {
    final profile = ProfilePreferences.fromJson({
      'preferredAudioLanguages': ['da', 'en'],
      'preferredSubtitleLanguages': ['da'],
      'subtitleMode': 'always',
      'subtitleStyle': 'broadcast',
      'subtitleSizePercent': 500,
      'subtitleBottomOffsetPercent': 1,
      'subtitleTimingOffsetMs': -9000,
      'autoplayNext': false,
      'recommendationsEnabled': false,
    });
    final device = DevicePreferences.fromJson({
      'qualityMode': 'fixed',
      'fixedQualityHeight': 1080,
      'allowUpscale': false,
      'upscaleMode': 'server',
      'bufferProfile': 'stable',
      'dataSaver': true,
      'playbackRate': 8,
      'hdrMode': 'sdr',
    });

    expect(profile.preferredAudioLanguages, ['da', 'en']);
    expect(profile.subtitleSizePercent, 150);
    expect(profile.subtitleBottomOffsetPercent, 4);
    expect(profile.subtitleTimingOffsetMs, -5000);
    expect(profile.toJson()['autoplayNext'], isFalse);
    expect(device.upscaleMode, 'server');
    expect(device.bufferProfile, 'stable');
    expect(device.toJson()['bufferProfile'], 'stable');
    expect(device.fixedQualityHeight, 1080);
    expect(device.playbackRate, 2);
    expect(device.toJson()['dataSaver'], isTrue);
  });

  test('notification parser preserves unread state and timestamps', () {
    final unread = ClientNotification.fromJson({
      'id': 'notice-1',
      'title': 'Ny episode',
      'body': 'Episode 2 er klar',
      'createdAt': '2026-08-24T10:00:00Z',
    });
    final read = ClientNotification.fromJson({
      'id': 'notice-2',
      'createdAt': '2026-08-24T10:00:00Z',
      'readAt': '2026-08-24T10:01:00Z',
    });

    expect(unread.unread, isTrue);
    expect(unread.createdAt.toUtc().year, 2026);
    expect(read.unread, isFalse);
  });

  test('Live TV parser retains guide, EPG and lease fields', () {
    final guide = LiveTvGuide.fromJson({
      'availableTotal': 2,
      'total': 1,
      'page': 1,
      'totalPages': 1,
      'groups': [
        {'name': 'Danske', 'count': 1},
      ],
      'channels': [
        {
          'id': 'dr1',
          'name': 'DR1',
          'number': 1,
          'favorite': true,
          'programs': [
            {
              'id': 'program-1',
              'title': 'Nyheder',
              'startsAt': '2026-08-24T10:00:00Z',
              'endsAt': '2026-08-24T10:30:00Z',
            },
          ],
        },
      ],
    });
    final session = LiveTvSession.fromJson({
      'leaseId': 'lease-1',
      'method': 'direct_play',
      'status': 'ready',
      'streamToken': 'secret',
      'streamUrl': '/stream/live.m3u8',
      'statusUrl': '/status',
      'heartbeatUrl': '/heartbeat',
      'releaseUrl': '/release',
    });

    expect(guide.groups.single.name, 'Danske');
    expect(guide.channels.single.programs.single.title, 'Nyheder');
    expect(guide.channels.single.favorite, isTrue);
    expect(session.ready, isTrue);
    expect(session.leaseId, 'lease-1');
  });

  test('Live TV recording parser retains playable and error states', () {
    final recording = LiveTvRecording.fromJson({
      'id': 'recording-1',
      'title': 'Nyhederne',
      'status': 'completed',
      'progress': 1,
      'ready': true,
      'startsAt': '2026-08-24T10:00:00Z',
      'endsAt': '2026-08-24T10:30:00Z',
      'sizeBytes': '1234',
      'channel': {'name': 'DR1'},
    });

    expect(recording.ready, isTrue);
    expect(recording.removable, isTrue);
    expect(recording.channelName, 'DR1');
    expect(recording.sizeBytes, 1234);
  });
}
