import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/core/api_client.dart';
import 'src/core/client_telemetry.dart';
import 'src/core/push_notifications.dart';
import 'src/core/app_config.dart';
import 'src/core/session_store.dart';
import 'src/state/app_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  PushNotifications.installBackgroundHandler();
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    unawaited(
      ClientTelemetry.instance.capture(
        details.exception,
        details.stack ?? StackTrace.current,
        kind: 'flutter_framework',
        context: {'library': details.library},
      ),
    );
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    unawaited(ClientTelemetry.instance.capture(error, stack));
    return true;
  };
  final store = DeviceSessionStore();
  final api = ApiClient(baseUrl: AppConfig.defaultApiUrl, storage: store);
  final controller = AppController(api: api, storage: store);
  runApp(BoltBytesApp(controller: controller));
  await controller.initialize();
}
