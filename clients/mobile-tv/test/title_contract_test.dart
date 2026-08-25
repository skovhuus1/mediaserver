import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/shared_core/title_contract.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/memory_session_storage.dart';

void main() {
  test(
    'TitleUseCase shares title parsing and mutations across UI shells',
    () async {
      final requests = <String>[];
      Map<String, dynamic>? watchedBody;
      final client = MockClient((request) async {
        requests.add('${request.method} ${request.url.path}');
        if (request.url.path.endsWith('/experience/titles/movie-1')) {
          return _json({
            'mode': 'title',
            'title': {
              'id': 'movie-1',
              'type': 'movie',
              'title': 'Fælles titel',
              'releaseYear': 2026,
              'genres': ['Drama'],
            },
            'series': {'seasons': <dynamic>[]},
          });
        }
        if (request.url.path.endsWith('/playback/history/movie-1/status')) {
          return _json({'inWatchlist': true, 'watched': false});
        }
        if (request.method == 'PATCH') {
          watchedBody = jsonDecode(request.body) as Map<String, dynamic>;
        }
        return _json({});
      });
      addTearDown(client.close);
      final contract = TitleUseCase(
        api: ApiClient(
          baseUrl: 'https://media.example.test/api/v1',
          storage: MemorySessionStorage(),
          httpClient: client,
        ),
      );

      final payload = await contract.loadTitle('movie-1');
      await contract.setWatchlist('movie-1', included: true);
      await contract.setWatchlist('movie-1', included: false);
      await contract.setWatched('movie-1', watched: true);

      expect(payload.experience.title.title, 'Fælles titel');
      expect(payload.experience.genres, ['Drama']);
      expect(payload.inWatchlist, isTrue);
      expect(payload.watched, isFalse);
      expect(requests, contains('GET /api/v1/experience/titles/movie-1'));
      expect(requests, contains('GET /api/v1/playback/history/movie-1/status'));
      expect(requests, contains('PUT /api/v1/playback/watchlist/movie-1'));
      expect(requests, contains('DELETE /api/v1/playback/watchlist/movie-1'));
      expect(
        requests,
        contains('PATCH /api/v1/playback/history/movie-1/watched'),
      );
      expect(watchedBody, {'watched': true});
    },
  );

  test('TitleUseCase retries a transient experience failure', () async {
    var experienceCalls = 0;
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/experience/titles/movie-1')) {
        experienceCalls += 1;
        if (experienceCalls == 1) {
          return http.Response(
            jsonEncode({'message': 'Temporary failure'}),
            503,
            headers: {'content-type': 'application/json'},
          );
        }
        return _json({
          'mode': 'title',
          'title': {'id': 'movie-1', 'type': 'movie', 'title': 'Stabil titel'},
          'series': {'seasons': <dynamic>[]},
        });
      }
      if (request.url.path.endsWith('/playback/history/movie-1/status')) {
        return _json({'inWatchlist': false, 'watched': false});
      }
      return _json({});
    });
    addTearDown(client.close);
    final contract = TitleUseCase(
      api: ApiClient(
        baseUrl: 'https://media.example.test/api/v1',
        storage: MemorySessionStorage(),
        httpClient: client,
      ),
      attemptTimeout: const Duration(seconds: 1),
    );

    final payload = await contract.loadTitle('movie-1');

    expect(payload.experience.title.title, 'Stabil titel');
    expect(experienceCalls, 2);
  });

  test('TitleUseCase tolerates unavailable history status', () async {
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/experience/titles/movie-1')) {
        return _json({
          'mode': 'title',
          'title': {'id': 'movie-1', 'type': 'movie', 'title': 'Titel'},
          'series': {'seasons': <dynamic>[]},
        });
      }
      return http.Response(
        jsonEncode({'message': 'History unavailable'}),
        503,
        headers: {'content-type': 'application/json'},
      );
    });
    addTearDown(client.close);
    final contract = TitleUseCase(
      api: ApiClient(
        baseUrl: 'https://media.example.test/api/v1',
        storage: MemorySessionStorage(),
        httpClient: client,
      ),
      attemptTimeout: const Duration(seconds: 1),
    );

    final payload = await contract.loadTitle('movie-1');

    expect(payload.inWatchlist, isFalse);
    expect(payload.watched, isFalse);
  });

  test(
    'TitleUseCase falls back to catalog details for older servers',
    () async {
      var experienceCalls = 0;
      final client = MockClient((request) async {
        if (request.url.path.endsWith('/experience/titles/episode-1')) {
          experienceCalls += 1;
          return http.Response(
            jsonEncode({'message': 'Not available'}),
            404,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/media/episode-1/details')) {
          return _json({
            'kind': 'series',
            'selectedSeason': 1,
            'item': {
              'id': 'episode-1',
              'type': 'series',
              'title': 'Kompatibel serie',
            },
            'continuation': {
              'id': 'episode-1',
              'title': 'Pilot',
              'seasonNumber': 1,
              'episodeNumber': 1,
            },
            'seasons': [
              {
                'number': 1,
                'title': 'Sæson 1',
                'episodeCount': 1,
                'episodes': [
                  {
                    'id': 'episode-1',
                    'title': 'Pilot',
                    'seasonNumber': 1,
                    'episodeNumber': 1,
                    'progress': {
                      'positionMs': 12000,
                      'percent': 25,
                      'completed': false,
                    },
                  },
                ],
              },
            ],
          });
        }
        if (request.url.path.endsWith('/playback/history/episode-1/status')) {
          return _json({'inWatchlist': false, 'watched': false});
        }
        return _json({});
      });
      addTearDown(client.close);
      final contract = TitleUseCase(
        api: ApiClient(
          baseUrl: 'https://media.example.test/api/v1',
          storage: MemorySessionStorage(),
          httpClient: client,
        ),
        attemptTimeout: const Duration(seconds: 1),
      );

      final payload = await contract.loadTitle('episode-1');

      expect(experienceCalls, 2);
      expect(payload.experience.title.title, 'Kompatibel serie');
      expect(payload.experience.selectedSeasonNumber, 1);
      expect(
        payload.experience.seasons.single.episodes.single.positionMs,
        12000,
      );
    },
  );
}

http.Response _json(dynamic value) => http.Response(
  jsonEncode(value),
  200,
  headers: {'content-type': 'application/json'},
);
