import 'package:boltbytes_media/src/core/app_update_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('compares semantic Android release versions', () {
    expect(compareVersions('1.2.0', '1.1.9'), 1);
    expect(compareVersions('1.2.0', '1.2.0'), 0);
    expect(compareVersions('1.2.0', '2.0.0'), -1);
    expect(compareVersions('android-v1.10.0', '1.9.9'), 1);
  });
}
