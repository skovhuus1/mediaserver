import 'package:boltbytes_media/src/shared_core/playback/playback_tuning.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('playback tuning persists validated buffer and upscale modes', () async {
    SharedPreferences.setMockInitialValues({});
    final store = PlaybackTuningStore();

    await store.save(
      const PlaybackTuning(bufferProfile: 'stable', upscaleMode: 'server'),
    );

    final value = await store.load();
    expect(value.bufferProfile, 'stable');
    expect(value.upscaleMode, 'server');
  });

  test('playback tuning rejects unsupported persisted values', () async {
    SharedPreferences.setMockInitialValues({
      'bb.playback.buffer_profile': 'unbounded',
      'bb.playback.upscale_mode': 'magic',
    });

    final value = await PlaybackTuningStore().load();
    expect(value.bufferProfile, 'auto');
    expect(value.upscaleMode, 'server');
  });
}
