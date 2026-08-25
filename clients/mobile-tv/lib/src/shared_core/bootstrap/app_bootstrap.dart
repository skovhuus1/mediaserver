import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/client_telemetry.dart';
import '../../core/push_notifications.dart';
import '../../core/session_store.dart';
import '../../state/app_controller.dart';

typedef BoltBytesAppFactory = Widget Function(AppController controller);

Future<void> runBoltBytesApp(
  BoltBytesAppFactory appFactory, {
  required AppRuntimeConfig runtimeConfig,
}) async {
  WidgetsFlutterBinding.ensureInitialized();
  AppConfig.configureRuntime(runtimeConfig);
  assert(
    AppConfig.compiledDeviceType.isEmpty ||
        AppConfig.compiledDeviceType.toLowerCase() == runtimeConfig.deviceType,
    'BB_MEDIA_DEVICE_TYPE must match the selected Flutter entrypoint.',
  );
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
  final api = ApiClient(
    baseUrl: runtimeConfig.defaultServerUrl,
    storage: store,
  );
  final controller = AppController(
    api: api,
    storage: store,
    runtimeConfig: runtimeConfig,
  );
  runApp(appFactory(controller));
  await controller.initialize();
}
