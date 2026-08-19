import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../core/api_client.dart';
import '../core/models.dart';
import '../state/app_controller.dart';
import '../widgets/brand.dart';
import '../widgets/media_card.dart';
import 'player_screen.dart';
import 'client_settings_screen.dart';
import 'title_screen.dart';
import 'offline_downloads_screen.dart';
import 'notification_inbox_screen.dart';

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({required this.controller, super.key});

  final AppController controller;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  int _tab = 0;
  bool _loading = true;
  String? _error;
  List<MediaItem> _movies = const [];
  List<MediaItem> _series = const [];
  List<MediaItem> _continue = const [];
  List<MediaItem> _watchlist = const [];
  RecommendationFeed _recommendations = const RecommendationFeed(sections: []);

  ApiClient get api => widget.controller.api;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final responses = await Future.wait([
        api.getJson('/media/catalog?type=movie&pageSize=36&sort=newest'),
        api.getJson('/media/catalog?type=series&pageSize=36&sort=newest'),
        api.getJson('/playback/history/continue'),
        api.getJson('/playback/watchlist'),
        api
            .getJson('/media/recommendations')
            .catchError((_) => <String, dynamic>{}),
      ]);
      if (!mounted) return;
      setState(() {
        _movies = _catalogItems(responses[0]);
        _series = _catalogItems(responses[1]);
        _continue = jsonList(responses[2])
            .map(MediaItem.fromJson)
            .where((item) => item.id.isNotEmpty)
            .toList(growable: false);
        _watchlist = jsonList(responses[3])
            .map(MediaItem.fromJson)
            .where((item) => item.id.isNotEmpty)
            .toList(growable: false);
        _recommendations = RecommendationFeed.fromJson(responses[4]);
        _loading = false;
      });
    } on ApiException catch (failure) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = failure.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Biblioteket kunne ikke indlæses.';
      });
    }
  }

  List<MediaItem> _catalogItems(dynamic raw) {
    final json = jsonMap(raw);
    return jsonList(json.isEmpty ? raw : json['items'])
        .map(MediaItem.fromJson)
        .where((item) => item.id.isNotEmpty)
        .toList(growable: false);
  }

  Future<void> _open(MediaItem media) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TitleScreen(api: api, media: media),
      ),
    );
    await _load();
  }

  Future<void> _play(MediaItem media) async {
    if (media.isSeries) {
      await _open(media);
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PlayerScreen(
          api: api,
          media: media,
          resumePositionMs: media.progress?.positionMs ?? 0,
        ),
      ),
    );
    await _load();
  }

  void _showSearch() {
    showSearch<void>(
      context: context,
      delegate: _MediaSearchDelegate(
        api: api,
        items: [..._movies, ..._series],
        onSelected: _open,
      ),
    );
  }

  Future<void> _openSettings() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => ClientSettingsScreen(api: api)),
    );
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final tv = useTvLayout(context);
    final labels = const ['Hjem', 'Film', 'Serier', 'Fortsæt', 'Min liste'];
    final icons = const [
      Icons.home_outlined,
      Icons.movie_outlined,
      Icons.tv_outlined,
      Icons.play_circle_outline,
      Icons.bookmark_outline,
    ];
    final content = Column(
      children: [
        _LibraryHeader(
          controller: widget.controller,
          selected: _tab,
          onSelect: (index) => setState(() => _tab = index),
          onSearch: _showSearch,
          onSettings: _openSettings,
          compact: !tv,
        ),
        Expanded(
          child: RefreshIndicator(onRefresh: _load, child: _body(tv)),
        ),
      ],
    );
    if (tv) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: _tab,
              onDestinationSelected: (value) => setState(() => _tab = value),
              extended: MediaQuery.sizeOf(context).width >= 1500,
              backgroundColor: const Color(0xFF080C11),
              leading: const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: BrandMark(size: 42),
              ),
              destinations: List.generate(
                labels.length,
                (index) => NavigationRailDestination(
                  icon: Icon(icons[index]),
                  selectedIcon: Icon(
                    icons[index],
                    color: Theme.of(context).colorScheme.secondary,
                  ),
                  label: Text(labels[index]),
                ),
              ),
            ),
            const VerticalDivider(width: 1),
            Expanded(child: content),
          ],
        ),
      );
    }
    return Scaffold(
      body: content,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (value) => setState(() => _tab = value),
        destinations: List.generate(
          labels.length,
          (index) => NavigationDestination(
            icon: Icon(icons[index]),
            label: labels[index],
          ),
        ),
      ),
    );
  }

  Widget _body(bool tv) {
    if (_loading && _movies.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 220),
          Center(child: CircularProgressIndicator()),
        ],
      );
    }
    if (_error != null && _movies.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(32),
        children: [
          const SizedBox(height: 120),
          Icon(
            Icons.cloud_off,
            size: 60,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 18),
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 18),
          Center(
            child: FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh),
              label: const Text('Prøv igen'),
            ),
          ),
        ],
      );
    }
    return switch (_tab) {
      1 => _CatalogGrid(
        api: api,
        title: 'Film',
        items: _movies,
        onPressed: _open,
      ),
      2 => _CatalogGrid(
        api: api,
        title: 'Serier',
        items: _series,
        onPressed: _open,
      ),
      3 => _CatalogGrid(
        api: api,
        title: 'Fortsæt med at se',
        items: _continue,
        onPressed: _play,
      ),
      4 => _CatalogGrid(
        api: api,
        title: 'Min liste',
        items: _watchlist,
        onPressed: _open,
      ),
      _ => _HomeFeed(
        api: api,
        profileName: widget.controller.activeProfile?.name ?? 'dig',
        recommendations: _recommendations,
        movies: _movies,
        series: _series,
        continueItems: _continue,
        onOpen: _open,
        onPlay: _play,
        tv: tv,
      ),
    };
  }
}

class _LibraryHeader extends StatelessWidget {
  const _LibraryHeader({
    required this.controller,
    required this.selected,
    required this.onSelect,
    required this.onSearch,
    required this.onSettings,
    required this.compact,
  });

  final AppController controller;
  final int selected;
  final ValueChanged<int> onSelect;
  final VoidCallback onSearch;
  final VoidCallback onSettings;
  final bool compact;

  @override
  Widget build(BuildContext context) => SafeArea(
    bottom: false,
    child: Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 30,
        vertical: 12,
      ),
      decoration: const BoxDecoration(
        color: Color(0xEE090D12),
        border: Border(bottom: BorderSide(color: Color(0xFF202831))),
      ),
      child: Row(
        children: [
          InkWell(
            onTap: () => onSelect(0),
            child: BrandLockup(compact: compact),
          ),
          if (!compact) ...[
            const SizedBox(width: 28),
            for (final entry in const [
              'Hjem',
              'Film',
              'Serier',
              'Fortsæt',
              'Min liste',
            ].indexed)
              Padding(
                padding: const EdgeInsets.only(right: 4),
                child: TextButton(
                  onPressed: () => onSelect(entry.$1),
                  style: TextButton.styleFrom(
                    foregroundColor: selected == entry.$1
                        ? Colors.white
                        : Colors.white54,
                    backgroundColor: selected == entry.$1
                        ? const Color(0xFF1C242C)
                        : null,
                  ),
                  child: Text(entry.$2),
                ),
              ),
          ],
          const Spacer(),
          IconButton(
            tooltip: 'Søg',
            onPressed: onSearch,
            icon: const Icon(Icons.search),
          ),
          if (controller.isAdmin)
            IconButton(
              tooltip: 'Åbn adminpanel',
              onPressed: () => launchUrl(
                Uri.parse(controller.api.baseUrl.replaceFirst('/api/v1', '')),
                mode: LaunchMode.externalApplication,
              ),
              icon: const Icon(Icons.admin_panel_settings_outlined),
            ),
          PopupMenuButton<String>(
            tooltip: 'Profil',
            onSelected: (value) {
              if (value == 'profiles') controller.showProfiles();
              if (value == 'settings') onSettings();
              if (value == 'downloads') {
                unawaited(
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => OfflineDownloadsScreen(
                        api: controller.api,
                        profileId: controller.activeProfile?.id,
                      ),
                    ),
                  ),
                );
              }
              if (value == 'notifications') {
                unawaited(
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) =>
                          NotificationInboxScreen(api: controller.api),
                    ),
                  ),
                );
              }
              if (value == 'logout') unawaited(controller.logout());
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'settings', child: Text('Indstillinger')),
              PopupMenuItem(
                value: 'notifications',
                child: Text('Notifikationer'),
              ),
              PopupMenuItem(value: 'downloads', child: Text('Downloads')),
              PopupMenuItem(value: 'profiles', child: Text('Skift profil')),
              PopupMenuItem(value: 'logout', child: Text('Log ud')),
            ],
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: const Color(0xFFB67AFF),
                child: Text(
                  (controller.activeProfile?.name ?? 'B').characters.first
                      .toUpperCase(),
                  style: const TextStyle(
                    color: Colors.black,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _HomeFeed extends StatelessWidget {
  const _HomeFeed({
    required this.api,
    required this.profileName,
    required this.recommendations,
    required this.movies,
    required this.series,
    required this.continueItems,
    required this.onOpen,
    required this.onPlay,
    required this.tv,
  });

  final ApiClient api;
  final String profileName;
  final RecommendationFeed recommendations;
  final List<MediaItem> movies;
  final List<MediaItem> series;
  final List<MediaItem> continueItems;
  final ValueChanged<MediaItem> onOpen;
  final ValueChanged<MediaItem> onPlay;
  final bool tv;

  @override
  Widget build(BuildContext context) {
    final hero =
        recommendations.hero ??
        (continueItems.isNotEmpty
            ? continueItems.first
            : (movies.isNotEmpty ? movies.first : null));
    final sections = <MediaSection>[
      if (continueItems.isNotEmpty)
        MediaSection(title: 'Fortsæt med at se', items: continueItems),
      ...recommendations.sections,
      if (movies.isNotEmpty) MediaSection(title: 'Nye film', items: movies),
      if (series.isNotEmpty)
        MediaSection(title: 'Serier på din server', items: series),
    ];
    return ListView(
      padding: EdgeInsets.only(bottom: tv ? 56 : 28),
      children: [
        if (hero != null)
          _Hero(api: api, media: hero, onOpen: onOpen, onPlay: onPlay, tv: tv),
        if (hero == null)
          const Padding(
            padding: EdgeInsets.all(40),
            child: Text(
              'Dit bibliotek er tomt. En administrator skal scanne et bibliotek først.',
            ),
          ),
        for (final section in sections)
          _MediaRail(api: api, section: section, onPressed: onOpen, tv: tv),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
          child: Text(
            'Udvalgt til $profileName beregnes kun fra medier, der findes på din egen server.',
            style: const TextStyle(color: Colors.white38, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.api,
    required this.media,
    required this.onOpen,
    required this.onPlay,
    required this.tv,
  });

  final ApiClient api;
  final MediaItem media;
  final ValueChanged<MediaItem> onOpen;
  final ValueChanged<MediaItem> onPlay;
  final bool tv;

  @override
  Widget build(BuildContext context) {
    final image = api.absoluteMediaUrl(
      media.backdropPath ?? media.posterPath,
      imageSize: 'original',
    );
    return Container(
      height: tv ? 500 : 420,
      margin: EdgeInsets.fromLTRB(tv ? 28 : 12, 18, tv ? 28 : 12, 18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        color: const Color(0xFF111820),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (image.isNotEmpty)
            Image.network(
              image,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const SizedBox(),
            ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  Color(0xF2090D12),
                  Color(0xB8090D12),
                  Color(0x18090D12),
                ],
                stops: [0, 0.5, 1],
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: EdgeInsets.all(tv ? 58 : 28),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: tv ? 660 : 520),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (media.reason ?? 'UDVALGT FRA DIT BIBLIOTEK')
                          .toUpperCase(),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: Theme.of(context).colorScheme.secondary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      media.displayTitle,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.displayLarge?.copyWith(
                        fontSize: tv ? 66 : 44,
                        height: 0.95,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      media.overview ?? media.episodeLabel,
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white70,
                        height: 1.45,
                      ),
                    ),
                    const SizedBox(height: 22),
                    Wrap(
                      spacing: 12,
                      runSpacing: 10,
                      children: [
                        FilledButton.icon(
                          onPressed: () => onPlay(media),
                          icon: const Icon(Icons.play_arrow),
                          label: Text(
                            media.progress == null ? 'Afspil' : 'Fortsæt',
                          ),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => onOpen(media),
                          icon: const Icon(Icons.info_outline),
                          label: const Text('Info'),
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
}

class _MediaRail extends StatelessWidget {
  const _MediaRail({
    required this.api,
    required this.section,
    required this.onPressed,
    required this.tv,
  });

  final ApiClient api;
  final MediaSection section;
  final ValueChanged<MediaItem> onPressed;
  final bool tv;

  @override
  Widget build(BuildContext context) {
    final width = tv ? 184.0 : 146.0;
    return Padding(
      padding: EdgeInsets.only(top: tv ? 24 : 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.symmetric(horizontal: tv ? 30 : 16),
            child: Text(
              section.title,
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: width * 1.48 + 64,
            child: ListView.separated(
              padding: EdgeInsets.symmetric(
                horizontal: tv ? 30 : 16,
                vertical: 4,
              ),
              scrollDirection: Axis.horizontal,
              itemCount: section.items.length,
              separatorBuilder: (_, _) => const SizedBox(width: 14),
              itemBuilder: (_, index) => MediaPosterCard(
                api: api,
                media: section.items[index],
                width: width,
                onPressed: () => onPressed(section.items[index]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CatalogGrid extends StatelessWidget {
  const _CatalogGrid({
    required this.api,
    required this.title,
    required this.items,
    required this.onPressed,
  });

  final ApiClient api;
  final String title;
  final List<MediaItem> items;
  final ValueChanged<MediaItem> onPressed;

  @override
  Widget build(BuildContext context) => CustomScrollView(
    slivers: [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 12),
        sliver: SliverToBoxAdapter(
          child: Text(title, style: Theme.of(context).textTheme.headlineMedium),
        ),
      ),
      if (items.isEmpty)
        const SliverFillRemaining(
          hasScrollBody: false,
          child: Center(child: Text('Ingen titler fundet.')),
        )
      else
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 48),
          sliver: SliverGrid.builder(
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 230,
              mainAxisExtent: 330,
              crossAxisSpacing: 16,
              mainAxisSpacing: 18,
            ),
            itemCount: items.length,
            itemBuilder: (_, index) => MediaPosterCard(
              api: api,
              media: items[index],
              width: 190,
              onPressed: () => onPressed(items[index]),
            ),
          ),
        ),
    ],
  );
}

class _MediaSearchDelegate extends SearchDelegate<void> {
  _MediaSearchDelegate({
    required this.api,
    required this.items,
    required this.onSelected,
  });

  final ApiClient api;
  final List<MediaItem> items;
  final ValueChanged<MediaItem> onSelected;

  @override
  String get searchFieldLabel => 'Søg efter film eller serie';

  @override
  List<Widget> buildActions(BuildContext context) => [
    if (query.isNotEmpty)
      IconButton(onPressed: () => query = '', icon: const Icon(Icons.clear)),
  ];

  @override
  Widget buildLeading(BuildContext context) => IconButton(
    onPressed: () => close(context, null),
    icon: const Icon(Icons.arrow_back),
  );

  @override
  Widget buildResults(BuildContext context) => _results(context);

  @override
  Widget buildSuggestions(BuildContext context) => _results(context);

  Widget _results(BuildContext context) {
    final needle = query.trim().toLowerCase();
    final matches = items
        .where((item) => item.displayTitle.toLowerCase().contains(needle))
        .take(60)
        .toList();
    return GridView.builder(
      padding: const EdgeInsets.all(20),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 220,
        mainAxisExtent: 320,
        crossAxisSpacing: 14,
        mainAxisSpacing: 14,
      ),
      itemCount: matches.length,
      itemBuilder: (_, index) => MediaPosterCard(
        api: api,
        media: matches[index],
        onPressed: () {
          close(context, null);
          onSelected(matches[index]);
        },
      ),
    );
  }
}
