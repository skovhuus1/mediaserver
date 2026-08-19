import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'app_config.dart';

const _firebaseApiKey = String.fromEnvironment('BB_MEDIA_FIREBASE_API_KEY');
const _firebaseAppId = String.fromEnvironment('BB_MEDIA_FIREBASE_APP_ID');
const _firebaseSenderId = String.fromEnvironment(
  'BB_MEDIA_FIREBASE_MESSAGING_SENDER_ID',
);
const _firebaseProjectId = String.fromEnvironment(
  'BB_MEDIA_FIREBASE_PROJECT_ID',
);

FirebaseOptions? get boltBytesFirebaseOptions {
  if ([
    _firebaseApiKey,
    _firebaseAppId,
    _firebaseSenderId,
    _firebaseProjectId,
  ].any((value) => value.trim().isEmpty)) {
    return null;
  }
  return const FirebaseOptions(
    apiKey: _firebaseApiKey,
    appId: _firebaseAppId,
    messagingSenderId: _firebaseSenderId,
    projectId: _firebaseProjectId,
  );
}

@pragma('vm:entry-point')
Future<void> boltBytesFirebaseBackgroundHandler(RemoteMessage message) async {
  final options = boltBytesFirebaseOptions;
  if (options == null) return;
  await Firebase.initializeApp(options: options);
}

class PushNotifications extends ChangeNotifier {
  PushNotifications._();

  static final instance = PushNotifications._();

  ApiClient? _api;
  bool _initialized = false;
  RemoteMessage? foregroundMessage;
  String? status;

  static void installBackgroundHandler() {
    if (boltBytesFirebaseOptions != null) {
      FirebaseMessaging.onBackgroundMessage(boltBytesFirebaseBackgroundHandler);
    }
  }

  Future<void> configure(ApiClient api) async {
    _api = api;
    final options = boltBytesFirebaseOptions;
    if (options == null) {
      status = 'Firebase er ikke konfigureret.';
      return;
    }
    try {
      if (!_initialized) {
        await Firebase.initializeApp(options: options);
        final messaging = FirebaseMessaging.instance;
        await messaging.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
        messaging.onTokenRefresh.listen(
          (token) => unawaited(_register(token).catchError((_) {})),
        );
        FirebaseMessaging.onMessage.listen((message) {
          foregroundMessage = message;
          notifyListeners();
        });
        _initialized = true;
      }
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) await _register(token);
      status = 'Aktiv';
    } catch (error) {
      status = 'Push kunne ikke initialiseres: $error';
    }
  }

  Future<void> _register(String token) async {
    final api = _api;
    if (api == null) return;
    await api.postJson('/client-services/push/register', {
      'token': token,
      'platform': defaultTargetPlatform.name,
      'appVersion': AppConfig.appVersion,
    });
  }

  Future<void> unregister() async {
    final api = _api;
    if (api == null || !_initialized) return;
    try {
      await api.deleteJson('/client-services/push/register');
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {
      // Logout must continue even when the device is temporarily offline.
    }
  }

  void dismissForeground() {
    foregroundMessage = null;
    notifyListeners();
  }
}
