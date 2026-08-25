import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:boltbytes_media/src/tv/screens/tv_profile_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('TV profile focus returns active profile to library', (
    tester,
  ) async {
    _setTvViewport(tester);
    final storage = _Storage();
    final controller =
        AppController(
            api: ApiClient(
              baseUrl: 'https://media.example.test/api/v1',
              storage: storage,
            ),
            storage: storage,
          )
          ..user = _user(activeProfileId: 'profile-1')
          ..stage = AppStage.profiles;

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvProfileScreen(controller: controller),
      ),
    );
    await tester.pumpAndSettle();

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-profile-item-0');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-profile-action-0',
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();

    expect(controller.stage, AppStage.library);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV profile dispatches the selected profile from D-pad input', (
    tester,
  ) async {
    _setTvViewport(tester);
    final storage = _Storage();
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: storage,
    );
    final controller = AppController(api: api, storage: storage)
      ..user = _user(activeProfileId: null)
      ..stage = AppStage.profiles;
    final selectedProfiles = <String>[];

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvProfileScreen(
          controller: controller,
          onSelectProfile: (profile, pin) async {
            selectedProfiles.add(profile.id);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();

    expect(selectedProfiles, ['profile-2']);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-profile-item-1');
  });

  testWidgets('TV profile PIN dialog submits a protected profile PIN', (
    tester,
  ) async {
    _setTvViewport(tester);
    final storage = _Storage();
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: storage,
    );
    final controller = AppController(api: api, storage: storage)
      ..user = _user(activeProfileId: null, secondProfileHasPin: true)
      ..stage = AppStage.profiles;
    final selected = <String>[];

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvProfileScreen(
          controller: controller,
          onSelectProfile: (profile, pin) async {
            selected.add('${profile.id}:$pin');
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.text('Profil-PIN'), findsOneWidget);

    await tester.tap(find.text('1'));
    await tester.pump();
    await tester.tap(find.text('2'));
    await tester.pump();
    await tester.tap(find.text('Fortsæt'));
    await tester.pumpAndSettle();

    expect(selected, ['profile-2:12']);
    expect(tester.takeException(), isNull);
  });
}

void _setTvViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1920, 1080);
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

SessionUser _user({
  required String? activeProfileId,
  bool secondProfileHasPin = false,
}) => SessionUser(
  id: 'user-1',
  email: 'viewer@example.test',
  displayName: 'TV Viewer',
  roles: const ['customer'],
  profiles: [
    const ProfileSummary(
      id: 'profile-1',
      name: 'Stuen',
      hasPin: false,
      isChildProfile: false,
    ),
    ProfileSummary(
      id: 'profile-2',
      name: 'Biografen',
      hasPin: secondProfileHasPin,
      isChildProfile: false,
    ),
  ],
  activeProfileId: activeProfileId,
);

class _Storage implements DeviceSessionStorage {
  String? accessToken;
  String? refreshToken;
  dynamic cachedUser;

  @override
  Future<void> clearCachedUser() async => cachedUser = null;

  @override
  Future<void> clearTokens() async {
    accessToken = null;
    refreshToken = null;
  }

  @override
  Future<String> deviceFingerprint() async => 'test-device-fingerprint';

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<dynamic> readCachedUser() async => cachedUser;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<String?> readServerUrl() async => null;

  @override
  Future<void> writeCachedUser(dynamic value) async => cachedUser = value;

  @override
  Future<void> writeServerUrl(String value) async {}

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
}
