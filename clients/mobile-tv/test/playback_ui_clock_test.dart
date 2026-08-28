import 'package:boltbytes_media/src/shared_core/playback/playback_ui_clock.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('keeps UI time moving when native position samples freeze', () {
    var elapsedMs = 0;
    final clock = PlaybackUiClock(elapsedMilliseconds: () => elapsedMs);

    clock.reset(
      positionMs: 20000,
      bufferedPositionMs: 60000,
      playing: true,
      buffering: false,
      playbackRate: 1,
    );
    elapsedMs = 5000;

    clock.synchronize(
      positionMs: 20000,
      bufferedPositionMs: 60000,
      playing: true,
      buffering: false,
      playbackRate: 1,
    );
    expect(clock.positionMs, 25000);

    elapsedMs = 7000;
    expect(clock.positionMs, 27000);
  });

  test('pause and buffering stop interpolation until playback resumes', () {
    var elapsedMs = 0;
    final clock = PlaybackUiClock(elapsedMilliseconds: () => elapsedMs);

    clock.reset(
      positionMs: 10000,
      bufferedPositionMs: 30000,
      playing: true,
      buffering: false,
      playbackRate: 1,
    );
    elapsedMs = 3000;
    clock.setTransport(playing: false, buffering: false, playbackRate: 1);
    elapsedMs = 9000;
    expect(clock.positionMs, 13000);

    clock.setTransport(playing: true, buffering: false, playbackRate: 1);
    elapsedMs = 11000;
    expect(clock.positionMs, 15000);

    clock.setTransport(playing: false, buffering: true, playbackRate: 1);
    elapsedMs = 16000;
    expect(clock.positionMs, 15000);
  });

  test('explicit backward seek remains authoritative', () {
    var elapsedMs = 0;
    final clock = PlaybackUiClock(elapsedMilliseconds: () => elapsedMs);

    clock.reset(
      positionMs: 40000,
      bufferedPositionMs: 80000,
      playing: true,
      buffering: false,
      playbackRate: 1,
    );
    elapsedMs = 5000;
    clock.seek(
      positionMs: 15000,
      bufferedPositionMs: 50000,
      playing: true,
      buffering: false,
      playbackRate: 1,
    );

    expect(clock.positionMs, 15000);
    elapsedMs = 6000;
    expect(clock.positionMs, 16000);
  });
}
