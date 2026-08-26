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

class NativeVideoTelemetry {
  const NativeVideoTelemetry({
    required this.bufferAheadMs,
    required this.bandwidthEstimate,
    required this.droppedFrames,
    required this.totalFrames,
    required this.isLoading,
    this.height,
    this.width,
    this.bitrate,
    this.decoder,
  });

  final int bufferAheadMs;
  final int bandwidthEstimate;
  final int droppedFrames;
  final int totalFrames;
  final bool isLoading;
  final int? height;
  final int? width;
  final int? bitrate;
  final String? decoder;

  factory NativeVideoTelemetry.fromValue(dynamic value) {
    final map = value is Map
        ? Map<String, dynamic>.from(value)
        : const <String, dynamic>{};
    int? number(String key) => (map[key] as num?)?.round();
    return NativeVideoTelemetry(
      bufferAheadMs: number('bufferAheadMs') ?? 0,
      bandwidthEstimate: number('bandwidthEstimate') ?? 0,
      droppedFrames: number('droppedFrames') ?? 0,
      totalFrames: number('totalFrames') ?? 0,
      isLoading: map['isLoading'] == true,
      height: number('height'),
      width: number('width'),
      bitrate: number('bitrate'),
      decoder: map['decoder']?.toString(),
    );
  }
}

class PlaybackPlatform {
  PlaybackPlatform._();

  static final instance = PlaybackPlatform._();
  static const _methods = MethodChannel('boltbytes.media/playback');
  static const _events = EventChannel('boltbytes.media/playback_events');
  static const _videoMethods = MethodChannel(
    'boltbytes.media/video_player_android',
  );

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

  Future<void> setKeepScreenOn(bool enabled) async {
    try {
      await _methods.invokeMethod<void>('setKeepScreenOn', enabled);
    } on MissingPluginException {
      // Non-Android clients do not expose native window flags.
    }
  }

  Future<void> configureTvVideoPlayer(
    bool enabled, {
    String bufferProfile = 'auto',
    String upscaleMode = 'server',
  }) async {
    try {
      await _videoMethods.invokeMethod<void>('configureTvMode', {
        'enabled': enabled,
        'bufferProfile': bufferProfile,
        'upscaleMode': upscaleMode,
      });
    } on MissingPluginException {
      // Non-Android clients keep the standard video_player implementation.
    }
  }

  Future<void> setAutoMaximumHeight(int height) async {
    try {
      await _videoMethods.invokeMethod<void>('setAutoMaximumHeight', height);
    } on MissingPluginException {
      // Track caps are Android TV specific.
    }
  }

  Future<NativeVideoTelemetry?> videoTelemetry() async {
    try {
      final value = await _videoMethods.invokeMethod<dynamic>('getTelemetry');
      return NativeVideoTelemetry.fromValue(value);
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }
}
