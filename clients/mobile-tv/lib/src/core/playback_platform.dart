import 'dart:async';

import 'package:flutter/services.dart';

class PlaybackPlatformCommand {
  const PlaybackPlatformCommand({
    required this.event,
    this.positionMs,
    this.inPictureInPicture = false,
  });

  final String event;
  final int? positionMs;
  final bool inPictureInPicture;

  factory PlaybackPlatformCommand.fromValue(dynamic value) {
    final map = value is Map
        ? Map<String, dynamic>.from(value)
        : const <String, dynamic>{};
    return PlaybackPlatformCommand(
      event: map['event']?.toString() ?? 'unknown',
      positionMs: (map['positionMs'] as num?)?.round(),
      inPictureInPicture: map['inPictureInPicture'] == true,
    );
  }
}

class PlaybackPlatform {
  PlaybackPlatform._();

  static final instance = PlaybackPlatform._();
  static const _methods = MethodChannel('boltbytes.media/playback');
  static const _events = EventChannel('boltbytes.media/playback_events');

  Stream<PlaybackPlatformCommand>? _commands;

  Stream<PlaybackPlatformCommand> get commands => _commands ??= _events
      .receiveBroadcastStream()
      .map(PlaybackPlatformCommand.fromValue)
      .asBroadcastStream();

  Future<void> update({
    required String title,
    required String subtitle,
    required bool playing,
    required bool buffering,
    required int positionMs,
    required int durationMs,
    required double playbackRate,
    required bool allowPictureInPicture,
    required int videoWidth,
    required int videoHeight,
  }) => _methods.invokeMethod<void>('update', {
    'title': title,
    'subtitle': subtitle,
    'playing': playing,
    'buffering': buffering,
    'positionMs': positionMs,
    'durationMs': durationMs,
    'playbackRate': playbackRate,
    'allowPictureInPicture': allowPictureInPicture,
    'videoWidth': videoWidth,
    'videoHeight': videoHeight,
  });

  Future<void> enterPictureInPicture() =>
      _methods.invokeMethod<void>('enterPictureInPicture');

  Future<void> clear() => _methods.invokeMethod<void>('clear');
}
