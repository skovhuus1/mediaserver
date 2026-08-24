import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../core/api_client.dart';
import '../core/models.dart';
import '../core/offline_downloads.dart';
import 'player_screen.dart';

class TitleScreen extends StatefulWidget {
  const TitleScreen({required this.api, required this.media, super.key});

  final ApiClient api;
  final MediaItem media;

  @override
  State<TitleScreen> createState() => _TitleScreenState();
}

class _TitleScreenState extends State<TitleScreen> {
  TitleExperience? experience;
  bool loading = true;
  String? error;
  int? selectedSeason;
  bool inWatchlist = false;
  bool watched = false;
  bool actionBusy = false;
  bool downloadBusy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load([int? season]) async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final query = season == null ? '' : '?seasonNumber=$season';
      final responses = await Future.wait([
        widget.api.getJson('/experience/titles/${widget.media.id}$query'),
        widget.api.getJson('/playback/history/${widget.media.id}/status'),
      ]);
      final next = TitleExperience.fromJson(responses[0]);
      final status = jsonMap(responses[1]);
      if (!mounted) return;
      setState(() {
        experience = next;
        selectedSeason =
            next.selectedSeasonNumber ??
            season ??
            next.seasons.firstOrNull?.number;
        loading = false;
        inWatchlist = status['inWatchlist'] == true;
        watched = status['watched'] == true;
      });
    } on ApiException catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = failure.message;
      });
    }
  }

  Future<void> _play(MediaItem media, int resumeMs) async {
    if (media.isSeries) {
      await _open(media);
      return;
    }
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => PlayerScreen(
          api: widget.api,
          media: media,
          resumePositionMs: resumeMs,
        ),
      ),
    );
    await _load(selectedSeason);
  }

  Future<void> _open(MediaItem media) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => TitleScreen(api: widget.api, media: media),
      ),
    );
    await _load(selectedSeason);
  }

  Future<void> _toggleWatchlist() async {
    if (actionBusy) return;
    setState(() => actionBusy = true);
    try {
      if (inWatchlist) {
        await widget.api.deleteJson('/playback/watchlist/${widget.media.id}');
      } else {
        await widget.api.putJson('/playback/watchlist/${widget.media.id}');
      }
      if (mounted) {
        setState(() {
          inWatchlist = !inWatchlist;
          actionBusy = false;
        });
      }
    } on ApiException catch (failure) {
      if (mounted) {
        setState(() {
          actionBusy = false;
          error = failure.message;
        });
      }
    }
  }

  Future<void> _toggleWatched() async {
    if (actionBusy) return;
    setState(() => actionBusy = true);
    try {
      await widget.api.patchJson(
        '/playback/history/${widget.media.id}/watched',
        {'watched': !watched},
      );
      if (mounted) {
        setState(() {
          watched = !watched;
          actionBusy = false;
        });
      }
    } on ApiException catch (failure) {
      if (mounted) {
        setState(() {
          actionBusy = false;
          error = failure.message;
        });
      }
    }
  }

  Future<void> _download() async {
    if (downloadBusy) return;
    final quality = await showModalBottomSheet<int>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Download til offline'),
              subtitle: Text('Filen klargøres som kompatibel H.264/AAC MP4.'),
            ),
            for (final height in [360, 480, 720, 1080])
              ListTile(
                leading: const Icon(Icons.download_outlined),
                title: Text('${height}p'),
                onTap: () => Navigator.pop(context, height),
              ),
          ],
        ),
      ),
    );
    if (quality == null || !mounted) return;
    setState(() => downloadBusy = true);
    try {
      final manager = OfflineDownloadsManager.instance;
      await manager.configure(widget.api);
      await manager.queue(widget.media.id, quality);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Downloaden er sat i kø.')),
        );
      }
    } on ApiException catch (failure) {
      if (mounted) setState(() => error = failure.message);
    } finally {
      if (mounted) setState(() => downloadBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = experience;
    final media = data?.title ?? widget.media;
    final tv = useTvLayout(context);
    final backdrop = widget.api.absoluteMediaUrl(
      media.backdropPath ?? media.posterPath,
      imageSize: 'original',
    );
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: tv ? 420 : 470,
            pinned: true,
            backgroundColor: const Color(0xFF090D12),
            actions: [
              if (tv)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _TvActionButton(
                    icon: Icons.download_for_offline_outlined,
                    label: 'Download',
                    busy: downloadBusy,
                    onTap: downloadBusy ? null : _download,
                  ),
                )
              else
                IconButton(
                  tooltip: 'Download til offline',
                  onPressed: downloadBusy ? null : _download,
                  icon: downloadBusy
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.download_for_offline_outlined),
                ),
              if (!tv)
                IconButton(
                  tooltip: inWatchlist
                      ? 'Fjern fra Min liste'
                      : 'Føj til Min liste',
                  onPressed: actionBusy ? null : _toggleWatchlist,
                  icon: Icon(
                    inWatchlist ? Icons.bookmark : Icons.bookmark_outline,
                  ),
                )
              else
                _TvActionButton(
                  icon: inWatchlist ? Icons.bookmark : Icons.bookmark_outline,
                  label: inWatchlist ? 'Fjern liste' : 'Gem i liste',
                  onTap: actionBusy ? null : _toggleWatchlist,
                ),
              if (!tv)
                IconButton(
                  tooltip: watched ? 'Markér som ikke set' : 'Markér som set',
                  onPressed: actionBusy ? null : _toggleWatched,
                  icon: Icon(
                    watched ? Icons.check_circle : Icons.check_circle_outline,
                  ),
                )
              else
                _TvActionButton(
                  icon: watched
                      ? Icons.check_circle
                      : Icons.check_circle_outline,
                  label: watched ? 'Marker uset' : 'Marker set',
                  onTap: actionBusy ? null : _toggleWatched,
                ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (backdrop.isNotEmpty)
                    Image.network(
                      backdrop,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const SizedBox(),
                    ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Color(0xAA090D12),
                          Color(0xFF090D12),
                        ],
                        stops: [0.25, 0.7, 1],
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.bottomLeft,
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        tv ? 58 : 24,
                        90,
                        tv ? 58 : 24,
                        40,
                      ),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 820),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Wrap(
                              spacing: 8,
                              children: [
                                if (media.releaseYear != null)
                                  Chip(label: Text('${media.releaseYear}')),
                                if (media.is4k) const Chip(label: Text('4K')),
                                if (media.isHdr)
                                  Chip(label: Text(media.hdr!.toUpperCase())),
                                for (final genre
                                    in data?.genres.take(3) ?? const <String>[])
                                  Chip(label: Text(genre)),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(
                              media.displayTitle,
                              style: Theme.of(context).textTheme.displayLarge
                                  ?.copyWith(
                                    fontSize: tv ? 48 : 42,
                                    height: 0.98,
                                  ),
                            ),
                            if (media.isEpisode) ...[
                              const SizedBox(height: 8),
                              Text(
                                media.episodeLabel,
                                style: const TextStyle(
                                  fontSize: 18,
                                  color: Colors.white70,
                                ),
                              ),
                            ],
                            const SizedBox(height: 14),
                            Text(
                              media.overview ??
                                  'Ingen beskrivelse er tilgængelig endnu.',
                              maxLines: tv ? 3 : 4,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white70,
                                height: 1.5,
                              ),
                            ),
                            const SizedBox(height: 20),
                            if (tv)
                              _TitleActionRow(
                                media: media,
                                experience: data,
                                loading: loading,
                                inWatchlist: inWatchlist,
                                watched: watched,
                                actionBusy: actionBusy,
                                onPlay: (resumeFromStart) {
                                  final current = data;
                                  if (current == null ||
                                      current.seasons.isEmpty) {
                                    _play(
                                      media,
                                      resumeFromStart
                                          ? 0
                                          : widget.media.progress?.positionMs ??
                                                0,
                                    );
                                    return;
                                  }
                                  if (resumeFromStart) {
                                    final first = current
                                        .seasons
                                        .firstOrNull
                                        ?.episodes
                                        .firstOrNull;
                                    if (first == null) {
                                      _play(media, 0);
                                      return;
                                    }
                                    _play(first.media, first.positionMs);
                                    return;
                                  }
                                  final episode =
                                      current.resumeEpisode ??
                                      current.nextEpisode;
                                  if (current.mode == 'series' &&
                                      episode != null) {
                                    _play(episode.media, episode.positionMs);
                                  } else {
                                    _play(
                                      media,
                                      widget.media.progress?.positionMs ?? 0,
                                    );
                                  }
                                },
                                onToggleWatchlist: actionBusy
                                    ? null
                                    : () {
                                        unawaited(_toggleWatchlist());
                                      },
                                onToggleWatched: actionBusy
                                    ? null
                                    : () {
                                        unawaited(_toggleWatched());
                                      },
                                onDownload: downloadBusy
                                    ? null
                                    : () {
                                        unawaited(_download());
                                      },
                              )
                            else
                              FilledButton.icon(
                                autofocus: tv,
                                onPressed: loading
                                    ? null
                                    : () {
                                        final episode =
                                            data?.resumeEpisode ??
                                            data?.nextEpisode;
                                        if (data?.mode == 'series' &&
                                            episode != null) {
                                          _play(
                                            episode.media,
                                            episode.positionMs,
                                          );
                                        } else {
                                          _play(
                                            media,
                                            widget.media.progress?.positionMs ??
                                                0,
                                          );
                                        }
                                      },
                                icon: const Icon(Icons.play_arrow),
                                label: Text(
                                  data?.resumeEpisode != null ||
                                          widget.media.progress != null
                                      ? 'Fortsæt'
                                      : 'Afspil',
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (loading)
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.all(48),
                child: Center(child: CircularProgressIndicator()),
              ),
            )
          else if (error != null)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  children: [
                    Text(error!),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _load,
                      child: const Text('Prøv igen'),
                    ),
                  ],
                ),
              ),
            )
          else if (data?.mode == 'series') ...[
            SliverToBoxAdapter(child: _seasonSelector(data!, tv)),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(tv ? 54 : 18, 10, tv ? 54 : 18, 44),
              sliver: SliverList.separated(
                itemCount: _selectedEpisodes(data).length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, index) => _EpisodeTile(
                  api: widget.api,
                  episode: _selectedEpisodes(data)[index],
                  tv: tv,
                  onPressed: () => _play(
                    _selectedEpisodes(data)[index].media,
                    _selectedEpisodes(data)[index].positionMs,
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 48),
                child: TextButton(
                  onPressed: () => launchUrl(
                    Uri.parse('https://thetvdb.com/'),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: const Text(
                    'Seriemetadata kan være leveret af TheTVDB.com',
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _seasonSelector(TitleExperience data, bool tv) => Padding(
    padding: EdgeInsets.fromLTRB(tv ? 54 : 24, 20, tv ? 54 : 24, 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Sæsoner og afsnit',
          style: Theme.of(
            context,
          ).textTheme.headlineSmall?.copyWith(fontSize: tv ? 28 : 22),
        ),
        const SizedBox(height: 14),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: data.seasons
                .map(
                  (season) => Padding(
                    padding: EdgeInsets.only(right: tv ? 12 : 10),
                    child: _SeasonButton(
                      label: '${season.label} · ${season.episodeCount}',
                      selected: selectedSeason == season.number,
                      onPressed: () {
                        selectedSeason = season.number;
                        _load(season.number);
                      },
                    ),
                  ),
                )
                .toList(growable: false),
          ),
        ),
      ],
    ),
  );

  List<EpisodeItem> _selectedEpisodes(TitleExperience data) {
    for (final season in data.seasons) {
      if (season.number == selectedSeason) return season.episodes;
    }
    return data.seasons.firstOrNull?.episodes ?? const [];
  }
}

class _TitleActionRow extends StatelessWidget {
  const _TitleActionRow({
    required this.media,
    required this.experience,
    required this.loading,
    required this.inWatchlist,
    required this.watched,
    required this.actionBusy,
    required this.onPlay,
    required this.onToggleWatchlist,
    required this.onToggleWatched,
    required this.onDownload,
  });

  final MediaItem media;
  final TitleExperience? experience;
  final bool loading;
  final bool inWatchlist;
  final bool watched;
  final bool actionBusy;
  final void Function(bool resumeFromStart) onPlay;
  final VoidCallback? onToggleWatchlist;
  final VoidCallback? onToggleWatched;
  final VoidCallback? onDownload;

  @override
  Widget build(BuildContext context) {
    final hasResume =
        (experience?.resumeEpisode != null) || media.progress != null;
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        FilledButton.icon(
          autofocus: useTvLayout(context),
          onPressed: loading ? null : () => onPlay(false),
          icon: const Icon(Icons.play_arrow),
          label: Text(hasResume ? 'Fortsæt' : 'Afspil'),
          style: FilledButton.styleFrom(
            minimumSize: const Size(170, 48),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        OutlinedButton.icon(
          onPressed: loading ? null : () => onPlay(true),
          icon: const Icon(Icons.playlist_play),
          label: const Text('Afspil fra start'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(170, 48),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
        if (onDownload != null)
          OutlinedButton.icon(
            onPressed: onDownload,
            icon: const Icon(Icons.download_for_offline_outlined),
            label: const Text('Download'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(160, 48),
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        if (onToggleWatchlist != null)
          TextButton.icon(
            onPressed: actionBusy ? null : onToggleWatchlist,
            icon: Icon(inWatchlist ? Icons.bookmark : Icons.bookmark_outline),
            label: Text(inWatchlist ? 'Fjern fra liste' : 'Gem i liste'),
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              backgroundColor: Colors.white.withValues(alpha: 0.06),
              minimumSize: const Size(148, 48),
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        if (onToggleWatched != null)
          TextButton.icon(
            onPressed: actionBusy ? null : onToggleWatched,
            icon: Icon(
              watched ? Icons.check_circle : Icons.check_circle_outline,
            ),
            label: Text(watched ? 'Marker uset' : 'Marker set'),
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              backgroundColor: Colors.white.withValues(alpha: 0.06),
              minimumSize: const Size(148, 48),
              textStyle: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
      ],
    );
  }
}

class _EpisodeTile extends StatefulWidget {
  const _EpisodeTile({
    required this.api,
    required this.episode,
    required this.tv,
    required this.onPressed,
  });

  final ApiClient api;
  final EpisodeItem episode;
  final bool tv;
  final VoidCallback onPressed;

  @override
  State<_EpisodeTile> createState() => _EpisodeTileState();
}

class _EpisodeTileState extends State<_EpisodeTile> {
  bool focused = false;

  @override
  Widget build(BuildContext context) {
    final episode = widget.episode;
    final image = widget.api.absoluteMediaUrl(
      episode.stillPath ?? episode.media.backdropPath,
      imageSize: 'w780',
    );
    return InkWell(
      onTap: widget.onPressed,
      onFocusChange: (value) {
        setState(() => focused = value);
        if (value) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            Scrollable.ensureVisible(
              context,
              alignment: 0.42,
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
            );
          });
        }
      },
      borderRadius: BorderRadius.circular(widget.tv ? 18 : 16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: EdgeInsets.all(widget.tv ? 14 : 10),
        decoration: BoxDecoration(
          color: focused ? const Color(0xFF1C2732) : const Color(0xFF10161D),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: focused
                ? Theme.of(context).colorScheme.secondary
                : const Color(0xFF222B34),
            width: focused ? 3 : 1,
          ),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(11),
              child: SizedBox(
                width: widget.tv ? 220 : 180,
                height: widget.tv ? 124 : 102,
                child: image.isEmpty
                    ? const ColoredBox(
                        color: Color(0xFF1A222A),
                        child: Icon(Icons.play_circle_outline),
                      )
                    : Image.network(
                        image,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const ColoredBox(color: Color(0xFF1A222A)),
                      ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${episode.media.episodeLabel} · ${episode.media.displayTitle}',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: widget.tv ? 18 : 16,
                          ),
                        ),
                      ),
                      if (episode.watched)
                        const Icon(
                          Icons.check_circle,
                          color: Color(0xFF62C9A7),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    episode.media.overview ?? 'Ingen episodebeskrivelse.',
                    maxLines: widget.tv ? 3 : 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, height: 1.35),
                  ),
                  if (episode.progressPercent > 0 && !episode.watched) ...[
                    const SizedBox(height: 10),
                    LinearProgressIndicator(
                      value: (episode.progressPercent / 100).clamp(0, 1),
                      minHeight: widget.tv ? 4 : 3,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            widget.tv
                ? Icon(Icons.play_arrow, size: 30, color: Colors.white70)
                : const Icon(Icons.play_arrow),
          ],
        ),
      ),
    );
  }
}

class _TvActionButton extends StatelessWidget {
  const _TvActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.busy = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool busy;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: onTap,
    icon: busy
        ? const SizedBox.square(
            dimension: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Icon(icon, size: 18),
    label: Text(label),
    style: OutlinedButton.styleFrom(
      foregroundColor: Colors.white,
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    ),
  );
}

class _SeasonButton extends StatefulWidget {
  const _SeasonButton({
    required this.label,
    required this.selected,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final VoidCallback onPressed;

  @override
  State<_SeasonButton> createState() => _SeasonButtonState();
}

class _SeasonButtonState extends State<_SeasonButton> {
  bool focused = false;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: widget.onPressed,
    onFocusChange: (value) {
      setState(() => focused = value);
      if (value) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          Scrollable.ensureVisible(
            context,
            alignment: 0.5,
            duration: const Duration(milliseconds: 180),
          );
        });
      }
    },
    borderRadius: BorderRadius.circular(12),
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: widget.selected
            ? const Color(0xFF173E68)
            : const Color(0xFF122235),
        border: Border.all(
          color: focused
              ? Theme.of(context).colorScheme.primary
              : widget.selected
              ? const Color(0xFF4EA1FF)
              : const Color(0xFF29435D),
          width: focused ? 3 : 1,
        ),
      ),
      child: Text(
        widget.label,
        style: TextStyle(
          color: Colors.white,
          fontWeight: widget.selected ? FontWeight.w800 : FontWeight.w600,
        ),
      ),
    ),
  );
}
