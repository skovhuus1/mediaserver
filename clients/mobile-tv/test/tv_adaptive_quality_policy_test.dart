import 'package:flutter_test/flutter_test.dart';
import 'package:boltbytes_media/src/shared_core/playback/tv_adaptive_quality_policy.dart';

void main() {
  const rungs = [
    TvAdaptiveQualityRung(height: 360, bandwidth: 864000),
    TvAdaptiveQualityRung(height: 720, bandwidth: 3240000),
    TvAdaptiveQualityRung(height: 1080, bandwidth: 6480000),
  ];

  test('warmup starts low and raises one rung only with safe buffer', () {
    final policy = TvAdaptiveQualityPolicy();
    final started = DateTime(2026);
    expect(
      policy.configure(
        rungs: rungs,
        configuredMaximum: 1080,
        now: started,
        warmStart: true,
      ),
      360,
    );
    final early = policy.evaluate(
      TvAdaptiveQualitySample(
        now: started.add(const Duration(seconds: 10)),
        bufferAheadMs: 35000,
        bandwidthEstimate: 12000000,
        isBuffering: false,
        isLoading: false,
      ),
    );
    expect(early.changed, isFalse);

    final safe = policy.evaluate(
      TvAdaptiveQualitySample(
        now: started.add(const Duration(seconds: 30)),
        bufferAheadMs: 35000,
        bandwidthEstimate: 12000000,
        isBuffering: false,
        isLoading: false,
      ),
    );
    expect(safe.maximumHeight, 720);
    expect(safe.changed, isTrue);
  });

  test('buffer risk lowers the ceiling without waiting for cooldown', () {
    final policy = TvAdaptiveQualityPolicy();
    final now = DateTime(2026);
    policy.configure(
      rungs: rungs,
      configuredMaximum: 1080,
      now: now,
      currentHeight: 1080,
    );
    final decision = policy.evaluate(
      TvAdaptiveQualitySample(
        now: now.add(const Duration(seconds: 1)),
        bufferAheadMs: 4000,
        bandwidthEstimate: 4000000,
        isBuffering: true,
        isLoading: true,
        currentHeight: 1080,
      ),
    );
    expect(decision.changed, isTrue);
    expect(decision.maximumHeight, 360);
  });

  test('manual quality acts as a maximum', () {
    final policy = TvAdaptiveQualityPolicy();
    final maximum = policy.configure(
      rungs: rungs,
      configuredMaximum: 720,
      now: DateTime(2026),
      currentHeight: 1080,
    );
    expect(maximum, 720);
  });

  test('quality does not rise without fifty percent bandwidth margin', () {
    final policy = TvAdaptiveQualityPolicy();
    final started = DateTime(2026);
    policy.configure(
      rungs: rungs,
      configuredMaximum: 1080,
      now: started,
      warmStart: true,
    );
    final decision = policy.evaluate(
      TvAdaptiveQualitySample(
        now: started.add(const Duration(seconds: 30)),
        bufferAheadMs: 40000,
        bandwidthEstimate: 4800000,
        isBuffering: false,
        isLoading: false,
      ),
    );
    expect(decision.changed, isFalse);
    expect(decision.reason, 'bandwidth_not_ready');
  });
}
