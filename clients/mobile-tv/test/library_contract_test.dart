import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/shared_core/library_contract.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/memory_session_storage.dart';

void main() {
  test(
    'loadHomePayload parses the same immutable payload for every shell',
    () async {
      final requests = <Uri>[];
      final client = MockClient((request) async {
        requests.add(request.url);
        if (request.url.path.endsWith('/media/catalog')) {
          final type = request.url.queryParameters['type'] ?? 'movie';
          final sort = request.url.queryParameters['sort'] ?? 'newest';
          return _jsonResponse({
            'items': [_media('$type-$sort', type, '$type $sort')],
            'page': 1,
            'total': 1,
            'totalPages': 1,
            'facets': {
              'categories': ['Action', ' action ', 'Drama', ''],
            },
          });
        }
        if (request.url.path.endsWith('/playback/history/continue')) {
          return _jsonResponse([
            _media('continue-1', 'movie', 'Fortsæt titel'),
          ]);
        }
        if (request.url.path.endsWith('/playback/watchlist')) {
          return _jsonResponse([_media('watchlist-1', 'series', 'Min serie')]);
        }
        if (request.url.path.endsWith('/media/recommendations')) {
          return _jsonResponse({
            'hero': _media('hero-1', 'movie', 'Hero'),
            'sections': [
              {
                'title': 'Til dig',
                'items': [_media('recommended-1', 'movie', 'Anbefalet')],
              },
            ],
          });
        }
        return http.Response('{}', 404);
      });
      addTearDown(client.close);
      final useCase = LibraryUseCase(
        api: ApiClient(
          baseUrl: 'https://media.example.test/api/v1',
          storage: MemorySessionStorage(),
          httpClient: client,
        ),
      );

      final payload = await useCase.loadHomePayload();

      expect(payload.hero?.id, 'hero-1');
      expect(payload.movieCatalog.items.single.id, 'movie-newest');
      expect(payload.continueItems.single.id, 'continue-1');
      expect(payload.watchlistItems.single.id, 'watchlist-1');
      expect(payload.movieCatalog.categories, ['Action', 'Drama']);
      expect(payload.isEmpty, isFalse);
      expect(
        requests.where((uri) => uri.path.endsWith('/media/catalog')),
        hasLength(5),
      );
    },
  );

  test(
    'search uses backend q filters concurrently and deduplicates media',
    () async {
      final requests = <Uri>[];
      final client = MockClient((request) async {
        requests.add(request.url);
        final type = request.url.queryParameters['type'] ?? 'movie';
        return _jsonResponse({
          'items': [
            _media('shared-1', type, 'Arrival'),
            _media('$type-1', type, 'Arrival $type'),
          ],
          'page': 1,
          'total': 2,
          'totalPages': 1,
          'facets': {'categories': <String>[]},
        });
      });
      addTearDown(client.close);
      final useCase = LibraryUseCase(
        api: ApiClient(
          baseUrl: 'https://media.example.test/api/v1',
          storage: MemorySessionStorage(),
          httpClient: client,
        ),
      );

      final results = await useCase.search(' Arrival ', maxResults: 4);

      expect(results.map((item) => item.id), [
        'shared-1',
        'movie-1',
        'series-1',
        'episode-1',
      ]);
      expect(requests, hasLength(3));
      for (final request in requests) {
        expect(request.queryParameters['q'], 'Arrival');
        expect(request.queryParameters['pageSize'], '4');
        expect(request.queryParameters['page'], '1');
      }
    },
  );

  test('catalog pagination owns URL encoding and response parsing', () async {
    late Uri requestUri;
    final client = MockClient((request) async {
      requestUri = request.url;
      return _jsonResponse({
        'items': [_media('movie-1', 'movie', 'Film')],
        'page': 2,
        'total': 101,
        'totalPages': 2,
        'facets': {
          'categories': ['Science Fiction'],
        },
      });
    });
    addTearDown(client.close);
    final useCase = LibraryUseCase(
      api: ApiClient(
        baseUrl: 'https://media.example.test/api/v1',
        storage: MemorySessionStorage(),
        httpClient: client,
      ),
    );

    final payload = await useCase.loadCatalogPage(
      'movie',
      page: 2,
      sort: 'title',
      category: 'Science Fiction',
      query: 'Moon & Mars',
      pageSize: 999,
    );

    expect(requestUri.queryParameters, containsPair('type', 'movie'));
    expect(requestUri.queryParameters, containsPair('page', '2'));
    expect(requestUri.queryParameters, containsPair('pageSize', '100'));
    expect(
      requestUri.queryParameters,
      containsPair('category', 'Science Fiction'),
    );
    expect(requestUri.queryParameters, containsPair('q', 'Moon & Mars'));
    expect(payload.page, 2);
    expect(payload.totalPages, 2);
    expect(payload.items.single.id, 'movie-1');
  });
}

http.Response _jsonResponse(dynamic value) => http.Response(
  jsonEncode(value),
  200,
  headers: {'content-type': 'application/json'},
);

Map<String, dynamic> _media(String id, String type, String title) => {
  'id': id,
  'type': type,
  'title': title,
  'overview': 'Testtitel',
  'releaseYear': 2026,
};
