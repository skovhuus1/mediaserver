import 'dart:async';
import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/app_config.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:boltbytes_media/src/shared_core/bootstrap/startup_coordinator.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemoryStorage implements DeviceSessionStorage {
  String? accessToken;
  String? refreshToken;
  String? serverUrl;
  dynamic cachedUser;
  Completer<String?>? accessRead;
  Completer<String?>? refreshRead;
  int readServerCount = 0;
  int writeServerCount = 0;
  int writeTokensCount = 0;
  int clearTokensCount = 0;

  @override
  Future<void> clearCachedUser() async => cachedUser = null;

  @override
  Future<void> clearTokens() async {
    clearTokensCount += 1;
    accessToken = null;
    refreshToken = null;
  }

  @override
  Future<String> deviceFingerprint() async => 'runtime-test-device';

  @override
  Future<String?> readAccessToken() =>
      accessRead?.future ?? Future<String?>.value(accessToken);

  @override
  Future<dynamic> readCachedUser() async => cachedUser;

  @override
  Future<String?> readRefreshToken() =>
      refreshRead?.future ?? Future<String?>.value(refreshToken);

  @override
  Future<String?> readServerUrl() async {
    readServerCount += 1;
    return serverUrl;
  }

  @override
  Future<void> writeCachedUser(dynamic value) async => cachedUser = value;

  @override
  Future<void> writeServerUrl(String value) async {
    writeServerCount += 1;
    serverUrl = value;
  }

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {
    writeTokensCount += 1;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
}

class _ImmediateTimeoutScheduler implements StartupDeadlineScheduler {
  const _ImmediateTimeoutScheduler();

  @override
  Future<StartupDeadlineResult<T>> waitFor<T>({
    required Future<T> operation,
    required Duration deadline,
    required T Function() onTimeout,
  }) async => StartupDeadlineResult(
    value: onTimeout(),
    timedOut: true,
    elapsed: deadline,
  );
}

class _FirstTimeoutScheduler implements StartupDeadlineScheduler {
  int calls = 0;

  @override
  Future<StartupDeadlineResult<T>> waitFor<T>({
    required Future<T> operation,
    required Duration deadline,
    required T Function() onTimeout,
  }) {
    calls += 1;
    if (calls == 1) {
      return Future.value(
        StartupDeadlineResult(
          value: onTimeout(),
          timedOut: true,
          elapsed: deadline,
        ),
      );
    }
    return const FutureStartupDeadlineScheduler().waitFor(
      operation: operation,
      deadline: deadline,
      onTimeout: onTimeout,
    );
  }
}

Map<String, dynamic> get _cachedUser => {
  'id': 'user-1',
  'email': 'viewer@example.test',
  'displayName': 'Viewer',
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
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('runtime variants expose fixed TV and editable mobile policies', () {
    final tv = AppRuntimeConfig.tv();
    final mobile = AppRuntimeConfig.mobile();

    expect(tv.variant, AppVariant.tv);
    expect(tv.endpointPolicy, ServerEndpointPolicy.fixed);
    expect(
      tv.resolveServerUrl('https://evil.example.test'),
      AppConfig.productionApiUrl,
    );
    expect(tv.startupTimeout, const Duration(seconds: 8));
    expect(mobile.endpointPolicy, ServerEndpointPolicy.editable);
    expect(
      mobile.resolveServerUrl('staging.example.test'),
      'https://staging.example.test/api/v1',
    );
  });

  test('TV login ignores requested and persisted server URLs', () async {
    final storage = _MemoryStorage()
      ..serverUrl = 'https://persisted-evil.example.test/api/v1';
    late http.Request captured;
    final httpClient = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'passwordChangeRequired': true,
          'passwordChangeToken': 'change-token',
        }),
        200,
      );
    });
    addTearDown(httpClient.close);
    final controller = AppController(
      api: ApiClient(
        baseUrl: 'https://wrong.example.test/api/v1',
        storage: storage,
        httpClient: httpClient,
      ),
      storage: storage,
      runtimeConfig: AppRuntimeConfig.tv(),
    );

    await controller.login(
      email: 'viewer@example.test',
      password: 'secret',
      requestedServerUrl: 'https://requested-evil.example.test',
    );

    expect(captured.url.toString(), startsWith(AppConfig.productionApiUrl));
    expect(
      (jsonDecode(captured.body) as Map<String, dynamic>)['deviceType'],
      'tv',
    );
    expect(storage.writeServerCount, 0);
    expect(controller.serverUrl, AppConfig.productionApiUrl);
    expect(controller.stage, AppStage.passwordChange);
  });

  test('mobile login still persists a requested server URL', () async {
    final storage = _MemoryStorage();
    late http.Request captured;
    final httpClient = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'passwordChangeRequired': true,
          'passwordChangeToken': 'change-token',
        }),
        200,
      );
    });
    addTearDown(httpClient.close);
    final controller = AppController(
      api: ApiClient(
        baseUrl: AppConfig.productionApiUrl,
        storage: storage,
        httpClient: httpClient,
      ),
      storage: storage,
      runtimeConfig: AppRuntimeConfig.mobile(),
    );

    await controller.login(
      email: 'viewer@example.test',
      password: 'secret',
      requestedServerUrl: 'staging.example.test',
    );

    expect(captured.url.host, 'staging.example.test');
    expect(
      (jsonDecode(captured.body) as Map<String, dynamic>)['deviceType'],
      'mobile',
    );
    expect(storage.serverUrl, 'https://staging.example.test/api/v1');
    expect(storage.writeServerCount, 1);
  });

  test(
    'token restoration commits only after both secure reads complete',
    () async {
      final access = Completer<String?>();
      final refresh = Completer<String?>();
      final storage = _MemoryStorage()
        ..accessRead = access
        ..refreshRead = refresh;
      final api = ApiClient(
        baseUrl: AppConfig.productionApiUrl,
        storage: storage,
      );
      final restoring = api.restoreTokens();

      access.complete('access-token');
      await Future<void>.delayed(Duration.zero);
      expect(api.hasRefreshToken, isFalse);

      refresh.complete('refresh-token');
      await restoring;
      expect(api.hasRefreshToken, isTrue);
    },
  );

  test('startup without a refresh token routes directly to login', () async {
    final storage = _MemoryStorage()
      ..serverUrl = 'https://persisted-evil.example.test/api/v1';
    final controller = AppController(
      api: ApiClient(baseUrl: AppConfig.productionApiUrl, storage: storage),
      storage: storage,
      runtimeConfig: AppRuntimeConfig.tv(),
    );

    final result = await controller.initialize();

    expect(result.destination, StartupDestination.login);
    expect(result.timedOut, isFalse);
    expect(controller.stage, AppStage.login);
    expect(storage.readServerCount, 0);
  });

  test(
    'valid refresh loads the online user and persists refreshed tokens',
    () async {
      final storage = _MemoryStorage()
        ..accessToken = 'old-access'
        ..refreshToken = 'old-refresh';
      final httpClient = MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          return http.Response(
            jsonEncode({
              'accessToken': 'new-access',
              'refreshToken': 'new-refresh',
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/auth/me')) {
          expect(request.headers['authorization'], 'Bearer new-access');
          return http.Response(jsonEncode(_cachedUser), 200);
        }
        return http.Response('not found', 404);
      });
      addTearDown(httpClient.close);
      final controller = AppController(
        api: ApiClient(
          baseUrl: AppConfig.productionApiUrl,
          storage: storage,
          httpClient: httpClient,
        ),
        storage: storage,
        runtimeConfig: AppRuntimeConfig.tv(),
      );

      final result = await controller.initialize();
      await Future<void>.delayed(Duration.zero);

      expect(result.destination, StartupDestination.online);
      expect(controller.stage, AppStage.library);
      expect(controller.activeProfile?.id, 'profile-1');
      expect(storage.accessToken, 'new-access');
      expect(storage.refreshToken, 'new-refresh');
    },
  );

  test(
    'network failure uses a cached profile only when downloads are playable',
    () async {
      final storage = _MemoryStorage()
        ..accessToken = 'old-access'
        ..refreshToken = 'old-refresh'
        ..cachedUser = _cachedUser;
      final httpClient = MockClient(
        (_) async => http.Response(
          jsonEncode({'message': 'offline'}),
          503,
          headers: {'content-type': 'application/json'},
        ),
      );
      addTearDown(httpClient.close);
      final controller = AppController(
        api: ApiClient(
          baseUrl: AppConfig.productionApiUrl,
          storage: storage,
          httpClient: httpClient,
        ),
        storage: storage,
        runtimeConfig: AppRuntimeConfig.tv(),
        hasPlayableDownloads: (_) async => true,
      );

      final result = await controller.initialize();

      expect(result.destination, StartupDestination.offline);
      expect(controller.stage, AppStage.offline);
      expect(controller.offlineMode, isTrue);
    },
  );

  test(
    'timeout leaves tokens intact and ignores late secure-storage completion',
    () async {
      final access = Completer<String?>();
      final storage = _MemoryStorage()..accessRead = access;
      final coordinator = StartupCoordinator(
        deadline: const Duration(seconds: 8),
        scheduler: const _ImmediateTimeoutScheduler(),
      );
      final api = ApiClient(
        baseUrl: AppConfig.productionApiUrl,
        storage: storage,
      );
      final controller = AppController(
        api: api,
        storage: storage,
        runtimeConfig: AppRuntimeConfig.tv(),
        startupCoordinator: coordinator,
      );

      final result = await controller.initialize();
      expect(result.timedOut, isTrue);
      expect(controller.stage, AppStage.login);
      expect(controller.canRetryStartup, isTrue);
      expect(storage.clearTokensCount, 0);

      access.complete('late-access');
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(controller.stage, AppStage.login);
      expect(api.hasRefreshToken, isFalse);
    },
  );

  test(
    'timeout ignores a late refresh response and retry starts a new generation',
    () async {
      final refreshResponse = Completer<http.Response>();
      final storage = _MemoryStorage()
        ..accessToken = 'stored-access'
        ..refreshToken = 'stored-refresh';
      final httpClient = MockClient((_) => refreshResponse.future);
      addTearDown(httpClient.close);
      final scheduler = _FirstTimeoutScheduler();
      final controller = AppController(
        api: ApiClient(
          baseUrl: AppConfig.productionApiUrl,
          storage: storage,
          httpClient: httpClient,
        ),
        storage: storage,
        runtimeConfig: AppRuntimeConfig.tv(),
        startupCoordinator: StartupCoordinator(
          deadline: const Duration(seconds: 8),
          scheduler: scheduler,
        ),
      );

      final first = await controller.initialize();
      expect(first.timedOut, isTrue);
      refreshResponse.complete(
        http.Response(
          jsonEncode({
            'accessToken': 'late-access',
            'refreshToken': 'late-refresh',
          }),
          200,
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(storage.writeTokensCount, 0);
      expect(controller.stage, AppStage.login);
    },
  );

  test('coordinator marks a cancelled operation as non-committable', () async {
    final pending = Completer<String>();
    final coordinator = StartupCoordinator(
      deadline: const Duration(minutes: 1),
    );
    final running = coordinator.run(
      operation: (_) => pending.future,
      onTimeout: () => 'timeout',
    );

    coordinator.cancel();
    pending.complete('late');
    final execution = await running;

    expect(execution.value, 'late');
    expect(execution.shouldCommit, isFalse);
  });
}
