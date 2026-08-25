const _productionApiUrl = 'https://media.boltbytes.com/api/v1';
const _configuredDefaultApiUrl = String.fromEnvironment(
  'BB_MEDIA_DEFAULT_SERVER_URL',
  defaultValue: _productionApiUrl,
);

enum AppVariant { mobile, tv }

enum ServerEndpointPolicy { editable, fixed }

class AppRuntimeConfig {
  AppRuntimeConfig.mobile({
    String defaultServerUrl = _configuredDefaultApiUrl,
    this.startupTimeout = const Duration(seconds: 8),
  }) : variant = AppVariant.mobile,
       endpointPolicy = ServerEndpointPolicy.editable,
       defaultServerUrl = _normalizeApiUrl(
         defaultServerUrl,
         fallback: _productionApiUrl,
       );

  AppRuntimeConfig.tv({
    String defaultServerUrl = _configuredDefaultApiUrl,
    this.startupTimeout = const Duration(seconds: 8),
  }) : variant = AppVariant.tv,
       endpointPolicy = ServerEndpointPolicy.fixed,
       defaultServerUrl = _normalizeApiUrl(
         defaultServerUrl,
         fallback: _productionApiUrl,
       );

  final AppVariant variant;
  final ServerEndpointPolicy endpointPolicy;
  final String defaultServerUrl;
  final Duration startupTimeout;

  bool get isTv => variant == AppVariant.tv;
  String get deviceType => variant.name;
  String get deviceName => isTv ? 'BoltBytes Android TV' : 'BoltBytes Android';

  String resolveServerUrl(String? candidate) {
    if (endpointPolicy == ServerEndpointPolicy.fixed) return defaultServerUrl;
    return _normalizeApiUrl(candidate ?? '', fallback: defaultServerUrl);
  }
}

class AppConfig {
  const AppConfig._();

  static const productionApiUrl = _productionApiUrl;
  static const defaultApiUrl = _configuredDefaultApiUrl;
  static const compiledDeviceType = String.fromEnvironment(
    'BB_MEDIA_DEVICE_TYPE',
    defaultValue: '',
  );
  static const appVersion = String.fromEnvironment(
    'BB_MEDIA_APP_VERSION',
    defaultValue: '0.1.0',
  );

  static AppRuntimeConfig _runtimeConfig = AppRuntimeConfig.mobile();

  static AppRuntimeConfig get runtimeConfig => _runtimeConfig;
  static bool get isTvBuild => _runtimeConfig.isTv;
  static String get deviceType => _runtimeConfig.deviceType;

  static void configureRuntime(AppRuntimeConfig runtimeConfig) {
    _runtimeConfig = runtimeConfig;
  }

  static String normalizeApiUrl(String value, {String? fallback}) =>
      _normalizeApiUrl(
        value,
        fallback: fallback ?? _runtimeConfig.defaultServerUrl,
      );
}

String _normalizeApiUrl(String value, {required String fallback}) {
  var normalized = value.trim();
  if (normalized.isEmpty) normalized = fallback.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://$normalized';
  }
  normalized = normalized.replaceAll(RegExp(r'/+$'), '');
  if (!normalized.endsWith('/api/v1')) normalized = '$normalized/api/v1';
  return normalized;
}
