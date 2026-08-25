import 'package:flutter/material.dart';

import '../screens/auth_screens.dart';
import '../screens/library_screen.dart';
import '../screens/offline_downloads_screen.dart';
import '../screens/profile_screen.dart';
import '../shared_core/app_shell_screens.dart';
import '../state/app_controller.dart';

class MobileShellScreens extends SharedShellScreens {
  const MobileShellScreens();

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
