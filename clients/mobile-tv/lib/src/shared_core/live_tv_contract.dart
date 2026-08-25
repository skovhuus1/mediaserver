import '../core/api_client.dart';
import '../core/models.dart';

enum LiveTvDirection { previous, next }

abstract interface class LiveTvContract {
  Future<LiveTvGuide> loadGuide({
    DateTime? from,
    DateTime? to,
    int page = 1,
    int pageSize = 75,
    String group = '',
    bool favoritesOnly = false,
  });
  Future<void> setFavorite(String channelId, {required bool favorite});
  Future<LiveTvSession> authorize(String channelId);
  Future<LiveTvStatus> pollStatus(LiveTvSession session);
  Future<void> heartbeat(
    LiveTvSession session, {
    required String runtimeState,
    int bufferAheadMs = 0,
    int stallCount = 0,
  });
  Future<LiveTvSwitchResult> switchChannel(
    LiveTvSession session,
    LiveTvChannel channel,
    LiveTvDirection direction,
  );
  Future<void> release(LiveTvSession session);
}

class LiveTvUseCase implements LiveTvContract {
  const LiveTvUseCase({required this.api});

  final ApiClient api;

  @override
  Future<LiveTvGuide> loadGuide({
    DateTime? from,
    DateTime? to,
    int page = 1,
    int pageSize = 75,
    String group = '',
    bool favoritesOnly = false,
  }) async {
    final now = DateTime.now().toUtc();
    final query = <String, String>{
      'from': (from ?? now.subtract(const Duration(minutes: 30)))
          .toUtc()
          .toIso8601String(),
      'to': (to ?? now.add(const Duration(hours: 12)))
          .toUtc()
          .toIso8601String(),
      'page': '${page.clamp(1, 1 << 31)}',
      'pageSize': '${pageSize.clamp(1, 100)}',
      if (group.trim().isNotEmpty) 'group': group.trim(),
      if (favoritesOnly) 'favorites': 'true',
    };
    return LiveTvGuide.fromJson(
      await api.getJson('/live-tv/guide?${Uri(queryParameters: query).query}'),
    );
  }

  @override
  Future<void> setFavorite(String channelId, {required bool favorite}) async {
    final id = Uri.encodeComponent(channelId);
    if (favorite) {
      await api.putJson('/live-tv/favorites/$id');
    } else {
      await api.deleteJson('/live-tv/favorites/$id');
    }
  }

  @override
  Future<LiveTvSession> authorize(String channelId) async => _absoluteSession(
    LiveTvSession.fromJson(
      await api.postJson('/live-tv/playback/authorize', {
        'channelId': channelId,
        'preferredMethod': 'auto',
      }),
    ),
  );

  @override
  Future<LiveTvStatus> pollStatus(LiveTvSession session) async =>
      LiveTvStatus.fromJson(await api.getJson(session.statusUrl));

  @override
  Future<void> heartbeat(
    LiveTvSession session, {
    required String runtimeState,
    int bufferAheadMs = 0,
    int stallCount = 0,
  }) async {
    await api.patchJson(session.heartbeatUrl, {
      'runtimeState': runtimeState,
      'bufferAheadMs': bufferAheadMs,
      'stallCount': stallCount,
    });
  }

  @override
  Future<LiveTvSwitchResult> switchChannel(
    LiveTvSession session,
    LiveTvChannel channel,
    LiveTvDirection direction,
  ) async {
    final neighbor = LiveTvChannel.fromJson(
      await api.getJson(
        '/live-tv/guide/channels/${Uri.encodeComponent(channel.id)}/neighbor'
        '?direction=${direction.name}',
      ),
    );
    final nextSession = _absoluteSession(
      LiveTvSession.fromJson(
        await api.postJson(
          '/live-tv/playback/leases/${Uri.encodeComponent(session.leaseId)}/switch',
          {
            'channelId': neighbor.id,
            'streamToken': session.streamToken,
            'preferredMethod': 'auto',
          },
        ),
      ),
    );
    return LiveTvSwitchResult(channel: neighbor, session: nextSession);
  }

  @override
  Future<void> release(LiveTvSession session) =>
      api.deleteJson(session.releaseUrl);

  LiveTvSession _absoluteSession(LiveTvSession session) =>
      session.copyWith(streamUrl: api.endpoint(session.streamUrl).toString());
}

class LiveTvGuide {
  const LiveTvGuide({
    required this.availableTotal,
    required this.total,
    required this.page,
    required this.totalPages,
    required this.groups,
    required this.channels,
  });

  final int availableTotal;
  final int total;
  final int page;
  final int totalPages;
  final List<LiveTvGroup> groups;
  final List<LiveTvChannel> channels;

  factory LiveTvGuide.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvGuide(
      availableTotal: intValue(json['availableTotal']) ?? 0,
      total: intValue(json['total']) ?? 0,
      page: intValue(json['page']) ?? 1,
      totalPages: (intValue(json['totalPages']) ?? 1).clamp(1, 1 << 31).toInt(),
      groups: jsonList(
        json['groups'],
      ).map(LiveTvGroup.fromJson).toList(growable: false),
      channels: jsonList(json['channels'])
          .map(LiveTvChannel.fromJson)
          .where((channel) => channel.id.isNotEmpty)
          .toList(growable: false),
    );
  }
}

class LiveTvGroup {
  const LiveTvGroup({required this.name, required this.count});
  final String name;
  final int count;

  factory LiveTvGroup.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvGroup(
      name: stringValue(json['name']) ?? '',
      count: intValue(json['count']) ?? 0,
    );
  }
}

class LiveTvChannel {
  LiveTvChannel({
    required this.id,
    required this.name,
    required this.number,
    required this.logoUrl,
    required this.groupName,
    required this.favorite,
    required this.programs,
  });

  static final empty = LiveTvChannel(
    id: '',
    name: '',
    number: null,
    logoUrl: null,
    groupName: null,
    favorite: false,
    programs: const [],
  );

  final String id;
  final String name;
  final int? number;
  final String? logoUrl;
  final String? groupName;
  bool favorite;
  final List<LiveTvProgram> programs;

  LiveTvProgram? get currentProgram =>
      programs.where((program) => program.isCurrent).firstOrNull;

  factory LiveTvChannel.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvChannel(
      id: stringValue(json['id']) ?? '',
      name: stringValue(json['name']) ?? 'Ukendt kanal',
      number: intValue(json['number']),
      logoUrl: stringValue(json['logoUrl']),
      groupName: stringValue(json['groupName']),
      favorite: boolValue(json['favorite']),
      programs: jsonList(
        json['programs'],
      ).map(LiveTvProgram.fromJson).toList(growable: false),
    );
  }
}

class LiveTvProgram {
  const LiveTvProgram({
    required this.id,
    required this.startsAt,
    required this.endsAt,
    required this.title,
    required this.subtitle,
  });

  final String id;
  final DateTime startsAt;
  final DateTime endsAt;
  final String title;
  final String? subtitle;

  bool get isCurrent {
    final now = DateTime.now();
    return !startsAt.isAfter(now) && endsAt.isAfter(now);
  }

  bool get isFuture => startsAt.isAfter(DateTime.now());

  factory LiveTvProgram.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvProgram(
      id: stringValue(json['id']) ?? '',
      startsAt:
          DateTime.tryParse(stringValue(json['startsAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      endsAt:
          DateTime.tryParse(stringValue(json['endsAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      title: stringValue(json['title']) ?? 'Programinformation',
      subtitle: stringValue(json['subtitle']),
    );
  }
}

class LiveTvSession {
  const LiveTvSession({
    required this.leaseId,
    required this.method,
    required this.status,
    required this.streamToken,
    required this.streamUrl,
    required this.statusUrl,
    required this.heartbeatUrl,
    required this.releaseUrl,
  });

  final String leaseId;
  final String method;
  final String status;
  final String streamToken;
  final String streamUrl;
  final String statusUrl;
  final String heartbeatUrl;
  final String releaseUrl;

  bool get ready => status == 'ready' || status == 'active';

  LiveTvSession copyWith({String? status, String? streamUrl}) => LiveTvSession(
    leaseId: leaseId,
    method: method,
    status: status ?? this.status,
    streamToken: streamToken,
    streamUrl: streamUrl ?? this.streamUrl,
    statusUrl: statusUrl,
    heartbeatUrl: heartbeatUrl,
    releaseUrl: releaseUrl,
  );

  factory LiveTvSession.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvSession(
      leaseId: stringValue(json['leaseId']) ?? '',
      method: stringValue(json['method']) ?? 'auto',
      status: stringValue(json['status']) ?? 'preparing',
      streamToken: stringValue(json['streamToken']) ?? '',
      streamUrl: stringValue(json['streamUrl']) ?? '',
      statusUrl: stringValue(json['statusUrl']) ?? '',
      heartbeatUrl: stringValue(json['heartbeatUrl']) ?? '',
      releaseUrl: stringValue(json['releaseUrl']) ?? '',
    );
  }
}

class LiveTvStatus {
  const LiveTvStatus({required this.state, this.message});
  final String state;
  final String? message;

  bool get ready => state == 'ready' || state == 'active';
  bool get failed => state == 'failed';

  factory LiveTvStatus.fromJson(dynamic value) {
    final json = jsonMap(value);
    return LiveTvStatus(
      state:
          stringValue(json['state']) ??
          stringValue(json['status']) ??
          'preparing',
      message: stringValue(json['message']) ?? stringValue(json['error']),
    );
  }
}

class LiveTvSwitchResult {
  const LiveTvSwitchResult({required this.channel, required this.session});
  final LiveTvChannel channel;
  final LiveTvSession session;
}
