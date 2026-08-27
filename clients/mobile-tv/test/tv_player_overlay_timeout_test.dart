import 'package:boltbytes_media/src/shared_core/playback/playback_session_controller.dart';
import 'package:boltbytes_media/src/tv/screens/tv_player_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:video_player/video_player.dart';

void main() {
  testWidgets('TV controls hide five seconds after playback becomes ready', (
    tester,
  ) async {
    final controller = _FakeTvPlaybackController();
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: TvPlaybackScaffold(controller: controller, title: 'Testtitel'),
      ),
    );

    await tester.pump(const Duration(seconds: 5));
    controller.markPlaying();
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(milliseconds: 200));

    final opacity = tester.widget<AnimatedOpacity>(
      find.byType(AnimatedOpacity),
    );
    expect(opacity.opacity, 0);
  });

  testWidgets('system Back closes the player and finishes once', (
    tester,
  ) async {
    final controller = _FakeTvPlaybackController();
    addTearDown(controller.dispose);
    final navigatorKey = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(navigatorKey: navigatorKey, home: const SizedBox()),
    );
    navigatorKey.currentState!.push(
      MaterialPageRoute<void>(
        builder: (_) =>
            TvPlaybackScaffold(controller: controller, title: 'Testtitel'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    controller.markPlaying();
    await tester.pump();

    final popScope =
        tester.widget(find.byKey(const ValueKey('tv-player-pop-scope')))
            as PopScope;
    popScope.onPopInvokedWithResult?.call(false, null);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.byType(TvPlaybackScaffold), findsNothing);
    expect(controller.finishCalls, 1);
  });
}

class _FakeTvPlaybackController extends ChangeNotifier
    implements TvPlaybackController {
  PlaybackViewState _state = PlaybackViewState.initial;
  int finishCalls = 0;

  @override
  PlaybackViewState get state => _state;

  @override
  VideoPlayerController? get video => null;

  void markPlaying() {
    _state = _state.copyWith(
      status: 'Afspiller',
      loading: false,
      buffering: false,
      playing: true,
      initialized: true,
      seekable: true,
      duration: const Duration(minutes: 45),
    );
    notifyListeners();
  }

  @override
  Future<void> finish() async {
    finishCalls += 1;
  }

  @override
  Future<void> initialize() async {}

  @override
  Future<void> retry() async {}

  @override
  Future<void> seekBy(Duration delta) async {}

  @override
  Future<void> seekTo(Duration position) async {}

  @override
  Future<void> setPlaybackRate(double rate) async {}

  @override
  Future<void> togglePlayback() async {}
}
