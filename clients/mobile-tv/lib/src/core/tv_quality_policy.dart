class TvQualityTrack {
  const TvQualityTrack({required this.height, required this.bitrate});

  final int height;
  final int bitrate;
}

class TvQualityPolicy {
  TvQualityPolicy({required DateTime startedAt, required this.sourceHeight})
    : _stableSince = startedAt;

  static const stabilityWindow = Duration(seconds: 45);
  static const cooldown = Duration(seconds: 120);
  static const requiredBufferMs = 30_000;
  static const bandwidthHeadroom = 1.5;

  final int sourceHeight;
  DateTime _stableSince;
  DateTime? _cooldownUntil;
  bool _wasBuffering = false;

  void observe({required DateTime now, required bool buffering}) {
    if (buffering && !_wasBuffering) {
      _stableSince = now;
      _cooldownUntil = now.add(cooldown);
    } else if (!buffering && _wasBuffering) {
      _stableSince = now;
    }
    _wasBuffering = buffering;
  }

  int automaticMaximumHeight({
    required DateTime now,
    required int bufferAheadMs,
    required int bandwidthEstimate,
    required List<TvQualityTrack> tracks,
  }) {
    final available =
        tracks
            .where((track) => track.height > 0 && track.height <= sourceHeight)
            .toList(growable: false)
          ..sort((left, right) => left.height.compareTo(right.height));
    if (available.isEmpty) return sourceHeight;
    if (available.length == 1) return available.single.height;

    final startup =
        available.where((track) => track.height <= 720).lastOrNull ??
        available.first;
    final coolingDown = _cooldownUntil?.isAfter(now) == true;
    final stable = now.difference(_stableSince) >= stabilityWindow;
    if (coolingDown || !stable || bufferAheadMs < requiredBufferMs) {
      return startup.height;
    }

    final eligible = available.where(
      (track) =>
          track.bitrate > 0 &&
          bandwidthEstimate >= (track.bitrate * bandwidthHeadroom).round(),
    );
    return eligible.lastOrNull?.height ?? startup.height;
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
