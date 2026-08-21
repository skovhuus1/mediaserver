import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/app_config.dart';
import '../core/app_update_service.dart';
import '../core/models.dart';
import '../widgets/cast_diagnostics.dart';

class ClientSettingsScreen extends StatefulWidget {
  const ClientSettingsScreen({required this.api, super.key});

  final ApiClient api;

  @override
  State<ClientSettingsScreen> createState() => _ClientSettingsScreenState();
}

class _ClientSettingsScreenState extends State<ClientSettingsScreen> {
  bool loading = true;
  bool saving = false;
  String? error;
  String? message;
  Map<String, dynamic> profile = {};
  Map<String, dynamic> device = {};
  AppRelease? release;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final values = await Future.wait([
        widget.api.getJson('/profiles/me/preferences'),
        widget.api.getJson('/devices/me/preferences'),
      ]);
      if (!mounted) return;
      setState(() {
        profile = jsonMap(values[0]);
        device = jsonMap(values[1]);
        loading = false;
      });
    } on ApiException catch (failure) {
      if (mounted) {
        setState(() {
          loading = false;
          error = failure.message;
        });
      }
    }
  }

  Future<void> _saveProfile() async {
    await _save(
      () => widget.api.patchJson('/profiles/me/preferences', {
        'preferredAudioLanguages': jsonList(profile['preferredAudioLanguages']),
        'preferredSubtitleLanguages': jsonList(
          profile['preferredSubtitleLanguages'],
        ),
        'subtitleMode': profile['subtitleMode'] ?? 'auto',
        'autoplayNext': profile['autoplayNext'] != false,
        'recommendationsEnabled': profile['recommendationsEnabled'] != false,
      }),
    );
  }

  Future<void> _saveDevice() async {
    await _save(
      () => widget.api.patchJson('/devices/me/preferences', {
        'qualityMode': device['qualityMode'] ?? 'auto',
        'fixedQualityHeight': device['fixedQualityHeight'],
        'allowUpscale': device['allowUpscale'] != false,
        'dataSaver': device['dataSaver'] == true,
        'playbackRate': device['playbackRate'] ?? 1,
        'hdrMode': device['hdrMode'] ?? 'auto',
      }),
    );
  }

  Future<void> _save(Future<dynamic> Function() operation) async {
    setState(() {
      saving = true;
      error = null;
      message = null;
    });
    try {
      await operation();
      if (mounted) {
        setState(() {
          saving = false;
          message = 'Indstillingerne er gemt.';
        });
      }
    } on ApiException catch (failure) {
      if (mounted) {
        setState(() {
          saving = false;
          error = failure.message;
        });
      }
    }
  }

  Future<void> _checkUpdate() async {
    setState(() {
      saving = true;
      error = null;
      message = null;
    });
    try {
      final value = await AppUpdateService().latest();
      if (!mounted) return;
      setState(() {
        saving = false;
        release = value;
        message = value == null
            ? 'Der findes endnu ingen Android-release.'
            : value.isNewer
            ? 'Version ${value.version} er klar.'
            : 'Appen er opdateret.';
      });
    } catch (failure) {
      if (mounted) {
        setState(() {
          saving = false;
          error = 'Opdateringstjek fejlede: $failure';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Indstillinger')),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (error != null) _Notice(error!, error: true),
              if (message != null) _Notice(message!),
              _Section(
                title: 'Afspilning',
                children: [
                  SwitchListTile(
                    title: const Text('Afspil næste episode automatisk'),
                    value: profile['autoplayNext'] != false,
                    onChanged: (value) =>
                        setState(() => profile['autoplayNext'] = value),
                  ),
                  SwitchListTile(
                    title: const Text('Personlige anbefalinger'),
                    value: profile['recommendationsEnabled'] != false,
                    onChanged: (value) => setState(
                      () => profile['recommendationsEnabled'] = value,
                    ),
                  ),
                  DropdownButtonFormField<String>(
                    initialValue: profile['subtitleMode']?.toString() ?? 'auto',
                    decoration: const InputDecoration(
                      labelText: 'Undertekster',
                      helperText:
                          'Automatisk viser kun tvungne spor. Vælg Altid for normale undertekster.',
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: 'auto',
                        child: Text('Automatisk'),
                      ),
                      DropdownMenuItem(value: 'always', child: Text('Altid')),
                      DropdownMenuItem(
                        value: 'forced',
                        child: Text('Kun tvungne'),
                      ),
                      DropdownMenuItem(value: 'off', child: Text('Fra')),
                    ],
                    onChanged: (value) =>
                        setState(() => profile['subtitleMode'] = value),
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: saving ? null : _saveProfile,
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Gem profilindstillinger'),
                  ),
                ],
              ),
              _Section(
                title: 'Denne enhed',
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: device['qualityMode']?.toString() ?? 'auto',
                    decoration: const InputDecoration(labelText: 'Kvalitet'),
                    items: const [
                      DropdownMenuItem(
                        value: 'auto',
                        child: Text('Automatisk'),
                      ),
                      DropdownMenuItem(
                        value: 'fixed',
                        child: Text('Fast maksimum'),
                      ),
                      DropdownMenuItem(
                        value: 'original',
                        child: Text('Original'),
                      ),
                    ],
                    onChanged: (value) =>
                        setState(() => device['qualityMode'] = value),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: device['hdrMode']?.toString() ?? 'auto',
                    decoration: const InputDecoration(labelText: 'HDR'),
                    items: const [
                      DropdownMenuItem(
                        value: 'auto',
                        child: Text('Automatisk'),
                      ),
                      DropdownMenuItem(
                        value: 'prefer_hdr',
                        child: Text('Foretræk HDR'),
                      ),
                      DropdownMenuItem(
                        value: 'force_sdr',
                        child: Text('Tving SDR'),
                      ),
                    ],
                    onChanged: (value) =>
                        setState(() => device['hdrMode'] = value),
                  ),
                  SwitchListTile(
                    title: const Text('Tillad upscaling'),
                    value: device['allowUpscale'] != false,
                    onChanged: (value) =>
                        setState(() => device['allowUpscale'] = value),
                  ),
                  SwitchListTile(
                    title: const Text('Databesparelse'),
                    subtitle: const Text(
                      'Begrænser automatisk kvalitet til cirka 720p.',
                    ),
                    value: device['dataSaver'] == true,
                    onChanged: (value) =>
                        setState(() => device['dataSaver'] = value),
                  ),
                  FilledButton.icon(
                    onPressed: saving ? null : _saveDevice,
                    icon: const Icon(Icons.devices_outlined),
                    label: const Text('Gem enhedsindstillinger'),
                  ),
                ],
              ),
              _Section(
                title: 'Chromecast',
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.cast_connected),
                    title: const Text('Receiver og discovery'),
                    subtitle: const Text(
                      'Kontrollér receiver-ID, forbindelse og fysisk discovery.',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => showCastDiagnostics(context),
                  ),
                ],
              ),
              _Section(
                title: 'App-opdatering',
                children: [
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Installeret version ${AppConfig.appVersion}'),
                    subtitle: const Text(
                      'Kun signerede android-v* GitHub Releases accepteres.',
                    ),
                  ),
                  Wrap(
                    spacing: 10,
                    children: [
                      OutlinedButton.icon(
                        onPressed: saving ? null : _checkUpdate,
                        icon: const Icon(Icons.refresh),
                        label: const Text('Søg efter opdatering'),
                      ),
                      if (release?.isNewer == true)
                        FilledButton.icon(
                          onPressed: saving
                              ? null
                              : () async {
                                  final started = await AppUpdateService()
                                      .downloadAndInstall(release!);
                                  if (mounted && !started) {
                                    setState(
                                      () => message =
                                          'Tillad installation fra BoltBytes, og tryk derefter igen.',
                                    );
                                  }
                                },
                          icon: const Icon(Icons.system_update),
                          label: Text('Installér ${release!.version}'),
                        ),
                    ],
                  ),
                ],
              ),
            ],
          ),
  );
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 16),
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice(this.text, {this.error = false});
  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: error ? const Color(0xFF35171C) : const Color(0xFF12312C),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Text(text),
  );
}
