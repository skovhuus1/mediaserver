import 'dart:async';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../core/api_client.dart';
import '../core/offline_downloads.dart';
import '../shared_core/offline_library_contract.dart';
import '../shared_core/playback/offline_playback_controller.dart';

class OfflineDownloadsScreen extends StatefulWidget {
  const OfflineDownloadsScreen({
    required this.api,
    required this.profileId,
    this.offline = false,
    this.onReconnect,
    this.library,
    super.key,
  });

  final ApiClient api;
  final String? profileId;
  final bool offline;
  final Future<void> Function()? onReconnect;
  final OfflineLibraryContract? library;

  @override
  State<OfflineDownloadsScreen> createState() => _OfflineDownloadsScreenState();
}

class _OfflineDownloadsScreenState extends State<OfflineDownloadsScreen> {
  late final OfflineLibraryContract library;

  @override
  void initState() {
    super.initState();
    library =
        widget.library ??
        OfflineLibraryUseCase(api: widget.api, online: !widget.offline);
    unawaited(library.initialize());
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: library.changes,
    builder: (context, _) {
      final records = library.recordsForProfile(widget.profileId);
      return Scaffold(
        appBar: AppBar(
          title: Text(widget.offline ? 'Offlinebibliotek' : 'Downloads'),
          actions: [
            if (widget.onReconnect != null)
              IconButton(
                tooltip: 'Forbind igen',
                onPressed: () => unawaited(widget.onReconnect!()),
                icon: const Icon(Icons.cloud_sync_outlined),
              ),
            IconButton(
              tooltip: 'Opdatér',
              onPressed: library.syncing
                  ? null
                  : () => unawaited(library.sync()),
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        body: records.isEmpty
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    'Ingen offline-titler endnu. Åbn en film eller episode og vælg downloadikonet.',
                    textAlign: TextAlign.center,
                  ),
                ),
              )
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: records.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, index) => _DownloadCard(
                  record: records[index],
                  onPlay: records[index].playable
                      ? () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => OfflinePlayerScreen(
                              record: records[index],
                              library: library,
                            ),
                          ),
                        )
                      : null,
                  onDelete: () => unawaited(library.remove(records[index])),
                ),
              ),
      );
    },
  );
}

class _DownloadCard extends StatelessWidget {
  const _DownloadCard({
    required this.record,
    required this.onPlay,
    required this.onDelete,
  });

  final OfflineDownloadRecord record;
  final VoidCallback? onPlay;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 92,
            decoration: BoxDecoration(
              color: const Color(0xFF202833),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              record.playable ? Icons.offline_pin : Icons.downloading,
              color: record.playable
                  ? Theme.of(context).colorScheme.secondary
                  : null,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  record.displayTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text('${record.qualityHeight}p · ${_status(record)}'),
                const SizedBox(height: 10),
                LinearProgressIndicator(value: record.progress / 100),
                if (record.error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    record.error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                Text(
                  'Offline-licens til ${_date(record.licenseExpiresAt)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Afspil offline',
            onPressed: onPlay,
            icon: const Icon(Icons.play_circle_outline),
          ),
          IconButton(
            tooltip: 'Slet download',
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
    ),
  );

  static String _status(OfflineDownloadRecord record) =>
      switch (record.status) {
        'queued' => 'Venter på worker',
        'preparing' => 'Forbereder ${record.progress} %',
        'ready' => 'Klar til overførsel',
        'downloading' => 'Henter ${record.progress} %',
        'downloaded' => 'Klar offline',
        'failed' => 'Fejlet',
        _ => record.status,
      };

  static String _date(DateTime value) =>
      '${value.day.toString().padLeft(2, '0')}.${value.month.toString().padLeft(2, '0')}.${value.year}';
}

class OfflinePlayerScreen extends StatefulWidget {
  const OfflinePlayerScreen({
    required this.record,
    required this.library,
    super.key,
  });

  final OfflineDownloadRecord record;
  final OfflineLibraryContract library;

  @override
  State<OfflinePlayerScreen> createState() => _OfflinePlayerScreenState();
}

class _OfflinePlayerScreenState extends State<OfflinePlayerScreen> {
  late final OfflinePlaybackController controller;

  @override
  void initState() {
    super.initState();
    controller = OfflinePlaybackController(
      library: widget.library,
      record: widget.record,
    );
    controller.addListener(_changed);
    unawaited(controller.initialize());
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    controller.removeListener(_changed);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = controller.video;
    final state = controller.state;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(widget.record.displayTitle),
      ),
      body: state.error != null
          ? Center(child: Text(state.error!))
          : video == null || !state.initialized
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: Center(
                    child: AspectRatio(
                      aspectRatio: video.value.aspectRatio,
                      child: VideoPlayer(video),
                    ),
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        IconButton(
                          onPressed: controller.togglePlayback,
                          icon: Icon(
                            state.playing ? Icons.pause : Icons.play_arrow,
                          ),
                        ),
                        Expanded(
                          child: Slider(
                            value: state.position.inMilliseconds
                                .clamp(0, state.duration.inMilliseconds)
                                .toDouble(),
                            max: state.duration.inMilliseconds
                                .clamp(1, 2_147_483_647)
                                .toDouble(),
                            onChanged: (value) => controller.seekTo(
                              Duration(milliseconds: value.round()),
                            ),
                          ),
                        ),
                        Text(_clock(state.position)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  String _clock(Duration value) {
    final hours = value.inHours;
    final minutes = value.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = value.inSeconds.remainder(60).toString().padLeft(2, '0');
    return hours > 0 ? '$hours:$minutes:$seconds' : '$minutes:$seconds';
  }
}
