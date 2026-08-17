class AppConfig {
  const AppConfig._();

  static const defaultApiUrl = String.fromEnvironment(
    'BB_MEDIA_API_URL',
    defaultValue: 'https://media.boltbytes.com/api/v1',
  );
  static const deviceType = String.fromEnvironment(
    'BB_MEDIA_DEVICE_TYPE',
    defaultValue: 'mobile',
  );
  static const appVersion = '0.1.0';

  static bool get isTvBuild => deviceType.toLowerCase() == 'tv';

  static String normalizeApiUrl(String value) {
    var normalized = value.trim();
    if (normalized.isEmpty) return defaultApiUrl;
    if (!normalized.startsWith('http://') &&
        !normalized.startsWith('https://')) {
      normalized = 'https://$normalized';
    }
    normalized = normalized.replaceAll(RegExp(r'/+$'), '');
    if (!normalized.endsWith('/api/v1')) normalized = '$normalized/api/v1';
    return normalized;
  }
}
