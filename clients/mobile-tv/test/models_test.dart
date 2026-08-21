import 'package:boltbytes_media/src/core/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('session parses profiles and active profile from auth response', () {
    final session = SessionUser.fromJson({
      'user': {
        'id': 'user-1',
        'email': 'kunde@example.test',
        'displayName': 'Kunde',
      },
      'roles': ['customer'],
      'profiles': [
        {
          'id': 'profile-1',
          'name': 'Anna',
          'hasPin': true,
          'isChildProfile': false,
        },
      ],
      'activeProfileId': 'profile-1',
    });

    expect(session.email, 'kunde@example.test');
    expect(session.activeProfile?.name, 'Anna');
    expect(session.activeProfile?.hasPin, isTrue);
  });

  test('continue item keeps clean title and absolute progress', () {
    final media = MediaItem.fromJson({
      'id': 'media-1',
      'title': 'Pilot',
      'type': 'episode',
      'seriesDisplayTitle': 'FBI',
      'seasonNumber': 1,
      'episodeNumber': 1,
      'width': 3840,
      'hdr': 'hdr10',
      'progress': {'positionMs': 1200000, 'durationMs': 2400000, 'percent': 50},
    });

    expect(media.displayTitle, 'FBI');
    expect(media.episodeLabel, 'S01E01 · Pilot');
    expect(media.progress?.positionMs, 1200000);
    expect(media.is4k, isTrue);
    expect(media.isHdr, isTrue);
  });

  test('playback authorization parses adaptive and subtitle contracts', () {
    final authorization = PlaybackAuthorization.fromJson({
      'sessionId': 'session-1',
      'streamToken': 'token',
      'method': 'transcode',
      'streamUrl':
          '/api/v1/playback/sessions/session-1/hls/master.m3u8?token=x',
      'contentType': 'application/x-mpegURL',
      'subtitleTracks': [
        {
          'id': 'da',
          'label': 'Dansk',
          'language': 'da',
          'delivery': 'webvtt',
          'forced': false,
          'src': '/sub.vtt',
        },
      ],
      'adaptiveQuality': {
        'renditions': [
          {'height': 720, 'bitrate': 3000000, 'upscaled': false, 'hdr': false},
          {'height': 1080, 'bitrate': 6000000, 'upscaled': true, 'hdr': false},
        ],
      },
      'playbackPreferences': {
        'qualityMode': 'auto',
        'playbackRate': 1,
        'preferredSubtitleLanguages': ['da', 'en'],
        'subtitleMode': 'auto',
        'autoplayNext': true,
      },
      'videoProfile': {
        'source': {'height': 720, 'bitrate': 3500000},
      },
    });

    expect(authorization.isHls, isTrue);
    expect(authorization.renditions, hasLength(2));
    expect(authorization.subtitleTracks.single.isText, isTrue);
    expect(authorization.preferences.preferredSubtitleLanguages.first, 'da');
  });

  test('automatic subtitles only select a forced preferred track', () {
    final tracks = [
      const SubtitleTrack(
        id: 'normal-da',
        label: 'Dansk',
        language: 'da',
        delivery: 'webvtt',
        forced: false,
        src: '/normal.vtt',
      ),
      const SubtitleTrack(
        id: 'forced-da',
        label: 'Dansk (tvungen)',
        language: 'da',
        delivery: 'webvtt',
        forced: true,
        src: '/forced.vtt',
      ),
    ];
    const automatic = PlaybackPreferences(
      qualityMode: 'auto',
      playbackRate: 1,
      preferredSubtitleLanguages: ['da', 'en'],
      subtitleMode: 'auto',
      autoplayNext: true,
    );
    const always = PlaybackPreferences(
      qualityMode: 'auto',
      playbackRate: 1,
      preferredSubtitleLanguages: ['da', 'en'],
      subtitleMode: 'always',
      autoplayNext: true,
    );
    const off = PlaybackPreferences(
      qualityMode: 'auto',
      playbackRate: 1,
      preferredSubtitleLanguages: ['da', 'en'],
      subtitleMode: 'off',
      autoplayNext: true,
    );

    expect(preferredSubtitleTrack(tracks, automatic)?.id, 'forced-da');
    expect(preferredSubtitleTrack(tracks, always)?.id, 'normal-da');
    expect(preferredSubtitleTrack(tracks, off), isNull);
  });

  test('series experience preserves seasons and resume episode', () {
    final experience = TitleExperience.fromJson({
      'mode': 'series',
      'title': {
        'id': 'series-1',
        'displayTitle': 'FBI',
        'type': 'series',
        'genres': ['Drama'],
      },
      'series': {
        'selectedSeasonNumber': 1,
        'resumeEpisode': {
          'id': 'episode-1',
          'title': 'Pilot',
          'seasonNumber': 1,
          'episodeNumber': 1,
          'positionMs': 300000,
        },
        'seasons': [
          {
            'number': 1,
            'label': 'Sæson 1',
            'episodeCount': 1,
            'episodes': [
              {
                'id': 'episode-1',
                'title': 'Pilot',
                'seasonNumber': 1,
                'episodeNumber': 1,
              },
            ],
          },
        ],
      },
    });

    expect(experience.mode, 'series');
    expect(
      experience.seasons.single.episodes.single.media.episodeLabel,
      'S01E01 · Pilot',
    );
    expect(experience.resumeEpisode?.positionMs, 300000);
  });
}
