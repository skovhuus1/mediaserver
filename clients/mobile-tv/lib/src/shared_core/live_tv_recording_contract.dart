import '../core/api_client.dart';
import '../core/models.dart';

abstract interface class LiveTvRecordingContract {
  Future<List<LiveTvRecording>> load();
  Future<LiveTvRecording> scheduleProgram(
    String programId, {
    int prePaddingSeconds = 0,
    int postPaddingSeconds = 0,
  });
  Future<LiveTvRecording> cancel(String recordingId);
  Future<void> remove(String recordingId);
  Future<LiveTvRecordingAuthorization> authorizePlayback(String recordingId);
}

class LiveTvRecordingUseCase implements LiveTvRecordingContract {
  const LiveTvRecordingUseCase({required this.api});

  final ApiClient api;

  @override
  Future<List<LiveTvRecording>> load() async => jsonList(
    await api.getJson('/live-tv/recordings'),
  ).map(LiveTvRecording.fromJson).toList(growable: false);

  @override
  Future<LiveTvRecording> scheduleProgram(
    String programId, {
    int prePaddingSeconds = 0,
    int postPaddingSeconds = 0,
  }) async => LiveTvRecording.fromJson(
    await api.postJson('/live-tv/recordings', {
      'programId': programId,
      'prePaddingSeconds': prePaddingSeconds.clamp(0, 600).toInt(),
      'postPaddingSeconds': postPaddingSeconds.clamp(0, 1800).toInt(),
    }),
  );

  @override
  Future<LiveTvRecording> cancel(String recordingId) async =>
      LiveTvRecording.fromJson(
        await api.postJson(
          '/live-tv/recordings/${Uri.encodeComponent(recordingId)}/cancel',
        ),
      );

  @override
  Future<void> remove(String recordingId) =>
      api.deleteJson('/live-tv/recordings/${Uri.encodeComponent(recordingId)}');

  @override
  Future<LiveTvRecordingAuthorization> authorizePlayback(
    String recordingId,
  ) async {
    final result = LiveTvRecordingAuthorization.fromJson(
      await api.postJson(
        '/live-tv/recordings/${Uri.encodeComponent(recordingId)}/playback',
      ),
    );
    return result.copyWith(
      streamUrl: api.endpoint(result.streamUrl).toString(),
    );
  }
}

class LiveTvRecording {
  const LiveTvRecording({
    required this.id,
    required this.title,
    required this.status,
    required this.progress,
    required this.startsAt,
    required this.endsAt,
    required this.ready,
    required this.channelName,
    this.sizeBytes,
    this.durationMs,
    this.error,
  });

  final String id;
  final String title;
  final String status;
  final double progress;
  final DateTime startsAt;
  final DateTime endsAt;
  final bool ready;
  final String channelName;
  final int? sizeBytes;
  final int? durationMs;
  final String? error;

  bool get cancellable =>
      const {'scheduled', 'queued', 'recording'}.contains(status);
  bool get removable =>
      const {'completed', 'failed', 'cancelled', 'missed'}.contains(status);

  String get statusLabel => switch (status) {
    'scheduled' => 'Planlagt',
    'queued' => 'I kø',
    'recording' => 'Optager',
    'completed' => 'Klar',
    'failed' => 'Fejlet',
    'cancelled' => 'Annulleret',
    'missed' => 'Misset',
    _ => status,
  };

  factory LiveTvRecording.fromJson(dynamic value) {
    final json = jsonMap(value);
    final channel = jsonMap(json['channel']);
    return LiveTvRecording(
      id: stringValue(json['id']) ?? '',
      title: stringValue(json['title']) ?? 'TV-optagelse',
      status: stringValue(json['status']) ?? 'unknown',
      progress: (json['progress'] as num?)?.toDouble() ?? 0,
      startsAt:
          DateTime.tryParse(stringValue(json['startsAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      endsAt:
          DateTime.tryParse(stringValue(json['endsAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      ready: boolValue(json['ready']),
      channelName: stringValue(channel['name']) ?? 'Ukendt kanal',
      sizeBytes: int.tryParse('${json['sizeBytes'] ?? ''}'),
      durationMs: intValue(json['durationMs']),
      error: stringValue(json['error']),
    );
  }
}

class LiveTvRecordingAuthorization {
  const LiveTvRecordingAuthorization({
    required this.recordingId,
    required this.streamUrl,
    required this.expiresAt,
  });

  final String recordingId;
  final String streamUrl;
  final DateTime expiresAt;

  LiveTvRecordingAuthorization copyWith({String? streamUrl}) =>
      LiveTvRecordingAuthorization(
        recordingId: recordingId,
        streamUrl: streamUrl ?? this.streamUrl,
        expiresAt: expiresAt,
      );

  factory LiveTvRecordingAuthorization.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvRecordingAuthorization(
      recordingId: stringValue(json['recordingId']) ?? '',
      streamUrl: stringValue(json['streamUrl']) ?? '',
      expiresAt:
          DateTime.tryParse(stringValue(json['expiresAt']) ?? '') ??
          DateTime.now().add(const Duration(minutes: 10)),
    );
  }
}
