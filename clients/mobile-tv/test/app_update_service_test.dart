import 'dart:convert';

import 'package:boltbytes_media/src/core/app_config.dart';
import 'package:boltbytes_media/src/core/app_update_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('compares semantic Android release versions', () {
    expect(compareVersions('1.2.0', '1.1.9'), 1);
    expect(compareVersions('1.2.0', '1.2.0'), 0);
    expect(compareVersions('1.2.0', '2.0.0'), -1);
    expect(compareVersions('android-v1.10.0', '1.9.9'), 1);
  });

  test('selects the independent mobile and TV release streams', () async {
    final client = MockClient(
      (_) async => http.Response(
        jsonEncode([
          {
            'tag_name': 'android-mobile-v1.2.3',
            'draft': false,
            'prerelease': false,
            'html_url': 'https://example.test/mobile',
            'assets': [
              {
                'name': 'boltbytes-media-mobile-release.apk',
                'browser_download_url': 'https://example.test/mobile.apk',
              },
            ],
          },
          {
            'tag_name': 'android-tv-v1.2.4',
            'draft': false,
            'prerelease': false,
            'html_url': 'https://example.test/tv',
            'assets': [
              {
                'name': 'boltbytes-media-tv-release.apk',
                'browser_download_url': 'https://example.test/tv.apk',
              },
            ],
          },
        ]),
        200,
      ),
    );
    addTearDown(client.close);

    final mobile = await AppUpdateService(
      client: client,
      runtimeConfig: AppRuntimeConfig.mobile(),
    ).latest();
    final tv = await AppUpdateService(
      client: client,
      runtimeConfig: AppRuntimeConfig.tv(),
    ).latest();

    expect(mobile?.version, '1.2.3');
    expect(mobile?.downloadUrl, 'https://example.test/mobile.apk');
    expect(tv?.version, '1.2.4');
    expect(tv?.downloadUrl, 'https://example.test/tv.apk');
  });
}
