import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:boltbytes_media/src/screens/auth_screens.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemorySessionStorage implements DeviceSessionStorage {
  String? accessToken;
  String? refreshToken;
  String? serverUrl;
  dynamic cachedUser;

  @override
  Future<void> clearTokens() async {
    accessToken = null;
    refreshToken = null;
  }

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  @override
  Future<void> clearCachedUser() async => cachedUser = null;

  @override
  Future<String> deviceFingerprint() async => 'test-device-fingerprint';

  @override
  Future<dynamic> readCachedUser() async => cachedUser;

  @override
  Future<String?> readServerUrl() async => serverUrl;

  @override
  Future<void> writeCachedUser(dynamic value) async => cachedUser = value;

  @override
  Future<void> writeServerUrl(String value) async => serverUrl = value;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('TV login has deterministic D-pad focus and visible actions', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final storage = _MemorySessionStorage();
    final controller = AppController(
      api: ApiClient(
        baseUrl: 'https://media.boltbytes.com/api/v1',
        storage: storage,
      ),
      storage: storage,
    )..serverUrl = 'https://media.boltbytes.com/api/v1';

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Vis QR-kode'), findsOneWidget);
    expect(find.textContaining('pil op/ned'), findsOneWidget);
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-login-qr-action',
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-login-manual-toggle',
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Brug QR-login i stedet'), findsOneWidget);
    expect(find.text('E-mail'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV login focuses editable server before network actions', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final storage = _MemorySessionStorage();
    final controller = AppController(
      api: ApiClient(baseUrl: 'http://localhost:6555', storage: storage),
      storage: storage,
    )..serverUrl = '';

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pumpAndSettle();

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-server');
    expect(find.text('Vis QR-kode'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test(
    'approved TV pairing publishes the library stage to the app router',
    () async {
      final storage = _MemorySessionStorage();
      final client = MockClient((request) async {
        if (request.url.path.endsWith('/auth/tv/poll')) {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['pairingId'], '00000000-0000-0000-0000-000000000001');
          expect(body['pollToken'], 'poll-token-with-enough-length');
          return http.Response(
            jsonEncode({
              'status': 'approved',
              'accessToken': 'tv-access-token',
              'refreshToken': 'tv-refresh-token',
              'expiresIn': 900,
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/auth/me')) {
          expect(request.headers['authorization'], 'Bearer tv-access-token');
          return http.Response(
            jsonEncode({
              'id': 'user-1',
              'email': 'viewer@example.test',
              'displayName': 'TV Viewer',
              'roles': ['customer'],
              'activeProfileId': 'profile-1',
              'profiles': [
                {
                  'id': 'profile-1',
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
      addTearDown(client.close);
      final controller = AppController(
        api: ApiClient(
          baseUrl: 'https://media.example.test/api/v1',
          storage: storage,
          httpClient: client,
        ),
        storage: storage,
      );
      var notifications = 0;
      controller.addListener(() => notifications++);
      final pairing = TvLoginPairing(
        pairingId: '00000000-0000-0000-0000-000000000001',
        status: 'pending',
        userCode: 'ABCD-2345',
        approveUrl: 'https://media.example.test/login/tv?token=approve-token',
        approvePath: '/login/tv?token=approve-token',
        pollToken: 'poll-token-with-enough-length',
        pollIntervalSeconds: 2,
        expiresAt: DateTime.now().add(const Duration(minutes: 10)),
      );

      final result = await controller.pollTvLogin(pairing);

      expect(result.isApproved, isTrue);
      expect(storage.accessToken, 'tv-access-token');
      expect(storage.refreshToken, 'tv-refresh-token');
      expect(controller.stage, AppStage.library);
      expect(controller.activeProfile?.id, 'profile-1');
      expect(notifications, greaterThan(0));
    },
  );
}
