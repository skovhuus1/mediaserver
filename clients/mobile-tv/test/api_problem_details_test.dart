import 'dart:convert';

import 'package:boltbytes_media/src/core/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/memory_session_storage.dart';

void main() {
  test('validation errors retain field details and correlation id', () async {
    final api = ApiClient(
      baseUrl: 'https://media.example.test/api/v1',
      storage: MemorySessionStorage(),
      httpClient: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'code': 'validation_failed',
            'message': 'Request validation failed',
            'details': [
              {
                'property': 'deviceId',
                'constraints': {'isUuid': 'deviceId must be a UUID'},
              },
            ],
            'correlationId': 'correlation-123',
          }),
          400,
        ),
      ),
    );

    await expectLater(
      api.postJson('/playback/authorize', const {}),
      throwsA(
        isA<ApiException>()
            .having(
              (error) => error.correlationId,
              'correlation',
              'correlation-123',
            )
            .having(
              (error) => error.details.join(' '),
              'details',
              contains('deviceId'),
            ),
      ),
    );
  });
}
