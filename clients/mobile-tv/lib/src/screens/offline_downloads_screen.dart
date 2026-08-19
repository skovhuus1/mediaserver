import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../core/api_client.dart';
import '../core/offline_downloads.dart';

class OfflineDownloadsScreen extends StatefulWidget {
  const OfflineDownloadsScreen({
    required this.api,
    required this.profileId,
    this.offline = false,
    this.onReconnect,
    super.key,
  });

  final ApiClient api;
  final String? profileId;
  final bool offline;
  final Future<void> Function()? onReconnect;

  @override
  State<OfflineDownloadsScreen> createState() => _OfflineDownloadsScreenState();
}

class _OfflineDownloadsScreenState extends State<OfflineDownloadsScreen> {
  final manager = OfflineDownloadsManager.instance;

  @override
  void initState() {
    super.initState();
    unawaited(manager.configure(widget.api, online: !widget.offline));
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: manager,
    builder: (context, _) {
      final records = manager.forProfile(widget.profileId);
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
              onPressed: manager.syncing
                  ? null
                  : () => unawaited(manager.sync(online: !widget.offline)),
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
                              manager: manager,
                            ),
                          ),
                        )
                      : null,
                  onDelete: () => unawaited(manager.remove(records[index])),
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
    required this.manager,
    super.key,
  });

  final OfflineDownloadRecord record;
  final OfflineDownloadsManager manager;

  @override
  State<OfflinePlayerScreen> createState() => _OfflinePlayerScreenState();
}

class _OfflinePlayerScreenState extends State<OfflinePlayerScreen> {
  VideoPlayerController? controller;
  String? error;
  int lastSavedSecond = -1;

  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final path = widget.record.localPath;
    if (path == null ||
        !File(path).existsSync() ||
        !widget.record.licenseValid) {
      setState(
        () => error = 'Offlinefilen eller licensen er ikke længere gyldig.',
      );
      return;
    }
    final response =
        await const MethodChannel(
          'boltbytes.media/offline_downloads',
        ).invokeMapMethod<String, dynamic>('serve', {
          'id': widget.record.id,
          'localPath': path,
          'licenseExpiresAtMs':
              widget.record.licenseExpiresAt.millisecondsSinceEpoch,
        });
    final streamUrl = response?['url']?.toString();
    if (streamUrl == null || streamUrl.isEmpty) {
      setState(() => error = 'Den krypterede offlinefil kunne ikke åbnes.');
      return;
    }
    final next = VideoPlayerController.networkUrl(
      Uri.parse(streamUrl),
      videoPlayerOptions: VideoPlayerOptions(allowBackgroundPlayback: true),
    );
    controller = next;
    await next.initialize();
    if (widget.record.positionMs > 0 &&
        widget.record.positionMs < next.value.duration.inMilliseconds) {
      await next.seekTo(Duration(milliseconds: widget.record.positionMs));
    }
    next.addListener(_changed);
    await next.play();
    if (mounted) setState(() {});
  }

  void _changed() {
    final video = controller;
    if (video == null || !mounted) return;
    final second = video.value.position.inSeconds;
    if (second > 0 && second % 10 == 0 && second != lastSavedSecond) {
      lastSavedSecond = second;
      unawaited(
        widget.manager.saveProgress(
          widget.record,
          video.value.position.inMilliseconds,
          completed:
              video.value.duration > Duration.zero &&
              video.value.position >= video.value.duration * 0.9,
        ),
      );
    }
    setState(() {});
  }

  @override
  void dispose() {
    final video = controller;
    if (video != null) {
      video.removeListener(_changed);
      unawaited(
        widget.manager.saveProgress(
          widget.record,
          video.value.position.inMilliseconds,
        ),
      );
      unawaited(video.dispose());
    }
    unawaited(
      const MethodChannel(
        'boltbytes.media/offline_downloads',
      ).invokeMethod<void>('stopServe'),
    );
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = controller;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Text(widget.record.displayTitle),
      ),
      body: error != null
          ? Center(child: Text(error!))
          : video == null || !video.value.isInitialized
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
                          onPressed: () => video.value.isPlaying
                              ? video.pause()
                              : video.play(),
                          icon: Icon(
                            video.value.isPlaying
                                ? Icons.pause
                                : Icons.play_arrow,
                          ),
                        ),
                        Expanded(
                          child: Slider(
                            value: video.value.position.inMilliseconds
                                .clamp(0, video.value.duration.inMilliseconds)
                                .toDouble(),
                            max: video.value.duration.inMilliseconds
                                .clamp(1, 2_147_483_647)
                                .toDouble(),
                            onChanged: (value) => video.seekTo(
                              Duration(milliseconds: value.round()),
                            ),
                          ),
                        ),
                        Text(_clock(video.value.position)),
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
