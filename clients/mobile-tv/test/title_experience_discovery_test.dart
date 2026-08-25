import 'package:boltbytes_media/src/core/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('title experience preserves people and related titles', () {
    final experience = TitleExperience.fromJson({
      'mode': 'series',
      'title': {
        'id': 'series-1',
        'displayTitle': 'Hovedserie',
        'type': 'series',
        'genres': <String>['Drama'],
        'rating': 7.3,
        'container': 'mp4',
        'videoCodec': 'h264',
        'audioCodec': 'aac',
      },
      'series': {'seasons': <dynamic>[]},
      'discovery': {
        'people': [
          {
            'key': 'tmdb-1-actor',
            'name': 'Anna Actor',
            'role': 'Efterforsker',
            'department': 'Acting',
            'profilePath': '/actor.jpg',
          },
        ],
      },
      'related': [
        {
          'mediaId': 'series-2',
          'title': 'Lignende serie',
          'type': 'series',
          'reason': 'Med samme medvirkende',
        },
      ],
    });

    expect(experience.people, hasLength(1));
    expect(experience.title.rating, 7.3);
    expect(experience.title.container, 'mp4');
    expect(experience.title.videoCodec, 'h264');
    expect(experience.people.single.name, 'Anna Actor');
    expect(experience.people.single.role, 'Efterforsker');
    expect(experience.related, hasLength(1));
    expect(experience.related.single.id, 'series-2');
    expect(experience.related.single.reason, 'Med samme medvirkende');
  });
}
