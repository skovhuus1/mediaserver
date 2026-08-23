import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemoryStorage implements SessionStorage {
  _MemoryStorage({this.access, this.refresh});

  String? access;
  String? refresh;

  @override
  Future<void> clearTokens() async {
    access = null;
    refresh = null;
  }

  @override
  Future<String?> readAccessToken() async => access;

  @override
  Future<String?> readRefreshToken() async => refresh;

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {
    access = accessToken;
    refresh = refreshToken;
  }
}

void main() {
  test('a 401 rotates tokens once and retries the original request', () async {
    final storage = _MemoryStorage(access: 'expired', refresh: 'refresh-token');
    var meCalls = 0;
    var refreshCalls = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        expect(jsonDecode(request.body)['refreshToken'], 'refresh-token');
        return http.Response(
          jsonEncode({'accessToken': 'fresh', 'refreshToken': 'rotated'}),
          200,
        );
      }
      if (request.url.path.endsWith('/auth/me')) {
        meCalls++;
        if (meCalls == 1) {
          return http.Response(jsonEncode({'message': 'expired'}), 401);
        }
        expect(request.headers['authorization'], 'Bearer fresh');
        return http.Response(jsonEncode({'id': 'user-1', 'profiles': []}), 200);
      }
      return http.Response('not found', 404);
    });
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: storage,
      httpClient: client,
    );
    await api.restoreTokens();

    final me = await api.getJson('/auth/me') as Map<String, dynamic>;

    expect(me['id'], 'user-1');
    expect(meCalls, 2);
    expect(refreshCalls, 1);
    expect(storage.access, 'fresh');
    expect(storage.refresh, 'rotated');
  });

  test('normalizes relative playback and metadata URLs safely', () {
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: _MemoryStorage(),
    );

    expect(
      api.endpoint('/playback/context').toString(),
      'https://media.example.test/api/v1/playback/context',
    );
    expect(
      api
          .endpoint(
            '/api/v1/playback/sessions/session-1/transcode-status?token=secret&generation=one',
          )
          .toString(),
      'https://media.example.test/api/v1/playback/sessions/session-1/transcode-status?token=secret&generation=one',
    );
    expect(
      api.endpoint('api/v1/playback/context').toString(),
      'https://media.example.test/api/v1/playback/context',
    );
    expect(
      api.endpoint('https://stream.example.test/video.m3u8').toString(),
      'https://stream.example.test/video.m3u8',
    );
    expect(
      api.absoluteMediaUrl('/api/v1/playback/stream'),
      'https://media.example.test/api/v1/playback/stream',
    );
    expect(
      api.absoluteMediaUrl('/poster.jpg'),
      'https://image.tmdb.org/t/p/w780/poster.jpg',
    );
  });

  test('redacts playback tokens from server error messages', () async {
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: _MemoryStorage(),
      httpClient: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'message':
                'Cannot GET /api/v1/playback/status?token=secret-stream-token&generation=one',
          }),
          404,
        ),
      ),
    );

    await expectLater(
      api.getJson('/api/v1/playback/status?token=secret-stream-token'),
      throwsA(
        isA<ApiException>()
            .having(
              (failure) => failure.message,
              'message',
              contains('token=[redacted]'),
            )
            .having(
              (failure) => failure.message,
              'message',
              isNot(contains('secret-stream-token')),
            ),
      ),
    );
  });

  test('starts and consumes TV QR login with absolute approval URL', () async {
    final storage = _MemoryStorage();
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/tv/start')) {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['deviceFingerprint'], 'fingerprint-123');
        expect(body['deviceName'], 'BoltBytes Android TV');
        expect(body['deviceType'], 'tv');
        return http.Response(
          jsonEncode({
            'pairingId': '00000000-0000-0000-0000-000000000001',
            'status': 'pending',
            'userCode': '123 456',
            'approveUrl': '/login/tv?token=approve-token',
            'approvePath': '/login/tv?token=approve-token',
            'pollToken': 'poll-token-with-enough-length-to-pass-client',
            'pollIntervalSeconds': 2,
            'expiresAt': '2026-08-23T12:00:00.000Z',
          }),
          200,
        );
      }
      if (request.url.path.endsWith('/auth/tv/poll')) {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body['pairingId'], '00000000-0000-0000-0000-000000000001');
        expect(body['pollToken'], 'poll-token');
        return http.Response(
          jsonEncode({
            'status': 'approved',
            'accessToken': 'access-tv',
            'refreshToken': 'refresh-tv',
            'expiresIn': 900,
          }),
          200,
        );
      }
      return http.Response('not found', 404);
    });
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: storage,
      httpClient: client,
    );

    final pairing = await api.startTvLogin(
      deviceFingerprint: 'fingerprint-123',
      deviceName: 'BoltBytes Android TV',
      deviceType: 'tv',
    );
    final approved = await api.pollTvLogin(
      pairingId: '00000000-0000-0000-0000-000000000001',
      pollToken: 'poll-token',
    );

    expect(
      pairing['approveUrl'],
      'https://media.example.test/login/tv?token=approve-token',
    );
    expect(approved['status'], 'approved');
    expect(storage.access, 'access-tv');
    expect(storage.refresh, 'refresh-tv');
  });
}
