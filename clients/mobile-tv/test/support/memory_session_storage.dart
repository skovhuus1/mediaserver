import 'package:boltbytes_media/src/core/session_store.dart';

class MemorySessionStorage implements DeviceSessionStorage {
  String? accessToken;
  String? refreshToken;
  String? serverUrl;
  dynamic cachedUser;

  @override
  Future<void> clearCachedUser() async => cachedUser = null;

  @override
  Future<void> clearTokens() async {
    accessToken = null;
    refreshToken = null;
  }

  @override
  Future<String> deviceFingerprint() async => 'test-device-fingerprint';

  @override
  Future<dynamic> readCachedUser() async => cachedUser;

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<String?> readServerUrl() async => serverUrl;

  @override
  Future<void> writeCachedUser(dynamic value) async => cachedUser = value;

  @override
  Future<void> writeServerUrl(String value) async => serverUrl = value;

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
}
