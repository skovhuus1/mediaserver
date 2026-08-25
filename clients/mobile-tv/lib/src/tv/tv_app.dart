import 'package:flutter/material.dart';

import '../app.dart';
import '../state/app_controller.dart';
import 'tv_focus_diagnostics.dart';
import 'tv_screens.dart';
import 'widgets/tv_cinematic_chrome.dart';

class TvBoltBytesApp extends StatelessWidget {
  const TvBoltBytesApp({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return TvFocusDiagnostics(
      child: TvCinematicChrome(
        child: BoltBytesApp(
          controller: controller,
          screens: const TvShellScreens(),
          forceTvLayout: true,
        ),
      ),
    );
  }
}
