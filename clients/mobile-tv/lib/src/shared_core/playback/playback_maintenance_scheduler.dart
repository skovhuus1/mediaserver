import 'dart:async';

typedef PlaybackClock = DateTime Function();
typedef PlaybackTimerFactory =
    Timer Function(Duration interval, void Function(Timer timer) callback);

class PlaybackMaintenanceScheduler {
  PlaybackMaintenanceScheduler({
    PlaybackClock? clock,
    PlaybackTimerFactory? timerFactory,
  }) : _clock = clock ?? DateTime.now,
       _timerFactory = timerFactory ?? Timer.periodic;

  static const heartbeatInterval = Duration(seconds: 30);
  static const progressInterval = Duration(seconds: 30);
  static const progressOffset = Duration(seconds: 15);

  final PlaybackClock _clock;
  final PlaybackTimerFactory _timerFactory;

  Timer? _timer;
  Future<void> Function()? _heartbeat;
  Future<void> Function()? _progress;
  DateTime? _nextHeartbeatAt;
  DateTime? _nextProgressAt;
  bool _inFlight = false;
  bool _stopped = true;

  void start({
    required Future<void> Function() heartbeat,
    required Future<void> Function() progress,
  }) {
    stop();
    final now = _clock();
    _heartbeat = heartbeat;
    _progress = progress;
    _nextHeartbeatAt = now.add(heartbeatInterval);
    _nextProgressAt = now.add(progressOffset);
    _stopped = false;
    _timer = _timerFactory(const Duration(seconds: 1), (_) {
      unawaited(poll());
    });
  }

  Future<void> poll() async {
    if (_stopped || _inFlight) return;
    final now = _clock();
    final progressDue =
        _nextProgressAt != null && !now.isBefore(_nextProgressAt!);
    final heartbeatDue =
        _nextHeartbeatAt != null && !now.isBefore(_nextHeartbeatAt!);
    if (!progressDue && !heartbeatDue) return;

    final runProgress =
        progressDue &&
        (!heartbeatDue || !_nextProgressAt!.isAfter(_nextHeartbeatAt!));
    final task = runProgress ? _progress : _heartbeat;
    if (runProgress) {
      _nextProgressAt = _advance(_nextProgressAt!, progressInterval, now);
    } else {
      _nextHeartbeatAt = _advance(_nextHeartbeatAt!, heartbeatInterval, now);
    }
    if (task == null) return;

    _inFlight = true;
    try {
      await task();
    } finally {
      _inFlight = false;
    }
  }

  DateTime _advance(DateTime dueAt, Duration interval, DateTime now) {
    var next = dueAt.add(interval);
    while (!next.isAfter(now)) {
      next = next.add(interval);
    }
    return next;
  }

  void stop() {
    _stopped = true;
    _timer?.cancel();
    _timer = null;
    _heartbeat = null;
    _progress = null;
    _nextHeartbeatAt = null;
    _nextProgressAt = null;
  }
}
