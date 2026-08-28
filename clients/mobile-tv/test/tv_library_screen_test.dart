import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/shared_core/library_contract.dart';
import 'package:boltbytes_media/src/tv/screens/tv_library_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/memory_session_storage.dart';

void main() {
  testWidgets('TV category grid owns DPAD columns and pagination focus', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final storage = MemorySessionStorage();
    final client = MockClient((_) async => http.Response('{}', 404));
    addTearDown(client.close);
    final library = _PagedLibrary();
    final opened = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvLibraryScreen(
          library: library,
          api: ApiClient(
            baseUrl: 'https://media.example.test/api/v1',
            storage: storage,
            httpClient: client,
          ),
          label: 'Film',
          mediaType: 'movie',
          category: 'Action',
          onPlay: (item) => opened.add(item.id),
          onOpen: (item) => opened.add(item.id),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-library-item-0');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-library-item-1');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-library-item-9',
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-library-item-9',
    );

    expect(library.requestedPages, [1, 2]);
    expect(find.textContaining('15 titler'), findsOneWidget);
    expect(find.text('Indlæs næste side'), findsNothing);
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      startsWith('tv-library-item-'),
    );
    expect(opened, isEmpty);
    expect(tester.takeException(), isNull);
  });
}

class _PagedLibrary implements LibraryContract {
  final List<int> requestedPages = [];

  @override
  Future<LibraryCatalogPayload> loadCatalogPage(
    String mediaType, {
    required int page,
    String sort = 'newest',
    String? category,
    String? query,
    int pageSize = 100,
  }) async {
    requestedPages.add(page);
    final start = page == 1 ? 0 : 12;
    final count = page == 1 ? 12 : 3;
    return LibraryCatalogPayload(
      items: List.generate(
        count,
        (index) => MediaItem(
          id: 'movie-${start + index}',
          title: 'Film ${start + index}',
          type: 'movie',
        ),
      ),
      categories: const ['Action'],
      page: page,
      total: 15,
      totalPages: 2,
    );
  }

  @override
  Future<LibraryHomePayload> loadHomePayload() async =>
      LibraryHomePayload.empty;

  @override
  Future<List<MediaItem>> loadContinue() async => const [];

  @override
  Future<RecommendationFeed> loadRecommendations() async =>
      const RecommendationFeed(sections: []);

  @override
  Future<List<MediaItem>> loadWatchlist() async => const [];

  @override
  Future<List<MediaItem>> search(String query, {int maxResults = 60}) async =>
      const [];
}
