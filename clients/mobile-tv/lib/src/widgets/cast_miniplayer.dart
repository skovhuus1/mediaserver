import 'package:flutter/material.dart';

import '../core/cast_playback_coordinator.dart';
import '../core/cast_service.dart';

class CastMiniPlayer extends StatefulWidget {
  const CastMiniPlayer({super.key});

  @override
  State<CastMiniPlayer> createState() => _CastMiniPlayerState();
}

class _CastMiniPlayerState extends State<CastMiniPlayer> {
  final coordinator = CastPlaybackCoordinator.instance;
  bool expanded = false;
  double? scrubPosition;

  String _time(int milliseconds) {
    final total = Duration(milliseconds: milliseconds).inSeconds;
    final hours = total ~/ 3600;
    final minutes = (total % 3600) ~/ 60;
    final seconds = total % 60;
    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: coordinator,
    builder: (context, _) {
      final active = coordinator.active;
      if (active == null || coordinator.playerAttached) {
        return const SizedBox.shrink();
      }
      final duration = coordinator.durationMs;
      final position = (scrubPosition ?? coordinator.positionMs.toDouble())
          .clamp(0, duration > 0 ? duration.toDouble() : 1);
      final wide = MediaQuery.sizeOf(context).width >= 700;
      return Positioned(
        left: wide ? null : 12,
        right: 12,
        bottom: wide ? 20 : 88,
        width: wide ? 430 : null,
        child: SafeArea(
          top: false,
          child: Material(
            color: const Color(0xF2131920),
            elevation: 18,
            shadowColor: Colors.black87,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: const BorderSide(color: Color(0xFF33414D)),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => setState(() => expanded = !expanded),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 8, 10),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 42,
                          height: 42,
                          decoration: BoxDecoration(
                            color: const Color(0xFF251A35),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.cast_connected,
                            color: Color(0xFF43E7C4),
                          ),
                        ),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                active.media.displayTitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                '${coordinator.deviceName} · ${_stateLabel(coordinator.runtimeState)}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white60,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: coordinator.isPlaying
                              ? 'Sæt på pause'
                              : 'Afspil',
                          onPressed: coordinator.isStopping
                              ? null
                              : coordinator.playPause,
                          icon: Icon(
                            coordinator.isPlaying
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                          ),
                        ),
                        IconButton(
                          tooltip: 'Stop afspilning',
                          onPressed: coordinator.isStopping
                              ? null
                              : coordinator.stop,
                          icon: const Icon(Icons.stop_rounded),
                        ),
                        Icon(
                          expanded
                              ? Icons.keyboard_arrow_down
                              : Icons.keyboard_arrow_up,
                          color: Colors.white54,
                        ),
                      ],
                    ),
                    if (expanded) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            _time(position.round()),
                            style: const TextStyle(
                              color: Colors.white60,
                              fontSize: 12,
                            ),
                          ),
                          Expanded(
                            child: Slider(
                              value: position.toDouble(),
                              max: duration > 0 ? duration.toDouble() : 1,
                              onChanged: duration > 0
                                  ? (value) =>
                                        setState(() => scrubPosition = value)
                                  : null,
                              onChangeEnd: duration > 0
                                  ? (value) {
                                      setState(() => scrubPosition = null);
                                      coordinator.seek(value.round());
                                    }
                                  : null,
                            ),
                          ),
                          Text(
                            _time(duration),
                            style: const TextStyle(
                              color: Colors.white60,
                              fontSize: 12,
                            ),
                          ),
                          const SizedBox(width: 8),
                          const SizedBox(
                            width: 44,
                            height: 44,
                            child: CastRouteButton(),
                          ),
                        ],
                      ),
                      if (coordinator.error != null)
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Padding(
                            padding: const EdgeInsets.only(left: 4, top: 4),
                            child: Text(
                              coordinator.error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  String _stateLabel(String state) => switch (state) {
    'playing' => 'Afspiller',
    'paused' => 'På pause',
    'buffering' => 'Bufferer',
    'starting' => 'Starter',
    _ => 'Forbundet',
  };
}
