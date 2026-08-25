import 'dart:async';
import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
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
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/tv/start')) {
        return http.Response(
          jsonEncode({
            'pairingId': '00000000-0000-0000-0000-000000000001',
            'status': 'pending',
            'userCode': 'ABCD-2345',
            'approveUrl':
                'https://media.example.test/login/tv?token=approve-token',
            'approvePath': '/login/tv?token=approve-token',
            'pollToken': 'poll-token-with-enough-length',
            'pollIntervalSeconds': 30,
            'expiresAt': DateTime.now()
                .add(const Duration(minutes: 10))
                .toUtc()
                .toIso8601String(),
          }),
          200,
        );
      }
      if (request.url.path.endsWith('/auth/tv/poll')) {
        return http.Response(
          jsonEncode({'status': 'pending', 'pollIntervalSeconds': 30}),
          200,
        );
      }
      return http.Response('not found', 404);
    });
    addTearDown(client.close);
    final controller = AppController(
      api: ApiClient(
        baseUrl: 'https://media.boltbytes.com/api/v1',
        storage: storage,
        httpClient: client,
      ),
      storage: storage,
    )..serverUrl = 'https://media.boltbytes.com/api/v1';

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Log ind med e-mail'), findsOneWidget);
    expect(find.text('Log ind med QR-kode'), findsOneWidget);
    expect(find.text('E-mail'), findsOneWidget);
    expect(find.text('Adgangskode'), findsOneWidget);
    expect(find.text('ABCD-2345'), findsOneWidget);
    expect(find.text('Skift'), findsNothing);
    expect(find.text('Vis QR-kode'), findsNothing);
    expect(find.textContaining('Dit bibliotek'), findsNothing);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-email');

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-password');

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-submit');

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-login-qr-action',
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV login never exposes server editing', (tester) async {
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

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-email');
    expect(find.text('E-mail'), findsOneWidget);
    expect(find.text('Adgangskode'), findsOneWidget);
    expect(find.text('Skift'), findsNothing);
    expect(find.text('Vis QR-kode'), findsNothing);
    expect(find.text('Prøv igen'), findsOneWidget);
    expect(find.text('QR-login er ikke tilgængeligt lige nu.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV Back closes the keyboard and preserves D-pad focus', (
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

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-email');
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    await tester.pump();

    final handled = await tester.binding.handlePopRoute();
    await tester.pump();

    expect(handled, isTrue);
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-email');

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-login-password');
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV QR login recovers automatically after a start failure', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    var startCalls = 0;
    final storage = _MemorySessionStorage();
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/tv/start')) {
        startCalls += 1;
        if (startCalls == 1) {
          return http.Response(
            jsonEncode({'message': 'temporary outage'}),
            503,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          jsonEncode({
            'pairingId': '00000000-0000-0000-0000-000000000002',
            'status': 'pending',
            'userCode': 'RETRY-2345',
            'approveUrl':
                'https://media.example.test/login/tv?token=retry-token',
            'approvePath': '/login/tv?token=retry-token',
            'pollToken': 'retry-poll-token-with-enough-length',
            'pollIntervalSeconds': 30,
            'expiresAt': DateTime.now()
                .add(const Duration(minutes: 10))
                .toUtc()
                .toIso8601String(),
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
    )..serverUrl = 'https://media.example.test/api/v1';

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(startCalls, 1);
    expect(find.text('Prøv igen'), findsOneWidget);

    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 200));

    expect(startCalls, 2);
    expect(find.text('RETRY-2345'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV replaces an expired QR code without user input', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    var startCalls = 0;
    final storage = _MemorySessionStorage();
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/tv/start')) {
        startCalls += 1;
        final expired = startCalls == 1;
        return http.Response(
          jsonEncode({
            'pairingId': '00000000-0000-0000-0000-000000000004',
            'status': 'pending',
            'userCode': expired ? 'OLD-0001' : 'NEW-0002',
            'approveUrl':
                'https://media.example.test/login/tv?token=$startCalls',
            'approvePath': '/login/tv?token=$startCalls',
            'pollToken': 'poll-token-$startCalls-with-enough-length',
            'pollIntervalSeconds': 30,
            'expiresAt':
                (expired
                        ? DateTime.now().subtract(const Duration(minutes: 1))
                        : DateTime.now().add(const Duration(minutes: 10)))
                    .toUtc()
                    .toIso8601String(),
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
    )..serverUrl = 'https://media.example.test/api/v1';

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('OLD-0001'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 700));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 200));

    expect(startCalls, 2);
    expect(find.text('NEW-0002'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('manual login pauses QR polling until the request completes', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final loginResponse = Completer<http.Response>();
    var pollCalls = 0;
    final storage = _MemorySessionStorage();
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/auth/tv/start')) {
        return http.Response(
          jsonEncode({
            'pairingId': '00000000-0000-0000-0000-000000000003',
            'status': 'pending',
            'userCode': 'PAUSE-2345',
            'approveUrl':
                'https://media.example.test/login/tv?token=pause-token',
            'approvePath': '/login/tv?token=pause-token',
            'pollToken': 'pause-poll-token-with-enough-length',
            'pollIntervalSeconds': 30,
            'expiresAt': DateTime.now()
                .add(const Duration(minutes: 10))
                .toUtc()
                .toIso8601String(),
          }),
          200,
        );
      }
      if (request.url.path.endsWith('/auth/login')) {
        return loginResponse.future;
      }
      if (request.url.path.endsWith('/auth/tv/poll')) {
        pollCalls += 1;
        return http.Response(
          jsonEncode({'status': 'pending', 'pollIntervalSeconds': 30}),
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
    )..serverUrl = 'https://media.example.test/api/v1';

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: LoginScreen(controller: controller),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    await tester.enterText(find.byType(TextFormField).at(0), 'tv@example.test');
    await tester.enterText(find.byType(TextFormField).at(1), 'secret-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Log ind'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(pollCalls, 0);

    loginResponse.complete(
      http.Response(
        jsonEncode({'message': 'Forkert login'}),
        401,
        headers: {'content-type': 'application/json'},
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump(const Duration(milliseconds: 1100));

    expect(pollCalls, greaterThanOrEqualTo(1));
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test(
    'approved TV pairing publishes the library stage to the app router',
    () async {
      final storage = _MemorySessionStorage();
      final client = MockClient((request) async {
        if (request.url.path.endsWith('/auth/tv/start')) {
          return http.Response(
            jsonEncode({
              'pairingId': '00000000-0000-0000-0000-000000000001',
              'status': 'pending',
              'userCode': 'ABCD-2345',
              'approveUrl':
                  'https://media.example.test/login/tv?token=approve-token',
              'approvePath': '/login/tv?token=approve-token',
              'pollToken': 'poll-token-with-enough-length',
              'pollIntervalSeconds': 2,
              'expiresAt': DateTime.now()
                  .add(const Duration(minutes: 10))
                  .toIso8601String(),
            }),
            200,
          );
        }
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
      final pairing = await controller.startTvLogin(
        requestedServerUrl: 'https://media.example.test/api/v1',
      );
      expect(pairing, isNotNull);

      final result = await controller.pollTvLogin(pairing!);

      expect(result.isApproved, isTrue);
      expect(storage.accessToken, 'tv-access-token');
      expect(storage.refreshToken, 'tv-refresh-token');
      expect(controller.stage, AppStage.library);
      expect(controller.activeProfile?.id, 'profile-1');
      expect(notifications, greaterThan(0));
    },
  );
}
