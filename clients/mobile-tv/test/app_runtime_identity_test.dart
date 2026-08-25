import 'package:boltbytes_media/src/core/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  tearDown(() => AppConfig.configureRuntime(AppRuntimeConfig.mobile()));

  test(
    'explicit entrypoint runtime identity does not require legacy define',
    () {
      expect(AppConfig.compiledDeviceType, isEmpty);

      AppConfig.configureRuntime(AppRuntimeConfig.tv());

      expect(AppConfig.isTvBuild, isTrue);
      expect(AppConfig.deviceType, 'tv');
      expect(
        AppConfig.runtimeConfig.endpointPolicy,
        ServerEndpointPolicy.fixed,
      );
    },
  );
}
