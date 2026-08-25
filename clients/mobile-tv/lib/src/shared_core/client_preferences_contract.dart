import '../core/api_client.dart';
import '../core/app_update_service.dart';
import '../core/models.dart';
import 'playback/playback_tuning.dart';

abstract interface class ClientPreferencesContract {
  Future<ClientPreferences> load();
  Future<void> saveProfilePreferences(ProfilePreferences preferences);
  Future<void> saveDevicePreferences(DevicePreferences preferences);
  Future<AppRelease?> checkForUpdate();
  Future<bool> installUpdate(AppRelease release);
}

class ClientPreferencesUseCase implements ClientPreferencesContract {
  ClientPreferencesUseCase({
    required this.api,
    AppUpdateService? updateService,
    PlaybackTuningStore? tuningStore,
  }) : _updateService = updateService ?? AppUpdateService(),
       _tuningStore = tuningStore ?? PlaybackTuningStore.instance;

  final ApiClient api;
  final AppUpdateService _updateService;
  final PlaybackTuningStore _tuningStore;

  @override
  Future<ClientPreferences> load() async {
    final responses = await Future.wait<dynamic>([
      api.getJson('/profiles/me/preferences'),
      api.getJson('/devices/me/preferences'),
    ]);
    final serverDevice = DevicePreferences.fromJson(
      jsonMap(responses[1])['preferences'],
    );
    final tuning = await _tuningStore.load(
      fallback: PlaybackTuning(
        bufferProfile: serverDevice.bufferProfile,
        upscaleMode: serverDevice.upscaleMode,
      ),
    );
    return ClientPreferences(
      profile: ProfilePreferences.fromJson(
        jsonMap(responses[0])['preferences'],
      ),
      device: serverDevice.copyWith(
        bufferProfile: tuning.bufferProfile,
        upscaleMode: tuning.upscaleMode,
      ),
    );
  }

  @override
  Future<void> saveProfilePreferences(ProfilePreferences preferences) async {
    await api.patchJson('/profiles/me/preferences', preferences.toJson());
  }

  @override
  Future<void> saveDevicePreferences(DevicePreferences preferences) async {
    try {
      await api.patchJson('/devices/me/preferences', preferences.toJson());
    } on ApiException catch (failure) {
      final validationFailure =
          failure.statusCode == 400 || failure.code == 'validation_failed';
      if (!validationFailure) rethrow;
      await api.patchJson(
        '/devices/me/preferences',
        preferences.toCompatibilityJson(),
      );
    }
    await _tuningStore.save(
      PlaybackTuning(
        bufferProfile: preferences.bufferProfile,
        upscaleMode: preferences.upscaleMode,
      ),
    );
  }

  @override
  Future<AppRelease?> checkForUpdate() => _updateService.latest();

  @override
  Future<bool> installUpdate(AppRelease release) =>
      _updateService.downloadAndInstall(release);
}

class ClientPreferences {
  const ClientPreferences({required this.profile, required this.device});

  final ProfilePreferences profile;
  final DevicePreferences device;
}

class ProfilePreferences {
  const ProfilePreferences({
    this.preferredAudioLanguages = const [],
    this.preferredSubtitleLanguages = const [],
    this.subtitleMode = 'auto',
    this.subtitleStyle = 'broadcast',
    this.subtitleTextColor = '#FFFFFF',
    this.subtitleSizePercent = 100,
    this.subtitleBottomOffsetPercent = 6,
    this.subtitleTimingOffsetMs = 0,
    this.autoplayNext = true,
    this.recommendationsEnabled = true,
  });

  final List<String> preferredAudioLanguages;
  final List<String> preferredSubtitleLanguages;
  final String subtitleMode;
  final String subtitleStyle;
  final String subtitleTextColor;
  final int subtitleSizePercent;
  final int subtitleBottomOffsetPercent;
  final int subtitleTimingOffsetMs;
  final bool autoplayNext;
  final bool recommendationsEnabled;

  factory ProfilePreferences.fromJson(dynamic value) {
    final json = jsonMap(value);
    return ProfilePreferences(
      preferredAudioLanguages: jsonList(
        json['preferredAudioLanguages'],
      ).map(stringValue).whereType<String>().toList(growable: false),
      preferredSubtitleLanguages: jsonList(
        json['preferredSubtitleLanguages'],
      ).map(stringValue).whereType<String>().toList(growable: false),
      subtitleMode: stringValue(json['subtitleMode']) ?? 'auto',
      subtitleStyle: stringValue(json['subtitleStyle']) ?? 'broadcast',
      subtitleTextColor: stringValue(json['subtitleTextColor']) ?? '#FFFFFF',
      subtitleSizePercent: (intValue(json['subtitleSizePercent']) ?? 100).clamp(
        75,
        150,
      ),
      subtitleBottomOffsetPercent:
          (intValue(json['subtitleBottomOffsetPercent']) ?? 6).clamp(4, 20),
      subtitleTimingOffsetMs: (intValue(json['subtitleTimingOffsetMs']) ?? 0)
          .clamp(-5000, 5000),
      autoplayNext: boolValue(json['autoplayNext'], fallback: true),
      recommendationsEnabled: boolValue(
        json['recommendationsEnabled'],
        fallback: true,
      ),
    );
  }

  ProfilePreferences copyWith({
    List<String>? preferredAudioLanguages,
    List<String>? preferredSubtitleLanguages,
    String? subtitleMode,
    String? subtitleStyle,
    String? subtitleTextColor,
    int? subtitleSizePercent,
    int? subtitleBottomOffsetPercent,
    int? subtitleTimingOffsetMs,
    bool? autoplayNext,
    bool? recommendationsEnabled,
  }) => ProfilePreferences(
    preferredAudioLanguages:
        preferredAudioLanguages ?? this.preferredAudioLanguages,
    preferredSubtitleLanguages:
        preferredSubtitleLanguages ?? this.preferredSubtitleLanguages,
    subtitleMode: subtitleMode ?? this.subtitleMode,
    subtitleStyle: subtitleStyle ?? this.subtitleStyle,
    subtitleTextColor: subtitleTextColor ?? this.subtitleTextColor,
    subtitleSizePercent: subtitleSizePercent ?? this.subtitleSizePercent,
    subtitleBottomOffsetPercent:
        subtitleBottomOffsetPercent ?? this.subtitleBottomOffsetPercent,
    subtitleTimingOffsetMs:
        subtitleTimingOffsetMs ?? this.subtitleTimingOffsetMs,
    autoplayNext: autoplayNext ?? this.autoplayNext,
    recommendationsEnabled:
        recommendationsEnabled ?? this.recommendationsEnabled,
  );

  Map<String, dynamic> toJson() => {
    'preferredAudioLanguages': preferredAudioLanguages,
    'preferredSubtitleLanguages': preferredSubtitleLanguages,
    'subtitleMode': subtitleMode,
    'subtitleStyle': subtitleStyle,
    'subtitleTextColor': subtitleTextColor,
    'subtitleSizePercent': subtitleSizePercent,
    'subtitleBottomOffsetPercent': subtitleBottomOffsetPercent,
    'subtitleTimingOffsetMs': subtitleTimingOffsetMs,
    'autoplayNext': autoplayNext,
    'recommendationsEnabled': recommendationsEnabled,
  };
}

const _notProvided = Object();

class DevicePreferences {
  const DevicePreferences({
    this.qualityMode = 'auto',
    this.fixedQualityHeight,
    this.allowUpscale = true,
    this.upscaleMode = 'server',
    this.bufferProfile = 'auto',
    this.dataSaver = false,
    this.playbackRate = 1,
    this.hdrMode = 'auto',
  });

  final String qualityMode;
  final int? fixedQualityHeight;
  final bool allowUpscale;
  final String upscaleMode;
  final String bufferProfile;
  final bool dataSaver;
  final double playbackRate;
  final String hdrMode;

  factory DevicePreferences.fromJson(dynamic value) {
    final json = jsonMap(value);
    final allowUpscale = boolValue(json['allowUpscale'], fallback: true);
    final normalizedUpscaleMode = PlaybackTuning.normalized(
      upscaleMode:
          stringValue(json['upscaleMode']) ?? (allowUpscale ? 'server' : 'off'),
    ).upscaleMode;
    return DevicePreferences(
      qualityMode: stringValue(json['qualityMode']) ?? 'auto',
      fixedQualityHeight: intValue(json['fixedQualityHeight']),
      allowUpscale: allowUpscale,
      upscaleMode: normalizedUpscaleMode,
      bufferProfile: PlaybackTuning.normalized(
        bufferProfile: stringValue(json['bufferProfile']),
      ).bufferProfile,
      dataSaver: boolValue(json['dataSaver']),
      playbackRate: (doubleValue(json['playbackRate']) ?? 1)
          .clamp(0.5, 2)
          .toDouble(),
      hdrMode: stringValue(json['hdrMode']) ?? 'auto',
    );
  }

  DevicePreferences copyWith({
    String? qualityMode,
    Object? fixedQualityHeight = _notProvided,
    bool? allowUpscale,
    String? upscaleMode,
    String? bufferProfile,
    bool? dataSaver,
    double? playbackRate,
    String? hdrMode,
  }) => DevicePreferences(
    qualityMode: qualityMode ?? this.qualityMode,
    fixedQualityHeight: identical(fixedQualityHeight, _notProvided)
        ? this.fixedQualityHeight
        : fixedQualityHeight as int?,
    allowUpscale: allowUpscale ?? this.allowUpscale,
    upscaleMode: upscaleMode ?? this.upscaleMode,
    bufferProfile: bufferProfile ?? this.bufferProfile,
    dataSaver: dataSaver ?? this.dataSaver,
    playbackRate: playbackRate ?? this.playbackRate,
    hdrMode: hdrMode ?? this.hdrMode,
  );

  Map<String, dynamic> toJson() => {
    'qualityMode': qualityMode,
    'fixedQualityHeight': fixedQualityHeight,
    'allowUpscale': allowUpscale,
    'upscaleMode': upscaleMode,
    'bufferProfile': bufferProfile,
    'dataSaver': dataSaver,
    'playbackRate': playbackRate,
    'hdrMode': hdrMode,
  };

  Map<String, dynamic> toCompatibilityJson() => {
    'qualityMode': qualityMode,
    'fixedQualityHeight': fixedQualityHeight,
    'allowUpscale': allowUpscale && upscaleMode == 'server',
    'dataSaver': dataSaver,
    'playbackRate': playbackRate,
    'hdrMode': hdrMode,
  };
}
