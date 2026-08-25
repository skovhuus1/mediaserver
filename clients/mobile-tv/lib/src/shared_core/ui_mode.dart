import 'package:flutter/material.dart';

import '../core/app_config.dart';

class AppUiModeScope extends InheritedWidget {
  const AppUiModeScope({
    required this.forceTvLayout,
    required super.child,
    super.key,
  });

  final bool? forceTvLayout;

  static bool? maybeTvLayoutOverride(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<AppUiModeScope>()
        ?.forceTvLayout;
  }

  @override
  bool updateShouldNotify(AppUiModeScope oldWidget) =>
      oldWidget.forceTvLayout != forceTvLayout;
}

bool uiUseTvLayout(BuildContext context, {bool fallbackToDeviceType = false}) {
  final forced = AppUiModeScope.maybeTvLayoutOverride(context);
  if (forced != null) return forced;
  if (fallbackToDeviceType && AppConfig.isTvBuild) return true;
  final size = MediaQuery.sizeOf(context);
  return size.width >= 1100 && size.shortestSide >= 600;
}
