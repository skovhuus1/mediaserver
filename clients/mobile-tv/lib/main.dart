import 'src/core/app_config.dart';
import 'src/mobile/mobile_app.dart';
import 'src/shared_core/bootstrap/app_bootstrap.dart';

Future<void> main() async {
  await runBoltBytesApp(
    (controller) => MobileBoltBytesApp(controller: controller),
    runtimeConfig: AppRuntimeConfig.mobile(),
  );
}
