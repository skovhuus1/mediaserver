import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:boltbytes_media/src/screens/title_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemoryStorage implements SessionStorage {
  @override
  Future<void> clearTokens() async {}
  @override
  Future<String?> readAccessToken() async => null;
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {}
}

void main() {
  testWidgets('series page renders seasons and every episode on TV', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = ApiClient(
      baseUrl: 'https://media.example/api/v1',
      storage: _MemoryStorage(),
      httpClient: MockClient((request) async {
        if (request.url.path.contains('/experience/titles/')) {
          return http.Response(
            jsonEncode(_seriesExperience()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/playback/history/')) {
          return http.Response(
            jsonEncode({'inWatchlist': false, 'watched': false}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final media = MediaItem.fromJson({
      'id': 'series-1',
      'type': 'series',
      'title': 'Klovn',
      'overview': 'Frank og Casper i hverdagen.',
      'releaseYear': 2005,
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TitleScreen(api: api, media: media),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sæsoner og afsnit'), findsOneWidget);
    expect(find.textContaining('Pilot'), findsOneWidget);
    expect(find.textContaining('Naboen'), findsOneWidget);
    expect(find.textContaining('Sæson 1 · 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('explicit season selection overrides resume season from server', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final requestedSeasons = <String?>[];
    final api = ApiClient(
      baseUrl: 'https://media.example/api/v1',
      storage: _MemoryStorage(),
      httpClient: MockClient((request) async {
        if (request.url.path.contains('/experience/titles/')) {
          requestedSeasons.add(request.url.queryParameters['seasonNumber']);
          return http.Response(
            jsonEncode(_multiSeasonExperience()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.contains('/playback/history/')) {
          return http.Response(
            jsonEncode({'inWatchlist': false, 'watched': false}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      }),
    );
    final media = MediaItem.fromJson({
      'id': 'series-1',
      'type': 'series',
      'title': 'Klovn',
      'releaseYear': 2005,
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TitleScreen(api: api, media: media),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('S03E01'), findsOneWidget);

    await tester.tap(find.text('Sæson 1 · 1'));
    await tester.pumpAndSettle();

    expect(requestedSeasons, contains('1'));
    expect(find.textContaining('S01E01'), findsOneWidget);
    expect(find.textContaining('S03E01'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

Map<String, dynamic> _seriesExperience() => {
  'mode': 'series',
  'title': {
    'id': 'series-1',
    'type': 'series',
    'title': 'Klovn',
    'overview': 'Frank og Casper i hverdagen.',
    'releaseYear': 2005,
    'genres': ['Comedy'],
  },
  'series': {
    'selectedSeasonNumber': 1,
    'seasons': [
      {
        'number': 1,
        'label': 'Sæson 1',
        'episodeCount': 2,
        'episodes': [
          {
            'id': 'episode-1',
            'type': 'episode',
            'title': 'Pilot',
            'seriesTitle': 'Klovn',
            'seasonNumber': 1,
            'episodeNumber': 1,
            'overview': 'Første afsnit.',
          },
          {
            'id': 'episode-2',
            'type': 'episode',
            'title': 'Naboen',
            'seriesTitle': 'Klovn',
            'seasonNumber': 1,
            'episodeNumber': 2,
            'overview': 'Andet afsnit.',
          },
        ],
      },
    ],
  },
};

Map<String, dynamic> _multiSeasonExperience() => {
  'mode': 'series',
  'title': {
    'id': 'series-1',
    'type': 'series',
    'title': 'Klovn',
    'releaseYear': 2005,
  },
  'series': {
    'selectedSeasonNumber': 3,
    'seasons': [
      {
        'number': 1,
        'label': 'Sæson 1',
        'episodeCount': 1,
        'episodes': [
          {
            'id': 'episode-1',
            'type': 'episode',
            'title': 'Pilot',
            'seriesTitle': 'Klovn',
            'seasonNumber': 1,
            'episodeNumber': 1,
          },
        ],
      },
      {
        'number': 3,
        'label': 'Sæson 3',
        'episodeCount': 1,
        'episodes': [
          {
            'id': 'episode-3',
            'type': 'episode',
            'title': 'Finale',
            'seriesTitle': 'Klovn',
            'seasonNumber': 3,
            'episodeNumber': 1,
          },
        ],
      },
    ],
  },
};
