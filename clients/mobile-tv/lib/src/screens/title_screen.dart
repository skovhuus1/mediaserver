import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../core/api_client.dart';
import '../core/models.dart';
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
      final next = TitleExperience.fromJson(
        await widget.api.getJson('/experience/titles/${widget.media.id}$query'),
      );
      if (!mounted) return;
      setState(() {
        experience = next;
        selectedSeason =
            next.selectedSeasonNumber ??
            season ??
            next.seasons.firstOrNull?.number;
        loading = false;
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
            expandedHeight: tv ? 560 : 470,
            pinned: true,
            backgroundColor: const Color(0xFF090D12),
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
                                    fontSize: tv ? 64 : 42,
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
                              maxLines: tv ? 5 : 4,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white70,
                                height: 1.5,
                              ),
                            ),
                            const SizedBox(height: 20),
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
            SliverToBoxAdapter(child: _seasonSelector(data!)),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(tv ? 54 : 18, 10, tv ? 54 : 18, 44),
              sliver: SliverList.separated(
                itemCount: _selectedEpisodes(data).length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (_, index) => _EpisodeTile(
                  api: widget.api,
                  episode: _selectedEpisodes(data)[index],
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

  Widget _seasonSelector(TitleExperience data) => Padding(
    padding: const EdgeInsets.fromLTRB(24, 20, 24, 14),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: data.seasons
            .map(
              (season) => Padding(
                padding: const EdgeInsets.only(right: 10),
                child: ChoiceChip(
                  label: Text('${season.label} · ${season.episodeCount}'),
                  selected: selectedSeason == season.number,
                  onSelected: (_) {
                    selectedSeason = season.number;
                    _load(season.number);
                  },
                ),
              ),
            )
            .toList(growable: false),
      ),
    ),
  );

  List<EpisodeItem> _selectedEpisodes(TitleExperience data) {
    for (final season in data.seasons) {
      if (season.number == selectedSeason) return season.episodes;
    }
    return data.seasons.firstOrNull?.episodes ?? const [];
  }
}

class _EpisodeTile extends StatefulWidget {
  const _EpisodeTile({
    required this.api,
    required this.episode,
    required this.onPressed,
  });

  final ApiClient api;
  final EpisodeItem episode;
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
      onFocusChange: (value) => setState(() => focused = value),
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: focused ? const Color(0xFF18232B) : const Color(0xFF10161D),
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
                width: 180,
                height: 102,
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
                          episode.media.episodeLabel,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      if (episode.watched)
                        const Icon(
                          Icons.check_circle,
                          color: Color(0xFF43E7C4),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    episode.media.overview ?? 'Ingen episodebeskrivelse.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, height: 1.35),
                  ),
                  if (episode.progressPercent > 0 && !episode.watched) ...[
                    const SizedBox(height: 10),
                    LinearProgressIndicator(
                      value: (episode.progressPercent / 100).clamp(0, 1),
                      minHeight: 3,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 12),
            const Icon(Icons.play_arrow),
          ],
        ),
      ),
    );
  }
}
