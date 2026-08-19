import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/client_telemetry.dart';
import '../core/push_notifications.dart';
import '../core/app_config.dart';
import '../core/cast_playback_coordinator.dart';
import '../core/models.dart';
import '../core/offline_downloads.dart';
import '../core/session_store.dart';

enum AppStage { booting, login, passwordChange, profiles, library, offline }

class AppController extends ChangeNotifier {
  AppController({required this.api, required this.storage});

  final ApiClient api;
  final DeviceSessionStore storage;

  AppStage stage = AppStage.booting;
  SessionUser? user;
  bool busy = false;
  String? error;
  String? _passwordChangeToken;
  String serverUrl = AppConfig.defaultApiUrl;
  bool offlineMode = false;

  ProfileSummary? get activeProfile => user?.activeProfile;
  bool get isAdmin => user?.roles.any((role) => role == 'admin') ?? false;

  Future<void> initialize() async {
    serverUrl = AppConfig.normalizeApiUrl(
      await storage.readServerUrl() ?? AppConfig.defaultApiUrl,
    );
    api.configureBaseUrl(serverUrl);
    await api.restoreTokens();
    if (!api.hasRefreshToken) {
      stage = AppStage.login;
      notifyListeners();
      return;
    }
    try {
      await api.refresh();
      await _loadUser();
    } on ApiException catch (failure) {
      if (failure.statusCode == 401 || failure.statusCode == 403) {
        await api.clearLocalSession();
        stage = AppStage.login;
      } else {
        await _restoreOffline();
      }
    } catch (_) {
      await _restoreOffline();
    }
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
    required String requestedServerUrl,
  }) async {
    await _guard(() async {
      serverUrl = AppConfig.normalizeApiUrl(requestedServerUrl);
      api.configureBaseUrl(serverUrl);
      await storage.writeServerUrl(serverUrl);
      offlineMode = false;
      final result = await api.login(
        email: email,
        password: password,
        deviceFingerprint: await storage.deviceFingerprint(),
        deviceName: AppConfig.isTvBuild
            ? 'BoltBytes Android TV'
            : 'BoltBytes Android',
        deviceType: AppConfig.isTvBuild ? 'tv' : 'mobile',
      );
      if (result['passwordChangeRequired'] == true) {
        _passwordChangeToken = stringValue(result['passwordChangeToken']);
        stage = AppStage.passwordChange;
        return;
      }
      await _loadUser();
    });
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

  Future<void> logout() async {
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
    busy = false;
    stage = AppStage.login;
    notifyListeners();
  }

  Future<void> _loadUser({bool forceLibrary = false}) async {
    final response = await api.getJson('/auth/me');
    user = SessionUser.fromJson(response);
    await storage.writeCachedUser(response);
    await Future.wait([
      PushNotifications.instance.configure(api),
      ClientTelemetry.instance.configure(api),
    ]);
    offlineMode = false;
    if (!forceLibrary &&
        user!.activeProfileId == null &&
        user!.profiles.isNotEmpty) {
      stage = AppStage.profiles;
    } else if (user!.activeProfileId == null && user!.profiles.length > 1) {
      stage = AppStage.profiles;
    } else {
      stage = AppStage.library;
    }
  }

  Future<void> retryOnline() async {
    stage = AppStage.booting;
    error = null;
    notifyListeners();
    try {
      await api.refresh();
      await _loadUser(forceLibrary: true);
    } catch (_) {
      await _restoreOffline();
      error = 'Serveren er stadig utilgængelig. Offlinebiblioteket er aktivt.';
    }
    notifyListeners();
  }

  Future<void> _restoreOffline() async {
    final cached = await storage.readCachedUser();
    if (cached != null) {
      final candidate = SessionUser.fromJson(cached);
      final profileId = candidate.activeProfileId;
      if (profileId != null &&
          await OfflineDownloadsManager.hasPlayable(profileId)) {
        user = candidate;
        offlineMode = true;
        stage = AppStage.offline;
        return;
      }
    }
    stage = AppStage.login;
  }

  Future<void> _guard(Future<void> Function() operation) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await operation();
    } on ApiException catch (failure) {
      error = failure.message;
    } catch (_) {
      error = 'Forbindelsen til serveren fejlede. Prøv igen.';
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
