import 'dart:async';

import '../core/api_client.dart';
import '../core/models.dart';

/// Stable business/data boundary for title detail experiences.
///
/// UI shells own layout, focus and navigation. This contract owns endpoint
/// construction, payload parsing and title-level state mutations.
abstract interface class TitleContract {
  Future<TitlePayload> loadTitle(String mediaId);

  Future<void> setWatchlist(String mediaId, {required bool included});

  Future<void> setWatched(String mediaId, {required bool watched});
}

abstract interface class SeasonAwareTitleContract implements TitleContract {
  Future<TitlePayload> loadTitleSeason(String mediaId, int seasonNumber);
}

class TitleUseCase implements SeasonAwareTitleContract {
  const TitleUseCase({
    required this.api,
    this.attemptTimeout = const Duration(seconds: 4),
  });

  final ApiClient api;
  final Duration attemptTimeout;

  @override
  Future<TitlePayload> loadTitle(String mediaId) => _loadTitle(mediaId);

  @override
  Future<TitlePayload> loadTitleSeason(String mediaId, int seasonNumber) =>
      _loadTitle(mediaId, seasonNumber: seasonNumber);

  Future<TitlePayload> _loadTitle(String mediaId, {int? seasonNumber}) async {
    final encodedId = Uri.encodeComponent(mediaId);
    final responses = await Future.wait<dynamic>([
      _loadExperience(encodedId, seasonNumber: seasonNumber),
      _getWithRetry(
        '/playback/history/$encodedId/status',
      ).catchError((_) => <String, dynamic>{}),
    ]);
    final status = jsonMap(responses[1]);
    return TitlePayload(
      experience: TitleExperience.fromJson(responses[0]),
      inWatchlist: boolValue(status['inWatchlist']),
      watched: boolValue(status['watched']),
    );
  }

  Future<dynamic> _loadExperience(String encodedId, {int? seasonNumber}) async {
    try {
      return await _getWithRetry('/experience/titles/$encodedId');
    } catch (_) {
      final seasonQuery = seasonNumber == null
          ? ''
          : '?season=${Uri.encodeQueryComponent('$seasonNumber')}';
      final details = await _getWithRetry(
        '/media/$encodedId/details$seasonQuery',
      );
      return _adaptCatalogDetails(details);
    }
  }

  Map<String, dynamic> _adaptCatalogDetails(dynamic value) {
    final details = jsonMap(value);
    final item = jsonMap(details['item']);
    final discovery = jsonMap(details['discovery']);
    final seasons = jsonList(details['seasons'])
        .map((rawSeason) {
          final season = jsonMap(rawSeason);
          final episodes = jsonList(season['episodes'])
              .map((rawEpisode) {
                final episode = jsonMap(rawEpisode);
                final progress = jsonMap(episode['progress']);
                return <String, dynamic>{
                  ...episode,
                  'watched': boolValue(progress['completed']),
                  'positionMs': intValue(progress['positionMs']) ?? 0,
                  'progressPercent': doubleValue(progress['percent']) ?? 0,
                };
              })
              .toList(growable: false);
          return <String, dynamic>{
            ...season,
            'label':
                stringValue(season['label']) ?? stringValue(season['title']),
            'episodes': episodes,
          };
        })
        .toList(growable: false);

    final people = <dynamic>[
      ...jsonList(discovery['cast']),
      ...jsonList(discovery['crew']),
      ...jsonList(discovery['people']),
    ];

    final normalizedPeople = people
        .map((rawPerson) {
          final person = jsonMap(rawPerson);
          final key = stringValue(person['key']) ?? stringValue(person['id']);
          final name =
              stringValue(person['name']) ?? stringValue(person['label']);
          if (key == null || name == null || key.isEmpty || name.isEmpty) {
            return null;
          }
          return <String, dynamic>{...person, 'key': key, 'name': name};
        })
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);

    final relatedSources = <dynamic>[
      ...jsonList(details['related']),
      ...jsonList(jsonMap(details['discovery'])['related']),
      ...jsonList(jsonMap(details['recommendation'])['items']),
      ...jsonList(jsonMap(details['recommendations'])['items']),
    ];

    final relatedById = <String, dynamic>{};
    for (final rawRelated in relatedSources) {
      final raw = jsonMap(rawRelated);
      final id = stringValue(raw['id']);
      if (id == null || id.isEmpty || relatedById.containsKey(id)) {
        continue;
      }
      relatedById[id] = raw;
    }

    final continuation = jsonMap(details['continuation']);
    return <String, dynamic>{
      'mode': stringValue(details['kind']) == 'series' ? 'series' : 'title',
      'title': item,
      'series': <String, dynamic>{
        'seasons': seasons,
        'selectedSeasonNumber': intValue(details['selectedSeason']),
        if (continuation.isNotEmpty) 'resumeEpisode': continuation,
      },
      'discovery': <String, dynamic>{'people': normalizedPeople},
      'related': relatedById.values.toList(growable: false),
    };
  }

  Future<dynamic> _getWithRetry(String path) async {
    Object? lastFailure;
    StackTrace? lastStack;
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        return await api.getJson(path).timeout(attemptTimeout);
      } catch (failure, stack) {
        lastFailure = failure;
        lastStack = stack;
      }
    }
    Error.throwWithStackTrace(
      lastFailure ?? TimeoutException('Titeldata overskred tidsgrænsen.'),
      lastStack ?? StackTrace.current,
    );
  }

  @override
  Future<void> setWatchlist(String mediaId, {required bool included}) async {
    final encodedId = Uri.encodeComponent(mediaId);
    if (included) {
      await api.putJson('/playback/watchlist/$encodedId');
    } else {
      await api.deleteJson('/playback/watchlist/$encodedId');
    }
  }

  @override
  Future<void> setWatched(String mediaId, {required bool watched}) async {
    final encodedId = Uri.encodeComponent(mediaId);
    await api.patchJson('/playback/history/$encodedId/watched', {
      'watched': watched,
    });
  }
}

class TitlePayload {
  const TitlePayload({
    required this.experience,
    required this.inWatchlist,
    required this.watched,
  });

  final TitleExperience experience;
  final bool inWatchlist;
  final bool watched;
}
