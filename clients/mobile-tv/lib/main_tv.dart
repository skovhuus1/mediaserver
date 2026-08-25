import 'src/core/app_config.dart';
import 'src/shared_core/bootstrap/app_bootstrap.dart';
import 'src/tv/tv_app.dart';

Future<void> main() => runBoltBytesApp(
  (controller) => TvBoltBytesApp(controller: controller),
  runtimeConfig: AppRuntimeConfig.tv(),
);
