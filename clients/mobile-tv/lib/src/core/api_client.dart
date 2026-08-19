import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_config.dart';
import 'session_store.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.code, this.statusCode});

  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({
    required String baseUrl,
    required this.storage,
    http.Client? httpClient,
  }) : _baseUri = Uri.parse(AppConfig.normalizeApiUrl(baseUrl)),
       _http = httpClient ?? http.Client();

  Uri _baseUri;
  final SessionStorage storage;
  final http.Client _http;
  String? _accessToken;
  String? _refreshToken;
  Future<void>? _refreshing;

  String get baseUrl => _baseUri.toString();
  bool get hasRefreshToken => _refreshToken?.isNotEmpty ?? false;

  void configureBaseUrl(String value) {
    _baseUri = Uri.parse(AppConfig.normalizeApiUrl(value));
  }

  Future<void> restoreTokens() async {
    _accessToken = await storage.readAccessToken();
    _refreshToken = await storage.readRefreshToken();
  }

  Uri endpoint(String path) {
    final value = path.trim();
    final parsed = Uri.tryParse(value);
    if (parsed != null && parsed.hasScheme) return parsed;
    final clean = value.replaceFirst(RegExp(r'^/+'), '');
    if (clean == 'api' || clean.startsWith('api/')) {
      return Uri.parse('${_baseUri.origin}/$clean');
    }
    final base = _baseUri.toString().replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base/$clean');
  }

  String absoluteMediaUrl(String? path, {String imageSize = 'w780'}) {
    if (path == null || path.trim().isEmpty) return '';
    final value = path.trim();
    final parsed = Uri.tryParse(value);
    if (parsed != null && parsed.hasScheme) return value;
    if (value.startsWith('/api/')) return '${_baseUri.origin}$value';
    if (value.startsWith('/')) {
      return 'https://image.tmdb.org/t/p/$imageSize$value';
    }
    return '${_baseUri.origin}/${value.replaceFirst(RegExp(r'^/+'), '')}';
  }

  Future<dynamic> getJson(String path) => _request('GET', path);
  Future<dynamic> postJson(String path, [Map<String, dynamic>? body]) =>
      _request('POST', path, body: body);
  Future<dynamic> putJson(String path, [Map<String, dynamic>? body]) =>
      _request('PUT', path, body: body);
  Future<dynamic> patchJson(String path, [Map<String, dynamic>? body]) =>
      _request('PATCH', path, body: body);
  Future<dynamic> deleteJson(String path) => _request('DELETE', path);

  Future<String> getText(String path) async {
    final response = await _send('GET', path, retryAfterRefresh: true);
    return utf8.decode(response.bodyBytes);
  }

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
    required String deviceFingerprint,
    required String deviceName,
    required String deviceType,
  }) async {
    final result = _asMap(
      await _request(
        'POST',
        '/auth/login',
        body: {
          'email': email,
          'password': password,
          'deviceFingerprint': deviceFingerprint,
          'deviceName': deviceName,
          'deviceType': deviceType,
          'platform': 'android',
          'appVersion': AppConfig.appVersion,
        },
        allowRefresh: false,
      ),
    );
    await _captureTokens(result);
    return result;
  }

  Future<Map<String, dynamic>> completePasswordChange(
    String token,
    String password,
  ) async {
    final result = _asMap(
      await _request(
        'POST',
        '/auth/complete-password-change',
        body: {'token': token, 'newPassword': password},
        allowRefresh: false,
      ),
    );
    await _captureTokens(result);
    return result;
  }

  Future<void> refresh({String? profileId, String? profilePin}) async {
    final token = _refreshToken;
    if (token == null || token.isEmpty) {
      throw const ApiException(
        'Sessionen er udløbet. Log ind igen.',
        code: 'no_refresh_token',
      );
    }
    final result = _asMap(
      await _request(
        'POST',
        '/auth/refresh',
        body: {
          'refreshToken': token,
          'profileId': ?profileId,
          'profilePin': ?(profilePin?.isNotEmpty == true ? profilePin : null),
        },
        allowRefresh: false,
      ),
    );
    await _captureTokens(result);
  }

  Future<void> logout() async {
    final token = _refreshToken;
    try {
      if (token != null) {
        await _request(
          'POST',
          '/auth/logout',
          body: {'refreshToken': token},
          allowRefresh: false,
        );
      }
    } finally {
      _accessToken = null;
      _refreshToken = null;
      await storage.clearTokens();
    }
  }

  Future<void> clearLocalSession() async {
    _accessToken = null;
    _refreshToken = null;
    await storage.clearTokens();
  }

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool allowRefresh = true,
  }) async {
    final response = await _send(
      method,
      path,
      body: body,
      retryAfterRefresh: allowRefresh,
    );
    if (response.statusCode == 204 || response.bodyBytes.isEmpty) return null;
    try {
      return jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      throw ApiException(
        'Serveren returnerede et ugyldigt svar.',
        statusCode: response.statusCode,
      );
    }
  }

  Future<http.Response> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    required bool retryAfterRefresh,
  }) async {
    Future<http.Response> execute() {
      final headers = <String, String>{
        'accept': 'application/json',
        if (body != null) 'content-type': 'application/json',
        if (_accessToken != null) 'authorization': 'Bearer $_accessToken',
      };
      final encoded = body == null ? null : jsonEncode(body);
      final uri = endpoint(path);
      return switch (method) {
        'POST' => _http.post(uri, headers: headers, body: encoded),
        'PATCH' => _http.patch(uri, headers: headers, body: encoded),
        'PUT' => _http.put(uri, headers: headers, body: encoded),
        'DELETE' => _http.delete(uri, headers: headers),
        _ => _http.get(uri, headers: headers),
      };
    }

    var response = await execute();
    if (response.statusCode == 401 && retryAfterRefresh && hasRefreshToken) {
      await _refreshOnce();
      response = await execute();
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _apiError(response);
    }
    return response;
  }

  Future<void> _refreshOnce() {
    final active = _refreshing;
    if (active != null) return active;
    final operation = refresh();
    _refreshing = operation;
    return operation.whenComplete(() => _refreshing = null);
  }

  Future<void> _captureTokens(Map<String, dynamic> result) async {
    final access = result['accessToken']?.toString();
    final refresh = result['refreshToken']?.toString();
    if (access == null || refresh == null) return;
    _accessToken = access;
    _refreshToken = refresh;
    await storage.writeTokens(access, refresh);
  }

  ApiException _apiError(http.Response response) {
    String message = 'Serverfejl (${response.statusCode}).';
    String? code;
    try {
      final json = _asMap(jsonDecode(utf8.decode(response.bodyBytes)));
      final nested = _asMap(json['error']);
      final rawMessage = json['message'] ?? nested['message'];
      if (rawMessage is List) {
        message = rawMessage.map((item) => item.toString()).join('\n');
      } else if (rawMessage != null) {
        message = rawMessage.toString();
      }
      code = (json['code'] ?? nested['code'])?.toString();
    } catch (_) {
      // Keep the status-based fallback for non-JSON proxy errors.
    }
    return ApiException(
      _redactSensitiveQueryParameters(message),
      code: code,
      statusCode: response.statusCode,
    );
  }
}

Map<String, dynamic> _asMap(dynamic value) =>
    value is Map<String, dynamic> ? value : <String, dynamic>{};

String _redactSensitiveQueryParameters(String value) => value.replaceAllMapped(
  RegExp(
    r'([?&](?:token|streamToken|accessToken|refreshToken|access_token)=)[^&\s]+',
    caseSensitive: false,
  ),
  (match) => '${match.group(1)}[redacted]',
);
