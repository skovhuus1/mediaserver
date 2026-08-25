import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/shared_core/title_contract.dart';
import 'package:boltbytes_media/src/tv/screens/tv_title_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/memory_session_storage.dart';

void main() {
  testWidgets('TV title navigates season rows and launches selected episode', (
    tester,
  ) async {
    _setTvViewport(tester);
    final contract = _FakeTitleContract();
    final played = <String>[];

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvTitleScreen(
          api: _api(),
          media: contract.payload.experience.title,
          titleContract: contract,
          onPlay: (media, position) async {
            played.add('${media.id}:$position');
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-title-action-0');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-title-section-10-item-0',
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();
    expect(find.textContaining('S02E01'), findsOneWidget);
    expect(find.textContaining('S01E01'), findsNothing);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      'tv-title-section-100-item-0',
    );
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();

    expect(played, ['episode-2:12000']);
    expect(contract.loadCalls, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV title toggles shared watchlist state from action row', (
    tester,
  ) async {
    _setTvViewport(tester);
    final contract = _FakeTitleContract();
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvTitleScreen(
          api: _api(),
          media: contract.payload.experience.title,
          titleContract: contract,
          onPlay: (_, _) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();

    expect(contract.watchlistValues, [true]);
    expect(find.text('Fjern fra Min liste'), findsOneWidget);
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'tv-title-action-2');
  });

  testWidgets('TV title renders cast and similar series discovery', (
    tester,
  ) async {
    _setTvViewport(tester);
    final contract = _FakeTitleContract();

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvTitleScreen(
          api: _api(),
          media: contract.payload.experience.title,
          titleContract: contract,
          onPlay: (_, _) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Skuespillere og crew'), findsOneWidget);
    expect(find.text('Lignende serier'), findsOneWidget);
    expect(find.text('Test Skuespiller'), findsOneWidget);
    expect(find.text('Naboserien'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TV title hydrates counted seasons and keeps simple labels', (
    tester,
  ) async {
    _setTvViewport(tester);
    final contract = _HydratingTitleContract();

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: TvTitleScreen(
          api: _api(),
          media: contract.initial.experience.title,
          titleContract: contract,
          onPlay: (_, _) async {},
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(find.text('Sæson 1'), findsOneWidget);
    expect(find.text('Sæson 1 · 1'), findsNothing);

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pumpAndSettle();

    expect(contract.seasonLoads, [2]);
    expect(find.textContaining('S02E01'), findsOneWidget);
    expect(find.text('Der er ingen afsnit i denne sæson.'), findsNothing);
    expect(find.text('Sæson 2'), findsOneWidget);
    expect(find.text('Sæson 2 · 1'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

void _setTvViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1920, 1080);
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

ApiClient _api() => ApiClient(
  baseUrl: 'https://media.example.test/api/v1',
  storage: MemorySessionStorage(),
);

class _FakeTitleContract implements TitleContract {
  int loadCalls = 0;
  final List<bool> watchlistValues = [];
  final List<bool> watchedValues = [];

  late final TitlePayload payload = TitlePayload(
    experience: const TitleExperience(
      mode: 'series',
      title: MediaItem(
        id: 'series-1',
        title: 'Testserien',
        type: 'series',
        overview: 'En serie bygget til TV-navigation.',
        releaseYear: 2026,
      ),
      genres: ['Drama'],
      selectedSeasonNumber: 1,
      resumeEpisode: null,
      nextEpisode: null,
      people: [
        TitlePerson(
          key: 'person-1',
          name: 'Test Skuespiller',
          role: 'Hovedrolle',
        ),
      ],
      related: [
        MediaItem(
          id: 'series-2',
          title: 'Naboserien',
          type: 'series',
          overview: 'En lignende serie.',
        ),
      ],
      seasons: [
        SeasonItem(
          number: 1,
          label: 'Sæson 1',
          episodeCount: 1,
          episodes: [
            EpisodeItem(
              media: MediaItem(
                id: 'episode-1',
                title: 'Pilot',
                type: 'episode',
                seriesTitle: 'Testserien',
                seasonNumber: 1,
                episodeNumber: 1,
              ),
              watched: false,
              positionMs: 0,
              progressPercent: 0,
            ),
          ],
        ),
        SeasonItem(
          number: 2,
          label: 'Sæson 2',
          episodeCount: 1,
          episodes: [
            EpisodeItem(
              media: MediaItem(
                id: 'episode-2',
                title: 'Finale',
                type: 'episode',
                seriesTitle: 'Testserien',
                seasonNumber: 2,
                episodeNumber: 1,
              ),
              watched: false,
              positionMs: 12000,
              progressPercent: 10,
            ),
          ],
        ),
      ],
    ),
    inWatchlist: false,
    watched: false,
  );

  @override
  Future<TitlePayload> loadTitle(String mediaId) async {
    loadCalls++;
    return TitlePayload(
      experience: payload.experience,
      inWatchlist: watchlistValues.isEmpty ? false : watchlistValues.last,
      watched: watchedValues.isEmpty ? false : watchedValues.last,
    );
  }

  @override
  Future<void> setWatchlist(String mediaId, {required bool included}) async {
    watchlistValues.add(included);
  }

  @override
  Future<void> setWatched(String mediaId, {required bool watched}) async {
    watchedValues.add(watched);
  }
}

class _HydratingTitleContract implements SeasonAwareTitleContract {
  final List<int> seasonLoads = [];
  final List<bool> watchlistValues = [];
  final List<bool> watchedValues = [];

  late final TitlePayload initial = _payload(
    selectedSeasonNumber: 1,
    hydrateSeason2: false,
  );

  @override
  Future<TitlePayload> loadTitle(String mediaId) async => initial;

  @override
  Future<TitlePayload> loadTitleSeason(String mediaId, int seasonNumber) async {
    seasonLoads.add(seasonNumber);
    return _payload(selectedSeasonNumber: seasonNumber, hydrateSeason2: true);
  }

  @override
  Future<void> setWatchlist(String mediaId, {required bool included}) async {
    watchlistValues.add(included);
  }

  @override
  Future<void> setWatched(String mediaId, {required bool watched}) async {
    watchedValues.add(watched);
  }

  TitlePayload _payload({
    required int selectedSeasonNumber,
    required bool hydrateSeason2,
  }) => TitlePayload(
    experience: TitleExperience(
      mode: 'series',
      title: const MediaItem(
        id: 'series-hydrate',
        title: 'Hydrer serien',
        type: 'series',
        overview: 'En serie med lazy-loadede sæsoner.',
      ),
      genres: const ['Drama'],
      selectedSeasonNumber: selectedSeasonNumber,
      resumeEpisode: null,
      nextEpisode: null,
      seasons: [
        SeasonItem(
          number: 1,
          label: 'Sæson 1',
          episodeCount: 1,
          episodes: const [
            EpisodeItem(
              media: MediaItem(
                id: 'hydrate-s01e01',
                title: 'Pilot',
                type: 'episode',
                seriesTitle: 'Hydrer serien',
                seasonNumber: 1,
                episodeNumber: 1,
              ),
              watched: false,
              positionMs: 0,
              progressPercent: 0,
            ),
          ],
        ),
        SeasonItem(
          number: 2,
          label: 'Sæson 2',
          episodeCount: 1,
          episodes: hydrateSeason2
              ? const [
                  EpisodeItem(
                    media: MediaItem(
                      id: 'hydrate-s02e01',
                      title: 'Retur',
                      type: 'episode',
                      seriesTitle: 'Hydrer serien',
                      seasonNumber: 2,
                      episodeNumber: 1,
                    ),
                    watched: false,
                    positionMs: 0,
                    progressPercent: 0,
                  ),
                ]
              : const [],
        ),
      ],
    ),
    inWatchlist: watchlistValues.isEmpty ? false : watchlistValues.last,
    watched: watchedValues.isEmpty ? false : watchedValues.last,
  );
}
