import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../shared_core/notification_contract.dart';

class NotificationInboxScreen extends StatefulWidget {
  const NotificationInboxScreen({
    required this.api,
    this.notifications,
    super.key,
  });

  final ApiClient api;
  final NotificationContract? notifications;

  @override
  State<NotificationInboxScreen> createState() =>
      _NotificationInboxScreenState();
}

class _NotificationInboxScreenState extends State<NotificationInboxScreen> {
  late final NotificationContract notifications;
  bool loading = true;
  String? error;
  List<ClientNotification> items = [];

  @override
  void initState() {
    super.initState();
    notifications =
        widget.notifications ?? NotificationUseCase(api: widget.api);
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      items = await notifications.load();
    } catch (failure) {
      error = failure.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _read(ClientNotification item) async {
    if (!item.unread) return;
    await notifications.markRead(item.id);
    await _load();
  }

  Future<void> _markAllRead() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await notifications.markAllRead();
      await _load();
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        loading = false;
        error = failure.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Notifikationer'),
      actions: [
        TextButton(
          onPressed: items.any((item) => item.unread) ? _markAllRead : null,
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
                final unread = item.unread;
                return ListTile(
                  onTap: () => _read(item),
                  leading: Icon(
                    unread
                        ? Icons.notifications_active
                        : Icons.notifications_none,
                    color: unread ? const Color(0xFF62C9A7) : Colors.white38,
                  ),
                  title: Text(
                    item.title,
                    style: TextStyle(
                      fontWeight: unread ? FontWeight.w800 : FontWeight.w500,
                    ),
                  ),
                  subtitle: Text(item.body),
                  trailing: Text(_date(item.createdAt)),
                );
              },
            ),
          ),
  );
}

String _date(DateTime raw) {
  final value = raw.toLocal();
  return '${value.day}.${value.month}.${value.year}';
}
