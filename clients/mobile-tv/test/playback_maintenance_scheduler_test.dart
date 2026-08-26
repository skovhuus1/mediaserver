import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:boltbytes_media/src/shared_core/playback/playback_maintenance_scheduler.dart';

void main() {
  test(
    'staggered maintenance never starts heartbeat and progress together',
    () async {
      var now = DateTime(2026);
      late void Function(Timer) tick;
      final fakeTimer = _FakeTimer();
      final events = <String>[];
      final scheduler = PlaybackMaintenanceScheduler(
        clock: () => now,
        timerFactory: (_, callback) {
          tick = callback;
          return fakeTimer;
        },
      );
      scheduler.start(
        heartbeat: () async => events.add('heartbeat'),
        progress: () async => events.add('progress'),
      );

      now = now.add(const Duration(seconds: 15));
      tick(fakeTimer);
      await Future<void>.delayed(Duration.zero);
      expect(events, ['progress']);

      now = now.add(const Duration(seconds: 15));
      tick(fakeTimer);
      await Future<void>.delayed(Duration.zero);
      expect(events, ['progress', 'heartbeat']);
    },
  );

  test('maintenance is single flight', () async {
    var now = DateTime(2026);
    late void Function(Timer) tick;
    final fakeTimer = _FakeTimer();
    final pending = Completer<void>();
    var progressCalls = 0;
    final scheduler = PlaybackMaintenanceScheduler(
      clock: () => now,
      timerFactory: (_, callback) {
        tick = callback;
        return fakeTimer;
      },
    );
    scheduler.start(
      heartbeat: () async {},
      progress: () {
        progressCalls += 1;
        return pending.future;
      },
    );

    now = now.add(const Duration(seconds: 15));
    tick(fakeTimer);
    await Future<void>.delayed(Duration.zero);
    now = now.add(const Duration(seconds: 30));
    tick(fakeTimer);
    await Future<void>.delayed(Duration.zero);
    expect(progressCalls, 1);
    pending.complete();
  });
}

class _FakeTimer implements Timer {
  bool _active = true;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;

  @override
  void cancel() => _active = false;
}
