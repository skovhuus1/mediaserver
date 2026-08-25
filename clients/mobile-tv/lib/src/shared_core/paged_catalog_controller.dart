import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import 'library_contract.dart';

class PagedCatalogState {
  const PagedCatalogState({
    this.items = const [],
    this.page = 0,
    this.total = 0,
    this.totalPages = 1,
    this.loading = false,
    this.loadingMore = false,
    this.error,
  });

  final List<MediaItem> items;
  final int page;
  final int total;
  final int totalPages;
  final bool loading;
  final bool loadingMore;
  final String? error;

  bool get hasMore => page == 0 || page < totalPages;
}

class PagedCatalogController extends ChangeNotifier {
  PagedCatalogController({
    required this.library,
    required this.mediaType,
    this.category,
    this.query,
    this.sort = 'title',
    this.pageSize = 100,
  });

  final LibraryContract library;
  final String mediaType;
  final String? category;
  final String? query;
  final String sort;
  final int pageSize;

  PagedCatalogState _state = const PagedCatalogState();
  PagedCatalogState get state => _state;
  int _generation = 0;
  bool _disposed = false;

  Future<void> loadInitial() async {
    final generation = ++_generation;
    _emit(const PagedCatalogState(loading: true));
    await _load(page: 1, generation: generation);
  }

  Future<void> loadNext() async {
    if (_state.loading || _state.loadingMore || !_state.hasMore) return;
    final generation = _generation;
    _emit(
      PagedCatalogState(
        items: _state.items,
        page: _state.page,
        total: _state.total,
        totalPages: _state.totalPages,
        loadingMore: true,
      ),
    );
    await _load(page: _state.page + 1, generation: generation);
  }

  Future<void> retry() => _state.page == 0 ? loadInitial() : loadNext();

  Future<void> _load({required int page, required int generation}) async {
    try {
      final payload = await library.loadCatalogPage(
        mediaType,
        page: page,
        sort: sort,
        category: category,
        query: query,
        pageSize: pageSize,
      );
      if (_disposed || generation != _generation) return;
      final merged = page == 1 ? <MediaItem>[] : [..._state.items];
      final ids = merged.map((item) => item.id).toSet();
      for (final item in payload.items) {
        if (ids.add(item.id)) merged.add(item);
      }
      _emit(
        PagedCatalogState(
          items: List.unmodifiable(merged),
          page: payload.page,
          total: payload.total,
          totalPages: payload.totalPages,
        ),
      );
    } catch (failure) {
      if (_disposed || generation != _generation) return;
      _emit(
        PagedCatalogState(
          items: _state.items,
          page: _state.page,
          total: _state.total,
          totalPages: _state.totalPages,
          error: failure is ApiException
              ? failure.message
              : 'Kataloget kunne ikke indlæses.',
        ),
      );
    }
  }

  void _emit(PagedCatalogState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    super.dispose();
  }
}
