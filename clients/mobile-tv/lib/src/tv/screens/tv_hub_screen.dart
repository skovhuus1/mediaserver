import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/brand_theme.dart';
import '../../core/models.dart';
import '../../shared_core/library_contract.dart';
import '../../shared_core/notification_contract.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../../state/app_controller.dart';
import '../../widgets/brand.dart';
import '../../widgets/media_card.dart';
import '../tv_focus_controller.dart';
import 'tv_library_screen.dart';
import 'tv_downloads_screen.dart';
import 'tv_live_guide_screen.dart';
import 'tv_notification_screen.dart';
import 'tv_player_screen.dart';
import 'tv_recordings_screen.dart';
import 'tv_settings_screen.dart';
import 'tv_title_screen.dart';
import '../widgets/tv_media_context_menu.dart';

class TvHubScreen extends StatefulWidget {
  const TvHubScreen({
    required this.controller,
    this.library,
    this.initialTopTab = 0,
    super.key,
  });

  final AppController controller;
  final LibraryContract? library;
  final int initialTopTab;

  @override
  State<TvHubScreen> createState() => _TvHubScreenState();
}

class _TvHubScreenState extends State<TvHubScreen> {
  static const _topTabs = [
    'Hjem',
    'Film',
    'Serier',
    'Live TV',
    'Fortsæt',
    'Genre',
    'Søg',
    'Min liste',
    'Downloads',
    'Notifikationer',
    'Indstillinger',
    'Min profil',
  ];
  static const _topIcons = [
    Icons.home_rounded,
    Icons.movie_outlined,
    Icons.tv_rounded,
    Icons.live_tv_rounded,
    Icons.playlist_play_rounded,
    Icons.category_outlined,
    Icons.search_rounded,
    Icons.bookmark_border_rounded,
    Icons.download_for_offline_outlined,
    Icons.notifications_none_rounded,
    Icons.settings_outlined,
    Icons.account_circle_outlined,
  ];

  static const _searchFieldSection = 10;
  static const _searchResultsSection = 20;

  final TextEditingController _searchController = TextEditingController();
  final Map<int, List<FocusNode>> _sectionNodes = {};
  final Map<int, void Function(int)> _sectionActions = {};

  late final LibraryContract _library;
  late final NotificationContract _notifications;
  late final List<FocusNode> _topNodes;
  late final TvFocusController _focusController;

  LibraryHomePayload _homePayload = LibraryHomePayload.empty;
  List<_TvHubSection> _sections = const [];
  List<MediaItem> _searchResultItems = const [];
  Timer? _searchDebounce;
  bool _loading = true;
  bool _searchLoading = false;
  bool _exitPromptOpen = false;
  bool _selectHoldFired = false;
  bool _selectHoldTracking = false;
  String? _error;
  String? _searchError;
  String _searchQuery = '';
  int _searchEpoch = 0;
  late int _configuredTopTab;
  int _unreadCount = 0;
  Timer? _selectHoldTimer;
  MediaItem? _selectHoldMedia;

  ApiClient get api => widget.controller.api;

  @override
  void initState() {
    super.initState();
    _library = widget.library ?? LibraryUseCase(api: api);
    _notifications = NotificationUseCase(api: api);
    _configuredTopTab = widget.initialTopTab
        .clamp(0, _topTabs.length - 1)
        .toInt();
    _topNodes = List.generate(
      _topTabs.length,
      (index) => FocusNode(debugLabel: 'tv-top-$index'),
    );
    _focusController = TvFocusController(
      topRowNodes: _topNodes,
      activeTopTab: _configuredTopTab,
      activeSection: -1,
      activeItem: 0,
      verticalNavigation: true,
    );
    for (var index = 0; index < _topNodes.length; index++) {
      final node = _topNodes[index];
      final tabIndex = index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifyTopNodeFocus(tabIndex);
          _ensureFocusVisible(node, alignment: 0.5);
        }
      });
    }
    _focusController.addListener(_onFocusStateChanged);
    _searchController.addListener(_onSearchQueryChanged);
    _rebuildSections();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusController.requestCurrentFocus();
    });
    unawaited(_loadHomePayload());
    unawaited(_loadUnreadCount());
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _resetSelectHold();
    _searchEpoch++;
    _searchController.removeListener(_onSearchQueryChanged);
    _focusController.removeListener(_onFocusStateChanged);
    _searchController.dispose();
    _focusController.dispose();
    for (final node in _topNodes) {
      node.dispose();
    }
    for (final nodes in _sectionNodes.values) {
      for (final node in nodes) {
        node.dispose();
      }
    }
    _sectionNodes.clear();
    super.dispose();
  }

  void _onFocusStateChanged() {
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _loadHomePayload() async {
    if (!_loading && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final payload = await _library.loadHomePayload();
      if (!mounted) return;
      _homePayload = payload;
      _loading = false;
      _error = null;
      _rebuildSections();
      setState(() {});
    } on Exception catch (failure) {
      if (!mounted) return;
      _loading = false;
      _error = failure is ApiException
          ? failure.message
          : 'Biblioteket kunne ikke indlæses.';
      _rebuildSections();
      setState(() {});
    }
  }

  void _onSearchQueryChanged() {
    final query = _searchController.text.trim();
    _searchDebounce?.cancel();
    _searchQuery = query;
    final epoch = ++_searchEpoch;

    if (query.length < 2) {
      _searchLoading = false;
      _searchError = null;
      _searchResultItems = const [];
      if (_configuredTopTab == 1) _rebuildSections();
      if (mounted) setState(() {});
      return;
    }

    _searchLoading = true;
    _searchError = null;
    if (_configuredTopTab == 1) _rebuildSections();
    if (mounted) setState(() {});
    _searchDebounce = Timer(
      const Duration(milliseconds: 250),
      () => unawaited(_runSearch(query, epoch)),
    );
  }

  void _submitSearch() {
    final query = _searchController.text.trim();
    if (query.length < 2) return;
    _searchDebounce?.cancel();
    final epoch = ++_searchEpoch;
    _searchLoading = true;
    _searchError = null;
    _rebuildSections();
    setState(() {});
    unawaited(_runSearch(query, epoch));
  }

  Future<void> _runSearch(String query, int epoch) async {
    try {
      final results = await _library.search(query);
      if (!mounted || epoch != _searchEpoch) return;
      _searchResultItems = results;
      _searchLoading = false;
      _searchError = null;
      _rebuildSections();
      setState(() {});
    } on Exception catch (failure) {
      if (!mounted || epoch != _searchEpoch) return;
      _searchResultItems = const [];
      _searchLoading = false;
      _searchError = failure is ApiException
          ? failure.message
          : 'Søgningen kunne ikke gennemføres.';
      _rebuildSections();
      setState(() {});
    }
  }

  void _rebuildSections() {
    _sections = _createSectionsForTab(_configuredTopTab);
    _sectionActions
      ..clear()
      ..addEntries(
        _sections
            .where(
              (section) =>
                  section.focusItemCount > 0 && section.onActivate != null,
            )
            .map((section) => MapEntry(section.id, section.onActivate!)),
      );

    final desiredCounts = <int, int>{
      for (final section in _sections)
        if (section.focusItemCount > 0) section.id: section.focusItemCount,
    };
    _syncSectionNodes(desiredCounts);
    _focusController.replaceSections({
      for (final entry in _sectionNodes.entries)
        if (desiredCounts.containsKey(entry.key)) entry.key: entry.value,
    }, notify: false);
  }

  void _syncSectionNodes(Map<int, int> desiredCounts) {
    final staleSections = _sectionNodes.keys
        .where(
          (sectionId) =>
              !desiredCounts.containsKey(sectionId) ||
              _sectionNodes[sectionId]!.length != desiredCounts[sectionId],
        )
        .toList(growable: false);
    for (final sectionId in staleSections) {
      final nodes = _sectionNodes.remove(sectionId) ?? const <FocusNode>[];
      for (final node in nodes) {
        node.dispose();
      }
    }

    for (final entry in desiredCounts.entries) {
      if (_sectionNodes.containsKey(entry.key)) continue;
      final sectionId = entry.key;
      _sectionNodes[sectionId] = List.generate(entry.value, (index) {
        final node = FocusNode(debugLabel: 'tv-section-$sectionId-item-$index');
        node.addListener(() {
          if (node.hasFocus) {
            _focusController.notifySectionNodeFocus(sectionId, index);
            _ensureFocusVisible(node);
          }
        });
        return node;
      });
    }
  }

  void _ensureFocusVisible(FocusNode node, {double alignment = 0.35}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = node.context;
      if (!mounted || context == null || !node.hasFocus) return;
      Scrollable.ensureVisible(
        context,
        alignment: alignment,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
      );
    });
  }

  List<_TvHubSection> _createSectionsForTab(int topTab) {
    if (_loading && _homePayload.isEmpty) return const [];
    final payload = _homePayload;
    final sections = <_TvHubSection>[];

    if (_error != null) {
      sections.add(
        _TvHubSection.actions(
          id: 5,
          title: 'Forbindelsen til biblioteket fejlede',
          message: _error!,
          actions: [
            _TvHubAction(
              label: 'Prøv igen',
              icon: Icons.refresh,
              onPressed: () => unawaited(_loadHomePayload()),
            ),
          ],
        ),
      );
    }

    void addMedia({
      required int id,
      required String title,
      required List<MediaItem> items,
      required ValueChanged<MediaItem> activate,
      required String emptyMessage,
    }) {
      sections.add(
        _TvHubSection.media(
          id: id,
          title: title,
          items: items,
          emptyMessage: emptyMessage,
          onActivate: (index) {
            final item = items.elementAtOrNull(index);
            if (item != null) activate(item);
          },
        ),
      );
    }

    switch (topTab) {
      case 1:
        final featuredMovie = payload.movieCatalog.items.firstOrNull;
        if (featuredMovie != null) {
          sections.add(
            _TvHubSection.hero(
              id: 5,
              media: featuredMovie,
              eyebrow: 'FILM · UDVALGT',
              primaryLabel: 'Afspil',
              secondaryLabel: 'Se alle film',
              onActivate: (index) => index == 0
                  ? unawaited(_play(featuredMovie))
                  : unawaited(_openAllCatalog('movie')),
            ),
          );
        }
        addMedia(
          id: 10,
          title: 'Nyeste film',
          items: payload.movieCatalog.items,
          emptyMessage: 'Der er endnu ingen film i biblioteket.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 20,
          title: 'Senest udgivne film',
          items: payload.releasedMovies.items,
          emptyMessage: 'Ingen nye filmudgivelser.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        sections.add(
          _TvHubSection.genres(
            id: 30,
            title: 'Filmgenrer',
            genres: payload.movieCatalog.categories,
            mediaType: 'movie',
            onActivate: (index) {
              final genre = payload.movieCatalog.categories.elementAtOrNull(
                index,
              );
              if (genre != null) {
                unawaited(_openGenreCatalog(genre, mediaType: 'movie'));
              }
            },
          ),
        );
        return sections;
      case 2:
        final featuredSeries = payload.seriesCatalog.items.firstOrNull;
        if (featuredSeries != null) {
          sections.add(
            _TvHubSection.hero(
              id: 5,
              media: featuredSeries,
              eyebrow: 'SERIER · UDVALGT',
              primaryLabel: 'Åbn serien',
              secondaryLabel: 'Se alle serier',
              onActivate: (index) => index == 0
                  ? unawaited(_openTitle(featuredSeries))
                  : unawaited(_openAllCatalog('series')),
            ),
          );
        }
        addMedia(
          id: 10,
          title: 'Nyeste serier',
          items: payload.seriesCatalog.items,
          emptyMessage: 'Der er endnu ingen serier i biblioteket.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 20,
          title: 'Nye episoder',
          items: collapseEpisodeSeriesCards(payload.latestEpisodes.items),
          emptyMessage: 'Ingen nye episoder.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 25,
          title: 'Senest tilføjet',
          items: payload.recentlyAddedSeries,
          emptyMessage: 'Der er ikke tilføjet nye serieafsnit endnu.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        sections.add(
          _TvHubSection.genres(
            id: 35,
            title: 'Seriegenrer',
            genres: payload.seriesCatalog.categories,
            mediaType: 'series',
            onActivate: (index) {
              final genre = payload.seriesCatalog.categories.elementAtOrNull(
                index,
              );
              if (genre != null) {
                unawaited(_openGenreCatalog(genre, mediaType: 'series'));
              }
            },
          ),
        );
        return sections;
      case 3:
        sections.add(
          _TvHubSection.actions(
            id: 10,
            title: 'Live TV',
            message:
                'Åbn den komplette programguide med kanaler, favoritter og 12 timers EPG.',
            actions: [
              _TvHubAction(
                label: 'Åbn TV-guiden',
                icon: Icons.live_tv,
                onPressed: () => unawaited(_openLiveTv()),
              ),
              _TvHubAction(
                label: 'Optagelser',
                icon: Icons.video_library_outlined,
                onPressed: () => unawaited(_openRecordings()),
              ),
            ],
          ),
        );
        return sections;
      case 4:
        addMedia(
          id: 10,
          title: 'Fortsæt med at se',
          items: payload.continueItems,
          emptyMessage: 'Du har ikke noget, du er i gang med.',
          activate: (item) => unawaited(_play(item)),
        );
        addMedia(
          id: 20,
          title: 'Nye episoder klar',
          items: collapseEpisodeSeriesCards(payload.latestEpisodes.items),
          emptyMessage: 'Ingen nye episoder lige nu.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        return sections;
      case 5:
        sections.add(
          _TvHubSection.message(
            id: 5,
            title: 'Find efter stemning',
            message:
                'Vælg en genre og åbn et fuldt katalog med TV-navigation. Genrer er nu en discovery-side med store brikker i stedet for små filterknapper.',
          ),
        );
        sections.add(
          _TvHubSection.genres(
            id: 10,
            title: 'Filmgenrer',
            genres: payload.movieCatalog.categories,
            mediaType: 'movie',
            onActivate: (index) {
              final genre = payload.movieCatalog.categories.elementAtOrNull(
                index,
              );
              if (genre != null) {
                unawaited(_openGenreCatalog(genre, mediaType: 'movie'));
              }
            },
          ),
        );
        sections.add(
          _TvHubSection.genres(
            id: 20,
            title: 'Seriegenrer',
            genres: payload.seriesCatalog.categories,
            mediaType: 'series',
            onActivate: (index) {
              final genre = payload.seriesCatalog.categories.elementAtOrNull(
                index,
              );
              if (genre != null) {
                unawaited(_openGenreCatalog(genre, mediaType: 'series'));
              }
            },
          ),
        );
        return sections;
      case 7:
        addMedia(
          id: 10,
          title: 'Min liste',
          items: payload.watchlistItems,
          emptyMessage: 'Din liste er tom.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        return sections;
      case 6:
        sections.add(
          _TvHubSection.search(
            id: _searchFieldSection,
            onActivate: (_) =>
                _sectionNodes[_searchFieldSection]?.firstOrNull?.requestFocus(),
          ),
        );
        if (_searchQuery.length >= 2) {
          addMedia(
            id: _searchResultsSection,
            title: 'Søgeresultater',
            items: _searchResultItems,
            emptyMessage: _searchLoading
                ? 'Søger...'
                : _searchError ?? 'Ingen titler matcher søgningen.',
            activate: (item) => item.isSeries
                ? unawaited(_openTitle(item))
                : unawaited(_play(item)),
          );
        } else {
          sections.add(
            _TvHubSection.message(
              id: 20,
              title: 'Søg i hele biblioteket',
              message:
                  'Skriv mindst 2 tegn for at søge i film, serier og episoder.',
            ),
          );
        }
        return sections;
      case 8:
        sections.add(
          _TvHubSection.actions(
            id: 10,
            title: 'Downloads',
            message: 'Administrer lokale titler og offline-afspilning.',
            actions: [
              _TvHubAction(
                label: 'Åbn downloads',
                icon: Icons.download_for_offline_outlined,
                onPressed: () => unawaited(_openDownloads()),
              ),
            ],
          ),
        );
        return sections;
      case 9:
        sections.add(
          _TvHubSection.actions(
            id: 10,
            title: 'Notifikationer',
            message: '$_unreadCount ulæste notifikationer.',
            actions: [
              _TvHubAction(
                label: 'Åbn notifikationer',
                icon: Icons.notifications_none_rounded,
                onPressed: () => unawaited(_openNotifications()),
              ),
            ],
          ),
        );
        return sections;
      case 10:
        sections.add(
          _TvHubSection.actions(
            id: 10,
            title: 'Indstillinger',
            message: 'Tilpas kvalitet, undertekster og afspilning.',
            actions: [
              _TvHubAction(
                label: 'Åbn indstillinger',
                icon: Icons.settings_outlined,
                onPressed: () => unawaited(_openSettings()),
              ),
            ],
          ),
        );
        return sections;
      case 11:
        sections.add(
          _TvHubSection.actions(
            id: 10,
            title: widget.controller.activeProfile?.name ?? 'Min profil',
            message:
                'Administrer den aktive TV-profil og lokale indstillinger.',
            actions: [
              _TvHubAction(
                label: 'Skift profil',
                icon: Icons.switch_account_outlined,
                onPressed: widget.controller.showProfiles,
              ),
              _TvHubAction(
                label: 'Indstillinger',
                icon: Icons.settings_outlined,
                onPressed: () => unawaited(_openSettings()),
              ),
              _TvHubAction(
                label: 'Downloads',
                icon: Icons.download_for_offline_outlined,
                onPressed: () => unawaited(_openDownloads()),
              ),
            ],
          ),
        );
        return sections;
      default:
        final hero = payload.hero;
        if (hero != null) {
          sections.add(
            _TvHubSection.hero(
              id: 0,
              media: hero,
              onActivate: (index) {
                if (index == 0) {
                  unawaited(_play(hero));
                } else {
                  unawaited(_openTitle(hero));
                }
              },
            ),
          );
        }
        addMedia(
          id: 10,
          title: 'Fortsæt med at se',
          items: payload.continueItems,
          emptyMessage: 'Du har ikke noget, du er i gang med.',
          activate: (item) => unawaited(_play(item)),
        );
        var recommendationId = 20;
        for (final recommendation in payload.recommendations.sections.take(2)) {
          addMedia(
            id: recommendationId++,
            title: recommendation.title,
            items: recommendation.items,
            emptyMessage: 'Ingen anbefalinger i denne række.',
            activate: (item) => item.isSeries
                ? unawaited(_openTitle(item))
                : unawaited(_play(item)),
          );
        }
        addMedia(
          id: 40,
          title: 'Nye episoder',
          items: collapseEpisodeSeriesCards(payload.latestEpisodes.items),
          emptyMessage: 'Ingen nye episoder.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 45,
          title: 'Senest tilføjet',
          items: payload.recentlyAddedSeries,
          emptyMessage: 'Der er ikke tilføjet nye serieafsnit endnu.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 50,
          title: 'Nyeste film',
          items: payload.movieCatalog.items,
          emptyMessage: 'Der er endnu ingen film i biblioteket.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 60,
          title: 'Nyeste serier',
          items: payload.seriesCatalog.items,
          emptyMessage: 'Der er endnu ingen serier i biblioteket.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        addMedia(
          id: 70,
          title: 'Min liste',
          items: payload.watchlistItems,
          emptyMessage: 'Din liste er tom.',
          activate: (item) => unawaited(_openTitle(item)),
        );
        return sections;
    }
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (_isSelectKey(event.logicalKey)) {
      return _handleSelectKey(event)
          ? KeyEventResult.handled
          : KeyEventResult.ignored;
    }
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    _resetSelectHold();
    final handled = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowLeft => _focusController.moveLeft(),
      LogicalKeyboardKey.arrowRight => _focusController.moveRight(),
      LogicalKeyboardKey.arrowDown => _focusController.moveDown(),
      LogicalKeyboardKey.arrowUp => _focusController.moveUp(),
      LogicalKeyboardKey.escape ||
      LogicalKeyboardKey.goBack ||
      LogicalKeyboardKey.browserBack => _handleBackAction(),
      _ => false,
    };
    return handled ? KeyEventResult.handled : KeyEventResult.ignored;
  }

  bool _isSelectKey(LogicalKeyboardKey key) =>
      key == LogicalKeyboardKey.enter ||
      key == LogicalKeyboardKey.numpadEnter ||
      key == LogicalKeyboardKey.select ||
      key == LogicalKeyboardKey.space;

  bool _handleSelectKey(KeyEvent event) {
    if (event is KeyUpEvent && !_selectHoldTracking) return true;
    if (event is KeyRepeatEvent && !_selectHoldTracking) return true;
    final media = _focusedContextMedia();
    if (media == null) {
      if (event is KeyDownEvent) return _activate();
      return event is KeyUpEvent || event is KeyRepeatEvent;
    }

    if (event is KeyDownEvent) {
      if (_selectHoldTracking) return true;
      _selectHoldTracking = true;
      _selectHoldFired = false;
      _selectHoldMedia = media;
      _selectHoldTimer = Timer(const Duration(milliseconds: 560), () {
        final heldMedia = _selectHoldMedia;
        if (!mounted || !_selectHoldTracking || heldMedia == null) {
          return;
        }
        _selectHoldFired = true;
        _selectHoldTimer = null;
        unawaited(
          _openContextMenu(heldMedia).whenComplete(() {
            if (mounted) _resetSelectHold();
          }),
        );
      });
      return true;
    }
    if (event is KeyRepeatEvent) return true;
    if (event is KeyUpEvent) {
      final fired = _selectHoldFired;
      _resetSelectHold();
      if (fired) return true;
      return _activate();
    }
    return false;
  }

  void _resetSelectHold() {
    _selectHoldTimer?.cancel();
    _selectHoldTimer = null;
    _selectHoldTracking = false;
    _selectHoldFired = false;
    _selectHoldMedia = null;
  }

  MediaItem? _focusedContextMedia() {
    final state = _focusController.state;
    if (state.isTopRow || state.itemIndex < 0) return null;
    final section = _sections.firstWhere(
      (section) => section.id == state.sectionIndex,
      orElse: () => _TvHubSection.message(id: -1, title: '', message: ''),
    );
    return switch (section.kind) {
      _TvHubSectionKind.hero => section.media,
      _TvHubSectionKind.media => section.items.elementAtOrNull(state.itemIndex),
      _ => null,
    };
  }

  bool _handleBackAction() {
    final state = _focusController.state;
    if (!state.isTopRow) {
      _focusController.setActive(
        topTab: state.topTab,
        sectionIndex: -1,
        itemIndex: 0,
      );
      return true;
    }
    if (state.topTab != 0) {
      if (_configuredTopTab != 0) {
        _configuredTopTab = 0;
        _rebuildSections();
      }
      _focusController.setActive(topTab: 0, sectionIndex: -1, itemIndex: 0);
      return true;
    }
    unawaited(_confirmExit());
    return true;
  }

  Future<void> _confirmExit() async {
    if (_exitPromptOpen || !mounted) return;
    setState(() => _exitPromptOpen = true);
    final shouldExit = await showDialog<bool>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.42),
      builder: (context) => Dialog(
        backgroundColor: Colors.transparent,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: const Color(0xF00A0D12),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: const Color(0x55FFE8A3), width: 1.4),
              boxShadow: const [
                BoxShadow(
                  color: Color(0xCC000000),
                  blurRadius: 48,
                  offset: Offset(0, 22),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Luk appen?',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 27,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.6,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Tryk tilbage for at blive i TV-appen, eller vælg Luk app.',
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 22),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton(
                          autofocus: true,
                          onPressed: () => Navigator.of(context).pop(false),
                          child: const Text('Bliv her'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(context).pop(true),
                          child: const Text('Luk app'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (mounted) setState(() => _exitPromptOpen = false);
    if (!mounted || shouldExit != true) {
      _focusController.setActive(topTab: 0, sectionIndex: -1, itemIndex: 0);
      return;
    }
    await SystemNavigator.pop();
  }

  bool _activate() {
    final state = _focusController.state;
    if (state.isTopRow) {
      _onSelectTopTab(state.topTab);
      return true;
    }
    final action = _sectionActions[state.sectionIndex];
    if (action == null || state.itemIndex < 0) return true;
    action(state.itemIndex);
    return true;
  }

  void _onSelectTopTab(int index) {
    switch (index) {
      case 3:
        unawaited(_openLiveTv());
        return;
      case 8:
        unawaited(_openDownloads());
        return;
      case 9:
        unawaited(_openNotifications());
        return;
      case 10:
        unawaited(_openSettings());
        return;
      case 11:
        widget.controller.showProfiles();
        return;
    }
    if (_configuredTopTab != index) {
      _configuredTopTab = index;
      _rebuildSections();
    }
    _focusController.moveRight();
  }

  Future<void> _refreshIfNeeded() => _loadHomePayload();

  Future<void> _openTitle(MediaItem media) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvTitleScreen(api: api, media: media),
      ),
    );
    await _refreshIfNeeded();
  }

  Future<void> _play(MediaItem media) async {
    await _playWithPosition(media, media.progress?.positionMs ?? 0);
  }

  Future<void> _playWithPosition(MediaItem media, int resumePositionMs) async {
    if (media.isSeries) {
      await _openTitle(media);
      return;
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvPlayerScreen(
          api: api,
          media: media,
          resumePositionMs: resumePositionMs,
        ),
      ),
    );
    await _refreshIfNeeded();
  }

  Future<void> _openContextMenu(MediaItem media) async {
    await showTvMediaContextMenu(
      context: context,
      api: api,
      media: media,
      onOpen: _openTitle,
      onPlay: _playWithPosition,
    );
    if (mounted) _focusController.requestCurrentFocus();
  }

  Future<void> _openSettings() async {
    await Navigator.of(
      context,
    ).push<void>(MaterialPageRoute(builder: (_) => TvSettingsScreen(api: api)));
    await _refreshIfNeeded();
  }

  Future<void> _openDownloads() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvDownloadsScreen(
          api: api,
          profileId: widget.controller.activeProfile?.id,
        ),
      ),
    );
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) =>
            TvNotificationScreen(api: api, notifications: _notifications),
      ),
    );
    await _loadUnreadCount();
    await _refreshIfNeeded();
  }

  Future<void> _openLiveTv() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => TvLiveGuideScreen(api: api)),
    );
  }

  Future<void> _openRecordings() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => TvRecordingsScreen(api: api)),
    );
  }

  Future<void> _loadUnreadCount() async {
    try {
      final items = await _notifications.load();
      if (!mounted) return;
      setState(() => _unreadCount = _notifications.unreadCount(items));
    } catch (_) {
      if (mounted) setState(() => _unreadCount = 0);
    }
  }

  Future<void> _openGenreCatalog(
    String genre, {
    required String mediaType,
  }) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvLibraryScreen(
          library: _library,
          api: api,
          label: mediaType == 'movie' ? 'Film' : 'Serier',
          mediaType: mediaType,
          category: genre,
          onPlay: _play,
          onPlayWithPosition: _playWithPosition,
          onOpen: _openTitle,
        ),
      ),
    );
    await _refreshIfNeeded();
  }

  Future<void> _openAllCatalog(String mediaType) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => TvLibraryScreen(
          library: _library,
          api: api,
          label: mediaType == 'movie' ? 'Film' : 'Serier',
          mediaType: mediaType,
          onPlay: _play,
          onPlayWithPosition: _playWithPosition,
          onOpen: _openTitle,
        ),
      ),
    );
    await _refreshIfNeeded();
  }

  Widget _buildSidebar() {
    final state = _focusController.state;
    final expanded = state.isTopRow;
    return AnimatedContainer(
      duration: TvDesignTokens.focusAnimationDuration,
      width: expanded
          ? TvDesignTokens.sidebarExpandedWidth
          : TvDesignTokens.sidebarCollapsedWidth,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [
            TvDesignTokens.background.withValues(alpha: 0.99),
            const Color(0xF20D131A).withValues(alpha: 0.97),
          ],
        ),
        boxShadow: expanded
            ? const [
                BoxShadow(
                  color: Color(0xB0000000),
                  blurRadius: 32,
                  offset: Offset(14, 0),
                ),
              ]
            : null,
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 16, 10, 14),
            child: AnimatedOpacity(
              opacity: expanded ? 1 : 0,
              duration: TvDesignTokens.focusAnimationDuration,
              child: expanded
                  ? const SizedBox(
                      height: 42,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: BrandLockup(),
                      ),
                    )
                  : const SizedBox(
                      height: 42,
                      child: Center(
                        child: Icon(
                          Icons.bolt_rounded,
                          color: Color(0xFFF7C35F),
                          size: 28,
                        ),
                      ),
                    ),
            ),
          ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 16),
              itemCount: _topTabs.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(height: TvDesignTokens.sidebarGap),
              itemBuilder: (_, index) {
                final selected = _configuredTopTab == index;
                final focused = state.isTopRow && state.topTab == index;
                return AnimatedScale(
                  scale: focused ? TvDesignTokens.focusScale : 1,
                  duration: TvDesignTokens.focusAnimationDuration,
                  child: InkWell(
                    key: ValueKey('tv-sidebar-$index'),
                    focusNode: _topNodes[index],
                    onTap: () {
                      _focusController.setActive(
                        topTab: index,
                        sectionIndex: -1,
                        itemIndex: 0,
                      );
                      _onSelectTopTab(index);
                    },
                    borderRadius: BorderRadius.circular(
                      TvDesignTokens.chromeRadius,
                    ),
                    child: AnimatedContainer(
                      duration: TvDesignTokens.focusAnimationDuration,
                      height: TvDesignTokens.sidebarItemHeight,
                      padding: EdgeInsets.symmetric(
                        horizontal: expanded ? 8 : 0,
                      ),
                      decoration: BoxDecoration(
                        gradient: focused
                            ? const LinearGradient(
                                begin: Alignment.centerLeft,
                                end: Alignment.centerRight,
                                colors: [Color(0xFF40351F), Color(0xD8182028)],
                              )
                            : null,
                        color: focused
                            ? null
                            : selected
                            ? const Color(0x334A3A20)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(
                          TvDesignTokens.chromeRadius,
                        ),
                        border: Border.all(
                          color: focused
                              ? TvDesignTokens.goldSoft
                              : Colors.transparent,
                          width: focused ? TvDesignTokens.focusBorderWidth : 0,
                        ),
                      ),
                      child: expanded
                          ? Row(
                              children: [
                                SizedBox(
                                  width: 24,
                                  child: Icon(
                                    _topIcons[index],
                                    size: 21,
                                    color: selected
                                        ? Colors.white
                                        : Colors.white.withValues(alpha: 0.72),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    _topTabs[index],
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 13.5,
                                      letterSpacing: 0,
                                      fontWeight: selected
                                          ? FontWeight.w900
                                          : FontWeight.w600,
                                    ),
                                  ),
                                ),
                                if (index == 9 && _unreadCount > 0)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 7,
                                      vertical: 2,
                                    ),
                                    decoration: BoxDecoration(
                                      color: BoltColors.error,
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                    child: Text(
                                      '$_unreadCount',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                              ],
                            )
                          : Icon(
                              _topIcons[index],
                              size: 21,
                              color: selected
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: 0.72),
                            ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String label) => Padding(
    padding: const EdgeInsets.fromLTRB(
      TvDesignTokens.pageHorizontalPadding,
      12,
      TvDesignTokens.pageHorizontalPadding,
      7,
    ),
    child: Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: TvDesignTokens.gold,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        const SizedBox(width: 9),
        Text(
          label,
          style: const TextStyle(
            fontSize: TvDesignTokens.sectionTitleSize,
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(width: 12),
        const Expanded(child: Divider(height: 1, color: Color(0x33404B55))),
      ],
    ),
  );

  Widget _buildHeroArtworkFallback(MediaItem media) => Stack(
    fit: StackFit.expand,
    children: [
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF4A3217), Color(0xFF121820), Color(0xFF143645)],
            stops: [0, 0.48, 1],
          ),
        ),
      ),
      Positioned(
        right: 42,
        top: -86,
        width: 360,
        height: 360,
        child: DecoratedBox(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [
                TvDesignTokens.cyan.withValues(alpha: 0.24),
                Colors.transparent,
              ],
            ),
          ),
        ),
      ),
      Positioned(
        right: 30,
        top: 38,
        width: 166,
        height: 238,
        child: Transform.rotate(
          angle: 0.11,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0x553F6575),
                  Color(0xAA101820),
                  Color(0xCC080B0F),
                ],
              ),
              border: Border.all(color: Colors.white10),
            ),
          ),
        ),
      ),
      Positioned(
        right: 142,
        top: 22,
        width: 174,
        height: 260,
        child: Transform.rotate(
          angle: -0.10,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0x775D4525),
                  Color(0xDD171B21),
                  Color(0xEE080A0D),
                ],
              ),
              border: Border.all(color: const Color(0x44FFE8A3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x77000000),
                  blurRadius: 28,
                  offset: Offset(0, 14),
                ),
              ],
            ),
          ),
        ),
      ),
      Positioned(
        right: 92,
        top: 46,
        width: 176,
        height: 238,
        child: Transform.rotate(
          angle: -0.02,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF2A4857),
                  Color(0xFF17212A),
                  Color(0xFF0A0D11),
                ],
              ),
              border: Border.all(color: const Color(0x66FFE8A3)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x99000000),
                  blurRadius: 32,
                  offset: Offset(0, 16),
                ),
              ],
            ),
            child: Center(
              child: Icon(
                media.isSeries ? Icons.tv_rounded : Icons.movie_filter_rounded,
                size: 76,
                color: Colors.white.withValues(alpha: 0.30),
              ),
            ),
          ),
        ),
      ),
    ],
  );

  Widget _buildHeroSection(_TvHubSection section) {
    final media = section.media!;
    final nodes = _sectionNodes[section.id]!;
    final imageUrl = api.absoluteMediaUrl(
      media.backdropPath ?? media.posterPath,
      imageSize: 'w1920',
    );
    final metadata = [
      if (media.releaseYear != null) '${media.releaseYear}',
      if (media.durationMs != null)
        '${(media.durationMs! / Duration.millisecondsPerMinute).round()} min.',
      if (media.is4k) '4K',
      if (media.isHdr) 'HDR',
    ].join('  ·  ');
    return SizedBox(
      height: TvDesignTokens.heroHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (imageUrl.isNotEmpty)
            Image.network(
              imageUrl,
              fit: BoxFit.cover,
              alignment: Alignment.centerRight,
              errorBuilder: (_, _, _) => _buildHeroArtworkFallback(media),
            )
          else
            _buildHeroArtworkFallback(media),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Color(0xFF040506),
                  Color(0xF2040506),
                  Color(0xA8040506),
                  Color(0x07040506),
                ],
                stops: [0, 0.34, 0.66, 1],
              ),
            ),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x00040506),
                  Color(0x08040506),
                  Color(0xFF040506),
                ],
                stops: [0, 0.78, 1],
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: ConstrainedBox(
              constraints: const BoxConstraints(
                maxWidth: TvDesignTokens.heroContentWidth,
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(38, 18, 24, 18),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      section.heroEyebrow,
                      style: const TextStyle(
                        color: Color(0xFFF7C35F),
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.8,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      media.displayTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 42,
                        height: 0.98,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.8,
                      ),
                    ),
                    if (metadata.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        metadata,
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      media.overview ?? media.reason ?? 'Klar til afspilning.',
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 14.5,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Flexible(
                          child: _TvFocusAction(
                            focusNode: nodes[0],
                            icon: Icons.play_arrow_rounded,
                            label:
                                section.heroPrimaryLabel ??
                                (media.progress == null ? 'Afspil' : 'Fortsæt'),
                            primary: true,
                            onPressed: () => section.onActivate!(0),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Flexible(
                          child: _TvFocusAction(
                            focusNode: nodes[1],
                            icon: Icons.info_outline_rounded,
                            label: section.heroSecondaryLabel,
                            onPressed: () => section.onActivate!(1),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMediaSection(_TvHubSection section) {
    if (section.items.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionHeader(section.title),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: TvDesignTokens.pageHorizontalPadding,
            ),
            child: Text(
              section.message ?? 'Ingen titler at vise.',
              style: const TextStyle(
                color: Colors.white60,
                fontSize: TvDesignTokens.bodyTextSize,
              ),
            ),
          ),
        ],
      );
    }
    final nodes = _sectionNodes[section.id]!;
    return Column(
      key: ValueKey('tv-section-${section.id}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(section.title),
        SizedBox(
          height: TvDesignTokens.cardHeight,
          child: ListView.separated(
            clipBehavior: Clip.none,
            padding: const EdgeInsets.symmetric(
              horizontal: TvDesignTokens.pageHorizontalPadding,
            ),
            scrollDirection: Axis.horizontal,
            itemCount: section.items.length,
            separatorBuilder: (_, _) =>
                const SizedBox(width: TvDesignTokens.cardGap),
            itemBuilder: (_, index) {
              final item = section.items[index];
              return MediaPosterCard(
                api: api,
                media: item,
                width: TvDesignTokens.cardWidth,
                isTv: true,
                focusNode: nodes[index],
                heroTag: 'tv-hub-${section.id}-${item.id}',
                onPressed: () => section.onActivate!(index),
                onLongPressed: () => unawaited(_openContextMenu(item)),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildGenreSection(_TvHubSection section) {
    if (section.genres.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionHeader(section.title),
          const Padding(
            padding: EdgeInsets.symmetric(
              horizontal: TvDesignTokens.pageHorizontalPadding,
            ),
            child: Text(
              'Ingen genrer er tilgængelige endnu.',
              style: TextStyle(
                color: Colors.white60,
                fontSize: TvDesignTokens.bodyTextSize,
              ),
            ),
          ),
        ],
      );
    }
    final nodes = _sectionNodes[section.id]!;
    const palettes = [
      [Color(0xFF2B5B7C), Color(0xFF121A2A)],
      [Color(0xFF7B4A24), Color(0xFF1C140E)],
      [Color(0xFF365C3C), Color(0xFF101C13)],
      [Color(0xFF633D67), Color(0xFF18101B)],
      [Color(0xFF6F3333), Color(0xFF1A0F0F)],
      [Color(0xFF4A5D7C), Color(0xFF101622)],
    ];
    final typeLabel = section.mediaType == 'series' ? 'SERIER' : 'FILM';
    final subtitle = section.mediaType == 'series'
        ? 'Åbn serie-katalog'
        : 'Åbn film-katalog';

    return Column(
      key: ValueKey('tv-section-${section.id}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(section.title),
        SizedBox(
          height: 128,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(
              horizontal: TvDesignTokens.pageHorizontalPadding,
            ),
            scrollDirection: Axis.horizontal,
            itemCount: section.genres.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, index) {
              final focused = nodes[index].hasFocus;
              final genre = section.genres[index];
              final palette = palettes[index % palettes.length];
              return AnimatedScale(
                scale: focused ? TvDesignTokens.focusScale : 1,
                duration: const Duration(milliseconds: 140),
                child: InkWell(
                  focusNode: nodes[index],
                  onTap: () => section.onActivate!(index),
                  borderRadius: BorderRadius.circular(
                    TvDesignTokens.panelRadius,
                  ),
                  child: AnimatedContainer(
                    duration: TvDesignTokens.focusAnimationDuration,
                    width: 248,
                    padding: const EdgeInsets.all(17),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(
                        TvDesignTokens.panelRadius,
                      ),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: focused
                            ? const [
                                TvDesignTokens.gold,
                                TvDesignTokens.focusFill,
                              ]
                            : palette,
                      ),
                      border: Border.all(
                        color: focused
                            ? Colors.white
                            : TvDesignTokens.panelBorderSoft,
                        width: focused ? TvDesignTokens.focusBorderWidth : 1,
                      ),
                      boxShadow: focused
                          ? const [
                              BoxShadow(
                                color: Color(0x66FFC857),
                                blurRadius: 26,
                                offset: Offset(0, 14),
                              ),
                            ]
                          : const [
                              BoxShadow(
                                color: Color(0x66000000),
                                blurRadius: 18,
                                offset: Offset(0, 10),
                              ),
                            ],
                    ),
                    child: Stack(
                      children: [
                        Positioned(
                          right: -8,
                          bottom: -10,
                          child: Icon(
                            _genreIcon(genre),
                            size: 82,
                            color: focused
                                ? Colors.black.withValues(alpha: 0.14)
                                : Colors.white.withValues(alpha: 0.12),
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              typeLabel,
                              style: TextStyle(
                                color: focused
                                    ? Colors.black.withValues(alpha: 0.62)
                                    : TvDesignTokens.gold,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.3,
                              ),
                            ),
                            Text(
                              genre,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: focused
                                    ? const Color(0xFF080704)
                                    : Colors.white,
                                fontSize: 23,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.4,
                              ),
                            ),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    subtitle,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: focused
                                          ? Colors.black.withValues(alpha: 0.68)
                                          : Colors.white70,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                                Icon(
                                  Icons.chevron_right_rounded,
                                  color: focused
                                      ? const Color(0xFF080704)
                                      : Colors.white70,
                                  size: 22,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSearchSection(_TvHubSection section) {
    final node = _sectionNodes[section.id]!.first;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        TvDesignTokens.pageHorizontalPadding,
        16,
        TvDesignTokens.pageHorizontalPadding,
        8,
      ),
      child: TextField(
        key: const ValueKey('tv-search-input'),
        focusNode: node,
        controller: _searchController,
        style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _submitSearch(),
        decoration: InputDecoration(
          isDense: true,
          filled: true,
          fillColor: TvDesignTokens.surfaceGlass,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
            borderSide: const BorderSide(color: TvDesignTokens.panelBorderSoft),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
            borderSide: BorderSide(
              color: TvDesignTokens.focusFill,
              width: TvDesignTokens.focusBorderWidth,
            ),
          ),
          hintText: 'Søg efter film, serier eller episoder',
          prefixIcon: const Icon(Icons.search_rounded),
          suffixIcon: _searchLoading
              ? const Padding(
                  padding: EdgeInsets.all(14),
                  child: SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                )
              : _searchController.text.isEmpty
              ? null
              : IconButton(
                  tooltip: 'Ryd søgning',
                  onPressed: _searchController.clear,
                  icon: const Icon(Icons.close),
                ),
        ),
      ),
    );
  }

  Widget _buildActionsSection(_TvHubSection section) {
    final nodes = _sectionNodes[section.id]!;
    return Column(
      key: ValueKey('tv-section-${section.id}'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader(section.title),
        if (section.message != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              TvDesignTokens.pageHorizontalPadding,
              0,
              TvDesignTokens.pageHorizontalPadding,
              14,
            ),
            child: Text(
              section.message!,
              style: const TextStyle(
                color: Colors.white60,
                fontSize: TvDesignTokens.bodyTextSize,
              ),
            ),
          ),
        SizedBox(
          height: 70,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(
              horizontal: TvDesignTokens.pageHorizontalPadding,
            ),
            scrollDirection: Axis.horizontal,
            itemCount: section.actions.length,
            separatorBuilder: (_, _) => const SizedBox(width: 12),
            itemBuilder: (_, index) {
              final action = section.actions[index];
              return _TvFocusAction(
                focusNode: nodes[index],
                icon: action.icon,
                label: action.label,
                onPressed: action.onPressed,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildMessageSection(_TvHubSection section) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _buildSectionHeader(section.title),
      Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: TvDesignTokens.pageHorizontalPadding,
        ),
        child: Text(
          section.message ?? '',
          style: const TextStyle(
            color: TvDesignTokens.textMuted,
            fontSize: TvDesignTokens.bodyTextSize,
          ),
        ),
      ),
    ],
  );

  Widget _buildSection(_TvHubSection section) => switch (section.kind) {
    _TvHubSectionKind.hero => _buildHeroSection(section),
    _TvHubSectionKind.media => _buildMediaSection(section),
    _TvHubSectionKind.genres => _buildGenreSection(section),
    _TvHubSectionKind.search => _buildSearchSection(section),
    _TvHubSectionKind.actions => _buildActionsSection(section),
    _TvHubSectionKind.message => _buildMessageSection(section),
  };

  Widget _buildSections() {
    if (_loading && _homePayload.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_sections.isEmpty) {
      return const Center(
        child: Text(
          'Ingen sektioner at vise.',
          style: TextStyle(color: Colors.white60),
        ),
      );
    }
    return ListView(
      children: [
        if (_loading) const LinearProgressIndicator(minHeight: 2),
        for (final section in _sections) _buildSection(section),
        const SizedBox(height: TvDesignTokens.sectionGap),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final sidebarWidth = _focusController.state.isTopRow
        ? TvDesignTokens.sidebarExpandedWidth
        : TvDesignTokens.sidebarCollapsedWidth;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (_, _) => _handleBackAction(),
      child: Scaffold(
        body: Focus(
          canRequestFocus: true,
          onKeyEvent: _handleKey,
          child: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xC81B1207), Color(0xE6010204)],
              ),
            ),
            child: SafeArea(
              child: Stack(
                children: [
                  const Positioned(
                    top: -280,
                    right: -220,
                    child: _TvAmbientGlow(size: 760, color: Color(0x223B2B10)),
                  ),
                  const Positioned(
                    bottom: -340,
                    left: 80,
                    child: _TvAmbientGlow(size: 620, color: Color(0x181D4A5A)),
                  ),
                  AnimatedPositioned(
                    duration: TvDesignTokens.focusAnimationDuration,
                    curve: Curves.easeOutCubic,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    left: sidebarWidth,
                    child: _buildSections(),
                  ),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: _buildSidebar(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TvAmbientGlow extends StatelessWidget {
  const _TvAmbientGlow({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, const Color(0x00000000)]),
      ),
    ),
  );
}

IconData _genreIcon(String genre) {
  final normalized = genre.toLowerCase();
  if (normalized.contains('action') || normalized.contains('thriller')) {
    return Icons.local_fire_department_rounded;
  }
  if (normalized.contains('animation') || normalized.contains('familie')) {
    return Icons.auto_awesome_rounded;
  }
  if (normalized.contains('dokumentar') || normalized.contains('documentary')) {
    return Icons.travel_explore_rounded;
  }
  if (normalized.contains('drama')) {
    return Icons.theater_comedy_rounded;
  }
  if (normalized.contains('sci') || normalized.contains('fantasy')) {
    return Icons.public_rounded;
  }
  if (normalized.contains('gys') || normalized.contains('horror')) {
    return Icons.dark_mode_rounded;
  }
  if (normalized.contains('komed') || normalized.contains('comedy')) {
    return Icons.sentiment_very_satisfied_rounded;
  }
  return Icons.movie_filter_rounded;
}

enum _TvHubSectionKind { hero, media, genres, search, actions, message }

class _TvHubSection {
  const _TvHubSection._({
    required this.id,
    required this.kind,
    required this.title,
    this.message,
    this.media,
    this.mediaType = 'media',
    this.items = const [],
    this.genres = const [],
    this.actions = const [],
    this.onActivate,
    this.heroEyebrow = 'UDVALGT TIL DIG',
    this.heroPrimaryLabel,
    this.heroSecondaryLabel = 'Mere info',
  });

  factory _TvHubSection.hero({
    required int id,
    required MediaItem media,
    required void Function(int) onActivate,
    String eyebrow = 'UDVALGT TIL DIG',
    String? primaryLabel,
    String secondaryLabel = 'Mere info',
  }) => _TvHubSection._(
    id: id,
    kind: _TvHubSectionKind.hero,
    title: media.displayTitle,
    media: media,
    onActivate: onActivate,
    heroEyebrow: eyebrow,
    heroPrimaryLabel: primaryLabel,
    heroSecondaryLabel: secondaryLabel,
  );

  factory _TvHubSection.media({
    required int id,
    required String title,
    required List<MediaItem> items,
    required String emptyMessage,
    required void Function(int) onActivate,
  }) => _TvHubSection._(
    id: id,
    kind: _TvHubSectionKind.media,
    title: title,
    message: emptyMessage,
    items: items.take(TvDesignTokens.maxSectionItems).toList(growable: false),
    onActivate: onActivate,
  );

  factory _TvHubSection.genres({
    required int id,
    required String title,
    required List<String> genres,
    required String mediaType,
    required void Function(int) onActivate,
  }) => _TvHubSection._(
    id: id,
    kind: _TvHubSectionKind.genres,
    title: title,
    mediaType: mediaType,
    genres: genres.take(TvDesignTokens.maxGenreItems).toList(growable: false),
    onActivate: onActivate,
  );

  factory _TvHubSection.search({
    required int id,
    required void Function(int) onActivate,
  }) => _TvHubSection._(
    id: id,
    kind: _TvHubSectionKind.search,
    title: 'Søg',
    onActivate: onActivate,
  );

  factory _TvHubSection.actions({
    required int id,
    required String title,
    required String message,
    required List<_TvHubAction> actions,
  }) => _TvHubSection._(
    id: id,
    kind: _TvHubSectionKind.actions,
    title: title,
    message: message,
    actions: actions,
    onActivate: (index) => actions.elementAtOrNull(index)?.onPressed(),
  );

  factory _TvHubSection.message({
    required int id,
    required String title,
    required String message,
  }) => _TvHubSection._(
    id: id,
    kind: _TvHubSectionKind.message,
    title: title,
    message: message,
  );

  final int id;
  final _TvHubSectionKind kind;
  final String title;
  final String? message;
  final MediaItem? media;
  final String mediaType;
  final List<MediaItem> items;
  final List<String> genres;
  final List<_TvHubAction> actions;
  final void Function(int)? onActivate;
  final String heroEyebrow;
  final String? heroPrimaryLabel;
  final String heroSecondaryLabel;

  int get focusItemCount => switch (kind) {
    _TvHubSectionKind.hero => 2,
    _TvHubSectionKind.media => items.length,
    _TvHubSectionKind.genres => genres.length,
    _TvHubSectionKind.search => 1,
    _TvHubSectionKind.actions => actions.length,
    _TvHubSectionKind.message => 0,
  };
}

class _TvHubAction {
  const _TvHubAction({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;
}

class _TvFocusAction extends StatelessWidget {
  const _TvFocusAction({
    required this.focusNode,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.primary = false,
  });

  final FocusNode focusNode;
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final focused = focusNode.hasFocus;
    final primaryBg = const LinearGradient(
      colors: [TvDesignTokens.focusFill, TvDesignTokens.gold],
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
    );
    final style =
        (primary
                ? FilledButton.styleFrom(
                    backgroundColor: TvDesignTokens.focusFill,
                    foregroundColor: const Color(0xFF090806),
                    elevation: 0,
                  )
                : OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    backgroundColor: const Color(0xD00B1017),
                  ))
            .copyWith(
              minimumSize: const WidgetStatePropertyAll(
                Size(132, TvDesignTokens.actionButtonHeight),
              ),
              side: WidgetStatePropertyAll(
                BorderSide(
                  color: focused
                      ? TvDesignTokens.focusFill
                      : primary
                      ? Colors.transparent
                      : TvDesignTokens.panelBorderSoft,
                  width: focused ? TvDesignTokens.focusBorderWidth : 1,
                ),
              ),
              textStyle: WidgetStatePropertyAll(
                TextStyle(
                  fontFamily: 'sans-serif-condensed',
                  fontSize: 13,
                  fontWeight: focused ? FontWeight.w900 : FontWeight.w700,
                  letterSpacing: -0.05,
                ),
              ),
              shape: WidgetStatePropertyAll(
                RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(
                    TvDesignTokens.chromeRadius,
                  ),
                ),
              ),
              padding: const WidgetStatePropertyAll(
                EdgeInsets.symmetric(horizontal: 15, vertical: 12),
              ),
            );
    final button = primary
        ? FilledButton.icon(
            focusNode: focusNode,
            onPressed: onPressed,
            style: style,
            icon: Icon(icon),
            label: Text(label),
          )
        : OutlinedButton.icon(
            focusNode: focusNode,
            onPressed: onPressed,
            style: style,
            icon: Icon(icon),
            label: Text(label),
          );
    return AnimatedScale(
      scale: focused ? TvDesignTokens.focusScale : 1,
      duration: const Duration(milliseconds: 140),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
          gradient: focused && primary ? primaryBg : null,
          boxShadow: focused
              ? const [
                  BoxShadow(
                    color: Color(0x55FFC857),
                    blurRadius: 18,
                    spreadRadius: 0.4,
                    offset: Offset(0, 7),
                  ),
                ]
              : const [],
        ),
        child: button,
      ),
    );
  }
}
