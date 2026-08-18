import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_config.dart';

class CastState {
  const CastState({
    required this.event,
    required this.available,
    required this.connected,
    required this.positionMs,
    required this.durationMs,
    required this.runtimeState,
    required this.volume,
    required this.muted,
    required this.activeTrackIds,
    this.deviceName,
    this.errorCode,
  });

  final String event;
  final bool available;
  final bool connected;
  final int positionMs;
  final int durationMs;
  final String runtimeState;
  final double volume;
  final bool muted;
  final List<int> activeTrackIds;
  final String? deviceName;
  final int? errorCode;

  bool get isPlaying => runtimeState == 'playing';
  bool get isBuffering => runtimeState == 'buffering';

  factory CastState.fromValue(dynamic value) {
    final map = value is Map ? value : const <Object?, Object?>{};
    int integer(String key) => switch (map[key]) {
      final num number => number.round(),
      final Object raw => int.tryParse(raw.toString()) ?? 0,
      _ => 0,
    };
    double decimal(String key, double fallback) => switch (map[key]) {
      final num number => number.toDouble(),
      final Object raw => double.tryParse(raw.toString()) ?? fallback,
      _ => fallback,
    };
    final device = map['deviceName']?.toString().trim();
    return CastState(
      event: map['event']?.toString() ?? 'state',
      available: map['available'] == true,
      connected: map['connected'] == true,
      positionMs: integer('positionMs').clamp(0, 2147483647),
      durationMs: integer('durationMs').clamp(0, 2147483647),
      runtimeState: map['runtimeState']?.toString() ?? 'unknown',
      volume: decimal('volume', 1).clamp(0, 1),
      muted: map['muted'] == true,
      activeTrackIds: map['activeTrackIds'] is List
          ? (map['activeTrackIds'] as List)
                .whereType<num>()
                .map((item) => item.round())
                .toList(growable: false)
          : const [],
      deviceName: device == null || device.isEmpty ? null : device,
      errorCode: map['errorCode'] == null ? null : integer('errorCode'),
    );
  }
}

class CastLoadTrack {
  const CastLoadTrack({
    required this.id,
    required this.contentUrl,
    required this.label,
    required this.language,
  });

  final int id;
  final String contentUrl;
  final String label;
  final String language;

  Map<String, dynamic> toJson() => {
    'id': id,
    'contentUrl': contentUrl,
    'contentType': 'text/vtt',
    'label': label,
    'language': language,
  };
}

class CastService {
  CastService._();

  static final instance = CastService._();
  static const _methods = MethodChannel('boltbytes.media/cast');
  static const _events = EventChannel('boltbytes.media/cast_events');

  Stream<CastState>? _stateStream;

  static bool get isSupported =>
      !kIsWeb && Platform.isAndroid && !AppConfig.isTvBuild;

  Stream<CastState> get states => _stateStream ??= _events
      .receiveBroadcastStream()
      .map(CastState.fromValue)
      .asBroadcastStream();

  Future<CastState> currentState() async {
    if (!isSupported) {
      return const CastState(
        event: 'unsupported',
        available: false,
        connected: false,
        positionMs: 0,
        durationMs: 0,
        runtimeState: 'unknown',
        volume: 1,
        muted: false,
        activeTrackIds: [],
      );
    }
    return CastState.fromValue(await _methods.invokeMethod('getState'));
  }

  Future<CastState> loadMedia({
    required String contentUrl,
    required String contentType,
    required String title,
    required String subtitle,
    required int positionMs,
    required int durationMs,
    required List<CastLoadTrack> tracks,
    required List<int> activeTrackIds,
    required Map<String, dynamic> customData,
    String? posterUrl,
  }) async => CastState.fromValue(
    await _methods.invokeMethod('loadMedia', {
      'contentUrl': contentUrl,
      'contentType': contentType,
      'title': title,
      'subtitle': subtitle,
      'posterUrl': posterUrl,
      'positionMs': positionMs,
      'durationMs': durationMs,
      'tracks': tracks.map((track) => track.toJson()).toList(growable: false),
      'activeTrackIds': activeTrackIds,
      'customData': customData,
    }),
  );

  Future<void> play() => _methods.invokeMethod('play');
  Future<void> pause() => _methods.invokeMethod('pause');
  Future<void> stop() => _methods.invokeMethod('stop');
  Future<void> seek(int positionMs) =>
      _methods.invokeMethod('seek', {'positionMs': positionMs});
  Future<void> setVolume(double volume) =>
      _methods.invokeMethod('setVolume', {'volume': volume.clamp(0, 1)});
  Future<void> setTextTrack(int? trackId) => _methods.invokeMethod(
    'setTextTrack',
    {'trackIds': trackId == null ? <int>[] : [trackId]},
  );
  Future<void> endSession({bool stopReceiver = false}) => _methods
      .invokeMethod('endSession', {'stopReceiver': stopReceiver});
}

class CastRouteButton extends StatelessWidget {
  const CastRouteButton({super.key});

  @override
  Widget build(BuildContext context) {
    if (!CastService.isSupported) return const SizedBox.shrink();
    return const Semantics(
      button: true,
      label: 'Chromecast',
      child: SizedBox(
        width: 48,
        height: 48,
        child: AndroidView(
          viewType: 'boltbytes.media/cast_button',
          hitTestBehavior: PlatformViewHitTestBehavior.opaque,
          creationParamsCodec: StandardMessageCodec(),
        ),
      ),
    );
  }
}
