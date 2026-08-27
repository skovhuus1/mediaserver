import 'dart:math' as math;

import 'package:video_player/video_player.dart';

import '../../core/playback_platform.dart';

class PlaybackQualitySelection {
  const PlaybackQualitySelection._({required this.mode, this.fixedHeight});

  const PlaybackQualitySelection.automatic() : this._(mode: 'auto');

  const PlaybackQualitySelection.original() : this._(mode: 'original');

  const PlaybackQualitySelection.fixed(int height)
    : this._(mode: 'fixed', fixedHeight: height);

  factory PlaybackQualitySelection.fromValue(String value) {
    if (value == 'auto') return const PlaybackQualitySelection.automatic();
    if (value == 'original') return const PlaybackQualitySelection.original();
    return PlaybackQualitySelection.fixed(
      int.tryParse(value)?.clamp(240, 4320).toInt() ?? 720,
    );
  }

  factory PlaybackQualitySelection.fromState(String mode, int? fixedHeight) {
    if (mode == 'original') return const PlaybackQualitySelection.original();
    if (mode == 'fixed') {
      return PlaybackQualitySelection.fixed(fixedHeight ?? 720);
    }
    return const PlaybackQualitySelection.automatic();
  }

  final String mode;
  final int? fixedHeight;

  bool get automatic => mode == 'auto';
}

class PlaybackQualityTarget {
  const PlaybackQualityTarget({
    required this.ceilingHeight,
    required this.adaptive,
    this.track,
  });

  final int ceilingHeight;
  final bool adaptive;
  final VideoTrack? track;
}

PlaybackQualityTarget resolvePlaybackQualityTarget({
  required PlaybackQualitySelection selection,
  required List<VideoTrack> tracks,
  required int sourceHeight,
  required Iterable<int> renditionHeights,
}) {
  final available = tracks.where((track) => (track.height ?? 0) > 0).toList()
    ..sort((left, right) => left.height!.compareTo(right.height!));
  final normalizedSource = math.max(240, sourceHeight);
  final renditionMaximum = renditionHeights
      .where((height) => height > 0)
      .fold(normalizedSource, math.max);
  final availableMaximum = available.isEmpty
      ? renditionMaximum
      : available.last.height!;
  final requested = switch (selection.mode) {
    'original' => normalizedSource,
    'fixed' => selection.fixedHeight ?? normalizedSource,
    _ => renditionMaximum,
  };
  final ceiling = math.max(240, math.min(requested, availableMaximum));
  if (selection.automatic || available.isEmpty) {
    return PlaybackQualityTarget(
      ceilingHeight: ceiling,
      adaptive: selection.automatic,
    );
  }
  final eligible = available.where((track) => track.height! <= ceiling);
  return PlaybackQualityTarget(
    ceilingHeight: ceiling,
    adaptive: false,
    track: eligible.isEmpty ? available.first : eligible.last,
  );
}

/// Owns all local Android TV quality selection.
///
/// Automatic quality is deliberately unlocked only once by the session
/// controller. After that Media3 is the sole ABR authority; Flutter never
/// raises or lowers the ceiling in a polling loop.
class PlaybackQualityCoordinator {
  PlaybackQualityCoordinator({PlaybackPlatform? platform})
    : _platform = platform ?? PlaybackPlatform.instance;

  final PlaybackPlatform _platform;
  List<VideoTrack> _tracks = const [];

  List<VideoTrack> get tracks => _tracks;
  bool get supportsLocalSelection => _tracks.isNotEmpty;

  Future<bool> attach(
    VideoPlayerController controller, {
    required bool enabled,
  }) async {
    _tracks = const [];
    if (!enabled || !controller.isVideoTrackSupportAvailable()) return false;
    try {
      final tracks = await controller.getVideoTracks();
      _tracks = tracks.where((track) => (track.height ?? 0) > 0).toList()
        ..sort((left, right) => left.height!.compareTo(right.height!));
    } catch (_) {
      _tracks = const [];
    }
    return supportsLocalSelection;
  }

  Future<bool> apply(
    VideoPlayerController controller, {
    required PlaybackQualitySelection selection,
    required int sourceHeight,
    required Iterable<int> renditionHeights,
    bool deferAutomatic = false,
  }) async {
    if (!supportsLocalSelection) return false;
    final target = resolvePlaybackQualityTarget(
      selection: selection,
      tracks: _tracks,
      sourceHeight: sourceHeight,
      renditionHeights: renditionHeights,
    );
    if (selection.automatic) {
      if (deferAutomatic) return true;
      await _platform.setAutoMaximumHeight(target.ceilingHeight);
      return true;
    }
    final track = target.track;
    if (track == null) return false;
    // Native selection clears the startup floor and applies the concrete
    // track in one selector update. A separate adaptive reset here would make
    // Media3 perform two resolution changes for one user action.
    await controller.selectVideoTrack(track);
    return true;
  }
}
