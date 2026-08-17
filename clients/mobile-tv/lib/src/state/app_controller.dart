import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../core/models.dart';
import '../core/session_store.dart';

enum AppStage { booting, login, passwordChange, profiles, library }

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
    } catch (_) {
      await api.clearLocalSession();
      stage = AppStage.login;
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
      await api.logout();
    } catch (_) {
      await api.clearLocalSession();
    }
    user = null;
    error = null;
    busy = false;
    stage = AppStage.login;
    notifyListeners();
  }

  Future<void> _loadUser({bool forceLibrary = false}) async {
    user = SessionUser.fromJson(await api.getJson('/auth/me'));
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
