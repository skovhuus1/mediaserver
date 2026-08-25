import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/shared_core/library_contract.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:boltbytes_media/src/tv/screens/tv_hub_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/memory_session_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('TV episode rows collapse repeated series into one artwork card', () {
    final cards = collapseEpisodeSeriesCards([
      for (var index = 0; index < 7; index++)
        MediaItem(
          id: 'dna-episode-$index',
          title: 'DNA episode $index',
          type: 'episode',
          seriesTitle: 'series-dna',
          seriesDisplayTitle: 'DNA',
          seasonNumber: 1,
          episodeNumber: index + 1,
          posterPath: '/dna-poster.jpg',
          backdropPath: '/dna-backdrop.jpg',
        ),
      const MediaItem(
        id: 'other-episode-1',
        title: 'Pilot',
        type: 'episode',
        seriesTitle: 'series-other',
        seriesDisplayTitle: 'Anden serie',
        seasonNumber: 1,
        episodeNumber: 1,
        posterPath: '/other-poster.jpg',
      ),
    ]);

    expect(cards, hasLength(2));
    expect(cards.first.type, 'series');
    expect(cards.first.displayTitle, 'DNA');
    expect(cards.first.posterPath, '/dna-poster.jpg');
    expect(cards.first.backdropPath, '/dna-backdrop.jpg');
    expect(cards.first.badgeCount, 7);
    expect(cards.last.badgeCount, 1);
  });

  testWidgets('TV hub has deterministic sidebar and content focus', (
    tester,
  ) async {
    final fixture = await _pumpHub(tester);

    expect(find.text('Fortsæt med at se'), findsOneWidget);
    expect(find.text('UDVALGT TIL DIG'), findsOneWidget);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-0');

    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-1');
    expect(find.text('Nyeste film'), findsOneWidget);
    expect(find.text('FILM · UDVALGT'), findsOneWidget);
    expect(find.text('Se alle film'), findsOneWidget);
    await _press(tester, LogicalKeyboardKey.arrowRight);
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-section-5-item-0',
    );
    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-section-10-item-0',
    );
    await _press(tester, LogicalKeyboardKey.arrowRight, count: 2);
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-section-10-item-2',
    );
    await _press(tester, LogicalKeyboardKey.arrowLeft, count: 3);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-1');
    await _press(tester, LogicalKeyboardKey.escape);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-0');
    expect(tester.takeException(), isNull);

    fixture.client.close();
  });

  testWidgets('empty Continue row is skipped without dead focus', (
    tester,
  ) async {
    final fixture = await _pumpHub(tester, includeContinue: false);

    await _press(tester, LogicalKeyboardKey.arrowRight);
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-section-0-item-0',
    );
    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(FocusManager.instance.primaryFocus?.debugLabel, isNotNull);
    expect(find.text('Du har ikke noget, du er i gang med.'), findsOneWidget);
    expect(tester.takeException(), isNull);

    fixture.client.close();
  });

  testWidgets(
    'TV search keeps field focus and exposes result row on DPAD down',
    (tester) async {
      final fixture = await _pumpHub(tester);

      await _press(tester, LogicalKeyboardKey.arrowDown, count: 6);
      expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-6');
      await _press(tester, LogicalKeyboardKey.enter);
      expect(
        FocusManager.instance.primaryFocus?.debugLabel,
        'tv-section-10-item-0',
      );

      await tester.enterText(
        find.byKey(const ValueKey('tv-search-input')),
        'arrival',
      );
      await tester.pump(const Duration(milliseconds: 260));
      await tester.pumpAndSettle();

      expect(fixture.library.searchQueries, ['arrival']);
      expect(find.text('Søgeresultater'), findsOneWidget);
      expect(
        FocusManager.instance.primaryFocus?.debugLabel,
        'tv-section-10-item-0',
      );
      await _press(tester, LogicalKeyboardKey.arrowDown);
      expect(
        FocusManager.instance.primaryFocus?.debugLabel,
        'tv-section-20-item-0',
      );
      expect(tester.takeException(), isNull);

      fixture.client.close();
    },
  );

  testWidgets('TV hub exposes first-class Continue and Genre tabs', (
    tester,
  ) async {
    final fixture = await _pumpHub(tester);

    await _press(tester, LogicalKeyboardKey.arrowDown, count: 4);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-4');
    expect(find.text('Fortsæt med at se'), findsOneWidget);
    expect(find.text('Nye episoder klar'), findsOneWidget);

    await _press(tester, LogicalKeyboardKey.arrowDown);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-5');
    expect(find.text('Filmgenrer'), findsOneWidget);
    expect(find.text('Seriegenrer'), findsOneWidget);
    expect(tester.takeException(), isNull);

    fixture.client.close();
  });

  testWidgets('profile tab delegates to the shared application stage', (
    tester,
  ) async {
    final fixture = await _pumpHub(tester);

    await _press(tester, LogicalKeyboardKey.arrowDown, count: 11);
    await _press(tester, LogicalKeyboardKey.arrowRight);
    await _press(tester, LogicalKeyboardKey.enter);

    expect(fixture.controller.stage, AppStage.profiles);
    fixture.client.close();
  });

  testWidgets('root Back asks before leaving the TV hub', (tester) async {
    final fixture = await _pumpHub(tester);

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-top-0');
    await _press(tester, LogicalKeyboardKey.escape);

    expect(find.text('Luk appen?'), findsOneWidget);
    expect(find.byType(TvHubScreen), findsOneWidget);
    fixture.client.close();
  });
}

Future<_HubFixture> _pumpHub(
  WidgetTester tester, {
  bool includeContinue = true,
}) async {
  tester.view.physicalSize = const Size(1920, 1080);
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  final storage = MemorySessionStorage();
  final client = MockClient((_) async => http.Response('{}', 404));
  final api = ApiClient(
    baseUrl: 'https://media.example.test/api/v1',
    storage: storage,
    httpClient: client,
  );
  final controller = AppController(api: api, storage: storage)
    ..serverUrl = 'https://media.example.test/api/v1'
    ..user = SessionUser.fromJson({
      'id': 'user-1',
      'email': 'viewer@example.test',
      'displayName': 'Viewer',
      'roles': ['customer'],
      'activeProfileId': 'profile-1',
      'profiles': [
        {
          'id': 'profile-1',
          'name': 'Stuen',
          'hasPin': false,
          'isChildProfile': false,
        },
      ],
    })
    ..stage = AppStage.library;
  final library = _FakeLibrary(includeContinue: includeContinue);

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData.dark(useMaterial3: true),
      home: TvHubScreen(controller: controller, library: library),
    ),
  );
  await tester.pumpAndSettle();

  return _HubFixture(controller: controller, library: library, client: client);
}

Future<void> _press(
  WidgetTester tester,
  LogicalKeyboardKey key, {
  int count = 1,
}) async {
  for (var index = 0; index < count; index++) {
    await tester.sendKeyEvent(key);
    await tester.pump();
  }
  await tester.pump(const Duration(milliseconds: 220));
}

class _HubFixture {
  const _HubFixture({
    required this.controller,
    required this.library,
    required this.client,
  });

  final AppController controller;
  final _FakeLibrary library;
  final MockClient client;
}

class _FakeLibrary implements LibraryContract {
  _FakeLibrary({required bool includeContinue})
    : home = _homePayload(includeContinue: includeContinue);

  final LibraryHomePayload home;
  final List<String> searchQueries = [];

  @override
  Future<LibraryHomePayload> loadHomePayload() async => home;

  @override
  Future<LibraryCatalogPayload> loadCatalogPage(
    String mediaType, {
    required int page,
    String sort = 'newest',
    String? category,
    String? query,
    int pageSize = 100,
  }) async => LibraryCatalogPayload(
    items: _items(mediaType, 8),
    categories: const ['Action', 'Drama', 'Krimi'],
    page: page,
    total: 8,
    totalPages: 1,
  );

  @override
  Future<List<MediaItem>> loadContinue() async => home.continueItems;

  @override
  Future<RecommendationFeed> loadRecommendations() async =>
      home.recommendations;

  @override
  Future<List<MediaItem>> loadWatchlist() async => home.watchlistItems;

  @override
  Future<List<MediaItem>> search(String query, {int maxResults = 60}) async {
    searchQueries.add(query);
    return _items('movie', 4);
  }
}

LibraryHomePayload _homePayload({required bool includeContinue}) {
  final movies = _items('movie', 8);
  final series = _items('series', 8);
  final episodes = _items('episode', 8);
  return LibraryHomePayload(
    movieCatalog: LibraryCatalogPayload(
      items: movies,
      categories: const ['Action', 'Drama', 'Krimi'],
      page: 1,
      total: movies.length,
      totalPages: 1,
    ),
    seriesCatalog: LibraryCatalogPayload(
      items: series,
      categories: const ['Drama', 'Krimi', 'Dokumentar'],
      page: 1,
      total: series.length,
      totalPages: 1,
    ),
    releasedMovies: LibraryCatalogPayload(
      items: movies.reversed.toList(),
      categories: const ['Action', 'Drama'],
      page: 1,
      total: movies.length,
      totalPages: 1,
    ),
    releasedSeries: LibraryCatalogPayload(
      items: series.reversed.toList(),
      categories: const ['Drama', 'Krimi'],
      page: 1,
      total: series.length,
      totalPages: 1,
    ),
    latestEpisodes: LibraryCatalogPayload(
      items: episodes,
      categories: const [],
      page: 1,
      total: episodes.length,
      totalPages: 1,
    ),
    recentlyAddedSeries: [
      MediaItem(
        id: episodes.first.id,
        title: episodes.first.displayTitle,
        type: 'series',
        seriesTitle: episodes.first.seriesTitle,
        seriesDisplayTitle: episodes.first.seriesDisplayTitle,
        posterPath: episodes.first.posterPath,
        backdropPath: episodes.first.backdropPath,
        badgeCount: episodes.length,
      ),
    ],
    continueItems: includeContinue ? [movies.first] : const [],
    watchlistItems: [series.first],
    recommendations: RecommendationFeed(
      hero: movies[1],
      sections: [
        MediaSection(title: 'Udvalgt til dig', items: movies.skip(2).toList()),
      ],
    ),
  );
}

List<MediaItem> _items(String type, int count) => List.generate(count, (index) {
  final number = index + 1;
  return MediaItem(
    id: '$type-$number',
    title: '$type $number',
    type: type,
    seriesDisplayTitle: type == 'episode' ? 'Serie $number' : null,
    seasonNumber: type == 'episode' ? 1 : null,
    episodeNumber: type == 'episode' ? number : null,
    releaseYear: 2026,
    overview: 'En titel til TV-test.',
  );
});
