import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/mobile/mobile_screens.dart';
import 'package:boltbytes_media/src/screens/library_screen.dart';
import 'package:boltbytes_media/src/shared_core/app_shell_screens.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:boltbytes_media/src/tv/screens/tv_hub_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_profile_screen.dart';
import 'package:boltbytes_media/src/tv/tv_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/memory_session_storage.dart';

void main() {
  testWidgets('AppShellScreens dispatches every application stage centrally', (
    tester,
  ) async {
    final controller = _controller();
    const screens = _RecordingScreens();
    const expected = {
      AppStage.booting: 'boot',
      AppStage.login: 'login',
      AppStage.passwordChange: 'password',
      AppStage.profiles: 'profiles',
      AppStage.library: 'library',
      AppStage.offline: 'offline',
    };

    for (final entry in expected.entries) {
      controller.stage = entry.key;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => screens.buildByStage(context, controller),
          ),
        ),
      );
      expect(find.text(entry.value), findsOneWidget);
    }
  });

  testWidgets('mobile and TV shells own different library and profile roots', (
    tester,
  ) async {
    final controller = _controller()..stage = AppStage.library;
    Widget? mobileScreen;
    Widget? tvScreen;

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            mobileScreen = const MobileShellScreens().buildByStage(
              context,
              controller,
            );
            tvScreen = const TvShellScreens().buildByStage(context, controller);
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(mobileScreen, isA<LibraryScreen>());
    expect(tvScreen, isA<TvHubScreen>());

    controller
      ..user = const SessionUser(
        id: 'user-1',
        email: 'viewer@example.test',
        displayName: 'Viewer',
        roles: ['customer'],
        profiles: [
          ProfileSummary(
            id: 'profile-1',
            name: 'Stuen',
            hasPin: false,
            isChildProfile: false,
          ),
        ],
        activeProfileId: 'profile-1',
      )
      ..stage = AppStage.profiles;
    Widget? tvProfileScreen;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            tvProfileScreen = const TvShellScreens().buildByStage(
              context,
              controller,
            );
            return const SizedBox.shrink();
          },
        ),
      ),
    );
    expect(tvProfileScreen, isA<TvProfileScreen>());
  });
}

AppController _controller() {
  final storage = MemorySessionStorage();
  return AppController(
    api: ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: storage,
    ),
    storage: storage,
  );
}

class _RecordingScreens extends AppShellScreens {
  const _RecordingScreens();

  @override
  Widget buildBootScreen(BuildContext context) => const Text('boot');

  @override
  Widget buildLibraryScreen(BuildContext context, AppController controller) =>
      const Text('library');

  @override
  Widget buildLoginScreen(BuildContext context, AppController controller) =>
      const Text('login');

  @override
  Widget buildOfflineScreen(BuildContext context, AppController controller) =>
      const Text('offline');

  @override
  Widget buildPasswordChangeScreen(
    BuildContext context,
    AppController controller,
  ) => const Text('password');

  @override
  Widget buildProfilesScreen(BuildContext context, AppController controller) =>
      const Text('profiles');
}
