import '../core/api_client.dart';
import '../core/models.dart';

abstract interface class NotificationContract {
  Future<List<ClientNotification>> load();
  Future<void> markRead(String id);
  Future<void> markAllRead();
  int unreadCount(Iterable<ClientNotification> notifications);
}

class NotificationUseCase implements NotificationContract {
  const NotificationUseCase({required this.api});

  final ApiClient api;

  @override
  Future<List<ClientNotification>> load() async {
    final response = jsonMap(
      await api.getJson('/client-services/notifications'),
    );
    return jsonList(response['items'])
        .map(ClientNotification.fromJson)
        .where((item) => item.id.isNotEmpty)
        .toList(growable: false);
  }

  @override
  Future<void> markRead(String id) async {
    await api.postJson(
      '/client-services/notifications/${Uri.encodeComponent(id)}/read',
    );
  }

  @override
  Future<void> markAllRead() async {
    await api.postJson('/client-services/notifications/read-all');
  }

  @override
  int unreadCount(Iterable<ClientNotification> notifications) =>
      notifications.where((item) => item.unread).length;
}

class ClientNotification {
  const ClientNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
    this.readAt,
  });

  final String id;
  final String title;
  final String body;
  final DateTime createdAt;
  final DateTime? readAt;

  bool get unread => readAt == null;

  ClientNotification copyWith({DateTime? readAt}) => ClientNotification(
    id: id,
    title: title,
    body: body,
    createdAt: createdAt,
    readAt: readAt ?? this.readAt,
  );

  factory ClientNotification.fromJson(dynamic value) {
    final json = jsonMap(value);
    return ClientNotification(
      id: stringValue(json['id']) ?? '',
      title: stringValue(json['title']) ?? 'BoltBytes Media',
      body: stringValue(json['body']) ?? '',
      createdAt:
          DateTime.tryParse(stringValue(json['createdAt']) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      readAt: DateTime.tryParse(stringValue(json['readAt']) ?? ''),
    );
  }
}
