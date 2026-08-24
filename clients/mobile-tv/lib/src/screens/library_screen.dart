import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app.dart';
import '../core/api_client.dart';
import '../core/brand_theme.dart';
import '../core/models.dart';
import '../state/app_controller.dart';
import '../widgets/brand.dart';
import '../widgets/media_card.dart';
import 'player_screen.dart';
import 'client_settings_screen.dart';
import 'title_screen.dart';
import 'offline_downloads_screen.dart';
import 'notification_inbox_screen.dart';
import 'live_tv_screen.dart';

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
    final labels = const [
      'Hjem',
      'Film',
      'Serier',
      'Live TV',
      'Fortsæt',
      'Min liste',
    ];
    final icons = const [
      Icons.home_outlined,
      Icons.movie_outlined,
      Icons.tv_outlined,
      Icons.live_tv_rounded,
      Icons.play_circle_outline,
      Icons.bookmark_outline,
    ];

    final body = _body(tv);

    if (tv) {
      return Scaffold(
        body: DecoratedBox(
          decoration: const BoxDecoration(
            color: BoltColors.background,
            gradient: RadialGradient(
              center: Alignment.topRight,
              radius: 1.1,
              colors: [Color(0x44204E78), BoltColors.background],
            ),
          ),
          child: FocusTraversalGroup(
            policy: ReadingOrderTraversalPolicy(),
            child: Row(
              children: [
                _TvSideRail(
                  labels: labels,
                  icons: icons,
                  selected: _tab,
                  onSelect: (index) => setState(() => _tab = index),
                  onSettings: _openSettings,
                ),
                Expanded(
                  child: Column(
                    children: [
                      _TvTopBar(
                        controller: widget.controller,
                        title: labels[_tab],
                        onSearch: _showSearch,
                        onSettings: _openSettings,
                        onDownloads: _openDownloads,
                        onNotifications: _openNotifications,
                      ),
                      Expanded(
                        child: RefreshIndicator(
                          onRefresh: _load,
                          child: _TvScrollContainer(child: body),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
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
      3 => LiveTvView(api: api),
      4 => _CatalogGrid(
        api: api,
        title: 'Fortsæt med at se',
        items: _continue,
        onPressed: _play,
        tv: tv,
      ),
      5 => _CatalogGrid(
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
    required this.onSettings,
  });

  final List<String> labels;
  final List<IconData> icons;
  final int selected;
  final ValueChanged<int> onSelect;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SizedBox(
      width: 218,
      child: Container(
        decoration: const BoxDecoration(
          border: Border(right: BorderSide(color: Color(0x1FFFFFFF))),
          color: Color(0xF208111D),
          boxShadow: [
            BoxShadow(
              color: Color(0x66000000),
              blurRadius: 28,
              offset: Offset(10, 0),
            ),
          ],
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 22, 14, 18),
              child: BrandLockup(
                compact: true,
                onTap: () => onSelect(0),
                tooltip: 'Gå til Hjem',
              ),
            ),
            const Divider(height: 1),
            const SizedBox(height: 14),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: labels.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, index) => _TvRailIcon(
                  icon: icons[index],
                  label: labels[index],
                  selected: selected == index,
                  onTap: () => onSelect(index),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: _TvRailIcon(
                icon: Icons.settings_outlined,
                label: 'Indstillinger',
                selected: false,
                onTap: onSettings,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _TvTopBar extends StatelessWidget {
  const _TvTopBar({
    required this.controller,
    required this.title,
    required this.onSearch,
    required this.onSettings,
    required this.onDownloads,
    required this.onNotifications,
  });

  final AppController controller;
  final String title;
  final VoidCallback onSearch;
  final VoidCallback onSettings;
  final VoidCallback onDownloads;
  final VoidCallback onNotifications;

  @override
  Widget build(BuildContext context) => SafeArea(
    bottom: false,
    child: Container(
      height: 72,
      padding: const EdgeInsets.fromLTRB(30, 9, 24, 9),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xF20A1624), Color(0x99101F30)],
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
          ),
          _TvIconAction(icon: Icons.search, label: 'Søg', onTap: onSearch),
          _TvIconAction(
            icon: Icons.notifications_none_outlined,
            label: 'Notifikationer',
            onTap: onNotifications,
          ),
          _TvIconAction(
            icon: Icons.download_for_offline_outlined,
            label: 'Downloads',
            onTap: onDownloads,
          ),
          if (controller.isAdmin)
            _TvIconAction(
              icon: Icons.admin_panel_settings_outlined,
              label: 'Admin',
              onTap: () => launchUrl(
                Uri.parse(controller.api.baseUrl.replaceFirst('/api/v1', '')),
                mode: LaunchMode.externalApplication,
              ),
            ),
          _TvIconAction(
            icon: Icons.settings_outlined,
            label: 'Indstillinger',
            onTap: onSettings,
          ),
          const SizedBox(width: 8),
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
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                color: Colors.white.withValues(alpha: 0.08),
                border: Border.all(color: Colors.white12),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 12, 6),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 18,
                      backgroundColor: BoltColors.primary,
                      child: Text(
                        (controller.activeProfile?.name ?? 'B').characters.first
                            .toUpperCase(),
                        style: const TextStyle(
                          color: Colors.black,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 140),
                      child: Text(
                        controller.activeProfile?.name ?? 'Bruger',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _TvRailIcon extends StatefulWidget {
  const _TvRailIcon({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_TvRailIcon> createState() => _TvRailIconState();
}

class _TvRailIconState extends State<_TvRailIcon> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final active = widget.selected || _focused;
    return Tooltip(
      message: widget.label,
      child: FocusableActionDetector(
        autofocus: widget.selected,
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onTap();
              return null;
            },
          ),
        },
        onFocusChange: (value) {
          setState(() => _focused = value);
          if (value) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) Scrollable.ensureVisible(context, alignment: 0.5);
            });
          }
        },
        child: InkWell(
          canRequestFocus: false,
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(14),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: widget.selected
                  ? const Color(0xFF173E68)
                  : _focused
                  ? const Color(0xFF1A3148)
                  : Colors.white.withValues(alpha: 0.04),
              border: Border.all(
                color: _focused ? BoltColors.focus : Colors.transparent,
                width: 2,
              ),
              boxShadow: _focused
                  ? const [
                      BoxShadow(
                        color: Color(0x554EA1FF),
                        blurRadius: 18,
                        spreadRadius: 1,
                      ),
                    ]
                  : const [],
            ),
            child: Row(
              children: [
                Icon(
                  widget.icon,
                  color: active ? BoltColors.primaryBright : Colors.white54,
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.label,
                    style: TextStyle(
                      color: active ? Colors.white : Colors.white60,
                      fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TvIconAction extends StatefulWidget {
  const _TvIconAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  State<_TvIconAction> createState() => _TvIconActionState();
}

class _TvIconActionState extends State<_TvIconAction> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: widget.label,
    child: FocusableActionDetector(
      actions: {
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            widget.onTap();
            return null;
          },
        ),
      },
      onFocusChange: (value) => setState(() => _focused = value),
      child: Padding(
        padding: const EdgeInsets.only(left: 8),
        child: InkWell(
          canRequestFocus: false,
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(999),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: _focused ? 112 : 46,
            height: 46,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              color: _focused
                  ? BoltColors.primary
                  : Colors.white.withValues(alpha: 0.08),
              border: Border.all(color: Colors.white12),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  widget.icon,
                  color: _focused ? Colors.black : Colors.white70,
                  size: 21,
                ),
                if (_focused) ...[
                  const SizedBox(width: 7),
                  Flexible(
                    child: Text(
                      widget.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
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
    if (tv) {
      return _PremiumTvHomeFeed(
        api: api,
        profileName: profileName,
        hero: hero,
        recommendations: recommendations,
        movies: movies,
        series: series,
        continueItems: continueItems,
        onOpen: onOpen,
        onPlay: onPlay,
      );
    }

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

class _PremiumTvHomeFeed extends StatelessWidget {
  const _PremiumTvHomeFeed({
    required this.api,
    required this.profileName,
    required this.hero,
    required this.recommendations,
    required this.movies,
    required this.series,
    required this.continueItems,
    required this.onOpen,
    required this.onPlay,
  });

  final ApiClient api;
  final String profileName;
  final MediaItem? hero;
  final RecommendationFeed recommendations;
  final List<MediaItem> movies;
  final List<MediaItem> series;
  final List<MediaItem> continueItems;
  final ValueChanged<MediaItem> onOpen;
  final ValueChanged<MediaItem> onPlay;

  @override
  Widget build(BuildContext context) {
    final qualityItems = _dedupeMedia([
      ...movies.where((item) => item.is4k || item.isHdr),
      ...series.where((item) => item.is4k || item.isHdr),
    ]);
    final personalized = recommendations.sections
        .where((section) => section.items.isNotEmpty)
        .take(4)
        .toList(growable: false);
    final sections = <MediaSection>[
      if (continueItems.isNotEmpty)
        MediaSection(title: 'Fortsæt med at se', items: continueItems),
      ...personalized,
      if (qualityItems.isNotEmpty)
        MediaSection(title: '4K og HDR på serveren', items: qualityItems),
      if (movies.isNotEmpty) MediaSection(title: 'Nye film', items: movies),
      if (series.isNotEmpty)
        MediaSection(title: 'Serier til sofaen', items: series),
    ];

    return FocusTraversalGroup(
      child: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: hero == null
                ? const _PremiumEmptyHero()
                : _PremiumTvHero(
                    api: api,
                    media: hero!,
                    profileName: profileName,
                    onOpen: onOpen,
                    onPlay: onPlay,
                  ),
          ),
          SliverToBoxAdapter(
            child: _TvMetricStrip(
              continueCount: continueItems.length,
              movieCount: movies.length,
              seriesCount: series.length,
              qualityCount: qualityItems.length,
            ),
          ),
          for (final section in sections)
            SliverToBoxAdapter(
              child: _PremiumMediaRail(
                api: api,
                section: section,
                onPressed: onOpen,
              ),
            ),
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(42, 22, 42, 48),
              child: Text(
                'BoltBytes TV er optimeret til fjernbetjening, hurtig navigation og din lokale server.',
                style: TextStyle(
                  color: Colors.white38,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PremiumEmptyHero extends StatelessWidget {
  const _PremiumEmptyHero();

  @override
  Widget build(BuildContext context) => Container(
    height: 520,
    margin: const EdgeInsets.fromLTRB(32, 12, 32, 22),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(30),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF19110A), Color(0xFF07090C), Color(0xFF101820)],
      ),
      border: Border.all(color: Colors.white10),
    ),
    child: const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          BrandMark(size: 74),
          SizedBox(height: 22),
          Text(
            'Dit bibliotek er tomt',
            style: TextStyle(fontSize: 34, fontWeight: FontWeight.w900),
          ),
          SizedBox(height: 10),
          Text(
            'Scan et bibliotek fra adminpanelet for at fylde TV-forsiden.',
            style: TextStyle(color: Colors.white60, fontSize: 16),
          ),
        ],
      ),
    ),
  );
}

class _PremiumTvHero extends StatelessWidget {
  const _PremiumTvHero({
    required this.api,
    required this.media,
    required this.profileName,
    required this.onOpen,
    required this.onPlay,
  });

  final ApiClient api;
  final MediaItem media;
  final String profileName;
  final ValueChanged<MediaItem> onOpen;
  final ValueChanged<MediaItem> onPlay;

  @override
  Widget build(BuildContext context) {
    final image = api.absoluteMediaUrl(
      media.backdropPath ?? media.posterPath,
      imageSize: 'original',
    );
    final poster = api.absoluteMediaUrl(media.posterPath, imageSize: 'w500');
    final progress = media.progress?.percent.clamp(0, 100);
    final hasProgress = progress != null && progress > 0;
    final reason = media.reason?.trim();

    return Container(
      height: 430,
      margin: const EdgeInsets.fromLTRB(18, 6, 22, 14),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(34),
          bottomRight: Radius.circular(34),
        ),
        color: const Color(0xFF06080A),
        border: Border.all(color: Colors.white10),
        boxShadow: const [
          BoxShadow(
            color: Color(0x99000000),
            blurRadius: 42,
            offset: Offset(0, 22),
          ),
        ],
      ),
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
                  Color(0xFF040506),
                  Color(0xE6040506),
                  Color(0x99040506),
                  Color(0x22040506),
                ],
                stops: [0, 0.42, 0.68, 1],
              ),
            ),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x77000000),
                  Color(0x00000000),
                  Color(0xE6000000),
                ],
                stops: [0, 0.48, 1],
              ),
            ),
          ),
          Positioned(
            left: 38,
            top: 28,
            child: Row(
              children: [
                const Icon(Icons.auto_awesome, color: BoltColors.primaryBright),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'DIT BIBLIOTEK',
                      style: TextStyle(
                        color: BoltColors.primaryBright,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2.2,
                      ),
                    ),
                    Text(
                      'Udvalgt til $profileName',
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Positioned(
            left: 38,
            right: 38,
            bottom: 28,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (reason != null && reason.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _HeroReason(label: reason),
                          ),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (media.releaseYear != null)
                              _ChipPill(label: '${media.releaseYear}'),
                            if (media.episodeLabel.isNotEmpty)
                              _ChipPill(label: media.episodeLabel),
                            if (media.is4k) const _ChipPill(label: '4K'),
                            if (media.isHdr)
                              _ChipPill(label: media.hdr!.toUpperCase()),
                            if (hasProgress)
                              _ChipPill(label: '${progress.round()}% set'),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Text(
                          media.displayTitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.displayLarge
                              ?.copyWith(
                                fontSize: 44,
                                height: 0.94,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -2.2,
                                shadows: const [
                                  Shadow(
                                    color: Color(0xCC000000),
                                    blurRadius: 18,
                                  ),
                                ],
                              ),
                        ),
                        const SizedBox(height: 18),
                        if ((media.overview ?? '').isNotEmpty)
                          Text(
                            media.overview!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xB8FFFFFF),
                              fontSize: 15,
                              height: 1.45,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            _TvHeroButton(
                              icon: hasProgress
                                  ? Icons.play_circle_fill_rounded
                                  : Icons.play_arrow_rounded,
                              label: hasProgress ? 'Fortsæt' : 'Afspil',
                              primary: true,
                              onTap: () => onPlay(media),
                            ),
                            const SizedBox(width: 14),
                            _TvHeroButton(
                              icon: Icons.info_outline_rounded,
                              label: 'Mere info',
                              onTap: () => onOpen(media),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                if (poster.isNotEmpty) ...[
                  const SizedBox(width: 24),
                  _HeroPosterPreview(image: poster, media: media),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroPosterPreview extends StatelessWidget {
  const _HeroPosterPreview({required this.image, required this.media});

  final String image;
  final MediaItem media;

  @override
  Widget build(BuildContext context) => Container(
    width: 132,
    height: 198,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: Colors.white24),
      boxShadow: const [
        BoxShadow(
          color: Color(0xAA000000),
          blurRadius: 30,
          offset: Offset(0, 18),
        ),
      ],
    ),
    child: Stack(
      fit: StackFit.expand,
      children: [
        Image.network(
          image,
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => const SizedBox(),
        ),
        Positioned(
          left: 10,
          right: 10,
          bottom: 10,
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (media.is4k) const _ChipPill(label: '4K'),
              if (media.isHdr) const _ChipPill(label: 'HDR'),
            ],
          ),
        ),
      ],
    ),
  );
}

class _HeroReason extends StatelessWidget {
  const _HeroReason({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(999),
      color: Colors.black.withValues(alpha: 0.38),
      border: Border.all(color: const Color(0x554EA1FF)),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: BoltColors.primaryBright,
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    ),
  );
}

class _TvHeroButton extends StatefulWidget {
  const _TvHeroButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;

  @override
  State<_TvHeroButton> createState() => _TvHeroButtonState();
}

class _TvHeroButtonState extends State<_TvHeroButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => FocusableActionDetector(
    autofocus: widget.primary,
    actions: {
      ActivateIntent: CallbackAction<ActivateIntent>(
        onInvoke: (_) {
          widget.onTap();
          return null;
        },
      ),
    },
    onFocusChange: (value) => setState(() => _focused = value),
    child: AnimatedScale(
      scale: _focused ? 1.06 : 1,
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOutCubic,
      child: InkWell(
        canRequestFocus: false,
        onTap: widget.onTap,
        borderRadius: BorderRadius.circular(999),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 15),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: widget.primary
                ? BoltColors.primary
                : Colors.white.withValues(alpha: _focused ? 0.18 : 0.1),
            border: Border.all(
              color: widget.primary
                  ? BoltColors.primaryBright
                  : Colors.white.withValues(alpha: _focused ? 0.38 : 0.18),
            ),
            boxShadow: _focused
                ? const [
                    BoxShadow(
                      color: Color(0x554EA1FF),
                      blurRadius: 22,
                      offset: Offset(0, 10),
                    ),
                  ]
                : const [],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                widget.icon,
                color: widget.primary ? Colors.black : Colors.white,
                size: 24,
              ),
              const SizedBox(width: 9),
              Text(
                widget.label,
                style: TextStyle(
                  color: widget.primary ? Colors.black : Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _TvMetricStrip extends StatelessWidget {
  const _TvMetricStrip({
    required this.continueCount,
    required this.movieCount,
    required this.seriesCount,
    required this.qualityCount,
  });

  final int continueCount;
  final int movieCount;
  final int seriesCount;
  final int qualityCount;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(42, 6, 42, 16),
    child: Row(
      children: [
        Expanded(
          child: _TvMetricCard(
            icon: Icons.play_circle_outline,
            label: 'Fortsæt',
            value: '$continueCount',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _TvMetricCard(
            icon: Icons.movie_creation_outlined,
            label: 'Film',
            value: '$movieCount',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _TvMetricCard(
            icon: Icons.live_tv_outlined,
            label: 'Serier',
            value: '$seriesCount',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _TvMetricCard(
            icon: Icons.hdr_auto_outlined,
            label: '4K / HDR',
            value: '$qualityCount',
          ),
        ),
      ],
    ),
  );
}

class _TvMetricCard extends StatelessWidget {
  const _TvMetricCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      color: Colors.white.withValues(alpha: 0.055),
      border: Border.all(color: Colors.white10),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              color: const Color(0x224EA1FF),
            ),
            child: Icon(icon, color: BoltColors.primaryBright, size: 21),
          ),
          const SizedBox(width: 13),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  height: 1,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.6,
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

class _PremiumMediaRail extends StatelessWidget {
  const _PremiumMediaRail({
    required this.api,
    required this.section,
    required this.onPressed,
  });

  final ApiClient api;
  final MediaSection section;
  final ValueChanged<MediaItem> onPressed;

  @override
  Widget build(BuildContext context) {
    final items = _dedupeMedia(section.items).take(24).toList(growable: false);
    if (items.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    section.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.7,
                    ),
                  ),
                ),
                Text(
                  '${items.length} titler',
                  style: const TextStyle(
                    color: Colors.white38,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 310,
            child: ScrollConfiguration(
              behavior: const ScrollBehavior().copyWith(scrollbars: false),
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(
                  horizontal: 28,
                  vertical: 5,
                ),
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(width: 16),
                itemBuilder: (_, index) => MediaPosterCard(
                  api: api,
                  media: items[index],
                  width: 158,
                  isTv: true,
                  showMeta: true,
                  heroTag: 'premium-${section.title}-$index-${items[index].id}',
                  onPressed: () => onPressed(items[index]),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

List<MediaItem> _dedupeMedia(Iterable<MediaItem> items) {
  final seen = <String>{};
  final result = <MediaItem>[];
  for (final item in items) {
    if (item.id.isEmpty || !seen.add(item.id)) continue;
    result.add(item);
  }
  return result;
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
                  heroTag:
                      'rail-${section.title}-$index-${section.items[index].id}',
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
              maxCrossAxisExtent: tv ? 198 : 230,
              mainAxisExtent: tv ? 318 : 330,
              crossAxisSpacing: 16,
              mainAxisSpacing: 18,
            ),
            itemCount: items.length,
            itemBuilder: (_, index) => MediaPosterCard(
              api: api,
              media: items[index],
              width: tv ? 178 : 190,
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
