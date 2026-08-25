import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/shared_core/playback/playback_session_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('TV playback request emits API-safe scalar types', () {
    final request = PlaybackAuthorizationRequest(
      profileId: '00000000-0000-4000-8000-000000000001',
      mediaId: '00000000-0000-4000-8000-000000000002',
      deviceId: '00000000-0000-4000-8000-000000000003',
      startPositionMs: -1,
      screenHeight: 9000.4,
      devicePixelRatio: 8,
      supportsHdr: true,
    ).toJson();

    final capabilities = request['capabilities'] as Map<String, dynamic>;
    expect(request['startPositionMs'], 0);
    expect(capabilities['screenHeight'], 4320);
    expect(capabilities['screenHeight'], isA<int>());
    expect(capabilities['devicePixelRatio'], 4.0);
    expect(capabilities['devicePixelRatio'], isA<double>());
    expect(capabilities['supportsHdr'], isTrue);
  });

  test('TV playback request rejects non-server identities', () {
    expect(
      () => PlaybackAuthorizationRequest(
        profileId: 'profile-local',
        mediaId: '00000000-0000-4000-8000-000000000002',
        deviceId: '00000000-0000-4000-8000-000000000003',
        startPositionMs: 0,
        screenHeight: 1080,
        devicePixelRatio: 1,
        supportsHdr: false,
      ),
      throwsA(isA<ApiException>()),
    );
  });

  test(
    'compatibility request omits capabilities rejected by older servers',
    () {
      final request = PlaybackAuthorizationRequest(
        profileId: '00000000-0000-4000-8000-000000000001',
        mediaId: '00000000-0000-4000-8000-000000000002',
        deviceId: '00000000-0000-4000-8000-000000000003',
        startPositionMs: 0,
        screenHeight: 1080,
        devicePixelRatio: 1,
        supportsHdr: false,
      );

      final current = request.toJson()['capabilities'] as Map<String, dynamic>;
      final compatibility =
          request.toJson(compatibility: true)['capabilities']
              as Map<String, dynamic>;

      expect(current, contains('supportedAudioCodecs'));
      expect(current, contains('upscaleMode'));
      expect(current['bufferProfile'], 'auto');
      expect(compatibility, isNot(contains('supportedAudioCodecs')));
      expect(compatibility, isNot(contains('upscaleMode')));
      expect(compatibility['supportedCodecs'], ['h264', 'hevc']);
      expect(compatibility['supportedContainers'], isNotEmpty);
    },
  );
}
