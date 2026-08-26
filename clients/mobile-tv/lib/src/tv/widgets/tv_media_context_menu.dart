import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../shared_core/title_contract.dart';
import 'tv_option_overlay.dart';

typedef TvMediaContextOpenHandler = Future<void> Function(MediaItem media);
typedef TvMediaContextPlayHandler =
    Future<void> Function(MediaItem media, int resumePositionMs);

enum TvMediaContextAction { play, restart, open }

Future<void> showTvMediaContextMenu({
  required BuildContext context,
  required ApiClient api,
  required MediaItem media,
  required TvMediaContextOpenHandler onOpen,
  required TvMediaContextPlayHandler onPlay,
}) async {
  final seriesLike = _isSeriesLike(media);
  final episode = media.isEpisode;
  final hasProgress = media.progress != null && media.progress!.positionMs > 0;
  final action = await showDialog<TvMediaContextAction>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.58),
    builder: (_) => TvOptionOverlay<TvMediaContextAction>(
      playbackTitle: media.displayTitle,
      playbackSubtitle: episode
          ? 'Afsnit'
          : seriesLike
          ? 'Serie'
          : 'Film',
      panelTitle: 'Hurtigmenu',
      panelDescription:
          'Hold OK på en titel for hurtig adgang til de vigtigste handlinger uden at miste placeringen i rækken.',
      previewText: seriesLike ? 'Seriehandlinger' : 'Filmafspilning',
      choices: [
        TvPlaybackChoice(
          value: TvMediaContextAction.play,
          title: hasProgress ? 'Fortsæt' : 'Afspil',
          subtitle: hasProgress
              ? 'Start fra seneste position'
              : episode
              ? 'Start afsnittet'
              : seriesLike
              ? 'Start næste tilgængelige afsnit'
              : 'Start filmen',
          icon: Icons.play_arrow_rounded,
          selected: true,
        ),
        const TvPlaybackChoice(
          value: TvMediaContextAction.restart,
          title: 'Start forfra',
          subtitle: 'Afspil fra begyndelsen',
          icon: Icons.restart_alt_rounded,
          selected: false,
        ),
        TvPlaybackChoice(
          value: TvMediaContextAction.open,
          title: episode || seriesLike ? 'Gå til serie' : 'Gå til film',
          subtitle: episode
              ? 'Åbn serien, sæsoner og afsnit'
              : seriesLike
              ? 'Åbn sæsoner, afsnit og detaljer'
              : 'Åbn detaljer, lignende titler og handlinger',
          icon: Icons.info_outline_rounded,
          selected: false,
        ),
      ],
    ),
  );

  if (action == null || !context.mounted) return;
  switch (action) {
    case TvMediaContextAction.open:
      await onOpen(media);
      break;
    case TvMediaContextAction.play:
      await _playResolved(
        api,
        media,
        fromStart: false,
        onOpen: onOpen,
        onPlay: onPlay,
      );
      break;
    case TvMediaContextAction.restart:
      await _playResolved(
        api,
        media,
        fromStart: true,
        onOpen: onOpen,
        onPlay: onPlay,
      );
      break;
  }
}

bool _isSeriesLike(MediaItem media) => media.isSeries || media.isEpisode;

Future<void> _playResolved(
  ApiClient api,
  MediaItem media, {
  required bool fromStart,
  required TvMediaContextOpenHandler onOpen,
  required TvMediaContextPlayHandler onPlay,
}) async {
  if (!_isSeriesLike(media)) {
    await onPlay(media, fromStart ? 0 : media.progress?.positionMs ?? 0);
    return;
  }
  if (media.isEpisode) {
    await onPlay(media, fromStart ? 0 : media.progress?.positionMs ?? 0);
    return;
  }

  try {
    final payload = await TitleUseCase(api: api).loadTitle(media.id);
    final experience = payload.experience;
    final episode = fromStart
        ? _firstEpisode(experience)
        : experience.resumeEpisode ??
              experience.nextEpisode ??
              _firstEpisode(experience);
    if (episode == null) {
      await onOpen(media);
      return;
    }
    await onPlay(episode.media, fromStart ? 0 : episode.positionMs);
  } catch (_) {
    await onOpen(media);
  }
}

EpisodeItem? _firstEpisode(TitleExperience experience) {
  for (final season in experience.seasons) {
    if (season.episodes.isNotEmpty) return season.episodes.first;
  }
  return null;
}
