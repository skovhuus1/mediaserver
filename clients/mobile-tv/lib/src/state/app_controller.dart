import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../core/cast_playback_coordinator.dart';
import '../core/client_telemetry.dart';
import '../core/models.dart';
import '../core/offline_downloads.dart';
import '../core/push_notifications.dart';
import '../core/session_store.dart';
import '../shared_core/bootstrap/startup_coordinator.dart';

enum AppStage { booting, login, passwordChange, profiles, library, offline }

typedef OfflinePlayableLookup = Future<bool> Function(String profileId);

class AppController extends ChangeNotifier {
  AppController({
    required this.api,
    required this.storage,
    AppRuntimeConfig? runtimeConfig,
    StartupCoordinator? startupCoordinator,
    OfflinePlayableLookup? hasPlayableDownloads,
  }) {
    this.runtimeConfig = runtimeConfig ?? AppRuntimeConfig.mobile();
    _startup =
        startupCoordinator ??
        StartupCoordinator(deadline: this.runtimeConfig.startupTimeout);
    _hasPlayableDownloads =
        hasPlayableDownloads ?? OfflineDownloadsManager.hasPlayable;
    serverUrl = this.runtimeConfig.defaultServerUrl;
  }

  final ApiClient api;
  final DeviceSessionStorage storage;
  late final AppRuntimeConfig runtimeConfig;
  late final StartupCoordinator _startup;
  late final OfflinePlayableLookup _hasPlayableDownloads;

  AppStage stage = AppStage.booting;
  SessionUser? user;
  bool busy = false;
  String? error;
  String? startupError;
  bool canRetryStartup = false;
  String? _passwordChangeToken;
  late String serverUrl;
  bool offlineMode = false;
  int _authGeneration = 0;
  final Map<String, int> _tvPairingGenerations = {};

  ProfileSummary? get activeProfile => user?.activeProfile;
  bool get isAdmin => user?.roles.any((role) => role == 'admin') ?? false;
  String? get visibleError => error ?? startupError;

  Future<StartupResult> initialize() async {
    SessionUser? offlineCandidate;
    final execution = await _startup.run<_StartupResolution>(
      operation: (generation) {
        final offlineFuture = _readOfflineCandidate();
        unawaited(
          offlineFuture.then((candidate) {
            if (_startup.isCurrent(generation)) offlineCandidate = candidate;
          }),
        );
        return _resolveStartup(generation, offlineFuture);
      },
      onTimeout: () {
        final candidate = offlineCandidate;
        if (candidate != null) {
          return _StartupResolution(
            result: const StartupResult.offline(
              timedOut: true,
              message:
                  'Serveren svarede ikke inden 8 sekunder. Offlinebiblioteket er aktivt.',
            ),
            serverUrl: runtimeConfig.defaultServerUrl,
            user: candidate,
          );
        }
        return _StartupResolution(
          result: const StartupResult.login(
            timedOut: true,
            retryable: true,
            message:
                'Forbindelsen tog for lang tid. Du kan logge ind eller prøve igen.',
          ),
          serverUrl: runtimeConfig.defaultServerUrl,
        );
      },
    );

    if (execution.shouldCommit) {
      _applyStartupResolution(execution.value);
      debugPrint(
        'BB_STARTUP_READY destination='
        '${execution.value.result.destination.name} '
        'elapsedMs=${execution.elapsed.inMilliseconds} '
        'timedOut=${execution.value.result.timedOut}',
      );
    }
    return execution.value.result;
  }

  Future<_StartupResolution> _resolveStartup(
    int generation,
    Future<SessionUser?> offlineFuture,
  ) async {
    var resolvedServerUrl = runtimeConfig.defaultServerUrl;
    ApiTokenSnapshot? refreshedTokens;
    try {
      final storedServerUrl =
          runtimeConfig.endpointPolicy == ServerEndpointPolicy.editable
          ? await storage.readServerUrl()
          : null;
      _ensureStartupCurrent(generation);
      resolvedServerUrl = runtimeConfig.resolveServerUrl(storedServerUrl);
      api.configureBaseUrl(resolvedServerUrl);

      final storedTokens = await api.readStoredTokenSnapshot();
      _ensureStartupCurrent(generation);
      if (!storedTokens.hasRefreshToken) {
        return _StartupResolution(
          result: const StartupResult.login(),
          serverUrl: resolvedServerUrl,
        );
      }

      refreshedTokens = await api.refreshTokenSnapshot(storedTokens);
      _ensureStartupCurrent(generation);
      api.installTokenSnapshot(refreshedTokens);
      final response = await api.getJson('/auth/me');
      _ensureStartupCurrent(generation);
      return _StartupResolution(
        result: const StartupResult.online(),
        serverUrl: resolvedServerUrl,
        user: SessionUser.fromJson(response),
        rawUser: response,
        tokens: refreshedTokens,
      );
    } on _StartupSuperseded {
      return _StartupResolution.superseded();
    } on ApiException catch (failure, stack) {
      if (!_startup.isCurrent(generation)) {
        return _StartupResolution.superseded();
      }
      if (failure.statusCode == 401 || failure.statusCode == 403) {
        await api.clearLocalSession();
        if (!_startup.isCurrent(generation)) {
          return _StartupResolution.superseded();
        }
        return _StartupResolution(
          result: const StartupResult.login(
            message: 'Sessionen er udløbet. Log ind igen.',
          ),
          serverUrl: resolvedServerUrl,
          failure: failure,
          stack: stack,
        );
      }
      final candidate = await offlineFuture;
      if (!_startup.isCurrent(generation)) {
        return _StartupResolution.superseded();
      }
      if (candidate != null) {
        return _StartupResolution(
          result: const StartupResult.offline(
            message: 'Serveren er utilgængelig. Offlinebiblioteket er aktivt.',
          ),
          serverUrl: resolvedServerUrl,
          user: candidate,
          tokens: refreshedTokens,
          failure: failure,
          stack: stack,
        );
      }
      return _StartupResolution(
        result: const StartupResult.login(
          retryable: true,
          message: 'Serveren er utilgængelig. Prøv igen eller log ind.',
        ),
        serverUrl: resolvedServerUrl,
        tokens: refreshedTokens,
        failure: failure,
        stack: stack,
      );
    } catch (failure, stack) {
      if (!_startup.isCurrent(generation)) {
        return _StartupResolution.superseded();
      }
      final candidate = await offlineFuture;
      if (!_startup.isCurrent(generation)) {
        return _StartupResolution.superseded();
      }
      if (candidate != null) {
        return _StartupResolution(
          result: const StartupResult.offline(
            message:
                'Den lokale session fejlede. Offlinebiblioteket er aktivt.',
          ),
          serverUrl: resolvedServerUrl,
          user: candidate,
          tokens: refreshedTokens,
          failure: failure,
          stack: stack,
        );
      }
      return _StartupResolution(
        result: const StartupResult.login(
          retryable: true,
          message: 'Den lokale session kunne ikke åbnes. Prøv igen.',
        ),
        serverUrl: resolvedServerUrl,
        tokens: refreshedTokens,
        failure: failure,
        stack: stack,
      );
    }
  }

  void _ensureStartupCurrent(int generation) {
    if (!_startup.isCurrent(generation)) throw const _StartupSuperseded();
  }

  Future<SessionUser?> _readOfflineCandidate() async {
    try {
      final cached = await storage.readCachedUser();
      if (cached == null) return null;
      final candidate = SessionUser.fromJson(cached);
      final profileId = candidate.activeProfileId;
      if (profileId == null || !await _hasPlayableDownloads(profileId)) {
        return null;
      }
      return candidate;
    } catch (_) {
      return null;
    }
  }

  void _applyStartupResolution(_StartupResolution resolution) {
    final result = resolution.result;
    serverUrl = runtimeConfig.resolveServerUrl(resolution.serverUrl);
    api.configureBaseUrl(serverUrl);
    error = null;
    startupError = result.message;
    canRetryStartup = result.retryable;
    switch (result.destination) {
      case StartupDestination.online:
        user = resolution.user;
        offlineMode = false;
        stage = _stageForUser(resolution.user!);
      case StartupDestination.offline:
        user = resolution.user;
        offlineMode = true;
        stage = AppStage.offline;
      case StartupDestination.login:
        user = null;
        offlineMode = false;
        stage = AppStage.login;
    }
    notifyListeners();
    unawaited(_runStartupBackgroundWork(resolution));
  }

  Future<void> _runStartupBackgroundWork(_StartupResolution resolution) async {
    try {
      final tokens = resolution.tokens;
      if (tokens != null) await api.persistTokenSnapshot(tokens);
      if (resolution.rawUser != null) {
        await storage.writeCachedUser(resolution.rawUser);
        await Future.wait([
          PushNotifications.instance.configure(api),
          ClientTelemetry.instance.configure(api),
        ]);
      }
    } catch (failure, stack) {
      await ClientTelemetry.instance.capture(
        failure,
        stack,
        kind: 'startup_background',
      );
    }
    final failure = resolution.failure;
    if (failure != null) {
      await ClientTelemetry.instance.capture(
        failure,
        resolution.stack ?? StackTrace.current,
        kind: 'startup_recovery',
      );
    }
  }

  AppStage _stageForUser(SessionUser candidate, {bool forceLibrary = false}) {
    if (!forceLibrary &&
        candidate.activeProfileId == null &&
        candidate.profiles.isNotEmpty) {
      return AppStage.profiles;
    }
    if (candidate.activeProfileId == null && candidate.profiles.length > 1) {
      return AppStage.profiles;
    }
    return AppStage.library;
  }

  Future<void> login({
    required String email,
    required String password,
    required String requestedServerUrl,
  }) async {
    _startup.cancel();
    final generation = ++_authGeneration;
    for (final pairingId in _tvPairingGenerations.keys.toList()) {
      _tvPairingGenerations[pairingId] = generation;
    }
    startupError = null;
    canRetryStartup = false;
    await _guard(() async {
      await _configureInteractiveServer(requestedServerUrl);
      offlineMode = false;
      final result = await api.login(
        email: email,
        password: password,
        deviceFingerprint: await storage.deviceFingerprint(),
        deviceName: runtimeConfig.deviceName,
        deviceType: runtimeConfig.deviceType,
      );
      _ensureAuthCurrent(generation);
      if (result['passwordChangeRequired'] == true) {
        _tvPairingGenerations.clear();
        _passwordChangeToken = stringValue(result['passwordChangeToken']);
        stage = AppStage.passwordChange;
        return;
      }
      await _loadUser(generation: generation);
      _tvPairingGenerations.clear();
    }, generation: generation);
  }

  Future<TvLoginPairing?> startTvLogin({
    required String requestedServerUrl,
  }) async {
    _startup.cancel();
    final generation = ++_authGeneration;
    _tvPairingGenerations.clear();
    busy = true;
    error = null;
    notifyListeners();
    try {
      await _configureInteractiveServer(requestedServerUrl);
      offlineMode = false;
      final result = await api.startTvLogin(
        deviceFingerprint: await storage.deviceFingerprint(),
        deviceName: runtimeConfig.deviceName,
        deviceType: runtimeConfig.deviceType,
      );
      _ensureAuthCurrent(generation);
      final pairing = TvLoginPairing.fromJson(result);
      _tvPairingGenerations[pairing.pairingId] = generation;
      return pairing;
    } on _InteractiveSuperseded {
      return null;
    } on ApiException catch (failure) {
      if (generation != _authGeneration) return null;
      error = failure.message;
      return null;
    } catch (_) {
      if (generation != _authGeneration) return null;
      error = 'Forbindelsen til serveren fejlede. Prøv igen.';
      return null;
    } finally {
      if (generation == _authGeneration) {
        busy = false;
        notifyListeners();
      }
    }
  }

  Future<void> _configureInteractiveServer(String requestedServerUrl) async {
    serverUrl = runtimeConfig.resolveServerUrl(requestedServerUrl);
    api.configureBaseUrl(serverUrl);
    if (runtimeConfig.endpointPolicy == ServerEndpointPolicy.editable) {
      await storage.writeServerUrl(serverUrl);
    }
  }

  Future<TvLoginPollResult> pollTvLogin(TvLoginPairing pairing) async {
    final generation = _tvPairingGenerations[pairing.pairingId];
    if (generation == null || generation != _authGeneration) {
      throw const ApiException(
        'QR-koden er blevet erstattet af et nyere loginforsøg.',
        code: 'tv_login_superseded',
      );
    }
    try {
      final result = TvLoginPollResult.fromJson(
        await api.pollTvLogin(
          pairingId: pairing.pairingId,
          pollToken: pairing.pollToken,
        ),
      );
      _ensureAuthCurrent(generation);
      if (result.isApproved) {
        error = null;
        startupError = null;
        canRetryStartup = false;
        await _loadUser(forceLibrary: true, generation: generation);
        _tvPairingGenerations.remove(pairing.pairingId);
      } else if (result.isConsumed && api.hasRefreshToken) {
        await _loadUser(forceLibrary: true, generation: generation);
        _tvPairingGenerations.remove(pairing.pairingId);
        return const TvLoginPollResult(status: 'approved');
      }
      return result;
    } on _InteractiveSuperseded {
      throw const ApiException(
        'QR-koden er blevet erstattet af et nyere loginforsøg.',
        code: 'tv_login_superseded',
      );
    } on ApiException catch (failure) {
      if (generation != _authGeneration) {
        throw const ApiException(
          'QR-koden er blevet erstattet af et nyere loginforsøg.',
          code: 'tv_login_superseded',
        );
      }
      error = failure.message;
      notifyListeners();
      rethrow;
    } catch (_) {
      if (generation != _authGeneration) {
        throw const ApiException(
          'QR-koden er blevet erstattet af et nyere loginforsøg.',
          code: 'tv_login_superseded',
        );
      }
      error = 'Forbindelsen til serveren fejlede. Prøv igen.';
      notifyListeners();
      rethrow;
    }
  }

  Future<void> completePasswordChange(String password) async {
    await _guard(() async {
      final token = _passwordChangeToken;
      if (token == null) {
        throw const ApiException('Password-linket er udløbet. Log ind igen.');
      }
      await api.completePasswordChange(token, password);
      _passwordChangeToken = null;
      await _loadUser();
    });
  }

  Future<void> selectProfile(ProfileSummary profile, {String? pin}) async {
    await _guard(() async {
      await api.refresh(profileId: profile.id, profilePin: pin);
      await _loadUser(forceLibrary: true);
    });
  }

  void showProfiles() {
    error = null;
    stage = AppStage.profiles;
    notifyListeners();
  }

  void showLibrary() {
    if (activeProfile == null) return;
    error = null;
    stage = AppStage.library;
    notifyListeners();
  }

  Future<void> logout() async {
    _startup.cancel();
    _authGeneration++;
    _tvPairingGenerations.clear();
    busy = true;
    notifyListeners();
    try {
      await CastPlaybackCoordinator.instance.stop();
      await PushNotifications.instance.unregister();
      await api.logout();
    } catch (_) {
      await api.clearLocalSession();
    }
    user = null;
    await storage.clearCachedUser();
    error = null;
    startupError = null;
    canRetryStartup = false;
    busy = false;
    stage = AppStage.login;
    notifyListeners();
  }

  Future<void> _loadUser({bool forceLibrary = false, int? generation}) async {
    final response = await api.getJson('/auth/me');
    if (generation != null) _ensureAuthCurrent(generation);
    final nextUser = SessionUser.fromJson(response);
    user = nextUser;
    offlineMode = false;
    stage = _stageForUser(nextUser, forceLibrary: forceLibrary);
    error = null;
    notifyListeners();
    unawaited(_completeAuthenticatedUserInBackground(response));
  }

  Future<void> _completeAuthenticatedUserInBackground(dynamic response) async {
    try {
      await storage
          .writeCachedUser(response)
          .timeout(const Duration(seconds: 5));
      await Future.wait([
        PushNotifications.instance.configure(api),
        ClientTelemetry.instance.configure(api),
      ]).timeout(const Duration(seconds: 5));
    } catch (failure, stack) {
      await ClientTelemetry.instance.capture(
        failure,
        stack,
        kind: 'authenticated_user_background',
      );
    }
  }

  void _ensureAuthCurrent(int generation) {
    if (generation != _authGeneration) throw const _InteractiveSuperseded();
  }

  Future<void> retryStartup() async {
    _startup.cancel();
    _authGeneration++;
    _tvPairingGenerations.clear();
    stage = AppStage.booting;
    error = null;
    startupError = null;
    canRetryStartup = false;
    notifyListeners();
    await initialize();
  }

  Future<void> retryOnline() async {
    await retryStartup();
    if (stage == AppStage.offline && startupError == null) {
      startupError =
          'Serveren er stadig utilgængelig. Offlinebiblioteket er aktivt.';
      notifyListeners();
    }
  }

  Future<void> _guard(
    Future<void> Function() operation, {
    int? generation,
  }) async {
    bool ownsVisibleState() =>
        generation == null || generation == _authGeneration;
    busy = true;
    error = null;
    notifyListeners();
    try {
      await operation();
    } on _InteractiveSuperseded {
      // A newer manual or QR login owns the visible state.
    } on ApiException catch (failure) {
      if (ownsVisibleState()) error = failure.message;
    } catch (_) {
      if (ownsVisibleState()) {
        error = 'Forbindelsen til serveren fejlede. Prøv igen.';
      }
    } finally {
      if (ownsVisibleState()) {
        busy = false;
        notifyListeners();
      }
    }
  }
}

class _StartupResolution {
  const _StartupResolution({
    required this.result,
    this.serverUrl,
    this.user,
    this.rawUser,
    this.tokens,
    this.failure,
    this.stack,
  });

  factory _StartupResolution.superseded() =>
      const _StartupResolution(result: StartupResult.login());

  final StartupResult result;
  final String? serverUrl;
  final SessionUser? user;
  final dynamic rawUser;
  final ApiTokenSnapshot? tokens;
  final Object? failure;
  final StackTrace? stack;
}

class _StartupSuperseded implements Exception {
  const _StartupSuperseded();
}

class _InteractiveSuperseded implements Exception {
  const _InteractiveSuperseded();
}
