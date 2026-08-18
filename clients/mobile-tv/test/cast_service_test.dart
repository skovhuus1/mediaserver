import 'package:boltbytes_media/src/core/cast_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses native Cast state without trusting platform value types', () {
    final state = CastState.fromValue({
      'event': 'sessionStarted',
      'available': true,
      'connected': true,
      'deviceName': 'Stue',
      'positionMs': 12_345,
      'durationMs': 90_000.4,
      'runtimeState': 'playing',
      'volume': 0.65,
      'muted': false,
      'activeTrackIds': <num>[1, 3.0],
    });

    expect(state.event, 'sessionStarted');
    expect(state.connected, isTrue);
    expect(state.deviceName, 'Stue');
    expect(state.positionMs, 12_345);
    expect(state.durationMs, 90_000);
    expect(state.isPlaying, isTrue);
    expect(state.volume, 0.65);
    expect(state.activeTrackIds, [1, 3]);
  });

  test('serializes WebVTT tracks for the Android Cast SDK', () {
    const track = CastLoadTrack(
      id: 2,
      contentUrl: 'https://media.example/api/v1/subtitle.vtt?token=x',
      label: 'Dansk',
      language: 'da',
    );

    expect(track.toJson(), {
      'id': 2,
      'contentUrl': 'https://media.example/api/v1/subtitle.vtt?token=x',
      'contentType': 'text/vtt',
      'label': 'Dansk',
      'language': 'da',
    });
  });
}
