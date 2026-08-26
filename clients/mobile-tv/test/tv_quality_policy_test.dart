import 'package:boltbytes_media/src/core/tv_quality_policy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const tracks = [
    TvQualityTrack(height: 480, bitrate: 1400000),
    TvQualityTrack(height: 720, bitrate: 3000000),
    TvQualityTrack(height: 1080, bitrate: 6000000),
  ];
  final started = DateTime.utc(2026, 8, 24, 12);

  test('auto starts conservatively at no more than 720p', () {
    final policy = TvQualityPolicy(startedAt: started, sourceHeight: 1080);
    expect(
      policy.automaticMaximumHeight(
        now: started.add(const Duration(seconds: 20)),
        bufferAheadMs: 60000,
        bandwidthEstimate: 20000000,
        tracks: tracks,
      ),
      720,
    );
  });

  test('auto unlocks source quality after stability, buffer and headroom', () {
    final policy = TvQualityPolicy(startedAt: started, sourceHeight: 1080);
    expect(
      policy.automaticMaximumHeight(
        now: started.add(const Duration(seconds: 46)),
        bufferAheadMs: 30000,
        bandwidthEstimate: 9000000,
        tracks: tracks,
      ),
      1080,
    );
  });

  test('rebuffer immediately caps auto and starts a 120 second cooldown', () {
    final policy = TvQualityPolicy(startedAt: started, sourceHeight: 1080);
    final stalled = started.add(const Duration(seconds: 60));
    policy.observe(now: stalled, buffering: true);
    policy.observe(
      now: stalled.add(const Duration(seconds: 2)),
      buffering: false,
    );
    expect(
      policy.automaticMaximumHeight(
        now: stalled.add(const Duration(seconds: 100)),
        bufferAheadMs: 60000,
        bandwidthEstimate: 20000000,
        tracks: tracks,
      ),
      720,
    );
  });

  test('hardware policy never selects above the physical source track', () {
    final policy = TvQualityPolicy(startedAt: started, sourceHeight: 720);
    expect(
      policy.automaticMaximumHeight(
        now: started.add(const Duration(minutes: 3)),
        bufferAheadMs: 60000,
        bandwidthEstimate: 50000000,
        tracks: tracks,
      ),
      720,
    );
  });

  test(
    'server upscale can unlock above source when stable and bandwidth allows',
    () {
      final policy = TvQualityPolicy(
        startedAt: started,
        sourceHeight: 720,
        allowUpscale: true,
      );
      expect(
        policy.automaticMaximumHeight(
          now: started.add(const Duration(minutes: 3)),
          bufferAheadMs: 60000,
          bandwidthEstimate: 12000000,
          tracks: tracks,
        ),
        1080,
      );
    },
  );
}
