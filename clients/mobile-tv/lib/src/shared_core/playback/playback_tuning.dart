import 'package:shared_preferences/shared_preferences.dart';

const playbackBufferProfiles = <String>{'low_latency', 'auto', 'stable'};
const playbackUpscaleModes = <String>{'off', 'device', 'server'};

class PlaybackTuning {
  const PlaybackTuning({
    this.bufferProfile = 'auto',
    this.upscaleMode = 'device',
  });

  final String bufferProfile;
  final String upscaleMode;

  factory PlaybackTuning.normalized({
    String? bufferProfile,
    String? upscaleMode,
  }) => PlaybackTuning(
    bufferProfile: playbackBufferProfiles.contains(bufferProfile)
        ? bufferProfile!
        : 'auto',
    upscaleMode: playbackUpscaleModes.contains(upscaleMode)
        ? upscaleMode!
        : 'device',
  );
}

class PlaybackTuningStore {
  PlaybackTuningStore({Future<SharedPreferences> Function()? preferences})
    : _preferences = preferences ?? SharedPreferences.getInstance;

  static final instance = PlaybackTuningStore();
  static const _bufferKey = 'bb.playback.buffer_profile';
  static const _upscaleKey = 'bb.playback.upscale_mode';

  final Future<SharedPreferences> Function() _preferences;

  Future<PlaybackTuning> load({
    PlaybackTuning fallback = const PlaybackTuning(),
  }) async {
    final preferences = await _preferences();
    return PlaybackTuning.normalized(
      bufferProfile: preferences.containsKey(_bufferKey)
          ? preferences.getString(_bufferKey)
          : fallback.bufferProfile,
      upscaleMode: preferences.containsKey(_upscaleKey)
          ? preferences.getString(_upscaleKey)
          : fallback.upscaleMode,
    );
  }

  Future<void> save(PlaybackTuning value) async {
    final normalized = PlaybackTuning.normalized(
      bufferProfile: value.bufferProfile,
      upscaleMode: value.upscaleMode,
    );
    final preferences = await _preferences();
    await Future.wait([
      preferences.setString(_bufferKey, normalized.bufferProfile),
      preferences.setString(_upscaleKey, normalized.upscaleMode),
    ]);
  }
}
