import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/app_config.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/memory_session_storage.dart';

void main() {
  test('approved QR login commits TV stage immediately', () async {
    final storage = MemorySessionStorage();
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/tv/start')) {
        return http.Response(
          jsonEncode({
            'pairingId': '00000000-0000-4000-8000-000000000001',
            'status': 'pending',
            'userCode': 'TV-1234',
            'approveUrl': '/login/tv?token=approval',
            'approvePath': '/login/tv?token=approval',
            'pollToken': 'poll-token-long-enough',
            'pollIntervalSeconds': 1,
            'expiresAt': DateTime.now()
                .add(const Duration(minutes: 5))
                .toIso8601String(),
          }),
          200,
        );
      }
      if (request.url.path.endsWith('/auth/tv/poll')) {
        return http.Response(
          jsonEncode({
            'status': 'approved',
            'accessToken': 'access',
            'refreshToken': 'refresh',
          }),
          200,
        );
      }
      if (request.url.path.endsWith('/auth/me')) {
        return http.Response(
          jsonEncode({
            'id': 'user-1',
            'email': 'viewer@example.test',
            'roles': ['customer'],
            'activeProfileId': '00000000-0000-4000-8000-000000000010',
            'profiles': [
              {
                'id': '00000000-0000-4000-8000-000000000010',
                'name': 'Stuen',
                'hasPin': false,
                'isChildProfile': false,
              },
            ],
          }),
          200,
        );
      }
      return http.Response('not found', 404);
    });
    final api = ApiClient(
      baseUrl: 'https://media.boltbytes.com/api/v1',
      storage: storage,
      httpClient: client,
    );
    final controller = AppController(
      api: api,
      storage: storage,
      runtimeConfig: AppRuntimeConfig.tv(),
    );

    final pairing = await controller.startTvLogin(
      requestedServerUrl: 'https://ignored.example.test',
    );
    final result = await controller.pollTvLogin(pairing!);

    expect(result.isApproved, isTrue);
    expect(controller.stage, AppStage.library);
    expect(controller.activeProfile?.name, 'Stuen');
    expect(api.hasRefreshToken, isTrue);
    client.close();
  });
}
