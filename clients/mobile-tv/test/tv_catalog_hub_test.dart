import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/models.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:boltbytes_media/src/screens/library_screen.dart';
import 'package:boltbytes_media/src/state/app_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemorySessionStorage implements DeviceSessionStorage {
  @override
  Future<void> clearCachedUser() async {}

  @override
  Future<void> clearTokens() async {}

  @override
  Future<String> deviceFingerprint() async => 'tv-catalog-test-device';

  @override
  Future<String?> readAccessToken() async => null;

  @override
  Future<dynamic> readCachedUser() async => null;

  @override
  Future<String?> readRefreshToken() async => null;

  @override
  Future<String?> readServerUrl() async => null;

  @override
  Future<void> writeCachedUser(dynamic value) async {}

  @override
  Future<void> writeServerUrl(String value) async {}

  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'TV movie and series hubs expose discovery rows, genres and pagination',
    (tester) async {
      tester.view.physicalSize = const Size(1920, 1080);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final requests = <Uri>[];
      final storage = _MemorySessionStorage();
      final api = ApiClient(
        baseUrl: 'https://media.example.test/api/v1',
        storage: storage,
        httpClient: MockClient((request) async {
          requests.add(request.url);
          if (request.url.path.endsWith('/media/catalog')) {
            return http.Response(
              jsonEncode(_catalogResponse(request.url.queryParameters)),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          if (request.url.path.endsWith('/playback/history/continue') ||
              request.url.path.endsWith('/playback/watchlist')) {
            return http.Response('[]', 200);
          }
          if (request.url.path.endsWith('/media/recommendations')) {
            return http.Response(
              jsonEncode({'hero': null, 'sections': []}),
              200,
            );
          }
          return http.Response('{}', 404);
        }),
      );
      final controller = AppController(api: api, storage: storage)
        ..stage = AppStage.library
        ..user = SessionUser.fromJson({
          'id': 'user-1',
          'email': 'viewer@example.test',
          'displayName': 'Viewer',
          'roles': ['customer'],
          'activeProfileId': 'profile-1',
          'profiles': [
            {
              'id': 'profile-1',
              'name': 'Stuen',
              'hasPin': false,
              'isChildProfile': false,
            },
          ],
        });

      await tester.pumpWidget(
        MaterialApp(
          theme: ThemeData.dark(useMaterial3: true),
          home: LibraryScreen(controller: controller),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        tester.getSize(find.byKey(const ValueKey('tv-side-rail'))).width,
        82,
      );
      expect(
        requests,
        contains(
          isA<Uri>().having(
            (uri) => uri.queryParameters,
            'movie newest query',
            containsPair('pageSize', '100'),
          ),
        ),
      );

      await tester.tap(find.byKey(const ValueKey('tv-navigation-1')));
      await tester.pumpAndSettle();

      expect(find.text('Gå på opdagelse'), findsOneWidget);
      expect(find.text('Action'), findsOneWidget);
      expect(find.text('Nyeste film'), findsOneWidget);
      expect(find.text('Senest udgivne film'), findsOneWidget);

      await tester.tap(find.text('Action'));
      await tester.pumpAndSettle();

      expect(find.text('Film · Action'), findsOneWidget);
      expect(
        requests.any(
          (uri) =>
              uri.queryParameters['type'] == 'movie' &&
              uri.queryParameters['category'] == 'Action' &&
              uri.queryParameters['pageSize'] == '100',
        ),
        isTrue,
      );

      await tester.pageBack();
      await tester.pumpAndSettle();
      final movieHub = find.byKey(
        const PageStorageKey<String>('catalog-hub-movie'),
      );
      final loadMore = find.byKey(const ValueKey('load-more-movie'));
      await tester.dragUntilVisible(loadMore, movieHub, const Offset(0, -600));
      expect(find.text('Alle film (245)'), findsOneWidget);
      await tester.tap(loadMore);
      await tester.pumpAndSettle();
      expect(
        requests.any(
          (uri) =>
              uri.queryParameters['type'] == 'movie' &&
              uri.queryParameters['page'] == '2' &&
              uri.queryParameters['sort'] == 'newest',
        ),
        isTrue,
      );

      await tester.tap(find.byKey(const ValueKey('tv-navigation-2')));
      await tester.pumpAndSettle();

      expect(find.text('Nyeste serier'), findsOneWidget);
      final seriesHub = find.byKey(
        const PageStorageKey<String>('catalog-hub-series'),
      );
      await tester.dragUntilVisible(
        find.text('Nye episoder'),
        seriesHub,
        const Offset(0, -500),
      );
      expect(find.text('Senest udgivne serier'), findsOneWidget);
      expect(find.text('Nye episoder'), findsOneWidget);
      await tester.dragUntilVisible(
        find.text('Alle serier (5032)'),
        seriesHub,
        const Offset(0, -500),
      );
      expect(find.text('Alle serier (5032)'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

Map<String, dynamic> _catalogResponse(Map<String, String> query) {
  final type = query['type'] ?? 'movie';
  final sort = query['sort'] ?? 'newest';
  final page = int.tryParse(query['page'] ?? '1') ?? 1;
  final category = query['category'];
  final total = category != null
      ? 120
      : switch (type) {
          'movie' => 245,
          'series' => 5032,
          _ => 418,
        };
  final prefix = type == 'episode'
      ? 'Episode'
      : type == 'series'
      ? 'Serie'
      : 'Film';
  return {
    'items': List.generate(6, (index) {
      final number = ((page - 1) * 100) + index + 1;
      return {
        'id': '$type-$sort-$number',
        'type': type,
        'title': '$prefix $number',
        if (type == 'episode') ...{
          'seriesDisplayTitle': 'Serie ${index + 1}',
          'seasonNumber': 1,
          'episodeNumber': number,
        },
        'overview': 'En katalogtitel til TV-hubben.',
        'releaseYear': 2026,
        'category': category ?? (index.isEven ? 'Action' : 'Drama'),
      };
    }),
    'page': page,
    'pageSize': 100,
    'total': total,
    'totalPages': (total / 100).ceil(),
    'facets': {
      'categories': ['Action', 'Drama', 'Krimi'],
      'libraries': [],
    },
  };
}
