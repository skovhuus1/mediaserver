import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/core/api_client.dart';
import 'src/core/app_config.dart';
import 'src/core/session_store.dart';
import 'src/state/app_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = DeviceSessionStore();
  final api = ApiClient(baseUrl: AppConfig.defaultApiUrl, storage: store);
  final controller = AppController(api: api, storage: store);
  runApp(BoltBytesApp(controller: controller));
  await controller.initialize();
}
