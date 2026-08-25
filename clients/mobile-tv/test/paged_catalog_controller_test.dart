import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/shared_core/library_contract.dart';
import 'package:boltbytes_media/src/shared_core/paged_catalog_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'complete series catalog appends every page and removes duplicates',
    () async {
      final library = _LargeSeriesLibrary();
      final controller = PagedCatalogController(
        library: library,
        mediaType: 'series',
      );

      await controller.loadInitial();
      while (controller.state.hasMore) {
        await controller.loadNext();
      }

      expect(library.pages, [1, 2, 3]);
      expect(controller.state.total, 205);
      expect(controller.state.items.length, 204);
      expect(controller.state.items.first.title, 'Serie 000');
      controller.dispose();
    },
  );
}

class _LargeSeriesLibrary implements LibraryContract {
  final List<int> pages = [];

  @override
  Future<LibraryCatalogPayload> loadCatalogPage(
    String mediaType, {
    required int page,
    String sort = 'newest',
    String? category,
    String? query,
    int pageSize = 100,
  }) async {
    pages.add(page);
    final start = (page - 1) * 100;
    final count = page < 3 ? 100 : 5;
    final items = List.generate(
      count,
      (index) => MediaItem(
        id: 'series-${start + index}',
        title: 'Serie ${(start + index).toString().padLeft(3, '0')}',
        type: 'series',
      ),
    );
    if (page == 2) {
      items[0] = const MediaItem(
        id: 'series-99',
        title: 'Serie 099',
        type: 'series',
      );
    }
    return LibraryCatalogPayload(
      items: items,
      categories: const ['Drama'],
      page: page,
      total: 205,
      totalPages: 3,
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
