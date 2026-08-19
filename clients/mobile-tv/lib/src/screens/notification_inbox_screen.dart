import 'package:flutter/material.dart';

import '../core/api_client.dart';

class NotificationInboxScreen extends StatefulWidget {
  const NotificationInboxScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<NotificationInboxScreen> createState() =>
      _NotificationInboxScreenState();
}

class _NotificationInboxScreenState extends State<NotificationInboxScreen> {
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final response = await widget.api.getJson(
        '/client-services/notifications',
      );
      final values = response is Map ? response['items'] : null;
      items = values is List
          ? values
                .whereType<Map>()
                .map((value) => Map<String, dynamic>.from(value))
                .toList()
          : [];
    } catch (failure) {
      error = failure.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _read(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    if (id == null || item['readAt'] != null) return;
    await widget.api.postJson('/client-services/notifications/$id/read');
    await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Notifikationer'),
      actions: [
        TextButton(
          onPressed: items.isEmpty
              ? null
              : () async {
                  await widget.api.postJson(
                    '/client-services/notifications/read-all',
                  );
                  await _load();
                },
          child: const Text('Markér alle som læst'),
        ),
      ],
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : error != null
        ? Center(child: Text(error!))
        : items.isEmpty
        ? const Center(child: Text('Ingen notifikationer endnu.'))
        : RefreshIndicator(
            onRefresh: _load,
            child: ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final item = items[index];
                final unread = item['readAt'] == null;
                return ListTile(
                  onTap: () => _read(item),
                  leading: Icon(
                    unread
                        ? Icons.notifications_active
                        : Icons.notifications_none,
                    color: unread ? const Color(0xFF43E7C4) : Colors.white38,
                  ),
                  title: Text(
                    item['title']?.toString() ?? 'BoltBytes Media',
                    style: TextStyle(
                      fontWeight: unread ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                  subtitle: Text(item['body']?.toString() ?? ''),
                  trailing: Text(_date(item['createdAt']?.toString())),
                );
              },
            ),
          ),
  );
}

String _date(String? raw) {
  final value = DateTime.tryParse(raw ?? '')?.toLocal();
  if (value == null) return '';
  return '${value.day}.${value.month}.${value.year}';
}
