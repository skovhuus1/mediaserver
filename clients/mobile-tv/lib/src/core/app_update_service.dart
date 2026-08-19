import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

import 'app_config.dart';

class AppRelease {
  const AppRelease({
    required this.version,
    required this.downloadUrl,
    required this.pageUrl,
    required this.publishedAt,
  });

  final String version;
  final String downloadUrl;
  final String pageUrl;
  final DateTime? publishedAt;

  bool get isNewer => compareVersions(version, AppConfig.appVersion) > 0;
}

class AppUpdateService {
  AppUpdateService({http.Client? client}) : _client = client ?? http.Client();

  static const _channel = MethodChannel('boltbytes.media/update');
  static const _releases =
      'https://api.github.com/repos/skovhuus1/mediaserver/releases?per_page=20';

  final http.Client _client;

  Future<AppRelease?> latest() async {
    final response = await _client.get(
      Uri.parse(_releases),
      headers: const {
        'accept': 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'BoltBytes-Media-Android',
      },
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('GitHub returnerede ${response.statusCode}.');
    }
    final releases = jsonDecode(utf8.decode(response.bodyBytes));
    if (releases is! List) return null;
    for (final value in releases.whereType<Map<String, dynamic>>()) {
      if (value['draft'] == true || value['prerelease'] == true) continue;
      final tag = value['tag_name']?.toString() ?? '';
      if (!tag.startsWith('android-v')) continue;
      final assets = value['assets'];
      if (assets is! List) continue;
      final expected = AppConfig.isTvBuild
          ? 'boltbytes-media-tv-release.apk'
          : 'boltbytes-media-mobile-release.apk';
      final asset = assets
          .whereType<Map<String, dynamic>>()
          .where((item) => item['name']?.toString() == expected)
          .firstOrNull;
      final downloadUrl = asset?['browser_download_url']?.toString();
      if (downloadUrl == null || downloadUrl.isEmpty) continue;
      return AppRelease(
        version: tag.substring('android-v'.length),
        downloadUrl: downloadUrl,
        pageUrl: value['html_url']?.toString() ?? downloadUrl,
        publishedAt: DateTime.tryParse(value['published_at']?.toString() ?? ''),
      );
    }
    return null;
  }

  Future<bool> downloadAndInstall(AppRelease release) async {
    final result = await _channel.invokeMapMethod<String, dynamic>(
      'downloadAndInstall',
      {'url': release.downloadUrl, 'version': release.version},
    );
    return result?['permissionRequired'] != true;
  }
}

int compareVersions(String left, String right) {
  List<int> parts(String value) => value
      .replaceFirst(RegExp(r'^[^0-9]*'), '')
      .split(RegExp(r'[.+-]'))
      .take(4)
      .map((part) => int.tryParse(part) ?? 0)
      .toList(growable: false);
  final a = parts(left);
  final b = parts(right);
  for (var index = 0; index < 4; index++) {
    final difference =
        (index < a.length ? a[index] : 0) - (index < b.length ? b[index] : 0);
    if (difference != 0) return difference.sign;
  }
  return 0;
}
