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

  Future<void> _openTitle(MediaItem media) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TitleScreen(api: api, media: media),
      ),
    );
    await _load();
  }

  Future<void> _openMedia(MediaItem media) async {
    if (media.isSeries) {
      await _openTitle(media);
      return;
    }
    await _play(media);
  }

  Future<void> _play(MediaItem media) async {
    if (media.isSeries) {
      await _openTitle(media);
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

  Future<void> _openSettings() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => ClientSettingsScreen(api: api)),
    );
    await _load();
  }

  Future<void> _openDownloads() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => OfflineDownloadsScreen(
          api: api,
          profileId: widget.controller.activeProfile?.id,
        ),
      ),
    );
    await _load();
  }

  Future<void> _openNotifications() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(builder: (_) => NotificationInboxScreen(api: api)),
    );
    await _load();
  }

  Future<void> _showSearch() async {
    await showSearch<void>(
      context: context,
      delegate: _MediaSearchDelegate(
        api: api,
        items: [..._movies, ..._series],
        onSelected: _openTitle,
      ),
    );
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

    final body = _body(tv);

    if (tv) {
      return Scaffold(
        body: Row(
          children: [
            _TvSideRail(
              labels: labels,
              icons: icons,
              selected: _tab,
              onSelect: (index) => setState(() => _tab = index),
              controller: widget.controller,
              onSearch: _showSearch,
              onSettings: _openSettings,
              onDownloads: _openDownloads,
              onNotifications: _openNotifications,
            ),
            const VerticalDivider(width: 1),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: _TvScrollContainer(child: body),
              ),
            ),
          ],
        ),
      );
    }

    final mobileContent = Column(
      children: [
        _LibraryHeader(
          controller: widget.controller,
          selected: _tab,
          onSelect: (index) => setState(() => _tab = index),
          onSearch: _showSearch,
          onSettings: _openSettings,
          onDownloads: _openDownloads,
          onNotifications: _openNotifications,
          compact: true,
          showTabs: true,
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _TvScrollContainer(child: body),
          ),
        ),
      ],
    );

    return Scaffold(
      body: mobileContent,
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
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 220),
          Center(child: CircularProgressIndicator()),
        ],
      );
    }

    if (_error != null && _movies.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
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
        onPressed: _openTitle,
        tv: tv,
      ),
      2 => _CatalogGrid(
        api: api,
        title: 'Serier',
        items: _series,
        onPressed: _openTitle,
        tv: tv,
      ),
      3 => _CatalogGrid(
        api: api,
        title: 'Fortsæt med at se',
        items: _continue,
        onPressed: _play,
        tv: tv,
      ),
      4 => _CatalogGrid(
        api: api,
        title: 'Min liste',
        items: _watchlist,
        onPressed: _openTitle,
        tv: tv,
      ),
      _ => _HomeFeed(
        api: api,
        profileName: widget.controller.activeProfile?.name ?? 'dig',
        recommendations: _recommendations,
        movies: _movies,
        series: _series,
        continueItems: _continue,
        onOpen: _openMedia,
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
    required this.onDownloads,
    required this.onNotifications,
    this.compact = false,
    this.showTabs = true,
  });

  final AppController controller;
  final int selected;
  final ValueChanged<int> onSelect;
  final VoidCallback onSearch;
  final VoidCallback onSettings;
  final VoidCallback onDownloads;
  final VoidCallback onNotifications;
  final bool compact;
  final bool showTabs;

  @override
  Widget build(BuildContext context) => SafeArea(
    bottom: false,
    child: Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 16 : 28,
        vertical: 12,
      ),
      decoration: const BoxDecoration(
        color: Color(0xF2090D12),
        border: Border(bottom: BorderSide(color: Color(0xFF202831))),
      ),
      child: Row(
        children: [
          BrandLockup(
            compact: compact,
            onTap: () => onSelect(0),
            tooltip: 'Gå til hjem',
          ),
          if (showTabs) ...[
            const SizedBox(width: 14),
            Expanded(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final entry in const [
                      'Hjem',
                      'Film',
                      'Serier',
                      'Fortsæt',
                      'Min liste',
                    ].indexed)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: _LibraryTopTab(
                          label: entry.$2,
                          selected: selected == entry.$1,
                          onTap: () => onSelect(entry.$1),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
          const Spacer(),
          IconButton(
            tooltip: 'Notifikationer',
            onPressed: onNotifications,
            icon: const Icon(Icons.notifications_none),
          ),
          IconButton(
            tooltip: 'Downloads',
            onPressed: onDownloads,
            icon: const Icon(Icons.download_for_offline_outlined),
          ),
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
              if (value == 'downloads') onDownloads();
              if (value == 'notifications') onNotifications();
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
              padding: const EdgeInsets.all(6),
              child: CircleAvatar(
                radius: compact ? 18 : 20,
                backgroundColor: const Color(0xFFF0C06F),
                child: Text(
                  (controller.activeProfile?.name ?? 'B').characters.first
                      .toUpperCase(),
                  style: TextStyle(
                    color: Colors.black,
                    fontWeight: FontWeight.w900,
                    fontSize: compact ? 14 : 16,
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

class _TvSideRail extends StatelessWidget {
  const _TvSideRail({
    required this.labels,
    required this.icons,
    required this.selected,
    required this.onSelect,
    required this.controller,
    required this.onSearch,
    required this.onSettings,
    required this.onDownloads,
    required this.onNotifications,
  });

  final List<String> labels;
  final List<IconData> icons;
  final int selected;
  final ValueChanged<int> onSelect;
  final AppController controller;
  final VoidCallback onSearch;
  final VoidCallback onSettings;
  final VoidCallback onDownloads;
  final VoidCallback onNotifications;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SizedBox(
      width: 286,
      child: Container(
        decoration: const BoxDecoration(
          border: Border(right: BorderSide(color: Color(0xFF1E2730))),
          color: Color(0xF2090E15),
          boxShadow: [
            BoxShadow(
              color: Color(0x33000000),
              blurRadius: 14,
              offset: Offset(8, 0),
            ),
          ],
        ),
        child: Column(
          children: [
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  color: Colors.white.withValues(alpha: 0.06),
                ),
                child: InkWell(
                  onTap: () => onSelect(0),
                  borderRadius: BorderRadius.circular(999),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                    child: BrandLockup(compact: false),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: NavigationRail(
                selectedIndex: selected,
                onDestinationSelected: onSelect,
                labelType: NavigationRailLabelType.all,
                groupAlignment: -0.95,
                backgroundColor: Colors.transparent,
                selectedIconTheme: const IconThemeData(size: 24),
                destinations: [
                  for (final entry in labels.indexed)
                    NavigationRailDestination(
                      icon: Icon(icons[entry.$1]),
                      label: Text(entry.$2),
                    ),
                ],
                trailing: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Divider(height: 16),
                    _TvRailAction(
                      icon: Icons.search,
                      label: 'Søg',
                      onTap: onSearch,
                    ),
                    _TvRailAction(
                      icon: Icons.notifications_none_outlined,
                      label: 'Notifikationer',
                      onTap: onNotifications,
                    ),
                    _TvRailAction(
                      icon: Icons.download_for_offline_outlined,
                      label: 'Downloads',
                      onTap: onDownloads,
                    ),
                    if (controller.isAdmin)
                      _TvRailAction(
                        icon: Icons.admin_panel_settings_outlined,
                        label: 'Admin',
                        onTap: () => launchUrl(
                          Uri.parse(
                            controller.api.baseUrl.replaceFirst('/api/v1', ''),
                          ),
                          mode: LaunchMode.externalApplication,
                        ),
                      ),
                    _TvRailAction(
                      icon: Icons.settings,
                      label: 'Indstillinger',
                      onTap: onSettings,
                    ),
                  ],
                ),
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: Colors.white.withValues(alpha: 0.04),
                  ),
                  child: Text(
                    controller.activeProfile?.name ?? 'Bruger',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _TvRailAction extends StatelessWidget {
  const _TvRailAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FocusableActionDetector(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 5, 10, 5),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(10),
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: Colors.white.withValues(alpha: 0.05),
              ),
              child: Row(
                children: [
                  Icon(icon, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      label,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ),
                  const Icon(Icons.chevron_right, size: 17),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LibraryTopTab extends StatelessWidget {
  const _LibraryTopTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: BorderRadius.circular(999),
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: selected ? const Color(0xAA4D2EA3) : Colors.white12,
        border: Border.all(
          color: selected ? const Color(0xFF7CA8FF) : Colors.white24,
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: Colors.white,
          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
        ),
      ),
    ),
  );
}

class _TvScrollContainer extends StatelessWidget {
  const _TvScrollContainer({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ScrollConfiguration(
    behavior: const ScrollBehavior().copyWith(scrollbars: false),
    child: child,
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
        if (tv)
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
            child: Text(
              'Udvalgt til $profileName.',
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
      height: tv ? 520 : 420,
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
                stops: [0, 0.55, 1],
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomLeft,
            child: Padding(
              padding: EdgeInsets.all(tv ? 56 : 28),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxWidth: tv ? 780 : 520),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (media.releaseYear != null)
                          _ChipPill(label: '${media.releaseYear}'),
                        if (media.is4k) const _ChipPill(label: '4K'),
                        if (media.isHdr)
                          _ChipPill(label: media.hdr!.toUpperCase()),
                        if (!tv && media.episodeLabel.isNotEmpty)
                          _ChipPill(label: media.episodeLabel),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      media.displayTitle,
                      style: Theme.of(context).textTheme.displayLarge?.copyWith(
                        fontSize: tv ? 58 : 44,
                        height: 0.98,
                        shadows: const [
                          Shadow(color: Colors.black, blurRadius: 12),
                        ],
                      ),
                    ),
                    if (!tv) ...[
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
                    ],
                    const SizedBox(height: 20),
                    Wrap(
                      spacing: 12,
                      children: [
                        FilledButton.icon(
                          onPressed: () => onPlay(media),
                          icon: const Icon(Icons.play_arrow),
                          label: const Text('Afspil'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () => onOpen(media),
                          icon: const Icon(Icons.info_outline),
                          label: const Text('Info'),
                        ),
                        if (tv)
                          TextButton.icon(
                            onPressed: () => onPlay(media),
                            icon: const Icon(Icons.play_circle_outline),
                            label: const Text('Genoptag'),
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
    final width = tv ? 214.0 : 146.0;
    return Padding(
      padding: EdgeInsets.only(top: tv ? 22 : 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.symmetric(horizontal: tv ? 30 : 16),
            child: Text(
              section.title,
              style: tv
                  ? Theme.of(
                      context,
                    ).textTheme.titleLarge?.copyWith(fontSize: 28)
                  : Theme.of(context).textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: width * 1.5 + (tv ? 78 : 72),
            child: ScrollConfiguration(
              behavior: const ScrollBehavior().copyWith(scrollbars: false),
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
                  isTv: tv,
                  showMeta: true,
                  onPressed: () => onPressed(section.items[index]),
                ),
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
    required this.tv,
  });

  final ApiClient api;
  final String title;
  final List<MediaItem> items;
  final ValueChanged<MediaItem> onPressed;
  final bool tv;

  @override
  Widget build(BuildContext context) => CustomScrollView(
    slivers: [
      SliverPadding(
        padding: EdgeInsets.fromLTRB(tv ? 34 : 24, 24, tv ? 34 : 24, 10),
        sliver: SliverToBoxAdapter(
          child: Text(
            title,
            style: tv
                ? Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontSize: tv ? 34 : 24,
                    fontWeight: FontWeight.w800,
                  )
                : Theme.of(context).textTheme.headlineMedium,
          ),
        ),
      ),
      if (items.isEmpty)
        SliverFillRemaining(
          hasScrollBody: false,
          child: Center(child: Text('Ingen titler fundet.')),
        )
      else
        SliverPadding(
          padding: EdgeInsets.fromLTRB(tv ? 34 : 20, 8, tv ? 34 : 20, 48),
          sliver: SliverGrid.builder(
            gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: tv ? 250 : 230,
              mainAxisExtent: tv ? 390 : 330,
              crossAxisSpacing: 16,
              mainAxisSpacing: 18,
            ),
            itemCount: items.length,
            itemBuilder: (_, index) => MediaPosterCard(
              api: api,
              media: items[index],
              width: tv ? 238 : 190,
              isTv: tv,
              onPressed: () => onPressed(items[index]),
            ),
          ),
        ),
    ],
  );
}

class _ChipPill extends StatelessWidget {
  const _ChipPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xE20A0E13),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: Colors.white24),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
    ),
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
    final tv = useTvLayout(context);
    return GridView.builder(
      padding: EdgeInsets.all(tv ? 28 : 20),
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
        width: 180,
        isTv: tv,
        onPressed: () {
          close(context, null);
          onSelected(matches[index]);
        },
      ),
    );
  }
}
