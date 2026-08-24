import 'package:flutter/material.dart';

import '../app.dart';
import '../core/models.dart';
import '../state/app_controller.dart';
import '../widgets/brand.dart';
import '../widgets/cast_diagnostics.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({required this.controller, super.key});

  final AppController controller;

  Future<void> _choose(BuildContext context, ProfileSummary profile) async {
    String? pin;
    if (profile.hasPin) {
      pin = await showDialog<String>(
        context: context,
        builder: (context) => const _PinDialog(),
      );
      if (pin == null) return;
    }
    await controller.selectProfile(profile, pin: pin);
  }

  @override
  Widget build(BuildContext context) {
    final profiles = controller.user?.profiles ?? const <ProfileSummary>[];
    final tv = useTvLayout(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(tv ? 52 : 24),
          child: Column(
            children: [
              Row(
                children: [
                  const BrandLockup(compact: true),
                  const Spacer(),
                  IconButton(
                    tooltip: 'Chromecast-diagnose',
                    onPressed: () => showCastDiagnostics(context),
                    icon: const Icon(Icons.cast_connected),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: controller.busy ? null : controller.logout,
                    icon: const Icon(Icons.logout),
                    label: const Text('Log ud'),
                  ),
                ],
              ),
              const Spacer(),
              Text(
                'Hvem ser med?',
                textAlign: TextAlign.center,
                style: Theme.of(
                  context,
                ).textTheme.displayLarge?.copyWith(fontSize: tv ? 64 : 44),
              ),
              const SizedBox(height: 12),
              const Text(
                'Historik, anbefalinger og undertekster følger den valgte profil.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white60),
              ),
              const SizedBox(height: 40),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 920),
                child: Wrap(
                  spacing: tv ? 28 : 18,
                  runSpacing: tv ? 28 : 18,
                  alignment: WrapAlignment.center,
                  children: profiles
                      .map(
                        (profile) => _ProfileTile(
                          profile: profile,
                          onPressed: () => _choose(context, profile),
                        ),
                      )
                      .toList(growable: false),
                ),
              ),
              if (controller.error != null) ...[
                const SizedBox(height: 24),
                Text(
                  controller.error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ],
              if (controller.busy) ...[
                const SizedBox(height: 24),
                const CircularProgressIndicator(),
              ],
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileTile extends StatefulWidget {
  const _ProfileTile({required this.profile, required this.onPressed});

  final ProfileSummary profile;
  final VoidCallback onPressed;

  @override
  State<_ProfileTile> createState() => _ProfileTileState();
}

class _ProfileTileState extends State<_ProfileTile> {
  bool focused = false;

  @override
  Widget build(BuildContext context) => InkWell(
    autofocus:
        widget.profile ==
        (context
            .findAncestorWidgetOfExactType<ProfileScreen>()
            ?.controller
            .user
            ?.profiles
            .firstOrNull),
    onTap: widget.onPressed,
    onFocusChange: (value) => setState(() => focused = value),
    borderRadius: BorderRadius.circular(20),
    child: AnimatedContainer(
      width: 150,
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: focused ? const Color(0xFF19262D) : Colors.transparent,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: focused
              ? Theme.of(context).colorScheme.secondary
              : Colors.transparent,
          width: 3,
        ),
      ),
      child: Column(
        children: [
          Container(
            width: 112,
            height: 112,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: widget.profile.isChildProfile
                    ? const [Color(0xFF38D3E7), Color(0xFF176A7A)]
                    : const [Color(0xFF82C4FF), Color(0xFF2469A8)],
              ),
            ),
            child: Center(
              child: Text(
                widget.profile.name.characters.first.toUpperCase(),
                style: const TextStyle(
                  fontSize: 44,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  widget.profile.name,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              if (widget.profile.hasPin) ...[
                const SizedBox(width: 5),
                const Icon(Icons.lock, size: 14, color: Colors.white54),
              ],
            ],
          ),
        ],
      ),
    ),
  );
}

class _PinDialog extends StatefulWidget {
  const _PinDialog();

  @override
  State<_PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<_PinDialog> {
  final pin = TextEditingController();

  @override
  void dispose() {
    pin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Profil-PIN'),
    content: TextField(
      controller: pin,
      autofocus: true,
      obscureText: true,
      keyboardType: TextInputType.number,
      maxLength: 8,
      onSubmitted: (value) {
        if (value.length >= 4) Navigator.pop(context, value);
      },
      decoration: const InputDecoration(hintText: '4-8 cifre', counterText: ''),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Annuller'),
      ),
      FilledButton(
        onPressed: () =>
            pin.text.length >= 4 ? Navigator.pop(context, pin.text) : null,
        child: const Text('Fortsæt'),
      ),
    ],
  );
}
