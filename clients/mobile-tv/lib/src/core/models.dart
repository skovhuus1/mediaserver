Map<String, dynamic> jsonMap(dynamic value) =>
    value is Map<String, dynamic> ? value : <String, dynamic>{};

List<dynamic> jsonList(dynamic value) => value is List ? value : const [];

String? stringValue(dynamic value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}

int? intValue(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.round();
  return int.tryParse(value?.toString() ?? '');
}

double? doubleValue(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '');
}

bool boolValue(dynamic value, {bool fallback = false}) =>
    value is bool ? value : fallback;

class ProfileSummary {
  const ProfileSummary({
    required this.id,
    required this.name,
    required this.hasPin,
    required this.isChildProfile,
  });

  final String id;
  final String name;
  final bool hasPin;
  final bool isChildProfile;

  factory ProfileSummary.fromJson(dynamic value) {
    final json = jsonMap(value);
    return ProfileSummary(
      id: stringValue(json['id']) ?? '',
      name: stringValue(json['name']) ?? 'Profil',
      hasPin: boolValue(json['hasPin']),
      isChildProfile: boolValue(json['isChildProfile']),
    );
  }
}

class SessionUser {
  const SessionUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.roles,
    required this.profiles,
    required this.activeProfileId,
  });

  final String id;
  final String email;
  final String displayName;
  final List<String> roles;
  final List<ProfileSummary> profiles;
  final String? activeProfileId;

  ProfileSummary? get activeProfile {
    for (final profile in profiles) {
      if (profile.id == activeProfileId) return profile;
    }
    return null;
  }

  factory SessionUser.fromJson(dynamic value) {
    final json = jsonMap(value);
    final nested = jsonMap(json['user']);
    final source = nested.isEmpty ? json : {...json, ...nested};
    final rawRoles = jsonList(json['roles'] ?? source['roles']);
    return SessionUser(
      id: stringValue(source['id']) ?? '',
      email: stringValue(source['email']) ?? '',
      displayName:
          stringValue(source['displayName'] ?? source['name']) ?? 'Bruger',
      roles: rawRoles
          .map(
            (role) =>
                role is Map ? stringValue(role['name']) : stringValue(role),
          )
          .whereType<String>()
          .toList(growable: false),
      profiles: jsonList(json['profiles'] ?? source['profiles'])
          .map(ProfileSummary.fromJson)
          .where((profile) => profile.id.isNotEmpty)
          .toList(growable: false),
      activeProfileId: stringValue(
        json['activeProfileId'] ?? source['activeProfileId'],
      ),
    );
  }
}

class TvLoginPairing {
  const TvLoginPairing({
    required this.pairingId,
    required this.status,
    required this.userCode,
    required this.approveUrl,
    required this.approvePath,
    required this.pollToken,
    required this.pollIntervalSeconds,
    required this.expiresAt,
  });

  final String pairingId;
  final String status;
  final String userCode;
  final String approveUrl;
  final String approvePath;
  final String pollToken;
  final int pollIntervalSeconds;
  final DateTime expiresAt;

  factory TvLoginPairing.fromJson(dynamic value) {
    final json = jsonMap(value);
    final expiresAt =
        DateTime.tryParse(stringValue(json['expiresAt']) ?? '') ??
        DateTime.now().add(const Duration(minutes: 5));
    return TvLoginPairing(
      pairingId: stringValue(json['pairingId']) ?? '',
      status: stringValue(json['status']) ?? 'pending',
      userCode: stringValue(json['userCode']) ?? '',
      approveUrl: stringValue(json['approveUrl']) ?? '',
      approvePath: stringValue(json['approvePath']) ?? '',
      pollToken: stringValue(json['pollToken']) ?? '',
      pollIntervalSeconds: intValue(json['pollIntervalSeconds']) ?? 2,
      expiresAt: expiresAt,
    );
  }
}

class TvLoginPollResult {
  const TvLoginPollResult({
    required this.status,
    this.pollIntervalSeconds,
    this.expiresAt,
  });

  final String status;
  final int? pollIntervalSeconds;
  final DateTime? expiresAt;

  bool get isApproved => status == 'approved';
  bool get isPending => status == 'pending';
  bool get isExpired => status == 'expired';
  bool get isConsumed => status == 'consumed';

  factory TvLoginPollResult.fromJson(dynamic value) {
    final json = jsonMap(value);
    return TvLoginPollResult(
      status: stringValue(json['status']) ?? 'pending',
      pollIntervalSeconds: intValue(json['pollIntervalSeconds']),
      expiresAt: DateTime.tryParse(stringValue(json['expiresAt']) ?? ''),
    );
  }
}

class PlaybackProgress {
  const PlaybackProgress({
    required this.positionMs,
    required this.durationMs,
    required this.percent,
  });

  final int positionMs;
  final int durationMs;
  final double percent;

  factory PlaybackProgress.fromJson(dynamic value) {
    final json = jsonMap(value);
    final position = intValue(json['positionMs']) ?? 0;
    final duration = intValue(json['durationMs']) ?? 0;
    return PlaybackProgress(
      positionMs: position,
      durationMs: duration,
      percent:
          doubleValue(json['percent']) ??
          (duration > 0 ? position / duration * 100 : 0),
    );
  }
}

class MediaItem {
  const MediaItem({
    required this.id,
    required this.title,
    required this.type,
    this.seriesTitle,
    this.seriesDisplayTitle,
    this.seriesMetadataProviderId,
    this.seasonNumber,
    this.episodeNumber,
    this.releaseYear,
    this.overview,
    this.posterPath,
    this.backdropPath,
    this.width,
    this.height,
    this.hdr,
    this.durationMs,
    this.progress,
    this.reason,
  });

  final String id;
  final String title;
  final String type;
  final String? seriesTitle;
  final String? seriesDisplayTitle;
  final String? seriesMetadataProviderId;
  final int? seasonNumber;
  final int? episodeNumber;
  final int? releaseYear;
  final String? overview;
  final String? posterPath;
  final String? backdropPath;
  final int? width;
  final int? height;
  final String? hdr;
  final int? durationMs;
  final PlaybackProgress? progress;
  final String? reason;

  bool get isEpisode => type == 'episode' || seasonNumber != null;
  bool get isSeries => type == 'series';
  bool get is4k => (width ?? 0) >= 3840 || (height ?? 0) >= 2160;
  bool get isHdr => hdr != null && hdr!.isNotEmpty;

  String get displayTitle =>
      isEpisode ? (seriesDisplayTitle ?? seriesTitle ?? title) : title;

  String get episodeLabel {
    if (!isEpisode) return '';
    final season = (seasonNumber ?? 0).toString().padLeft(2, '0');
    final episode = (episodeNumber ?? 0).toString().padLeft(2, '0');
    return 'S${season}E$episode · $title';
  }

  factory MediaItem.fromJson(dynamic value, {String? reason}) {
    final outer = jsonMap(value);
    final nested = jsonMap(outer['media']);
    final json = nested.isEmpty ? outer : {...outer, ...nested};
    final file = jsonMap(json['file']);
    return MediaItem(
      id: stringValue(json['id'] ?? json['mediaId']) ?? '',
      title:
          stringValue(json['displayTitle'] ?? json['title']) ?? 'Ukendt titel',
      type: stringValue(json['type']) ?? 'movie',
      seriesTitle: stringValue(json['seriesTitle']),
      seriesDisplayTitle: stringValue(json['seriesDisplayTitle']),
      seriesMetadataProviderId: stringValue(json['seriesMetadataProviderId']),
      seasonNumber: intValue(json['seasonNumber']),
      episodeNumber: intValue(json['episodeNumber']),
      releaseYear: intValue(json['releaseYear']),
      overview: stringValue(json['overview']),
      posterPath: stringValue(json['posterPath']),
      backdropPath: stringValue(json['backdropPath']),
      width: intValue(json['width']),
      height: intValue(json['height']),
      hdr: stringValue(json['hdr']),
      durationMs: intValue(json['durationMs'] ?? file['durationMs']),
      progress: json['progress'] == null
          ? null
          : PlaybackProgress.fromJson(json['progress']),
      reason: reason ?? stringValue(outer['reason'] ?? outer['explanation']),
    );
  }
}

class MediaSection {
  const MediaSection({required this.title, required this.items});

  final String title;
  final List<MediaItem> items;

  factory MediaSection.fromJson(dynamic value) {
    final json = jsonMap(value);
    final title =
        stringValue(json['title'] ?? json['label']) ?? 'Udvalgt til dig';
    return MediaSection(
      title: title,
      items: jsonList(json['items'] ?? json['media'])
          .map((item) => MediaItem.fromJson(item, reason: title))
          .where((item) => item.id.isNotEmpty)
          .toList(growable: false),
    );
  }
}

class RecommendationFeed {
  const RecommendationFeed({this.hero, required this.sections});

  final MediaItem? hero;
  final List<MediaSection> sections;

  factory RecommendationFeed.fromJson(dynamic value) {
    final json = jsonMap(value);
    final heroJson = jsonMap(json['hero']);
    return RecommendationFeed(
      hero: heroJson.isEmpty ? null : MediaItem.fromJson(heroJson),
      sections: jsonList(json['sections'])
          .map(MediaSection.fromJson)
          .where((section) => section.items.isNotEmpty)
          .toList(growable: false),
    );
  }
}

class EpisodeItem {
  const EpisodeItem({
    required this.media,
    required this.watched,
    required this.positionMs,
    required this.progressPercent,
    this.stillPath,
  });

  final MediaItem media;
  final bool watched;
  final int positionMs;
  final double progressPercent;
  final String? stillPath;

  factory EpisodeItem.fromJson(dynamic value) {
    final json = jsonMap(value);
    return EpisodeItem(
      media: MediaItem.fromJson({...json, 'type': 'episode'}),
      watched: boolValue(json['watched']),
      positionMs: intValue(json['positionMs']) ?? 0,
      progressPercent: doubleValue(json['progressPercent']) ?? 0,
      stillPath: stringValue(json['stillPath']),
    );
  }
}

class SeasonItem {
  const SeasonItem({
    required this.number,
    required this.label,
    required this.episodeCount,
    required this.episodes,
  });

  final int number;
  final String label;
  final int episodeCount;
  final List<EpisodeItem> episodes;

  factory SeasonItem.fromJson(dynamic value) {
    final json = jsonMap(value);
    final number = intValue(json['number']) ?? 0;
    return SeasonItem(
      number: number,
      label:
          stringValue(json['label']) ??
          (number == 0 ? 'Specials' : 'Sæson $number'),
      episodeCount:
          intValue(json['episodeCount']) ?? jsonList(json['episodes']).length,
      episodes: jsonList(json['episodes'])
          .map(EpisodeItem.fromJson)
          .where((episode) => episode.media.id.isNotEmpty)
          .toList(growable: false),
    );
  }
}

class TitleExperience {
  const TitleExperience({
    required this.mode,
    required this.title,
    required this.genres,
    required this.seasons,
    required this.selectedSeasonNumber,
    this.resumeEpisode,
    this.nextEpisode,
  });

  final String mode;
  final MediaItem title;
  final List<String> genres;
  final List<SeasonItem> seasons;
  final int? selectedSeasonNumber;
  final EpisodeItem? resumeEpisode;
  final EpisodeItem? nextEpisode;

  factory TitleExperience.fromJson(dynamic value) {
    final json = jsonMap(value);
    final titleJson = jsonMap(json['title']);
    final series = jsonMap(json['series']);
    EpisodeItem? parseEpisode(dynamic raw) =>
        raw == null ? null : EpisodeItem.fromJson(raw);
    return TitleExperience(
      mode: stringValue(json['mode']) ?? 'title',
      title: MediaItem.fromJson(titleJson),
      genres: jsonList(
        titleJson['genres'],
      ).map(stringValue).whereType<String>().toList(growable: false),
      seasons: jsonList(
        series['seasons'],
      ).map(SeasonItem.fromJson).toList(growable: false),
      selectedSeasonNumber: intValue(series['selectedSeasonNumber']),
      resumeEpisode: parseEpisode(series['resumeEpisode']),
      nextEpisode: parseEpisode(series['nextEpisode']),
    );
  }
}

class SubtitleTrack {
  const SubtitleTrack({
    required this.id,
    required this.label,
    required this.language,
    required this.delivery,
    required this.forced,
    this.src,
  });

  final String id;
  final String label;
  final String language;
  final String delivery;
  final bool forced;
  final String? src;

  bool get isText {
    final normalized = delivery.trim().toLowerCase();
    if (normalized == 'burn' ||
        normalized == 'burn_in' ||
        normalized == 'hardcoded') {
      return false;
    }
    if (normalized == 'text' ||
        normalized == 'webvtt' ||
        normalized == 'vtt' ||
        normalized == 'srt' ||
        normalized == 'ass' ||
        normalized == 'ssa' ||
        normalized == 'subrip' ||
        normalized == 'embedded' ||
        normalized.endsWith('+text')) {
      return true;
    }
    final source = src?.toLowerCase();
    if (source == null || source.isEmpty) return false;
    return source.endsWith('.vtt') ||
        source.endsWith('.srt') ||
        source.endsWith('.ass') ||
        source.endsWith('.ssa');
  }

  factory SubtitleTrack.fromJson(dynamic value) {
    final json = jsonMap(value);
    return SubtitleTrack(
      id: stringValue(json['id']) ?? '',
      label: stringValue(json['label']) ?? 'Undertekst',
      language: stringValue(json['language']) ?? '',
      delivery: stringValue(json['delivery']) ?? 'webvtt',
      forced:
          boolValue(json['forced']) ||
          RegExp(
            r'\b(forced|foreign|tvungen)\b',
            caseSensitive: false,
          ).hasMatch(stringValue(json['label']) ?? ''),
      src: stringValue(json['src']),
    );
  }
}

SubtitleTrack? preferredSubtitleTrack(
  List<SubtitleTrack> tracks,
  PlaybackPreferences preferences,
) {
  final mode = preferences.subtitleMode.toLowerCase();
  if (mode == 'off') return null;
  final textTracks = tracks.where((track) => track.isText).toList();
  if (textTracks.isEmpty) return null;

  SubtitleTrack? firstMatching(
    Iterable<SubtitleTrack> candidates,
    String language,
  ) {
    final normalized = language.toLowerCase().split(RegExp(r'[-_]')).first;
    for (final track in candidates) {
      final trackLanguage = track.language
          .toLowerCase()
          .split(RegExp(r'[-_]'))
          .first;
      if (trackLanguage == normalized) return track;
    }
    return null;
  }

  final candidates = mode == 'always'
      ? textTracks
      : textTracks.where((track) => track.forced).toList();
  if (candidates.isEmpty) return null;
  for (final language in preferences.preferredSubtitleLanguages) {
    final languageTracks = candidates.where((track) {
      final trackLanguage = track.language
          .toLowerCase()
          .split(RegExp(r'[-_]'))
          .first;
      return trackLanguage ==
          language.toLowerCase().split(RegExp(r'[-_]')).first;
    });
    if (mode == 'always') {
      final normal = languageTracks.where((track) => !track.forced);
      final normalMatch = firstMatching(normal, language);
      if (normalMatch != null) return normalMatch;
    }
    final match = firstMatching(languageTracks, language);
    if (match != null) return match;
  }
  if (mode == 'always') {
    for (final track in candidates) {
      if (!track.forced) return track;
    }
  }
  return candidates.first;
}

class Rendition {
  const Rendition({
    required this.height,
    required this.bitrate,
    required this.upscaled,
    required this.hdr,
  });

  final int height;
  final int bitrate;
  final bool upscaled;
  final bool hdr;

  factory Rendition.fromJson(dynamic value) {
    final json = jsonMap(value);
    return Rendition(
      height: intValue(json['height']) ?? 0,
      bitrate: intValue(json['bitrate']) ?? 0,
      upscaled: boolValue(json['upscaled']),
      hdr: boolValue(json['hdr']),
    );
  }
}

class PlaybackPreferences {
  const PlaybackPreferences({
    required this.qualityMode,
    this.fixedQualityHeight,
    required this.playbackRate,
    required this.preferredSubtitleLanguages,
    required this.subtitleMode,
    required this.autoplayNext,
  });

  final String qualityMode;
  final int? fixedQualityHeight;
  final double playbackRate;
  final List<String> preferredSubtitleLanguages;
  final String subtitleMode;
  final bool autoplayNext;

  factory PlaybackPreferences.fromJson(dynamic value) {
    final json = jsonMap(value);
    return PlaybackPreferences(
      qualityMode: stringValue(json['qualityMode']) ?? 'auto',
      fixedQualityHeight: intValue(json['fixedQualityHeight']),
      playbackRate: doubleValue(json['playbackRate']) ?? 1,
      preferredSubtitleLanguages: jsonList(
        json['preferredSubtitleLanguages'],
      ).map(stringValue).whereType<String>().toList(growable: false),
      subtitleMode: stringValue(json['subtitleMode']) ?? 'auto',
      autoplayNext: boolValue(json['autoplayNext'], fallback: true),
    );
  }
}

class PlaybackAuthorization {
  const PlaybackAuthorization({
    required this.sessionId,
    required this.streamToken,
    required this.method,
    required this.streamUrl,
    required this.contentType,
    required this.subtitleTracks,
    required this.renditions,
    required this.preferences,
    this.transcodeStatusUrl,
    this.sourceBitrate,
    this.sourceHeight,
  });

  final String sessionId;
  final String streamToken;
  final String method;
  final String streamUrl;
  final String contentType;
  final String? transcodeStatusUrl;
  final List<SubtitleTrack> subtitleTracks;
  final List<Rendition> renditions;
  final PlaybackPreferences preferences;
  final int? sourceBitrate;
  final int? sourceHeight;

  bool get isDirectPlay => method == 'direct_play';
  bool get isHls => contentType.toLowerCase().contains('mpegurl');

  PlaybackAuthorization copyWith({
    String? method,
    String? streamUrl,
    String? contentType,
    String? transcodeStatusUrl,
  }) => PlaybackAuthorization(
    sessionId: sessionId,
    streamToken: streamToken,
    method: method ?? this.method,
    streamUrl: streamUrl ?? this.streamUrl,
    contentType: contentType ?? this.contentType,
    transcodeStatusUrl: transcodeStatusUrl ?? this.transcodeStatusUrl,
    subtitleTracks: subtitleTracks,
    renditions: renditions,
    preferences: preferences,
    sourceBitrate: sourceBitrate,
    sourceHeight: sourceHeight,
  );

  factory PlaybackAuthorization.fromJson(dynamic value) {
    final json = jsonMap(value);
    final profile = jsonMap(json['videoProfile']);
    final source = jsonMap(profile['source']);
    final adaptive = jsonMap(json['adaptiveQuality']);
    return PlaybackAuthorization(
      sessionId: stringValue(json['sessionId']) ?? '',
      streamToken: stringValue(json['streamToken']) ?? '',
      method: stringValue(json['method']) ?? 'direct_play',
      streamUrl: stringValue(json['streamUrl']) ?? '',
      contentType: stringValue(json['contentType']) ?? 'video/mp4',
      transcodeStatusUrl: stringValue(json['transcodeStatusUrl']),
      subtitleTracks: jsonList(json['subtitleTracks'])
          .map(SubtitleTrack.fromJson)
          .where((track) => track.id.isNotEmpty)
          .toList(growable: false),
      renditions: jsonList(adaptive['renditions'])
          .map(Rendition.fromJson)
          .where((rendition) => rendition.height > 0)
          .toList(growable: false),
      preferences: PlaybackPreferences.fromJson(json['playbackPreferences']),
      sourceBitrate: intValue(source['bitrate']),
      sourceHeight: intValue(source['height']),
    );
  }
}
