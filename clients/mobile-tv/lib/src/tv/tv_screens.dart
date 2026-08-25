import 'package:flutter/material.dart';

import '../shared_core/app_shell_screens.dart';
import '../state/app_controller.dart';
import 'screens/tv_hub_screen.dart';
import 'screens/tv_downloads_screen.dart';
import 'screens/tv_profile_screen.dart';

class TvShellScreens extends SharedShellScreens {
  const TvShellScreens();

  @override
  Widget buildProfilesScreen(BuildContext context, AppController controller) =>
      TvProfileScreen(controller: controller);

  @override
  Widget buildLibraryScreen(BuildContext context, AppController controller) =>
      TvHubScreen(controller: controller);

  @override
  Widget buildOfflineScreen(BuildContext context, AppController controller) =>
      TvDownloadsScreen(
        api: controller.api,
        profileId: controller.activeProfile?.id,
        offline: true,
        onReconnect: controller.retryOnline,
      );
}
