import 'package:flutter/material.dart';

import '../core/push_notifications.dart';

class PushMessageBanner extends StatelessWidget {
  const PushMessageBanner({super.key});

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: PushNotifications.instance,
    builder: (context, _) {
      final message = PushNotifications.instance.foregroundMessage;
      if (message == null) return const SizedBox.shrink();
      final title =
          message.notification?.title ??
          message.data['title']?.toString() ??
          'BoltBytes Media';
      final body =
          message.notification?.body ?? message.data['body']?.toString() ?? '';
      return SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: Container(
            width: 520,
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.fromLTRB(18, 14, 8, 14),
            decoration: BoxDecoration(
              color: const Color(0xF51A2028),
              border: Border.all(color: const Color(0xFF43E7C4)),
              borderRadius: BorderRadius.circular(16),
              boxShadow: const [
                BoxShadow(color: Colors.black54, blurRadius: 24),
              ],
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.notifications_active_outlined,
                  color: Color(0xFF43E7C4),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      if (body.isNotEmpty)
                        Text(
                          body,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: 'Luk',
                  onPressed: PushNotifications.instance.dismissForeground,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
        ),
      );
    },
  );
}
