import '../core/api_client.dart';
import '../core/models.dart';

/// Stable data boundary used by both the mobile and TV library shells.
///
/// UI code consumes parsed payloads from this contract and must not construct
/// catalog URLs or parse transport payloads itself.
abstract class LibraryContract {
  Future<LibraryHomePayload> loadHomePayload();

  Future<LibraryCatalogPayload> loadCatalogPage(
    String mediaType, {
    required int page,
    String sort = 'newest',
    String? category,
    String? query,
    int pageSize = 100,
  });

  Future<List<MediaItem>> loadContinue();
  Future<List<MediaItem>> loadWatchlist();
  Future<RecommendationFeed> loadRecommendations();
  Future<List<MediaItem>> search(String query, {int maxResults = 60});
}

class LibraryUseCase implements LibraryContract {
  LibraryUseCase({required this.api});

  final ApiClient api;

  @override
  Future<LibraryHomePayload> loadHomePayload() async {
    final responses = await Future.wait([
      api.getJson('/media/catalog?type=movie&pageSize=100&sort=newest'),
      api.getJson('/media/catalog?type=series&pageSize=100&sort=newest'),
      api.getJson('/media/catalog?type=movie&pageSize=36&sort=released'),
      api.getJson('/media/catalog?type=series&pageSize=36&sort=released'),
      api.getJson('/media/catalog?type=episode&pageSize=36&sort=released'),
      api.getJson('/playback/history/continue'),
      api.getJson('/playback/watchlist'),
      api
          .getJson('/media/recommendations')
          .catchError((_) => <String, dynamic>{}),
    ]);

    return LibraryHomePayload(
      movieCatalog: LibraryCatalogPayload.fromJson(responses[0]),
      seriesCatalog: LibraryCatalogPayload.fromJson(responses[1]),
      releasedMovies: LibraryCatalogPayload.fromJson(responses[2]),
      releasedSeries: LibraryCatalogPayload.fromJson(responses[3]),
      latestEpisodes: LibraryCatalogPayload.fromJson(responses[4]),
      continueItems: jsonList(responses[5]).map(MediaItem.fromJson).toList(),
      watchlistItems: jsonList(responses[6]).map(MediaItem.fromJson).toList(),
      recommendations: RecommendationFeed.fromJson(responses[7]),
    );
  }

  @override
  Future<LibraryCatalogPayload> loadCatalogPage(
    String mediaType, {
    required int page,
    String sort = 'newest',
    String? category,
    String? query,
    int pageSize = 100,
  }) async {
    final parameters = <String, String>{
      'type': mediaType,
      'page': '${page.clamp(1, 1 << 31)}',
      'pageSize': '${pageSize.clamp(1, 100)}',
      'sort': sort,
    };
    final normalizedCategory = category?.trim();
    if (normalizedCategory != null && normalizedCategory.isNotEmpty) {
      parameters['category'] = normalizedCategory;
    }
    final normalizedQuery = query?.trim();
    if (normalizedQuery != null && normalizedQuery.isNotEmpty) {
      parameters['q'] = normalizedQuery;
    }
    final encodedQuery = Uri(queryParameters: parameters).query;
    return LibraryCatalogPayload.fromJson(
      await api.getJson('/media/catalog?$encodedQuery'),
    );
  }

  @override
  Future<List<MediaItem>> loadContinue() async => jsonList(
    await api.getJson('/playback/history/continue'),
  ).map(MediaItem.fromJson).toList();

  @override
  Future<List<MediaItem>> loadWatchlist() async => jsonList(
    await api.getJson('/playback/watchlist'),
  ).map(MediaItem.fromJson).toList();

  @override
  Future<RecommendationFeed> loadRecommendations() async =>
      RecommendationFeed.fromJson(await api.getJson('/media/recommendations'));

  @override
  Future<List<MediaItem>> search(String query, {int maxResults = 60}) async {
    final normalizedQuery = query.trim();
    if (normalizedQuery.isEmpty || maxResults <= 0) return const [];
    final pageSize = maxResults.clamp(1, 100).toInt();
    final payloads = await Future.wait(
      ['movie', 'series', 'episode'].map(
        (mediaType) => loadCatalogPage(
          mediaType,
          page: 1,
          sort: 'newest',
          query: normalizedQuery,
          pageSize: pageSize,
        ),
      ),
    );
    final seenIds = <String>{};
    return payloads
        .expand((payload) => payload.items)
        .where((item) => seenIds.add(item.id))
        .take(maxResults)
        .toList(growable: false);
  }
}

class LibraryHomePayload {
  const LibraryHomePayload({
    required this.movieCatalog,
    required this.seriesCatalog,
    required this.releasedMovies,
    required this.releasedSeries,
    required this.latestEpisodes,
    required this.continueItems,
    required this.watchlistItems,
    required this.recommendations,
  });

  final LibraryCatalogPayload movieCatalog;
  final LibraryCatalogPayload seriesCatalog;
  final LibraryCatalogPayload releasedMovies;
  final LibraryCatalogPayload releasedSeries;
  final LibraryCatalogPayload latestEpisodes;
  final List<MediaItem> continueItems;
  final List<MediaItem> watchlistItems;
  final RecommendationFeed recommendations;

  MediaItem? get hero =>
      recommendations.hero ??
      movieCatalog.items.firstOrNull ??
      seriesCatalog.items.firstOrNull;

  bool get isEmpty =>
      movieCatalog.items.isEmpty &&
      seriesCatalog.items.isEmpty &&
      releasedMovies.items.isEmpty &&
      releasedSeries.items.isEmpty &&
      latestEpisodes.items.isEmpty &&
      continueItems.isEmpty &&
      watchlistItems.isEmpty &&
      recommendations.sections.isEmpty &&
      recommendations.hero == null;

  static const empty = LibraryHomePayload(
    movieCatalog: LibraryCatalogPayload.empty,
    seriesCatalog: LibraryCatalogPayload.empty,
    releasedMovies: LibraryCatalogPayload.empty,
    releasedSeries: LibraryCatalogPayload.empty,
    latestEpisodes: LibraryCatalogPayload.empty,
    continueItems: [],
    watchlistItems: [],
    recommendations: RecommendationFeed(sections: []),
  );
}

class LibraryCatalogPayload {
  const LibraryCatalogPayload({
    required this.items,
    required this.categories,
    required this.page,
    required this.total,
    required this.totalPages,
  });

  final List<MediaItem> items;
  final List<String> categories;
  final int page;
  final int total;
  final int totalPages;

  static const empty = LibraryCatalogPayload(
    items: [],
    categories: [],
    page: 1,
    total: 0,
    totalPages: 1,
  );

  factory LibraryCatalogPayload.fromJson(dynamic raw) {
    final json = jsonMap(raw);
    final facets = jsonMap(json['facets']);
    final items = jsonList(json.isEmpty ? raw : json['items'])
        .map(MediaItem.fromJson)
        .where((item) => item.id.isNotEmpty)
        .toList(growable: false);
    final seenCategories = <String>{};
    final categories = jsonList(facets['categories'])
        .map(stringValue)
        .whereType<String>()
        .map((category) => category.trim())
        .where(
          (category) =>
              category.isNotEmpty && seenCategories.add(category.toLowerCase()),
        )
        .toList(growable: false);
    return LibraryCatalogPayload(
      items: items,
      categories: categories,
      page: intValue(json['page']) ?? 1,
      total: intValue(json['total']) ?? items.length,
      totalPages: (intValue(json['totalPages']) ?? 1).clamp(1, 1 << 31).toInt(),
    );
  }
}
