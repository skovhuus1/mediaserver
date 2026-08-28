import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/api_client.dart';
import '../../core/app_config.dart';
import '../../core/app_update_service.dart';
import '../../shared_core/client_preferences_contract.dart';
import '../../shared_core/playback/playback_tuning.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../widgets/tv_premium_layout.dart';

class TvSettingsScreen extends StatefulWidget {
  const TvSettingsScreen({required this.api, this.preferences, super.key});

  final ApiClient api;
  final ClientPreferencesContract? preferences;

  @override
  State<TvSettingsScreen> createState() => _TvSettingsScreenState();
}

class _TvSettingsScreenState extends State<TvSettingsScreen> {
  static const _categories = [
    'Afspilning',
    'Undertekster',
    'Lyd og sprog',
    'Billede',
    'App',
  ];
  static const _languages = ['', 'da', 'en', 'de', 'sv', 'no'];

  final FocusNode _root = FocusNode(debugLabel: 'tv-settings-root');
  late final ClientPreferencesContract _preferences;
  ProfilePreferences _profile = const ProfilePreferences();
  DevicePreferences _device = const DevicePreferences();
  AppRelease? _release;
  int _category = 0;
  int _option = 0;
  bool _inOptions = false;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _message;

  @override
  void initState() {
    super.initState();
    _preferences =
        widget.preferences ?? ClientPreferencesUseCase(api: widget.api);
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final value = await _preferences.load();
      if (!mounted) return;
      setState(() {
        _profile = value.profile;
        _device = value.device;
        _loading = false;
      });
    } catch (failure) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = failure.toString();
      });
    }
  }

  List<_TvSettingOption> get _options => switch (_category) {
    0 => [
      _toggle(
        'Afspil næste episode',
        _profile.autoplayNext,
        (value) => _profile = _profile.copyWith(autoplayNext: value),
      ),
      _toggle(
        'Personlige anbefalinger',
        _profile.recommendationsEnabled,
        (value) => _profile = _profile.copyWith(recommendationsEnabled: value),
      ),
      _choice(
        'Bufferprofil',
        _bufferLabel(_device.bufferProfile),
        () => _device = _device.copyWith(
          bufferProfile: _cycle(
            playbackBufferProfiles.toList(growable: false),
            _device.bufferProfile,
            1,
          ),
        ),
        () => _device = _device.copyWith(
          bufferProfile: _cycle(
            playbackBufferProfiles.toList(growable: false),
            _device.bufferProfile,
            -1,
          ),
        ),
      ),
      _number(
        'Afspilningshastighed',
        '${_device.playbackRate.toStringAsFixed(2)}x',
        -0.25,
        0.25,
        () => _device = _device.copyWith(
          playbackRate: (_device.playbackRate + 0.25).clamp(0.5, 2),
        ),
        () => _device = _device.copyWith(
          playbackRate: (_device.playbackRate - 0.25).clamp(0.5, 2),
        ),
      ),
      _TvSettingOption(
        label: 'Gem afspilningsindstillinger',
        value: _saving ? 'Gemmer...' : 'Gem',
        icon: Icons.save_outlined,
        onActivate: _savePlayback,
      ),
    ],
    1 => [
      _choice(
        'Foretrukket undertekstsprog',
        _languageLabel(_profile.preferredSubtitleLanguages.firstOrNull ?? ''),
        () {
          final current = _profile.preferredSubtitleLanguages.firstOrNull ?? '';
          final next = _cycle(_languages, current, 1);
          _profile = _profile.copyWith(
            preferredSubtitleLanguages: next.isEmpty ? [] : [next],
          );
        },
        () {
          final current = _profile.preferredSubtitleLanguages.firstOrNull ?? '';
          final next = _cycle(_languages, current, -1);
          _profile = _profile.copyWith(
            preferredSubtitleLanguages: next.isEmpty ? [] : [next],
          );
        },
      ),
      _enumChoice(
        'Visning',
        ['auto', 'always', 'forced', 'off'],
        _profile.subtitleMode,
        (value) => _profile = _profile.copyWith(subtitleMode: value),
      ),
      _enumChoice(
        'Stil',
        ['broadcast', 'line_box', 'solid_box'],
        _profile.subtitleStyle,
        (value) => _profile = _profile.copyWith(subtitleStyle: value),
      ),
      _enumChoice(
        'Tekstfarve',
        ['#FFFFFF', '#FFE66D', '#7FDBFF'],
        _profile.subtitleTextColor,
        (value) => _profile = _profile.copyWith(subtitleTextColor: value),
      ),
      _number(
        'Størrelse',
        '${_profile.subtitleSizePercent} %',
        -5,
        5,
        () => _profile = _profile.copyWith(
          subtitleSizePercent: (_profile.subtitleSizePercent + 5).clamp(
            75,
            150,
          ),
        ),
        () => _profile = _profile.copyWith(
          subtitleSizePercent: (_profile.subtitleSizePercent - 5).clamp(
            75,
            150,
          ),
        ),
      ),
      _number(
        'Placering fra bunden',
        '${_profile.subtitleBottomOffsetPercent} %',
        -1,
        1,
        () => _profile = _profile.copyWith(
          subtitleBottomOffsetPercent:
              (_profile.subtitleBottomOffsetPercent + 1).clamp(4, 20),
        ),
        () => _profile = _profile.copyWith(
          subtitleBottomOffsetPercent:
              (_profile.subtitleBottomOffsetPercent - 1).clamp(4, 20),
        ),
      ),
      _number(
        'Synkronisering',
        '${(_profile.subtitleTimingOffsetMs / 1000).toStringAsFixed(2)} s',
        -250,
        250,
        () => _profile = _profile.copyWith(
          subtitleTimingOffsetMs: (_profile.subtitleTimingOffsetMs + 250).clamp(
            -5000,
            5000,
          ),
        ),
        () => _profile = _profile.copyWith(
          subtitleTimingOffsetMs: (_profile.subtitleTimingOffsetMs - 250).clamp(
            -5000,
            5000,
          ),
        ),
      ),
      _saveProfileOption(),
    ],
    2 => [
      _choice(
        'Foretrukket lydsprog',
        _languageLabel(_profile.preferredAudioLanguages.firstOrNull ?? ''),
        () {
          final current = _profile.preferredAudioLanguages.firstOrNull ?? '';
          final next = _cycle(_languages, current, 1);
          _profile = _profile.copyWith(
            preferredAudioLanguages: next.isEmpty ? [] : [next],
          );
        },
        () {
          final current = _profile.preferredAudioLanguages.firstOrNull ?? '';
          final next = _cycle(_languages, current, -1);
          _profile = _profile.copyWith(
            preferredAudioLanguages: next.isEmpty ? [] : [next],
          );
        },
      ),
      _saveProfileOption(),
    ],
    3 => [
      _enumChoice(
        'Kvalitet',
        ['auto', 'fixed', 'original'],
        _device.qualityMode,
        (value) => _device = _device.copyWith(qualityMode: value),
      ),
      _enumChoice(
        'Fast maksimum',
        ['480', '720', '1080', '2160'],
        '${_device.fixedQualityHeight ?? 1080}',
        (value) =>
            _device = _device.copyWith(fixedQualityHeight: int.parse(value)),
      ),
      _choice(
        'Opskalering',
        _device.allowUpscale ? _upscaleLabel(_device.upscaleMode) : 'Fra',
        () {
          final current = _device.allowUpscale
              ? _effectiveTvUpscaleMode(_device.upscaleMode)
              : 'off';
          final mode = _cycle(
            playbackUpscaleModes.toList(growable: false),
            current,
            1,
          );
          _device = _device.copyWith(
            upscaleMode: mode,
            allowUpscale: mode != 'off',
          );
        },
        () {
          final current = _device.allowUpscale
              ? _effectiveTvUpscaleMode(_device.upscaleMode)
              : 'off';
          final mode = _cycle(
            playbackUpscaleModes.toList(growable: false),
            current,
            -1,
          );
          _device = _device.copyWith(
            upscaleMode: mode,
            allowUpscale: mode != 'off',
          );
        },
      ),
      _toggle(
        'Databesparelse',
        _device.dataSaver,
        (value) => _device = _device.copyWith(dataSaver: value),
      ),
      _enumChoice(
        'HDR',
        ['auto', 'prefer_hdr', 'force_sdr'],
        _device.hdrMode,
        (value) => _device = _device.copyWith(hdrMode: value),
      ),
      _TvSettingOption(
        label: 'Gem enhedsindstillinger',
        value: _saving ? 'Gemmer...' : 'Gem',
        icon: Icons.devices_outlined,
        onActivate: _saveDevice,
      ),
    ],
    _ => [
      _TvSettingOption(
        label: 'Installeret version',
        value: AppConfig.appVersion,
        icon: Icons.info_outline,
      ),
      _TvSettingOption(
        label: 'Søg efter opdatering',
        value: _release == null
            ? 'Kontrollér nu'
            : _release!.isNewer
            ? 'Version ${_release!.version}'
            : 'Appen er opdateret',
        icon: Icons.system_update,
        onActivate: _checkUpdate,
      ),
      if (_release?.isNewer == true)
        _TvSettingOption(
          label: 'Installér opdatering',
          value: _release!.version,
          icon: Icons.download,
          onActivate: _installUpdate,
        ),
    ],
  };

  _TvSettingOption _toggle(
    String label,
    bool value,
    ValueChanged<bool> update,
  ) => _TvSettingOption(
    label: label,
    value: value ? 'Til' : 'Fra',
    icon: value ? Icons.toggle_on : Icons.toggle_off,
    onLeft: () => setState(() => update(!value)),
    onRight: () => setState(() => update(!value)),
    onActivate: () => setState(() => update(!value)),
  );

  _TvSettingOption _choice(
    String label,
    String value,
    VoidCallback next,
    VoidCallback previous,
  ) => _TvSettingOption(
    label: label,
    value: value,
    icon: Icons.translate,
    onLeft: () => setState(previous),
    onRight: () => setState(next),
    onActivate: () => setState(next),
  );

  _TvSettingOption _enumChoice(
    String label,
    List<String> values,
    String current,
    ValueChanged<String> update,
  ) => _TvSettingOption(
    label: label,
    value: current,
    icon: Icons.tune,
    onLeft: () => setState(() => update(_cycle(values, current, -1))),
    onRight: () => setState(() => update(_cycle(values, current, 1))),
    onActivate: () => setState(() => update(_cycle(values, current, 1))),
  );

  _TvSettingOption _number(
    String label,
    String value,
    num previousStep,
    num nextStep,
    VoidCallback next,
    VoidCallback previous,
  ) => _TvSettingOption(
    label: label,
    value: value,
    icon: Icons.straighten,
    onLeft: () => setState(previous),
    onRight: () => setState(next),
    onActivate: () => setState(next),
  );

  _TvSettingOption _saveProfileOption() => _TvSettingOption(
    label: 'Gem profilindstillinger',
    value: _saving ? 'Gemmer...' : 'Gem',
    icon: Icons.save_outlined,
    onActivate: _saveProfile,
  );

  Future<void> _saveProfile() =>
      _save(() => _preferences.saveProfilePreferences(_profile));

  Future<void> _savePlayback() => _save(() async {
    await _preferences.saveProfilePreferences(_profile);
    await _preferences.saveDevicePreferences(_device);
  });

  Future<void> _saveDevice() =>
      _save(() => _preferences.saveDevicePreferences(_device));

  String _bufferLabel(String value) => switch (value) {
    'low_latency' => 'Lav latenstid · 5-15 sek.',
    'stable' => 'Stabil · 60-180 sek.',
    _ => 'Auto · 30-120 sek.',
  };

  String _upscaleLabel(String value) => switch (value) {
    'off' => 'Fra',
    'device' => 'TV · lokal',
    'server' => 'Server · FFmpeg',
    _ => 'Fra',
  };

  String _effectiveTvUpscaleMode(String value) =>
      playbackUpscaleModes.contains(value) ? value : 'off';

  Future<void> _save(Future<void> Function() operation) async {
    setState(() {
      _saving = true;
      _error = null;
      _message = null;
    });
    try {
      await operation();
      if (mounted) setState(() => _message = 'Indstillingerne er gemt.');
    } catch (failure) {
      if (mounted) setState(() => _error = failure.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _checkUpdate() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final value = await _preferences.checkForUpdate();
      if (!mounted) return;
      setState(() {
        _release = value;
        _message = value == null
            ? 'Der findes endnu ingen Android-release.'
            : value.isNewer
            ? 'Version ${value.version} er klar.'
            : 'Appen er opdateret.';
      });
    } catch (failure) {
      if (mounted) setState(() => _error = failure.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _installUpdate() async {
    final release = _release;
    if (release == null) return;
    final started = await _preferences.installUpdate(release);
    if (mounted && !started) {
      setState(
        () => _message =
            'Tillad installation fra BoltBytes, og vælg derefter igen.',
      );
    }
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final options = _options;
    switch (event.logicalKey) {
      case LogicalKeyboardKey.arrowUp:
        setState(() {
          if (_inOptions) {
            _option = (_option - 1).clamp(0, options.length - 1);
          } else {
            _category = (_category - 1).clamp(0, _categories.length - 1);
            _option = 0;
          }
        });
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        setState(() {
          if (_inOptions) {
            _option = (_option + 1).clamp(0, options.length - 1);
          } else {
            _category = (_category + 1).clamp(0, _categories.length - 1);
            _option = 0;
          }
        });
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        if (!_inOptions) {
          setState(() => _inOptions = true);
        } else {
          options[_option].onRight?.call();
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowLeft:
        if (_inOptions && options[_option].onLeft != null) {
          options[_option].onLeft!.call();
        } else {
          setState(() => _inOptions = false);
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.enter:
      case LogicalKeyboardKey.numpadEnter:
      case LogicalKeyboardKey.select:
      case LogicalKeyboardKey.space:
        if (!_inOptions) {
          setState(() => _inOptions = true);
        } else {
          final action = options[_option].onActivate;
          if (action != null) unawaited(Future<void>.sync(action));
        }
        return KeyEventResult.handled;
      case LogicalKeyboardKey.escape:
      case LogicalKeyboardKey.goBack:
      case LogicalKeyboardKey.browserBack:
        if (_inOptions) {
          setState(() => _inOptions = false);
        } else {
          unawaited(Navigator.of(context).maybePop());
        }
        return KeyEventResult.handled;
      default:
        return KeyEventResult.ignored;
    }
  }

  @override
  void dispose() {
    _root.dispose();
    super.dispose();
  }

  IconData _categoryIcon(int index) => switch (index) {
    0 => Icons.play_circle_outline_rounded,
    1 => Icons.subtitles_rounded,
    2 => Icons.spatial_audio_off_rounded,
    3 => Icons.hdr_auto_rounded,
    _ => Icons.settings_applications_rounded,
  };

  String _categoryDescription(int index) => switch (index) {
    0 => 'Autoplay, bufferprofil og afspilningshastighed.',
    1 => 'Sprog, visning, stil, størrelse og synkronisering.',
    2 => 'Foretrukken lyd og sprogprioritet for profilen.',
    3 => 'Kvalitet, opløsning, HDR, opskalering og dataforbrug.',
    _ => 'Version, opdateringer og TV-app status.',
  };

  @override
  Widget build(BuildContext context) {
    final options = _options;
    _option = _option.clamp(0, options.length - 1);
    return TvPageScaffold(
      focusNode: _root,
      autofocus: true,
      onKeyEvent: _handleKey,
      eyebrow: 'PERSONLIG TILPASNING',
      title: 'Indstillinger',
      subtitle: _categoryDescription(_category),
      icon: Icons.tune_rounded,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_saving) ...[
            const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 10),
          ],
          const TvStatusPill(
            label: '↑↓ vælg  ·  ←→ justér  ·  OK aktivér',
            icon: Icons.gamepad_outlined,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_message != null || _error != null) ...[
            TvInlineNotice(
              message: _error ?? _message!,
              error: _error != null,
            ),
            const SizedBox(height: 12),
          ],
          Expanded(
            child: _loading
                ? const TvStateView(
                    icon: Icons.tune_rounded,
                    title: 'Henter indstillinger',
                    message: 'Indlæser profil- og enhedsvalg.',
                    busy: true,
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TvPanel(
                        width: TvDesignTokens.contentRailWidth,
                        padding: const EdgeInsets.all(9),
                        child: ListView.separated(
                          itemCount: _categories.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, index) {
                            final focused =
                                !_inOptions && index == _category;
                            final selected = index == _category;
                            return _settingsTile(
                              focused: focused,
                              selected: selected,
                              child: Row(
                                children: [
                                  Container(
                                    width: 34,
                                    height: 34,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: selected
                                          ? TvDesignTokens.gold.withValues(
                                              alpha: 0.13,
                                            )
                                          : Colors.white.withValues(
                                              alpha: 0.035,
                                            ),
                                    ),
                                    child: Icon(
                                      _categoryIcon(index),
                                      color: selected
                                          ? TvDesignTokens.goldSoft
                                          : TvDesignTokens.textMuted,
                                      size: 19,
                                    ),
                                  ),
                                  const SizedBox(width: 11),
                                  Expanded(
                                    child: Text(
                                      _categories[index],
                                      style: TextStyle(
                                        fontSize: 15.5,
                                        fontWeight: selected
                                            ? FontWeight.w900
                                            : FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  if (selected)
                                    const Icon(
                                      Icons.chevron_right_rounded,
                                      size: 18,
                                      color: TvDesignTokens.goldSoft,
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 18),
                      Expanded(
                        child: TvPanel(
                          padding: const EdgeInsets.all(15),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    _categories[_category],
                                    style: const TextStyle(
                                      fontSize: 23,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: -0.3,
                                    ),
                                  ),
                                  const Spacer(),
                                  TvStatusPill(
                                    label: '${options.length} valg',
                                    icon: Icons.tune_rounded,
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              Expanded(
                                child: ListView.separated(
                                  itemCount: options.length,
                                  separatorBuilder: (_, _) =>
                                      const SizedBox(height: 8),
                                  itemBuilder: (_, index) {
                                    final option = options[index];
                                    return _settingsTile(
                                      focused:
                                          _inOptions && index == _option,
                                      selected: false,
                                      child: Row(
                                        children: [
                                          Icon(
                                            option.icon,
                                            color: TvDesignTokens.gold,
                                            size: 20,
                                          ),
                                          const SizedBox(width: 13),
                                          Expanded(
                                            child: Text(
                                              option.label,
                                              style: const TextStyle(
                                                fontSize: 15.5,
                                                fontWeight: FontWeight.w700,
                                              ),
                                            ),
                                          ),
                                          if (option.onLeft != null)
                                            const Icon(
                                              Icons.chevron_left_rounded,
                                              color: Colors.white38,
                                            ),
                                          Container(
                                            constraints: const BoxConstraints(
                                              minWidth: 142,
                                            ),
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 12,
                                              vertical: 7,
                                            ),
                                            decoration: BoxDecoration(
                                              color: Colors.white.withValues(
                                                alpha: 0.045,
                                              ),
                                              borderRadius:
                                                  BorderRadius.circular(999),
                                              border: Border.all(
                                                color: Colors.white10,
                                              ),
                                            ),
                                            child: Text(
                                              option.value,
                                              textAlign: TextAlign.center,
                                              style: const TextStyle(
                                                color:
                                                    TvDesignTokens.goldSoft,
                                                fontSize: 14,
                                                fontWeight: FontWeight.w900,
                                              ),
                                            ),
                                          ),
                                          if (option.onRight != null)
                                            const Icon(
                                              Icons.chevron_right_rounded,
                                              color: Colors.white38,
                                            ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _settingsTile({
    required bool focused,
    required bool selected,
    required Widget child,
  }) => AnimatedScale(
    scale: focused ? 1.018 : 1,
    duration: TvDesignTokens.focusAnimationDuration,
    child: AnimatedContainer(
      duration: TvDesignTokens.focusAnimationDuration,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        gradient: focused
            ? const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF2A2214), Color(0xFF151B22)],
              )
            : null,
        color: focused
            ? null
            : selected
            ? TvDesignTokens.selectedFill
            : const Color(0xAA070B10),
        borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
        border: Border.all(
          color: focused
              ? TvDesignTokens.focusFill
              : selected
              ? const Color(0x665E4A26)
              : TvDesignTokens.panelBorderSoft,
          width: focused ? TvDesignTokens.focusBorderWidth : 1,
        ),
        boxShadow: focused
            ? const [
                BoxShadow(
                  color: Color(0x55FFC857),
                  blurRadius: 18,
                  offset: Offset(0, 7),
                ),
              ]
            : const [],
      ),
      child: child,
    ),
  );
}

class _TvSettingOption {
  const _TvSettingOption({
    required this.label,
    required this.value,
    required this.icon,
    this.onLeft,
    this.onRight,
    this.onActivate,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback? onLeft;
  final VoidCallback? onRight;
  final FutureOr<void> Function()? onActivate;
}

String _cycle(List<String> values, String current, int direction) {
  final index = values.indexOf(current);
  final start = index < 0 ? 0 : index;
  return values[(start + direction) % values.length];
}

String _languageLabel(String value) => switch (value) {
  'da' => 'Dansk',
  'en' => 'Engelsk',
  'de' => 'Tysk',
  'sv' => 'Svensk',
  'no' => 'Norsk',
  _ => 'Automatisk',
};
