import 'package:boltbytes_media/src/shared_core/playback/playback_quality_coordinator.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';

void main() {
  const tracks = [
    VideoTrack(id: '0_0', isSelected: true, height: 360, bitrate: 800000),
    VideoTrack(id: '0_1', isSelected: false, height: 720, bitrate: 3000000),
    VideoTrack(id: '0_2', isSelected: false, height: 1080, bitrate: 6000000),
    VideoTrack(id: '0_3', isSelected: false, height: 2160, bitrate: 20000000),
  ];

  test('Auto exposes the full ladder to Media3 without a forced track', () {
    final target = resolvePlaybackQualityTarget(
      selection: const PlaybackQualitySelection.automatic(),
      tracks: tracks,
      sourceHeight: 1080,
      renditionHeights: const [360, 720, 1080, 2160],
    );

    expect(target.adaptive, isTrue);
    expect(target.ceilingHeight, 2160);
    expect(target.track, isNull);
  });

  test('fixed quality resolves to one existing local HLS rendition', () {
    final target = resolvePlaybackQualityTarget(
      selection: const PlaybackQualitySelection.fixed(900),
      tracks: tracks,
      sourceHeight: 1080,
      renditionHeights: const [360, 720, 1080, 2160],
    );

    expect(target.adaptive, isFalse);
    expect(target.ceilingHeight, 900);
    expect(target.track?.height, 720);
  });

  test('Original selects source height and never an upscaled rendition', () {
    final target = resolvePlaybackQualityTarget(
      selection: const PlaybackQualitySelection.original(),
      tracks: tracks,
      sourceHeight: 1080,
      renditionHeights: const [360, 720, 1080, 2160],
    );

    expect(target.ceilingHeight, 1080);
    expect(target.track?.height, 1080);
  });
}
