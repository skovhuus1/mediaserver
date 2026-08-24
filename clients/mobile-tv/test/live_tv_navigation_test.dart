import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:boltbytes_media/src/core/session_store.dart';
import 'package:boltbytes_media/src/screens/live_tv_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _MemoryStorage implements SessionStorage {
  @override
  Future<void> clearTokens() async {}
  @override
  Future<String?> readAccessToken() async => null;
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<void> writeTokens(String accessToken, String refreshToken) async {}
}

void main() {
  test('Live TV contracts parse guide, EPG and playback session', () {
    final guide = LiveTvGuide.fromJson(_guideJson());
    expect(guide.availableTotal, 2);
    expect(guide.channels, hasLength(2));
    expect(guide.channels.first.currentProgram?.title, 'TV Avisen');

    final session = LiveTvSession.fromJson({
      'leaseId': 'lease-1',
      'method': 'direct_stream',
      'status': 'preparing',
      'streamToken': 'secret',
      'streamUrl': 'https://media.example/live.m3u8',
      'statusUrl': 'https://media.example/status',
      'heartbeatUrl': 'https://media.example/heartbeat',
      'releaseUrl': 'https://media.example/release',
    });
    expect(session.leaseId, 'lease-1');
    expect(session.method, 'direct_stream');
  });

  testWidgets('TV guide moves channel focus with D-pad', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final api = ApiClient(
      baseUrl: 'https://media.example/api/v1',
      storage: _MemoryStorage(),
      httpClient: MockClient((request) async {
        if (request.url.path.endsWith('/live-tv/guide')) {
          return http.Response(
            jsonEncode(_guideJson()),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData.dark(useMaterial3: true),
        home: Scaffold(body: LiveTvView(api: api)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('live-detail-dr1')), findsOneWidget);
    expect(find.text('TV Avisen'), findsWidgets);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('live-detail-tv2')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

Map<String, dynamic> _guideJson() {
  final now = DateTime.now().toUtc();
  Map<String, dynamic> program(String id, String title) => {
    'id': id,
    'startsAt': now.subtract(const Duration(minutes: 20)).toIso8601String(),
    'endsAt': now.add(const Duration(minutes: 40)).toIso8601String(),
    'title': title,
    'subtitle': null,
  };
  return {
    'availableTotal': 2,
    'total': 2,
    'page': 1,
    'totalPages': 1,
    'groups': [
      {'name': 'Danmark', 'count': 2},
    ],
    'channels': [
      {
        'id': 'dr1',
        'name': 'DR 1',
        'number': 1,
        'logoUrl': null,
        'groupName': 'Danmark',
        'favorite': true,
        'programs': [program('p1', 'TV Avisen')],
      },
      {
        'id': 'tv2',
        'name': 'TV 2',
        'number': 2,
        'logoUrl': null,
        'groupName': 'Danmark',
        'favorite': false,
        'programs': [program('p2', 'Nyhederne')],
      },
    ],
  };
}
