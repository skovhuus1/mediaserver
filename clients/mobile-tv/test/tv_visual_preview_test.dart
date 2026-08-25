import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/app_update_service.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/core/offline_downloads.dart';
import 'package:boltbytes_media/src/screens/auth_screens.dart';
import 'package:boltbytes_media/src/shared_core/client_preferences_contract.dart';
import 'package:boltbytes_media/src/shared_core/library_contract.dart';
import 'package:boltbytes_media/src/shared_core/live_tv_contract.dart';
import 'package:boltbytes_media/src/shared_core/live_tv_recording_contract.dart';
import 'package:boltbytes_media/src/shared_core/notification_contract.dart';
import 'package:boltbytes_media/src/shared_core/offline_library_contract.dart';
import 'package:boltbytes_media/src/shared_core/playback/playback_session_controller.dart';
import 'package:boltbytes_media/src/shared_core/title_contract.dart';
import 'package:boltbytes_media/src/shared_core/ui_mode.dart';
import 'package:boltbytes_media/src/shared_core/ui_tokens/tv_design_tokens.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:boltbytes_media/src/tv/screens/tv_downloads_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_hub_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_live_guide_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_notification_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_player_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_profile_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_recordings_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_settings_screen.dart';
import 'package:boltbytes_media/src/tv/screens/tv_title_screen.dart';
import 'package:boltbytes_media/src/tv/widgets/tv_option_overlay.dart';
import 'package:boltbytes_media/src/tv/widgets/tv_cinematic_chrome.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:video_player/video_player.dart';

import 'support/memory_session_storage.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(_loadPreviewFonts);

  final enabled = Platform.environment['BB_TV_PREVIEW'] == '1';
  const allFiles = [
    '01-hub.png',
    '02-genre.png',
    '03-title-series.png',
    '04-player-controls.png',
    '05-player-options.png',
    '06-live-tv.png',
    '07-downloads.png',
    '08-notifications.png',
    '09-settings.png',
    '10-recordings.png',
    '11-profiles.png',
    '12-login.png',
  ];
  final requested = Platform.environment['BB_TV_PREVIEW_SCREEN']?.trim();
  final files = requested == null || requested.isEmpty
      ? allFiles
      : allFiles.where((file) => file == requested).toList(growable: false);

  for (final fileName in files) {
    testWidgets('writes $fileName', (tester) async {
      tester.view.physicalSize = const Size(1280, 720);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final preview = _PreviewHarness(tester);
      if (fileName == allFiles.first) preview.clear();
      await preview.pump(
        fileName,
        _previewWidget(fileName),
        chrome: _chrome(fileName),
      );
    }, skip: !enabled);
  }
}

Future<void> _loadPreviewFonts() async {
  if (!Platform.isWindows) return;
  await _loadFontFamily(
    'sans-serif-condensed',
    r'C:\Windows\Fonts\segoeui.ttf',
  );
  await _loadFontFamily('sans-serif', r'C:\Windows\Fonts\segoeui.ttf');
  await _loadFontFamily('Courier New', r'C:\Windows\Fonts\consola.ttf');
}

Future<void> _loadFontFamily(String family, String path) async {
  final file = File(path);
  if (!file.existsSync()) return;
  final bytes = Uint8List.fromList(file.readAsBytesSync());
  await (FontLoader(
    family,
  )..addFont(Future.value(ByteData.sublistView(bytes)))).load();
}

Widget _previewWidget(String fileName) {
  final api = _api();
  final controller = _controller(api);
  final library = _PreviewLibrary();
  final title = _PreviewTitleContract();
  switch (fileName) {
    case '01-hub.png':
      return TvHubScreen(controller: controller, library: library);
    case '02-genre.png':
      return TvHubScreen(
        controller: controller,
        library: library,
        initialTopTab: 5,
      );
    case '03-title-series.png':
      return TvTitleScreen(
        api: api,
        media: title.payload.experience.title,
        titleContract: title,
        onPlay: (_, _) async {},
      );
    case '04-player-controls.png':
      final playback = _PreviewPlaybackController()..markReady();
      return TvPlaybackScaffold(controller: playback, title: 'Sommer');
    case '05-player-options.png':
      return TvOptionOverlay<String>(
        playbackTitle: 'Sommer',
        playbackSubtitle: 'Sæson 2, episode 4',
        panelTitle: 'Undertekster',
        panelDescription:
            'Vælg tekstspor uden at forlade afspilningen. Back lukker overlayet og bevarer fokus.',
        previewText: 'Starter om lidt',
        choices: const [
          TvPlaybackChoice(
            value: 'off',
            title: 'Fra',
            subtitle: 'Ingen undertekster',
            icon: Icons.closed_caption_disabled_rounded,
            selected: false,
          ),
          TvPlaybackChoice(
            value: 'da',
            title: 'Dansk',
            subtitle: 'WebVTT · aktiv',
            icon: Icons.closed_caption_rounded,
            selected: true,
          ),
          TvPlaybackChoice(
            value: 'en',
            title: 'English',
            subtitle: 'Tekstspor',
            icon: Icons.subtitles_rounded,
            selected: false,
          ),
        ],
      );
    case '06-live-tv.png':
      return TvLiveGuideScreen(
        api: api,
        liveTv: _PreviewLiveTv(),
        recordings: _PreviewRecordings(),
      );
    case '07-downloads.png':
      return TvDownloadsScreen(
        api: api,
        profileId: 'profile-1',
        offline: true,
        library: _PreviewOfflineLibrary(),
      );
    case '08-notifications.png':
      return TvNotificationScreen(
        api: api,
        notifications: _PreviewNotifications(),
      );
    case '09-settings.png':
      return TvSettingsScreen(api: api, preferences: _PreviewPreferences());
    case '10-recordings.png':
      return TvRecordingsScreen(api: api, recordings: _PreviewRecordings());
    case '11-profiles.png':
      return TvProfileScreen(controller: controller);
    case '12-login.png':
      return LoginScreen(controller: _loginController());
  }
  throw ArgumentError.value(fileName, 'fileName');
}

bool _chrome(String fileName) =>
    fileName != '01-hub.png' && fileName != '02-genre.png';

class _PreviewHarness {
  _PreviewHarness(this.tester);

  final WidgetTester tester;
  GlobalKey _key = GlobalKey();
  final _directory = Directory('artifacts/tv-previews');

  void clear() {
    if (!_directory.existsSync()) return;
    for (final entry in _directory.listSync()) {
      if (entry is File && entry.path.endsWith('.png')) entry.deleteSync();
    }
  }

  Future<void> pump(String fileName, Widget child, {bool chrome = true}) async {
    // ignore: avoid_print
    print('TV_PREVIEW pump $fileName');
    _key = GlobalKey();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    await tester.pumpWidget(
      RepaintBoundary(
        key: _key,
        child: AppUiModeScope(
          forceTvLayout: true,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: _theme(),
            home: chrome ? TvCinematicChrome(child: child) : child,
          ),
        ),
      ),
    );
    // ignore: avoid_print
    print('TV_PREVIEW pumped $fileName');
    await drain();
    await write(fileName);
  }

  Future<void> drain() async {
    for (var index = 0; index < 3; index++) {
      await tester.pump();
    }
  }

  Future<void> write(String fileName) async {
    // ignore: avoid_print
    print('TV_PREVIEW write $fileName');
    if (!_directory.existsSync()) _directory.createSync(recursive: true);
    final boundary =
        _key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    File(
      '${_directory.path}/$fileName',
    ).writeAsBytesSync(byteData!.buffer.asUint8List(), flush: true);
    // ignore: avoid_print
    print('TV_PREVIEW wrote $fileName');
  }
}

ThemeData _theme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: TvDesignTokens.gold,
        brightness: Brightness.dark,
        surface: TvDesignTokens.surface,
      ).copyWith(
        primary: TvDesignTokens.gold,
        secondary: TvDesignTokens.cyan,
        onPrimary: Colors.black,
        onSurface: Colors.white,
        surfaceContainerLow: TvDesignTokens.surfaceRaised,
        surfaceContainerHighest: TvDesignTokens.surfaceGlass,
      );
  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: scheme,
    scaffoldBackgroundColor: Colors.transparent,
    fontFamily: 'sans-serif-condensed',
    splashFactory: NoSplash.splashFactory,
    textTheme: const TextTheme(
      headlineLarge: TextStyle(
        fontFamily: 'sans-serif-condensed',
        fontWeight: FontWeight.w900,
        letterSpacing: -1.2,
        height: 0.98,
      ),
      headlineMedium: TextStyle(
        fontFamily: 'sans-serif-condensed',
        fontWeight: FontWeight.w900,
        letterSpacing: -0.6,
      ),
      titleLarge: TextStyle(fontWeight: FontWeight.w900),
      titleMedium: TextStyle(fontWeight: FontWeight.w800),
      bodyMedium: TextStyle(color: TvDesignTokens.textMuted),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xD9111820),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
        borderSide: const BorderSide(color: TvDesignTokens.panelBorderSoft),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
        borderSide: const BorderSide(color: TvDesignTokens.panelBorderSoft),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
        borderSide: const BorderSide(
          color: TvDesignTokens.goldSoft,
          width: 1.8,
        ),
      ),
      labelStyle: const TextStyle(color: Colors.white70),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: TvDesignTokens.gold,
        foregroundColor: Colors.black,
        elevation: 0,
        textStyle: const TextStyle(fontWeight: FontWeight.w900),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.white,
        side: const BorderSide(color: TvDesignTokens.panelBorder),
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
        ),
      ),
    ),
  );
}

ApiClient _api() => ApiClient(
  baseUrl: 'https://media.example.test/api/v1',
  storage: MemorySessionStorage(),
  httpClient: MockClient((_) async => http.Response('{}', 404)),
);

AppController _controller(ApiClient api) {
  final storage = MemorySessionStorage();
  return AppController(api: api, storage: storage)
    ..serverUrl = 'https://media.example.test/api/v1'
    ..stage = AppStage.library
    ..user = const SessionUser(
      id: 'user-1',
      email: 'viewer@example.test',
      displayName: 'Henrik',
      roles: ['customer'],
      activeProfileId: 'profile-1',
      profiles: [
        ProfileSummary(
          id: 'profile-1',
          name: 'Stuen',
          hasPin: true,
          isChildProfile: false,
        ),
        ProfileSummary(
          id: 'profile-2',
          name: 'Børn',
          hasPin: false,
          isChildProfile: true,
        ),
      ],
    );
}

AppController _loginController() {
  final storage = MemorySessionStorage();
  final client = MockClient((request) async {
    if (request.url.path.endsWith('/auth/tv/start')) {
      return http.Response(
        jsonEncode({
          'pairingId': '00000000-0000-4000-8000-000000000001',
          'status': 'pending',
          'userCode': 'ABCD-2345',
          'approveUrl': 'https://media.example.test/login/tv?token=preview',
          'approvePath': '/login/tv?token=preview',
          'pollToken': 'preview-poll-token-with-enough-length',
          'pollIntervalSeconds': 30,
          'expiresAt': DateTime.now()
              .add(const Duration(minutes: 10))
              .toUtc()
              .toIso8601String(),
        }),
        200,
      );
    }
    if (request.url.path.endsWith('/auth/tv/poll')) {
      return http.Response(
        jsonEncode({'status': 'pending', 'pollIntervalSeconds': 30}),
        200,
      );
    }
    return http.Response('{}', 404);
  });
  return AppController(
    api: ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: storage,
      httpClient: client,
    ),
    storage: storage,
  )..serverUrl = 'https://media.example.test/api/v1';
}

class _PreviewLibrary implements LibraryContract {
  _PreviewLibrary();

  late final movies = [
    _media('movie-1', 'Nordlys', 'movie', year: 2026, progress: 34),
    _media('movie-2', 'Kystlinjen', 'movie', year: 2025, hdr: 'HDR10'),
    _media('movie-3', 'Den sidste bro', 'movie', year: 2024),
    _media('movie-4', 'Mørke spor', 'movie', year: 2023),
    _media('movie-5', 'Station 9', 'movie', year: 2022),
  ];

  late final series = [
    _media('series-1', 'DNA', 'series', year: 2026, hdr: 'Dolby Vision'),
    _media('series-2', 'Sommer', 'series', year: 2025),
    _media('series-3', 'The Sinner', 'series', year: 2024),
    _media('series-4', 'Efterklang', 'series', year: 2023),
  ];

  late final episodes = [
    for (var episode = 1; episode <= 7; episode++)
      MediaItem(
        id: 'dna-s01e$episode',
        title: 'Afsnit $episode',
        type: 'episode',
        seriesTitle: 'DNA',
        seriesDisplayTitle: 'DNA',
        seasonNumber: 1,
        episodeNumber: episode,
        releaseYear: 2026,
      ),
    const MediaItem(
      id: 'sommer-s02e04',
      title: 'Starter om lidt',
      type: 'episode',
      seriesTitle: 'Sommer',
      seriesDisplayTitle: 'Sommer',
      seasonNumber: 2,
      episodeNumber: 4,
      releaseYear: 2025,
    ),
  ];

  @override
  Future<LibraryHomePayload> loadHomePayload() async {
    // ignore: avoid_print
    print('TV_PREVIEW loadHomePayload start');
    final payload = LibraryHomePayload(
      movieCatalog: _catalog(movies, [
        'Action',
        'Drama',
        'Dokumentar',
        'Familie',
      ]),
      seriesCatalog: _catalog(series, [
        'Drama',
        'Krimi',
        'Nordic Noir',
        'Familie',
      ]),
      releasedMovies: _catalog(movies.reversed.toList(), const []),
      releasedSeries: _catalog(series.reversed.toList(), const []),
      latestEpisodes: _catalog(episodes, const []),
      recentlyAddedSeries: collapseEpisodeSeriesCards(episodes),
      continueItems: [movies.first],
      watchlistItems: [series.first, movies[1]],
      recommendations: RecommendationFeed(
        hero: series.first,
        sections: [
          MediaSection(
            title: 'Stemningsfuldt drama',
            items: [movies[1], series[2]],
          ),
        ],
      ),
    );
    // ignore: avoid_print
    print('TV_PREVIEW loadHomePayload done');
    return payload;
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
    final items = mediaType == 'series' ? series : movies;
    return _catalog(
      items,
      mediaType == 'series' ? ['Drama', 'Krimi'] : ['Action', 'Drama'],
    );
  }

  @override
  Future<List<MediaItem>> loadContinue() async => [movies.first];

  @override
  Future<List<MediaItem>> loadWatchlist() async => [series.first, movies[1]];

  @override
  Future<RecommendationFeed> loadRecommendations() async =>
      RecommendationFeed(hero: series.first, sections: const []);

  @override
  Future<List<MediaItem>> search(String query, {int maxResults = 60}) async =>
      [...movies, ...series].take(maxResults).toList(growable: false);
}

MediaItem _media(
  String id,
  String title,
  String type, {
  int? year,
  double progress = 0,
  String? hdr,
}) => MediaItem(
  id: id,
  title: title,
  type: type,
  releaseYear: year,
  overview:
      'En kompakt TV-visning med tydelig fokus, store actions og cinematic metadata.',
  hdr: hdr,
  width: hdr == null ? 1920 : 3840,
  height: hdr == null ? 1080 : 2160,
  progress: progress <= 0
      ? null
      : PlaybackProgress(
          positionMs: (progress * 60000).round(),
          durationMs: 6000000,
          percent: progress,
        ),
);

LibraryCatalogPayload _catalog(
  List<MediaItem> items,
  List<String> categories,
) => LibraryCatalogPayload(
  items: items,
  categories: categories,
  page: 1,
  total: items.length,
  totalPages: 1,
);

class _PreviewTitleContract implements SeasonAwareTitleContract {
  late final payload = TitlePayload(
    experience: TitleExperience(
      mode: 'series',
      title: _media('series-1', 'Sommer', 'series', year: 2026),
      genres: const ['Kriminalitet', 'Drama'],
      selectedSeasonNumber: 2,
      resumeEpisode: null,
      nextEpisode: EpisodeItem(
        media: _episode('episode-4', 'Starter om lidt', 2, 4),
        watched: false,
        positionMs: 0,
        progressPercent: 0,
      ),
      people: const [
        TitlePerson(key: 'p1', name: 'Sofie Gråbøl', role: 'Hovedrolle'),
        TitlePerson(key: 'p2', name: 'Lars Mikkelsen', role: 'Skuespiller'),
        TitlePerson(
          key: 'p3',
          name: 'Annette K. Olesen',
          department: 'Instruktør',
        ),
      ],
      related: [
        _media('series-2', 'DNA', 'series', year: 2026),
        _media('series-3', 'The Sinner', 'series', year: 2024),
        _media('series-4', 'Efterklang', 'series', year: 2023),
      ],
      seasons: [
        SeasonItem(
          number: 1,
          label: 'Sæson 1',
          episodeCount: 2,
          episodes: [
            EpisodeItem(
              media: _episode('episode-1', 'Pilot', 1, 1),
              watched: true,
              positionMs: 0,
              progressPercent: 100,
            ),
            EpisodeItem(
              media: _episode('episode-2', 'Mørke dage', 1, 2),
              watched: false,
              positionMs: 0,
              progressPercent: 0,
            ),
          ],
        ),
        SeasonItem(
          number: 2,
          label: 'Sæson 2',
          episodeCount: 2,
          episodes: [
            EpisodeItem(
              media: _episode('episode-3', 'Nye spor', 2, 3),
              watched: false,
              positionMs: 880000,
              progressPercent: 44,
            ),
            EpisodeItem(
              media: _episode('episode-4', 'Starter om lidt', 2, 4),
              watched: false,
              positionMs: 0,
              progressPercent: 0,
            ),
          ],
        ),
      ],
    ),
    inWatchlist: true,
    watched: false,
  );

  @override
  Future<TitlePayload> loadTitle(String mediaId) async => payload;

  @override
  Future<TitlePayload> loadTitleSeason(
    String mediaId,
    int seasonNumber,
  ) async => payload;

  @override
  Future<void> setWatchlist(String mediaId, {required bool included}) async {}

  @override
  Future<void> setWatched(String mediaId, {required bool watched}) async {}
}

MediaItem _episode(String id, String title, int season, int episode) =>
    MediaItem(
      id: id,
      title: title,
      type: 'episode',
      seriesTitle: 'Sommer',
      seriesDisplayTitle: 'Sommer',
      seasonNumber: season,
      episodeNumber: episode,
      releaseYear: 2026,
      durationMs: 3900000,
    );

class _PreviewPlaybackController extends ChangeNotifier
    implements TvPlaybackController {
  PlaybackViewState _state = PlaybackViewState.initial;

  @override
  PlaybackViewState get state => _state;

  @override
  VideoPlayerController? get video => null;

  void markReady() {
    final subtitle = const SubtitleTrack(
      id: 'sub-da',
      label: 'Dansk',
      language: 'da',
      delivery: 'webvtt',
      forced: false,
    );
    final audio = const PlaybackAudioTrack(
      id: 'audio-da',
      streamIndex: 1,
      label: 'Dansk 5.1',
      language: 'da',
      codec: 'EAC3',
      channels: 6,
      selected: true,
    );
    _state = PlaybackViewState.initial.copyWith(
      status: 'Afspiller',
      loading: false,
      buffering: false,
      playing: true,
      initialized: true,
      position: const Duration(minutes: 18, seconds: 32),
      duration: const Duration(minutes: 56, seconds: 40),
      bufferedPosition: const Duration(minutes: 31),
      seekable: true,
      playbackRate: 1,
      qualityLabel: '1080p · Server',
      upscaleLabel: 'Opskalering: TV',
      subtitleText: 'Starter om lidt',
      selectedSubtitle: subtitle,
      selectedAudioTrack: audio,
      authorization: PlaybackAuthorization(
        sessionId: 'session-preview',
        streamToken: 'stream-preview',
        method: 'transcode',
        streamUrl: 'https://media.example.test/stream.m3u8',
        contentType: 'application/vnd.apple.mpegurl',
        subtitleTracks: [
          subtitle,
          const SubtitleTrack(
            id: 'sub-en',
            label: 'English',
            language: 'en',
            delivery: 'webvtt',
            forced: false,
          ),
        ],
        audioTracks: [
          audio,
          const PlaybackAudioTrack(
            id: 'audio-en',
            streamIndex: 2,
            label: 'English stereo',
            language: 'en',
            codec: 'AAC',
            channels: 2,
          ),
        ],
        selectedAudioTrackId: 'audio-da',
        renditions: const [
          Rendition(
            height: 2160,
            bitrate: 18000000,
            upscaled: false,
            hdr: true,
          ),
          Rendition(
            height: 1080,
            bitrate: 9000000,
            upscaled: false,
            hdr: false,
          ),
          Rendition(height: 720, bitrate: 4200000, upscaled: false, hdr: false),
        ],
        preferences: const PlaybackPreferences(
          qualityMode: 'auto',
          playbackRate: 1,
          preferredAudioLanguages: ['da'],
          preferredSubtitleLanguages: ['da'],
          subtitleMode: 'auto',
          autoplayNext: true,
          allowUpscale: true,
          upscaleMode: 'device',
        ),
      ),
      markers: const [
        PlaybackMarker(kind: 'intro', startMs: 90000, endMs: 165000),
      ],
    );
    notifyListeners();
  }

  @override
  Future<void> finish() async {}

  @override
  Future<void> initialize() async {}

  @override
  Future<void> retry() async {}

  @override
  Future<void> seekBy(Duration delta) async {}

  @override
  Future<void> seekTo(Duration position) async {}

  @override
  Future<void> setPlaybackRate(double rate) async {}

  @override
  Future<void> togglePlayback() async {}
}

class _PreviewLiveTv implements LiveTvContract {
  @override
  Future<LiveTvGuide> loadGuide({
    DateTime? from,
    DateTime? to,
    int page = 1,
    int pageSize = 75,
    String group = '',
    bool favoritesOnly = false,
  }) async {
    final start = DateTime.now().subtract(const Duration(minutes: 30));
    return LiveTvGuide(
      availableTotal: 3,
      total: 3,
      page: 1,
      totalPages: 1,
      groups: const [
        LiveTvGroup(name: 'Nyheder', count: 2),
        LiveTvGroup(name: 'Film', count: 1),
      ],
      channels: [
        _channel('1', 'BB News', 1, start),
        _channel('2', 'Nordic Drama', 12, start),
        _channel('3', 'Cinema 4K', 44, start),
      ],
    );
  }

  LiveTvChannel _channel(String id, String name, int number, DateTime start) =>
      LiveTvChannel(
        id: id,
        name: name,
        number: number,
        logoUrl: null,
        groupName: number == 44 ? 'Film' : 'Nyheder',
        favorite: number == 12,
        programs: [
          LiveTvProgram(
            id: '$id-current',
            startsAt: start,
            endsAt: start.add(const Duration(hours: 1)),
            title: number == 44 ? 'Aftenfilm' : 'Live program',
            subtitle: 'Direkte',
          ),
          LiveTvProgram(
            id: '$id-next',
            startsAt: start.add(const Duration(hours: 1)),
            endsAt: start.add(const Duration(hours: 2)),
            title: 'Næste udsendelse',
            subtitle: 'Om lidt',
          ),
        ],
      );

  @override
  Future<LiveTvSession> authorize(String channelId) =>
      throw UnimplementedError();

  @override
  Future<void> heartbeat(
    LiveTvSession session, {
    required String runtimeState,
    int bufferAheadMs = 0,
    int stallCount = 0,
  }) => throw UnimplementedError();

  @override
  Future<LiveTvStatus> pollStatus(LiveTvSession session) =>
      throw UnimplementedError();

  @override
  Future<void> release(LiveTvSession session) => throw UnimplementedError();

  @override
  Future<void> setFavorite(String channelId, {required bool favorite}) async {}

  @override
  Future<LiveTvSwitchResult> switchChannel(
    LiveTvSession session,
    LiveTvChannel channel,
    LiveTvDirection direction,
  ) => throw UnimplementedError();
}

class _PreviewRecordings implements LiveTvRecordingContract {
  @override
  Future<List<LiveTvRecording>> load() async {
    final now = DateTime.now();
    return [
      LiveTvRecording(
        id: 'rec-1',
        title: 'Aftenfilm',
        status: 'completed',
        progress: 1,
        startsAt: now.subtract(const Duration(days: 1, hours: 2)),
        endsAt: now.subtract(const Duration(days: 1)),
        ready: true,
        channelName: 'Cinema 4K',
        durationMs: 7200000,
        sizeBytes: 6400000000,
      ),
      LiveTvRecording(
        id: 'rec-2',
        title: 'Live program',
        status: 'recording',
        progress: 0.42,
        startsAt: now.subtract(const Duration(minutes: 25)),
        endsAt: now.add(const Duration(minutes: 35)),
        ready: false,
        channelName: 'BB News',
      ),
    ];
  }

  @override
  Future<LiveTvRecordingAuthorization> authorizePlayback(String recordingId) =>
      throw UnimplementedError();

  @override
  Future<LiveTvRecording> cancel(String recordingId) =>
      throw UnimplementedError();

  @override
  Future<void> remove(String recordingId) => throw UnimplementedError();

  @override
  Future<LiveTvRecording> scheduleProgram(
    String programId, {
    int prePaddingSeconds = 0,
    int postPaddingSeconds = 0,
  }) => throw UnimplementedError();
}

class _PreviewOfflineLibrary implements OfflineLibraryContract {
  final _changes = ChangeNotifier();

  late final _records = [
    OfflineDownloadRecord(
      id: 'download-1',
      mediaId: 'movie-1',
      profileId: 'profile-1',
      title: 'Nordlys',
      qualityHeight: 1080,
      status: 'downloaded',
      progress: 100,
      licenseExpiresAt: DateTime.now().add(const Duration(days: 5)),
      tokenExpiresAt: DateTime.now().add(const Duration(days: 5)),
      durationMs: 6200000,
      positionMs: 1480000,
      sizeBytes: 3200000000,
      localPath: 'preview.bbenc',
    ),
    OfflineDownloadRecord(
      id: 'download-2',
      mediaId: 'episode-4',
      profileId: 'profile-1',
      title: 'Starter om lidt',
      seriesTitle: 'Sommer',
      seasonNumber: 2,
      episodeNumber: 4,
      qualityHeight: 720,
      status: 'failed',
      progress: 64,
      licenseExpiresAt: DateTime.now().subtract(const Duration(days: 1)),
      tokenExpiresAt: DateTime.now().subtract(const Duration(days: 1)),
      durationMs: 3900000,
      positionMs: 0,
      sizeBytes: 1400000000,
      error: 'Licensen er udløbet',
    ),
  ];

  @override
  Listenable get changes => _changes;

  @override
  String? get error => null;

  @override
  bool get syncing => false;

  @override
  Future<void> initialize() async {}

  @override
  List<OfflineDownloadRecord> recordsForProfile(String? profileId) =>
      _records.where((record) => record.profileId == profileId).toList();

  @override
  Future<List<OfflineDownloadRecord>> loadForProfile(String? profileId) async =>
      recordsForProfile(profileId);

  @override
  Future<bool> hasAny(String profileId) async =>
      _records.any((record) => record.profileId == profileId);

  @override
  Future<bool> hasPlayable(String profileId) async => true;

  @override
  Future<OfflineDownloadRecord> queue(String mediaId, int qualityHeight) =>
      throw UnimplementedError();

  @override
  Future<void> remove(OfflineDownloadRecord record) async {}

  @override
  Future<void> saveProgress(
    OfflineDownloadRecord record,
    int positionMs, {
    bool completed = false,
  }) async {}

  @override
  Future<void> sync() async {}
}

class _PreviewNotifications implements NotificationContract {
  var _items = [
    ClientNotification(
      id: 'n1',
      title: 'Ny episode er klar',
      body: 'DNA har 7 nye afsnit i biblioteket.',
      createdAt: DateTime.now().subtract(const Duration(minutes: 18)),
    ),
    ClientNotification(
      id: 'n2',
      title: 'Download færdig',
      body: 'Nordlys er klar til offline-afspilning.',
      createdAt: DateTime.now().subtract(const Duration(hours: 2)),
      readAt: DateTime.now().subtract(const Duration(hours: 1)),
    ),
  ];

  @override
  Future<List<ClientNotification>> load() async => _items;

  @override
  Future<void> markAllRead() async {
    final now = DateTime.now();
    _items = _items.map((item) => item.copyWith(readAt: now)).toList();
  }

  @override
  Future<void> markRead(String id) async {
    final now = DateTime.now();
    _items = [
      for (final item in _items)
        item.id == id ? item.copyWith(readAt: now) : item,
    ];
  }

  @override
  int unreadCount(Iterable<ClientNotification> notifications) =>
      notifications.where((item) => item.unread).length;
}

class _PreviewPreferences implements ClientPreferencesContract {
  @override
  Future<ClientPreferences> load() async => const ClientPreferences(
    profile: ProfilePreferences(
      preferredAudioLanguages: ['da'],
      preferredSubtitleLanguages: ['da'],
      subtitleMode: 'auto',
      subtitleStyle: 'broadcast',
      autoplayNext: true,
      recommendationsEnabled: true,
    ),
    device: DevicePreferences(
      qualityMode: 'auto',
      fixedQualityHeight: 1080,
      allowUpscale: true,
      upscaleMode: 'device',
      bufferProfile: 'auto',
      dataSaver: false,
      playbackRate: 1,
      hdrMode: 'auto',
    ),
  );

  @override
  Future<AppRelease?> checkForUpdate() async => null;

  @override
  Future<bool> installUpdate(AppRelease release) async => false;

  @override
  Future<void> saveDevicePreferences(DevicePreferences preferences) async {}

  @override
  Future<void> saveProfilePreferences(ProfilePreferences preferences) async {}
}
