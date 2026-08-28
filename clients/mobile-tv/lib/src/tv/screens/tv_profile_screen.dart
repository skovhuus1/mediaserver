import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import '../../state/app_controller.dart';
import '../../widgets/brand.dart';
import '../widgets/tv_premium_layout.dart';
import '../tv_focus_controller.dart';

typedef TvProfileSelectionHandler =
    Future<void> Function(ProfileSummary profile, String? pin);

class TvProfileScreen extends StatefulWidget {
  const TvProfileScreen({
    required this.controller,
    this.onSelectProfile,
    super.key,
  });

  final AppController controller;
  final TvProfileSelectionHandler? onSelectProfile;

  @override
  State<TvProfileScreen> createState() => _TvProfileScreenState();
}

class _TvProfileScreenState extends State<TvProfileScreen> {
  late final List<ProfileSummary> _profiles;
  late final List<FocusNode> _profileNodes;
  late final List<_TvProfileAction> _actions;
  late final List<FocusNode> _actionNodes;
  late final TvFocusController _focusController;
  int _focusRequestEpoch = 0;

  @override
  void initState() {
    super.initState();
    _profiles = List<ProfileSummary>.unmodifiable(
      widget.controller.user?.profiles ?? const [],
    );
    _profileNodes = List.generate(
      _profiles.isEmpty ? 1 : _profiles.length,
      (index) => FocusNode(
        debugLabel: 'tv-profile-item-$index',
        onKeyEvent: _handleKey,
      ),
    );
    _actions = [
      if (widget.controller.activeProfile != null)
        _TvProfileAction(
          label: 'Til bibliotek',
          icon: Icons.home_rounded,
          onPressed: widget.controller.showLibrary,
        ),
      _TvProfileAction(
        label: 'Log ud',
        icon: Icons.logout_rounded,
        onPressed: () => unawaited(widget.controller.logout()),
      ),
    ];
    _actionNodes = List.generate(
      _actions.length,
      (index) => FocusNode(
        debugLabel: 'tv-profile-action-$index',
        onKeyEvent: _handleKey,
      ),
    );
    _focusController = TvFocusController(
      topRowNodes: _profileNodes,
      activeTopTab: 0,
      activeSection: -1,
      activeItem: 0,
    );
    for (var index = 0; index < _profileNodes.length; index++) {
      final node = _profileNodes[index];
      final itemIndex = index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifyTopNodeFocus(itemIndex);
        }
      });
    }
    for (var index = 0; index < _actionNodes.length; index++) {
      final node = _actionNodes[index];
      final itemIndex = index;
      node.addListener(() {
        if (node.hasFocus) {
          _focusController.notifySectionNodeFocus(
            TvDesignTokens.actionSectionIndex,
            itemIndex,
          );
        }
      });
    }
    _focusController.replaceSections({
      TvDesignTokens.actionSectionIndex: _actionNodes,
    }, notify: false);
    widget.controller.addListener(_controllerChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focusController.requestCurrentFocus();
    });
  }

  @override
  void dispose() {
    widget.controller.removeListener(_controllerChanged);
    for (final node in [..._profileNodes, ..._actionNodes]) {
      node.dispose();
    }
    _focusController.dispose();
    super.dispose();
  }

  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final handled = switch (event.logicalKey) {
      LogicalKeyboardKey.arrowLeft => _moveHorizontal(-1),
      LogicalKeyboardKey.arrowRight => _moveHorizontal(1),
      LogicalKeyboardKey.arrowDown => _moveVertical(1),
      LogicalKeyboardKey.arrowUp => _moveVertical(-1),
      LogicalKeyboardKey.enter ||
      LogicalKeyboardKey.numpadEnter ||
      LogicalKeyboardKey.space ||
      LogicalKeyboardKey.select => _activateFocused(),
      LogicalKeyboardKey.escape ||
      LogicalKeyboardKey.goBack ||
      LogicalKeyboardKey.browserBack => _goBack(),
      _ => false,
    };
    return handled ? KeyEventResult.handled : KeyEventResult.ignored;
  }

  bool _moveHorizontal(int delta) {
    final state = _focusController.state;
    if (state.sectionIndex == TvDesignTokens.actionSectionIndex) {
      final target = (state.itemIndex + delta)
          .clamp(0, _actionNodes.length - 1)
          .toInt();
      return _focusNode(
        sectionIndex: TvDesignTokens.actionSectionIndex,
        itemIndex: target,
        node: _actionNodes[target],
      );
    }
    final last = _profileNodes.length - 1;
    final target = delta < 0
        ? (state.topTab == 0 ? last : state.topTab - 1)
        : (state.topTab == last ? 0 : state.topTab + 1);
    return _focusNode(
      topTab: target,
      sectionIndex: -1,
      itemIndex: 0,
      node: _profileNodes[target],
    );
  }

  bool _moveVertical(int delta) {
    final state = _focusController.state;
    if (delta > 0) {
      if (state.isTopRow) {
        return _focusNode(
          sectionIndex: TvDesignTokens.actionSectionIndex,
          itemIndex: 0,
          node: _actionNodes.first,
        );
      }
      return true;
    }
    if (state.isTopRow) return true;
    return _focusNode(
      sectionIndex: -1,
      itemIndex: 0,
      node: _profileNodes[state.topTab],
    );
  }

  bool _focusNode({
    int? topTab,
    required int sectionIndex,
    required int itemIndex,
    required FocusNode node,
  }) {
    _focusController.setActive(
      topTab: topTab ?? _focusController.state.topTab,
      sectionIndex: sectionIndex,
      itemIndex: itemIndex,
    );
    final epoch = ++_focusRequestEpoch;
    FocusScope.of(context).requestFocus(node);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && epoch == _focusRequestEpoch) node.requestFocus();
    });
    return true;
  }

  bool _activateFocused() {
    if (widget.controller.busy) return true;
    final state = _focusController.state;
    if (state.isTopRow) {
      if (_profiles.isNotEmpty && state.topTab < _profiles.length) {
        unawaited(_selectProfile(_profiles[state.topTab]));
      }
      return true;
    }
    if (state.sectionIndex == TvDesignTokens.actionSectionIndex &&
        state.itemIndex >= 0 &&
        state.itemIndex < _actions.length) {
      _actions[state.itemIndex].onPressed();
    }
    return true;
  }

  bool _goBack() {
    if (widget.controller.activeProfile != null) {
      widget.controller.showLibrary();
    } else {
      unawaited(Navigator.of(context).maybePop());
    }
    return true;
  }

  Future<void> _selectProfile(ProfileSummary profile) async {
    String? pin;
    if (profile.hasPin) {
      pin = await _requestPin(profile);
      if (pin == null) {
        _focusController.requestCurrentFocus();
        return;
      }
    }
    final handler = widget.onSelectProfile;
    if (handler != null) {
      await handler(profile, pin);
    } else {
      await widget.controller.selectProfile(profile, pin: pin);
    }
    if (mounted && widget.controller.stage == AppStage.profiles) {
      _focusController.requestCurrentFocus();
    }
  }

  Future<String?> _requestPin(ProfileSummary profile) async {
    final pin = await showDialog<String>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.78),
      builder: (_) => _TvPinDialog(profileName: profile.name),
    );
    final normalized = pin?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.controller.user;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Focus(
        canRequestFocus: true,
        onKeyEvent: _handleKey,
        child: Stack(
          children: [
            const Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment(-0.55, -0.75),
                    radius: 1.2,
                    colors: [
                      Color(0xFF392D1A),
                      Color(0xFF10151B),
                      TvDesignTokens.background,
                    ],
                    stops: [0, 0.48, 1],
                  ),
                ),
              ),
            ),
            Positioned(
              right: -120,
              bottom: -210,
              width: 520,
              height: 520,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        TvDesignTokens.cyan.withValues(alpha: 0.09),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: TvDesignTokens.pageHorizontalPadding,
                  vertical: TvDesignTokens.pageVerticalPadding,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        BrandMark(size: 50),
                        SizedBox(width: 14),
                        Text(
                          'BOLTBYTES  /  PROFILER',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 2.3,
                            color: Color(0xFFC5D2DD),
                          ),
                        ),
                        Spacer(),
                        TvStatusPill(
                          label: 'OK vælg  ·  PIN beskyttet',
                          icon: Icons.lock_outline_rounded,
                        ),
                      ],
                    ),
                    const Spacer(),
                    Center(
                      child: Column(
                        children: [
                          const Text(
                            'Hvem ser med?',
                            style: TextStyle(
                              fontSize: 46,
                              height: 0.96,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1.1,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            user == null
                                ? 'Vælg en profil for at fortsætte'
                                : '${user.displayName} · vælg seerprofil',
                            style: const TextStyle(
                              color: Color(0xFFAEC0D0),
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 30),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: _profiles.isEmpty
                                  ? [
                                      _TvEmptyProfileCard(
                                        focusNode: _profileNodes.first,
                                        onKeyEvent: _handleKey,
                                      ),
                                    ]
                                  : List.generate(
                                      _profiles.length,
                                      (index) => Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 9,
                                        ),
                                        child: _TvProfileCard(
                                          focusNode: _profileNodes[index],
                                          onKeyEvent: _handleKey,
                                          profile: _profiles[index],
                                          active:
                                              widget
                                                  .controller
                                                  .activeProfile
                                                  ?.id ==
                                              _profiles[index].id,
                                          onPressed: () => unawaited(
                                            _selectProfile(_profiles[index]),
                                          ),
                                        ),
                                      ),
                                    ),
                            ),
                          ),
                          const SizedBox(height: 22),
                          Wrap(
                            spacing: 14,
                            children: List.generate(
                              _actions.length,
                              (index) => _TvProfileActionButton(
                                focusNode: _actionNodes[index],
                                onKeyEvent: _handleKey,
                                action: _actions[index],
                              ),
                            ),
                          ),
                          if (widget.controller.error != null) ...[
                            const SizedBox(height: 20),
                            Text(
                              widget.controller.error!,
                              style: const TextStyle(
                                color: Color(0xFFFF9A9A),
                                fontSize: 17,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const Spacer(),
                    const Center(
                      child: Text(
                        'Brug piletasterne til at vælge · OK for at fortsætte',
                        style: TextStyle(
                          color: Color(0xFF748A9D),
                          fontSize: 14,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (widget.controller.busy)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0x77000000),
                      child: Center(
                        child: TvPanel(
                          padding: EdgeInsets.all(24),
                          child: SizedBox.square(
                            dimension: 36,
                            child: CircularProgressIndicator(strokeWidth: 2.5),
                          ),
                        ),
                      ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TvPinDialog extends StatefulWidget {
  const _TvPinDialog({required this.profileName});

  final String profileName;

  @override
  State<_TvPinDialog> createState() => _TvPinDialogState();
}

class _TvPinDialogState extends State<_TvPinDialog> {
  static const _labels = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    'Slet',
    '0',
    'Fortsæt',
  ];

  late final List<FocusNode> _nodes = List.generate(
    _labels.length,
    (index) => FocusNode(debugLabel: 'tv-pin-key-$index'),
  );
  String _pin = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _nodes.first.requestFocus();
    });
  }

  @override
  void dispose() {
    for (final node in _nodes) {
      node.dispose();
    }
    super.dispose();
  }

  KeyEventResult _handleKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;
    if (key == LogicalKeyboardKey.escape ||
        key == LogicalKeyboardKey.goBack ||
        key == LogicalKeyboardKey.browserBack) {
      Navigator.of(context).pop();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.backspace ||
        key == LogicalKeyboardKey.delete) {
      _removeDigit();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.enter ||
        key == LogicalKeyboardKey.numpadEnter ||
        key == LogicalKeyboardKey.select ||
        key == LogicalKeyboardKey.space) {
      _submit();
      return KeyEventResult.handled;
    }
    final digit = _digitForKey(key);
    if (digit != null) {
      _appendDigit(digit);
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  String? _digitForKey(LogicalKeyboardKey key) {
    final label = key.keyLabel.trim();
    if (label.length == 1 && '0123456789'.contains(label)) return label;
    return switch (key) {
      LogicalKeyboardKey.digit0 || LogicalKeyboardKey.numpad0 => '0',
      LogicalKeyboardKey.digit1 || LogicalKeyboardKey.numpad1 => '1',
      LogicalKeyboardKey.digit2 || LogicalKeyboardKey.numpad2 => '2',
      LogicalKeyboardKey.digit3 || LogicalKeyboardKey.numpad3 => '3',
      LogicalKeyboardKey.digit4 || LogicalKeyboardKey.numpad4 => '4',
      LogicalKeyboardKey.digit5 || LogicalKeyboardKey.numpad5 => '5',
      LogicalKeyboardKey.digit6 || LogicalKeyboardKey.numpad6 => '6',
      LogicalKeyboardKey.digit7 || LogicalKeyboardKey.numpad7 => '7',
      LogicalKeyboardKey.digit8 || LogicalKeyboardKey.numpad8 => '8',
      LogicalKeyboardKey.digit9 || LogicalKeyboardKey.numpad9 => '9',
      _ => null,
    };
  }

  void _appendDigit(String value) {
    if (_pin.length >= 12) return;
    setState(() => _pin += value);
  }

  void _removeDigit() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  void _submit() {
    if (_pin.isEmpty) return;
    Navigator.of(context).pop(_pin);
  }

  void _press(String label) {
    if (label == 'Slet') {
      _removeDigit();
      return;
    }
    if (label == 'Fortsæt') {
      _submit();
      return;
    }
    _appendDigit(label);
  }

  @override
  Widget build(BuildContext context) => Dialog(
    backgroundColor: Colors.transparent,
    insetPadding: const EdgeInsets.all(36),
    child: Focus(
      autofocus: true,
      onKeyEvent: _handleKey,
      child: Container(
        width: 520,
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: const Color(0xF207080A),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0x88403322)),
          boxShadow: const [
            BoxShadow(
              color: Color(0xD9000000),
              blurRadius: 40,
              offset: Offset(0, 20),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Profil-PIN',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 5),
            Text(
              widget.profileName,
              style: const TextStyle(
                color: Color(0xFFB9C4CE),
                fontSize: 15,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: List.generate(6, (index) {
                final filled = index < _pin.length;
                return Container(
                  width: 44,
                  height: 44,
                  margin: const EdgeInsets.only(right: 8),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: filled
                        ? const Color(0xFFFFF4D0)
                        : const Color(0xFF101215),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(
                      color: filled ? Colors.white : const Color(0xFF332D21),
                    ),
                  ),
                  child: filled
                      ? const Icon(
                          Icons.circle,
                          size: 12,
                          color: Color(0xFF090806),
                        )
                      : null,
                );
              }),
            ),
            const SizedBox(height: 18),
            FocusTraversalGroup(
              policy: OrderedTraversalPolicy(),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 9,
                  crossAxisSpacing: 9,
                  mainAxisExtent: 54,
                ),
                itemCount: _labels.length,
                itemBuilder: (context, index) => FocusTraversalOrder(
                  order: NumericFocusOrder(index.toDouble()),
                  child: _TvPinKey(
                    focusNode: _nodes[index],
                    label: _labels[index],
                    enabled: _labels[index] != 'Fortsæt' || _pin.isNotEmpty,
                    onPressed: () => _press(_labels[index]),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 13),
            const Text(
              'Brug fjernbetjeningen eller tastaturets tal. Tilbage annullerer.',
              style: TextStyle(color: Color(0xFF7D8C98), fontSize: 12.5),
            ),
          ],
        ),
      ),
    ),
  );
}

class _TvPinKey extends StatefulWidget {
  const _TvPinKey({
    required this.focusNode,
    required this.label,
    required this.enabled,
    required this.onPressed,
  });

  final FocusNode focusNode;
  final String label;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  State<_TvPinKey> createState() => _TvPinKeyState();
}

class _TvPinKeyState extends State<_TvPinKey> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: widget.focusNode,
    onKeyEvent: (_, event) {
      if (event is KeyDownEvent &&
          (event.logicalKey == LogicalKeyboardKey.enter ||
              event.logicalKey == LogicalKeyboardKey.select)) {
        if (widget.enabled) widget.onPressed();
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    },
    onFocusChange: (value) => setState(() => _focused = value),
    child: GestureDetector(
      onTap: widget.enabled ? widget.onPressed : null,
      child: AnimatedScale(
        scale: _focused ? 1.045 : 1,
        duration: const Duration(milliseconds: 110),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 110),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: !widget.enabled
                ? const Color(0x44101215)
                : _focused
                ? TvDesignTokens.goldSoft
                : TvDesignTokens.surfaceRaised,
            borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
            border: Border.all(
              color: _focused ? Colors.white : TvDesignTokens.panelBorderSoft,
              width: _focused ? 2 : 1,
            ),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              color: !widget.enabled
                  ? Colors.white38
                  : _focused
                  ? const Color(0xFF090806)
                  : Colors.white,
              fontSize: widget.label.length == 1 ? 23 : 15,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    ),
  );
}

class _TvProfileAction {
  const _TvProfileAction({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final VoidCallback onPressed;
}

class _TvProfileCard extends StatefulWidget {
  const _TvProfileCard({
    required this.focusNode,
    required this.onKeyEvent,
    required this.profile,
    required this.active,
    required this.onPressed,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final ProfileSummary profile;
  final bool active;
  final VoidCallback onPressed;

  @override
  State<_TvProfileCard> createState() => _TvProfileCardState();
}

class _TvProfileCardState extends State<_TvProfileCard> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: widget.focusNode,
    onKeyEvent: widget.onKeyEvent,
    onFocusChange: (value) {
      setState(() => _focused = value);
      if (value) _ensureProfileVisible(context);
    },
    child: GestureDetector(
      onTap: widget.onPressed,
      child: AnimatedScale(
        scale: _focused ? TvDesignTokens.focusScale : 1,
        duration: const Duration(milliseconds: 140),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          width: TvDesignTokens.profileCardWidth,
          height: TvDesignTokens.profileCardHeight,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: _focused
                  ? const [Color(0xFF3A2F1C), Color(0xFF151C24)]
                  : const [Color(0xE8151B22), Color(0xE6090C10)],
            ),
            borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
            border: Border.all(
              color: _focused
                  ? TvDesignTokens.goldSoft
                  : widget.active
                  ? const Color(0xFFE5A424)
                  : TvDesignTokens.panelBorderSoft,
              width: _focused ? TvDesignTokens.focusBorderWidth : 1,
            ),
            boxShadow: _focused
                ? const [
                    BoxShadow(
                      color: Color(0x77000000),
                      blurRadius: 24,
                      offset: Offset(0, 12),
                    ),
                  ]
                : const [],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                children: [
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _focused
                            ? TvDesignTokens.goldSoft
                            : Colors.white12,
                        width: 2,
                      ),
                    ),
                    child: CircleAvatar(
                      radius: 41,
                      backgroundColor: _profileColor(widget.profile.id),
                      child: Text(
                        _profileInitials(widget.profile.name),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                  if (widget.profile.hasPin)
                    const Positioned(
                      right: 0,
                      bottom: 0,
                      child: CircleAvatar(
                        radius: 14,
                        backgroundColor: Color(0xFF080D12),
                        child: Icon(Icons.lock, size: 15, color: Colors.white),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                widget.profile.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                widget.profile.isChildProfile
                    ? 'Børneprofil'
                    : widget.active
                    ? 'Aktiv profil'
                    : 'Seerprofil',
                style: TextStyle(
                  color: widget.active
                      ? const Color(0xFFF2C25F)
                      : const Color(0xFF9CB0C1),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _TvEmptyProfileCard extends StatefulWidget {
  const _TvEmptyProfileCard({
    required this.focusNode,
    required this.onKeyEvent,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;

  @override
  State<_TvEmptyProfileCard> createState() => _TvEmptyProfileCardState();
}

class _TvEmptyProfileCardState extends State<_TvEmptyProfileCard> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: widget.focusNode,
    onKeyEvent: widget.onKeyEvent,
    onFocusChange: (value) => setState(() => _focused = value),
    child: Container(
      width: TvDesignTokens.profileCardWidth,
      height: 150,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: const Color(0xCC111D28),
        borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
        border: Border.all(
          color: _focused ? Colors.white : const Color(0xFF304253),
          width: _focused ? TvDesignTokens.focusBorderWidth : 1,
        ),
      ),
      child: const Text(
        'Ingen profiler',
        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

class _TvProfileActionButton extends StatefulWidget {
  const _TvProfileActionButton({
    required this.focusNode,
    required this.onKeyEvent,
    required this.action,
  });

  final FocusNode focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent) onKeyEvent;
  final _TvProfileAction action;

  @override
  State<_TvProfileActionButton> createState() => _TvProfileActionButtonState();
}

class _TvProfileActionButtonState extends State<_TvProfileActionButton> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: widget.focusNode,
    onKeyEvent: widget.onKeyEvent,
    onFocusChange: (value) => setState(() => _focused = value),
    child: GestureDetector(
      onTap: widget.action.onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 130),
        height: TvDesignTokens.actionButtonHeight,
        padding: const EdgeInsets.symmetric(horizontal: 22),
        decoration: BoxDecoration(
          gradient: _focused
              ? const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFFFFF2C1), TvDesignTokens.gold],
                )
              : const LinearGradient(
                  colors: [Color(0xDD151C24), Color(0xDD0A0E13)],
                ),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: _focused ? Colors.white : const Color(0xFF34495C),
            width: _focused ? TvDesignTokens.focusBorderWidth : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              widget.action.icon,
              color: _focused ? Colors.black : Colors.white,
            ),
            const SizedBox(width: 10),
            Text(
              widget.action.label,
              style: TextStyle(
                color: _focused ? Colors.black : Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

String _profileInitials(String name) {
  final words = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .take(2)
      .toList(growable: false);
  if (words.isEmpty) return '?';
  return words.map((word) => word[0].toUpperCase()).join();
}

Color _profileColor(String id) {
  const palette = [
    Color(0xFF376FA5),
    Color(0xFF2D8A70),
    Color(0xFFA35D4B),
    Color(0xFF7C5FA5),
    Color(0xFFA48035),
  ];
  return palette[id.hashCode.abs() % palette.length];
}

void _ensureProfileVisible(BuildContext context) {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    if (!context.mounted) return;
    Scrollable.ensureVisible(
      context,
      alignment: 0.5,
      duration: const Duration(milliseconds: 160),
      curve: Curves.easeOut,
    );
  });
}
