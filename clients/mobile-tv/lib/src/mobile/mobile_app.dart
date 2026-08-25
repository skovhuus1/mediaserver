import 'package:flutter/material.dart';

import '../app.dart';
import '../state/app_controller.dart';
import 'mobile_screens.dart';

class MobileBoltBytesApp extends StatelessWidget {
  const MobileBoltBytesApp({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return BoltBytesApp(
      controller: controller,
      screens: const MobileShellScreens(),
    );
  }
}
