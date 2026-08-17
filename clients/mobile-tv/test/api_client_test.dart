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
      api.absoluteMediaUrl('/api/v1/playback/stream'),
      'https://media.example.test/api/v1/playback/stream',
    );
    expect(
      api.absoluteMediaUrl('/poster.jpg'),
      'https://image.tmdb.org/t/p/w780/poster.jpg',
    );
  });
}
