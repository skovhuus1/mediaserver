import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api_client.dart';
import 'app_config.dart';

class ClientTelemetry {
  ClientTelemetry._();

  static final instance = ClientTelemetry._();
  static const _storage = FlutterSecureStorage(aOptions: AndroidOptions());
  static const _storageKey = 'bb_media_pending_crashes_v1';
  static const _native = MethodChannel('boltbytes.media/crash_reporting');

  ApiClient? _api;
  bool _flushing = false;

  Future<void> configure(ApiClient api) async {
    _api = api;
    try {
      await _drainNative();
      await flush();
    } catch (_) {
      // Telemetry must never block login or normal playback.
    }
  }

  Future<void> capture(
    Object error,
    StackTrace stack, {
    String kind = 'dart_uncaught',
    Map<String, dynamic>? context,
  }) async {
    try {
      final queue = await _readQueue();
      queue.add({
        'kind': kind,
        'message': error.toString().takeSafe(4000),
        'stack': stack.toString().takeSafe(32000),
        'platform': 'android',
        'appVersion': AppConfig.appVersion,
        'occurredAt': DateTime.now().toUtc().toIso8601String(),
        'context': context ?? const <String, dynamic>{},
      });
      await _writeQueue(
        queue.length > 20 ? queue.sublist(queue.length - 20) : queue,
      );
      await flush();
    } catch (_) {
      // Error reporting must not become a second application failure.
    }
  }

  Future<void> flush() async {
    final api = _api;
    if (api == null || _flushing) return;
    _flushing = true;
    try {
      final queue = await _readQueue();
      var sent = 0;
      for (final report in queue) {
        try {
          await api.postJson('/client-services/crashes', report);
          sent += 1;
        } catch (_) {
          break;
        }
      }
      if (sent > 0) await _writeQueue(queue.sublist(sent));
    } finally {
      _flushing = false;
    }
  }

  Future<void> _drainNative() async {
    try {
      final values = await _native.invokeListMethod<dynamic>('drainPending');
      if (values == null || values.isEmpty) return;
      final queue = await _readQueue();
      for (final value in values) {
        if (value is Map) {
          final report = Map<String, dynamic>.from(value);
          report.putIfAbsent('platform', () => 'android');
          report.putIfAbsent('appVersion', () => AppConfig.appVersion);
          queue.add(report);
        }
      }
      await _writeQueue(queue);
    } catch (_) {
      // Native crash collection is optional on non-Android test platforms.
    }
  }

  Future<List<Map<String, dynamic>>> _readQueue() async {
    final raw = await _storage.read(key: _storageKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      return decoded is List
          ? decoded
                .whereType<Map>()
                .map((value) => Map<String, dynamic>.from(value))
                .toList()
          : [];
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeQueue(List<Map<String, dynamic>> queue) =>
      _storage.write(key: _storageKey, value: jsonEncode(queue));
}

extension on String {
  String takeSafe(int maximum) =>
      length <= maximum ? this : substring(0, maximum);
}
