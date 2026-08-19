import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract interface class SessionStorage {
  Future<String?> readAccessToken();
  Future<String?> readRefreshToken();
  Future<void> writeTokens(String accessToken, String refreshToken);
  Future<void> clearTokens();
}

class DeviceSessionStore implements SessionStorage {
  DeviceSessionStore({
    FlutterSecureStorage? secureStorage,
    SharedPreferencesAsync? preferences,
  }) : _secure =
           secureStorage ?? FlutterSecureStorage(aOptions: AndroidOptions()),
       _preferences = preferences ?? SharedPreferencesAsync();

  static const _accessKey = 'bb_media_access_token';
  static const _refreshKey = 'bb_media_refresh_token';
  static const _serverKey = 'bb_media_server_url';
  static const _deviceKey = 'bb_media_device_fingerprint';
  static const _cachedUserKey = 'bb_media_cached_user';

  final FlutterSecureStorage _secure;
  final SharedPreferencesAsync _preferences;

  @override
  Future<String?> readAccessToken() => _secure.read(key: _accessKey);

  @override
  Future<String?> readRefreshToken() => _secure.read(key: _refreshKey);

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {
    await Future.wait([
      _secure.write(key: _accessKey, value: accessToken),
      _secure.write(key: _refreshKey, value: refreshToken),
    ]);
  }

  @override
  Future<void> clearTokens() async {
    await Future.wait([
      _secure.delete(key: _accessKey),
      _secure.delete(key: _refreshKey),
    ]);
  }

  Future<String?> readServerUrl() => _preferences.getString(_serverKey);

  Future<void> writeServerUrl(String value) =>
      _preferences.setString(_serverKey, value);

  Future<void> writeCachedUser(dynamic value) =>
      _secure.write(key: _cachedUserKey, value: jsonEncode(value));

  Future<dynamic> readCachedUser() async {
    final value = await _secure.read(key: _cachedUserKey);
    return value == null ? null : jsonDecode(value);
  }

  Future<void> clearCachedUser() => _secure.delete(key: _cachedUserKey);

  Future<String> deviceFingerprint() async {
    final existing = await _preferences.getString(_deviceKey);
    if (existing != null && existing.length >= 16) return existing;
    final random = Random.secure();
    final bytes = List<int>.generate(24, (_) => random.nextInt(256));
    final value = bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
    await _preferences.setString(_deviceKey, value);
    return value;
  }
}
