import 'package:flutter/material.dart';

import '../core/cast_service.dart';

Future<void> showCastDiagnostics(BuildContext context) => showDialog<void>(
  context: context,
  builder: (_) => const _CastDiagnosticsDialog(),
);

class _CastDiagnosticsDialog extends StatefulWidget {
  const _CastDiagnosticsDialog();

  @override
  State<_CastDiagnosticsDialog> createState() => _CastDiagnosticsDialogState();
}

class _CastDiagnosticsDialogState extends State<_CastDiagnosticsDialog> {
  CastDiagnostics? diagnostics;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => error = null);
    try {
      final value = await CastService.instance.diagnostics();
      if (mounted) setState(() => diagnostics = value);
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Cast-diagnosen kunne ikke indlæses.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = diagnostics;
    return AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.cast_connected),
          SizedBox(width: 10),
          Text('Chromecast-diagnose'),
        ],
      ),
      content: SizedBox(
        width: 520,
        child: value == null && error == null
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (error != null)
                      Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    if (value != null) ...[
                      _DiagnosticRow(
                        label: 'Google Cast SDK',
                        value: value.available ? 'Klar' : 'Ikke tilgængelig',
                        healthy: value.available,
                      ),
                      _DiagnosticRow(
                        label: 'Receiver',
                        value: value.receiverMode == 'custom'
                            ? 'BoltBytes Custom Receiver'
                            : 'Google Default Receiver',
                        healthy: value.receiverMode == 'custom',
                      ),
                      _DiagnosticRow(
                        label: 'Application ID',
                        value: value.receiverApplicationId.isEmpty
                            ? 'Ikke konfigureret'
                            : value.receiverApplicationId,
                        healthy: value.receiverApplicationId.isNotEmpty,
                      ),
                      _DiagnosticRow(
                        label: 'Forbindelse',
                        value: value.connected
                            ? value.deviceName ?? 'Forbundet'
                            : 'Ingen aktiv enhed',
                        healthy: value.connected,
                      ),
                      _DiagnosticRow(
                        label: 'Receiver-status',
                        value: value.runtimeState,
                        healthy: value.connected,
                      ),
                      if (value.mediaTitle?.isNotEmpty == true)
                        _DiagnosticRow(
                          label: 'Aktivt medie',
                          value: value.mediaTitle!,
                          healthy: true,
                        ),
                      const Divider(height: 30),
                      const Text(
                        'Fysisk test',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Telefon og Chromecast skal være på samme Wi-Fi. Google Play Services skal være opdateret, media.boltbytes.com skal have gyldigt HTTPS-certifikat, og Custom Receiver-ID skal være registreret i Google Cast Console.',
                        style: TextStyle(color: Colors.white70),
                      ),
                      const SizedBox(height: 14),
                      const Row(
                        children: [
                          SizedBox(
                            width: 48,
                            height: 48,
                            child: CastRouteButton(),
                          ),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Tryk her for at kontrollere discovery på den fysiske telefon.',
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
      ),
      actions: [
        TextButton.icon(
          onPressed: _load,
          icon: const Icon(Icons.refresh),
          label: const Text('Opdater'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Luk'),
        ),
      ],
    );
  }
}

class _DiagnosticRow extends StatelessWidget {
  const _DiagnosticRow({
    required this.label,
    required this.value,
    required this.healthy,
  });

  final String label;
  final String value;
  final bool healthy;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          healthy ? Icons.check_circle : Icons.info_outline,
          size: 18,
          color: healthy
              ? Theme.of(context).colorScheme.secondary
              : Colors.amber,
        ),
        const SizedBox(width: 9),
        SizedBox(
          width: 128,
          child: Text(label, style: const TextStyle(color: Colors.white60)),
        ),
        Expanded(
          child: SelectableText(
            value,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}
