import 'package:flutter/material.dart';

import '../core/brand_theme.dart';
import '../screens/auth_screens.dart';
import '../screens/library_screen.dart';
import '../screens/offline_downloads_screen.dart';
import '../screens/profile_screen.dart';
import '../widgets/brand.dart';
import '../state/app_controller.dart';

/// Stable routing boundary between shared application state and a UI shell.
///
/// Mobile and TV may replace individual stages without importing widgets from
/// each other's UI layer. Keep stage dispatch centralized in [buildByStage].
abstract class AppShellScreens {
  const AppShellScreens();

  Widget buildBootScreen(BuildContext context);
  Widget buildLoginScreen(BuildContext context, AppController controller);
  Widget buildPasswordChangeScreen(
    BuildContext context,
    AppController controller,
  );
  Widget buildProfilesScreen(BuildContext context, AppController controller);
  Widget buildLibraryScreen(BuildContext context, AppController controller);
  Widget buildOfflineScreen(BuildContext context, AppController controller);

  /// Builds the screen owned by the shell for the controller's current stage.
  Widget buildByStage(BuildContext context, AppController controller) =>
      switch (controller.stage) {
        AppStage.booting => buildBootScreen(context),
        AppStage.login => buildLoginScreen(context, controller),
        AppStage.passwordChange => buildPasswordChangeScreen(
          context,
          controller,
        ),
        AppStage.profiles => buildProfilesScreen(context, controller),
        AppStage.library => buildLibraryScreen(context, controller),
        AppStage.offline => buildOfflineScreen(context, controller),
      };
}

class SharedShellScreens extends AppShellScreens {
  const SharedShellScreens();

  @override
  Widget buildBootScreen(BuildContext context) => const SharedBootScreen();

  @override
  Widget buildLoginScreen(BuildContext context, AppController controller) =>
      LoginScreen(controller: controller);

  @override
  Widget buildPasswordChangeScreen(
    BuildContext context,
    AppController controller,
  ) => PasswordChangeScreen(controller: controller);

  @override
  Widget buildProfilesScreen(BuildContext context, AppController controller) =>
      ProfileScreen(controller: controller);

  @override
  Widget buildLibraryScreen(BuildContext context, AppController controller) =>
      LibraryScreen(controller: controller);

  @override
  Widget buildOfflineScreen(BuildContext context, AppController controller) =>
      OfflineDownloadsScreen(
        api: controller.api,
        profileId: controller.activeProfile?.id,
        offline: true,
        onReconnect: controller.retryOnline,
      );
}

class SharedBootScreen extends StatelessWidget {
  const SharedBootScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [BoltColors.panel, BoltColors.background],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(size: 86),
            SizedBox(height: 16),
            Text(
              'BoltBytes',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w900,
                letterSpacing: -1,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'MEDIA CLIENT',
              style: TextStyle(
                color: Colors.white60,
                letterSpacing: 3,
                fontSize: 10,
              ),
            ),
            SizedBox(height: 34),
            SizedBox(width: 240, child: LinearProgressIndicator(minHeight: 7)),
            SizedBox(height: 14),
            Text('Forbinder sikkert til din server...'),
          ],
        ),
      ),
    ),
  );
}
