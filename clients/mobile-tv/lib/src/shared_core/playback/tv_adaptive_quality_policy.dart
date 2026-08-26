class TvAdaptiveQualityRung {
  const TvAdaptiveQualityRung({required this.height, required this.bandwidth});

  final int height;
  final int bandwidth;
}

class TvAdaptiveQualitySample {
  const TvAdaptiveQualitySample({
    required this.now,
    required this.bufferAheadMs,
    required this.bandwidthEstimate,
    required this.isBuffering,
    required this.isLoading,
    this.currentHeight,
  });

  final DateTime now;
  final int bufferAheadMs;
  final int bandwidthEstimate;
  final bool isBuffering;
  final bool isLoading;
  final int? currentHeight;
}

class TvAdaptiveQualityDecision {
  const TvAdaptiveQualityDecision({
    required this.maximumHeight,
    required this.changed,
    required this.reason,
  });

  final int maximumHeight;
  final bool changed;
  final String reason;
}

class TvAdaptiveQualityPolicy {
  static const minimumBufferForIncreaseMs = 30_000;
  static const riskBufferMs = 8_000;
  static const loadingRiskBufferMs = 12_000;
  static const stablePeriod = Duration(seconds: 20);
  static const increaseCooldown = Duration(seconds: 45);
  static const increaseBandwidthMargin = 1.35;
  static const safeBandwidthFraction = 0.70;

  List<TvAdaptiveQualityRung> _rungs = const [];
  int? _configuredMaximum;
  int? _maximumHeight;
  DateTime? _lastRiskAt;
  DateTime? _lastIncreaseAt;

  int? get maximumHeight => _maximumHeight;

  int configure({
    required List<TvAdaptiveQualityRung> rungs,
    required int configuredMaximum,
    required DateTime now,
    int? currentHeight,
    bool warmStart = false,
  }) {
    final normalized =
        rungs
            .where(
              (rung) => rung.height > 0 && rung.height <= configuredMaximum,
            )
            .toList(growable: false)
          ..sort((left, right) => left.height.compareTo(right.height));
    _rungs = normalized.isEmpty
        ? [TvAdaptiveQualityRung(height: configuredMaximum, bandwidth: 0)]
        : normalized;
    _configuredMaximum = configuredMaximum;
    if (warmStart) {
      _maximumHeight = _rungs.first.height;
      _lastRiskAt = now;
      _lastIncreaseAt = null;
      return _maximumHeight!;
    }
    final current = currentHeight ?? _maximumHeight ?? configuredMaximum;
    _maximumHeight =
        _rungs
            .where((rung) => rung.height <= current)
            .map((rung) => rung.height)
            .lastOrNull ??
        _rungs.first.height;
    _lastRiskAt ??= now;
    return _maximumHeight!;
  }

  TvAdaptiveQualityDecision evaluate(TvAdaptiveQualitySample sample) {
    final currentMaximum = _maximumHeight;
    if (currentMaximum == null || _rungs.isEmpty) {
      return const TvAdaptiveQualityDecision(
        maximumHeight: 0,
        changed: false,
        reason: 'not_configured',
      );
    }
    final currentIndex = _rungs.lastIndexWhere(
      (rung) => rung.height <= currentMaximum,
    );
    final risk =
        sample.isBuffering ||
        sample.bufferAheadMs < riskBufferMs ||
        (sample.isLoading && sample.bufferAheadMs < loadingRiskBufferMs);
    if (risk) {
      _lastRiskAt = sample.now;
      if (currentIndex <= 0) {
        return TvAdaptiveQualityDecision(
          maximumHeight: currentMaximum,
          changed: false,
          reason: 'risk_at_lowest',
        );
      }
      var targetIndex = currentIndex - 1;
      if (sample.bandwidthEstimate > 0) {
        final safeBandwidth = sample.bandwidthEstimate * safeBandwidthFraction;
        final safeIndex = _rungs.lastIndexWhere(
          (rung) => rung.bandwidth <= 0 || rung.bandwidth <= safeBandwidth,
        );
        if (safeIndex >= 0 && safeIndex < targetIndex) targetIndex = safeIndex;
      }
      _maximumHeight = _rungs[targetIndex].height;
      return TvAdaptiveQualityDecision(
        maximumHeight: _maximumHeight!,
        changed: true,
        reason: 'buffer_risk',
      );
    }

    if (currentIndex >= _rungs.length - 1 ||
        currentMaximum >= (_configuredMaximum ?? currentMaximum)) {
      return TvAdaptiveQualityDecision(
        maximumHeight: currentMaximum,
        changed: false,
        reason: 'at_maximum',
      );
    }
    if (sample.bufferAheadMs < minimumBufferForIncreaseMs) {
      return TvAdaptiveQualityDecision(
        maximumHeight: currentMaximum,
        changed: false,
        reason: 'buffer_not_ready',
      );
    }
    final stableSince = _lastRiskAt;
    if (stableSince != null &&
        sample.now.difference(stableSince) < stablePeriod) {
      return TvAdaptiveQualityDecision(
        maximumHeight: currentMaximum,
        changed: false,
        reason: 'not_stable',
      );
    }
    final lastIncrease = _lastIncreaseAt;
    if (lastIncrease != null &&
        sample.now.difference(lastIncrease) < increaseCooldown) {
      return TvAdaptiveQualityDecision(
        maximumHeight: currentMaximum,
        changed: false,
        reason: 'cooldown',
      );
    }
    final next = _rungs[currentIndex + 1];
    if (sample.bandwidthEstimate <= 0 ||
        sample.bandwidthEstimate < next.bandwidth * increaseBandwidthMargin) {
      return TvAdaptiveQualityDecision(
        maximumHeight: currentMaximum,
        changed: false,
        reason: 'bandwidth_not_ready',
      );
    }
    _maximumHeight = next.height;
    _lastIncreaseAt = sample.now;
    return TvAdaptiveQualityDecision(
      maximumHeight: _maximumHeight!,
      changed: true,
      reason: 'safe_increase',
    );
  }
}

extension<T> on Iterable<T> {
  T? get lastOrNull {
    T? value;
    for (final item in this) {
      value = item;
    }
    return value;
  }
}
