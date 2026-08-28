import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../app.dart';
import '../core/models.dart';
import '../shared_core/ui_tokens/tv_design_tokens.dart';
import '../state/app_controller.dart';
import '../widgets/brand.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({required this.controller, super.key});

  final AppController controller;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _server;
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _form = GlobalKey<FormState>();
  final _serverFocus = FocusNode(debugLabel: 'tv-login-server');
  final _serverSwitchFocus = FocusNode(debugLabel: 'tv-login-server-switch');
  final _qrActionFocus = FocusNode(debugLabel: 'tv-login-qr-action');
  final _startupRetryFocus = FocusNode(debugLabel: 'tv-login-startup-retry');
  final _emailFocus = FocusNode(debugLabel: 'tv-login-email');
  final _passwordFocus = FocusNode(debugLabel: 'tv-login-password');
  final _loginButtonFocus = FocusNode(debugLabel: 'tv-login-submit');
  final _tvControlsScroll = ScrollController();
  Timer? _qrPollTimer;
  TvLoginPairing? _tvPairing;
  String? _qrMessage;
  FocusNode? _tvKeyboardFocus;
  int _qrPollFailures = 0;
  bool _qrStarting = false;
  bool _manualLoginInFlight = false;
  bool _tvKeyboardOpen = false;
  bool _showPassword = false;
  bool _editServer = false;

  @override
  void initState() {
    super.initState();
    _server = TextEditingController(text: widget.controller.serverUrl);
    _editServer = _server.text.trim().isEmpty;
    for (final node in _tvFocusNodes) {
      node.addListener(_keepFocusedActionVisible);
    }
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _focusInitialTvAction(),
    );
  }

  @override
  void dispose() {
    _qrPollTimer?.cancel();
    _server.dispose();
    _email.dispose();
    _password.dispose();
    for (final node in _tvFocusNodes) {
      node.removeListener(_keepFocusedActionVisible);
      node.dispose();
    }
    _tvControlsScroll.dispose();
    super.dispose();
  }

  List<FocusNode> get _tvFocusNodes => [
    _serverFocus,
    _serverSwitchFocus,
    _qrActionFocus,
    _startupRetryFocus,
    _emailFocus,
    _passwordFocus,
    _loginButtonFocus,
  ];

  void _focusInitialTvAction() {
    if (!mounted || !useTvLayout(context)) return;
    _emailFocus.requestFocus();
    unawaited(_startQrLogin());
  }

  void _focusAfterBuild(FocusNode node) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && node.canRequestFocus) node.requestFocus();
    });
  }

  void _keepFocusedActionVisible() {
    final focused = _tvFocusNodes.where((node) => node.hasFocus).firstOrNull;
    if (focused == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final focusContext = focused.context;
      if (!mounted || !focused.hasFocus || focusContext == null) return;
      Scrollable.ensureVisible(
        focusContext,
        alignment: 0.5,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOutCubic,
      );
    });
  }

  void _editServerAddress() {
    setState(() => _editServer = true);
    _focusAfterBuild(_serverFocus);
  }

  Future<void> _submit() async {
    _server.text = _normalizeServerInput(_server.text);
    if (!(_form.currentState?.validate() ?? false)) return;
    final tv = useTvLayout(context);
    if (tv) {
      _qrPollTimer?.cancel();
      setState(() => _manualLoginInFlight = true);
    }
    try {
      await widget.controller.login(
        email: _email.text.trim(),
        password: _password.text,
        requestedServerUrl: _server.text,
      );
    } finally {
      if (mounted && tv) {
        setState(() => _manualLoginInFlight = false);
        final pairing = _tvPairing;
        if (pairing != null && DateTime.now().isBefore(pairing.expiresAt)) {
          _scheduleQrPoll(const Duration(seconds: 1));
        } else {
          _scheduleQrRestart(const Duration(seconds: 1));
        }
      }
    }
  }

  Future<void> _startQrLogin() async {
    if (!mounted || _qrStarting || _manualLoginInFlight) return;
    _server.text = _normalizeServerInput(_server.text);
    final serverError = _validateServerInput(_server.text);
    if (serverError != null) {
      setState(
        () => _qrMessage = useTvLayout(context)
            ? 'QR-login er ikke tilgængeligt lige nu.'
            : serverError,
      );
      return;
    }
    _qrPollTimer?.cancel();
    setState(() {
      _qrStarting = true;
      _tvPairing = null;
      _qrMessage = 'Opretter sikker QR-kode...';
    });
    final pairing = await widget.controller.startTvLogin(
      requestedServerUrl: _server.text,
    );
    if (!mounted) return;
    setState(() {
      _qrStarting = false;
      _tvPairing = pairing;
      _qrPollFailures = 0;
      _qrMessage = pairing == null
          ? 'QR-login kunne ikke oprettes. Prøver automatisk igen.'
          : 'Scan QR-koden med en mobil eller browser, hvor du allerede er logget ind.';
    });
    if (pairing != null) {
      _scheduleQrPoll(const Duration(milliseconds: 700));
    } else {
      _scheduleQrRestart(const Duration(seconds: 5));
    }
  }

  void _scheduleQrRestart([Duration delay = const Duration(seconds: 2)]) {
    _qrPollTimer?.cancel();
    if (!mounted || _manualLoginInFlight) return;
    _qrPollTimer = Timer(delay, () {
      if (!mounted || _manualLoginInFlight) return;
      _restartQrLogin();
    });
  }

  void _scheduleQrPoll([Duration? delay]) {
    _qrPollTimer?.cancel();
    if (_manualLoginInFlight) return;
    final pairing = _tvPairing;
    if (pairing == null) return;
    final seconds = pairing.pollIntervalSeconds.clamp(1, 10);
    _qrPollTimer = Timer(delay ?? Duration(seconds: seconds), _pollQrLogin);
  }

  Future<void> _pollQrLogin() async {
    final pairing = _tvPairing;
    if (!mounted || pairing == null || _manualLoginInFlight) return;
    if (DateTime.now().isAfter(pairing.expiresAt)) {
      setState(() {
        _tvPairing = null;
        _qrMessage = 'QR-koden er udløbet. Opretter en ny kode...';
      });
      _scheduleQrRestart(const Duration(milliseconds: 500));
      return;
    }
    try {
      final result = await widget.controller.pollTvLogin(pairing);
      if (!mounted) return;
      if (result.isApproved) {
        _qrPollTimer?.cancel();
        setState(() => _qrMessage = 'Godkendt. Logger ind...');
        return;
      }
      if (result.isExpired) {
        setState(() {
          _tvPairing = null;
          _qrMessage = 'QR-koden er udløbet. Opretter en ny kode...';
        });
        _scheduleQrRestart(const Duration(milliseconds: 500));
        return;
      }
      if (result.isConsumed) {
        setState(() {
          _tvPairing = null;
          _qrMessage = 'QR-koden er allerede brugt. Opretter en ny kode...';
        });
        _scheduleQrRestart(const Duration(milliseconds: 500));
        return;
      }
      setState(() {
        _qrPollFailures = 0;
        _qrMessage = 'Venter på godkendelse... Kode ${pairing.userCode}.';
      });
      _scheduleQrPoll(
        Duration(seconds: (result.pollIntervalSeconds ?? 2).clamp(1, 10)),
      );
    } catch (_) {
      if (!mounted) return;
      _qrPollFailures += 1;
      if (_qrPollFailures >= 3) {
        setState(() {
          _tvPairing = null;
          _qrMessage = 'Forbindelsen blev afbrudt. Opretter en ny QR-kode...';
        });
        _scheduleQrRestart();
      } else {
        setState(
          () => _qrMessage = 'Forbindelsen blev afbrudt. Prøver igen...',
        );
        _scheduleQrPoll(const Duration(seconds: 2));
      }
    }
  }

  void _restartQrLogin() {
    if (!mounted || _qrStarting || _manualLoginInFlight) return;
    _qrPollTimer?.cancel();
    setState(() {
      _tvPairing = null;
      _qrMessage = 'Opretter en ny QR-kode...';
      _qrStarting = false;
      _qrPollFailures = 0;
    });
    unawaited(_startQrLogin());
  }

  Future<void> _retryStartup() async {
    _qrPollTimer?.cancel();
    await widget.controller.retryStartup();
  }

  void _openTvKeyboard(FocusNode node) {
    if (!mounted || !useTvLayout(context)) return;
    node.requestFocus();
    if (!_tvKeyboardOpen || _tvKeyboardFocus != node) {
      setState(() {
        _tvKeyboardOpen = true;
        _tvKeyboardFocus = node;
      });
    }
    unawaited(SystemChannels.textInput.invokeMethod<void>('TextInput.show'));
  }

  void _closeTvKeyboard({FocusNode? nextFocus}) {
    if (!mounted) return;
    final target = nextFocus ?? _tvKeyboardFocus ?? _emailFocus;
    if (_tvKeyboardOpen || _tvKeyboardFocus != null) {
      setState(() {
        _tvKeyboardOpen = false;
        _tvKeyboardFocus = null;
      });
    }
    unawaited(SystemChannels.textInput.invokeMethod<void>('TextInput.hide'));
    _focusAfterBuild(target);
  }

  String _normalizeServerInput(String value) {
    var normalized = value.trim().replaceAll(RegExp(r'\s+'), '');
    if (normalized.isEmpty) return normalized;
    if (RegExp(r'^[a-z][a-z\d+.-]*://').hasMatch(normalized.toLowerCase())) {
      final uri = Uri.tryParse(normalized);
      if (uri != null && uri.hasAuthority) {
        normalized = uri.host;
        if (uri.hasPort) normalized = '$normalized:${uri.port}';
      } else {
        normalized = normalized.split('://').last.split('/').first;
      }
    } else if (normalized.contains('?') || normalized.contains('#')) {
      normalized = normalized.split('?').first.split('#').first;
    } else {
      normalized = normalized.split('/').first;
    }
    return normalized;
  }

  String? _validateServerInput(String? value) {
    final server = _normalizeServerInput(value ?? '');
    if (server.isEmpty) {
      return 'Indtast serverhost (fx media.boltbytes.com:6555).';
    }
    final hostPart = server.split(':').first;
    final portPart = server.split(':').skip(1).join('');
    if (hostPart.isEmpty) return 'Servernavn mangler.';
    final port = int.tryParse(portPart);
    if (portPart.isNotEmpty && port == null) {
      return 'Portnummer skal være et tal.';
    }
    if (port != null && (port < 1 || port > 65535)) {
      return 'Portnummer skal være mellem 1 og 65535.';
    }
    return null;
  }

  bool _isUrlLike(String value) =>
      value.contains('://') ||
      value.contains('/') ||
      value.contains('?') ||
      value.contains('#');

  @override
  Widget build(BuildContext context) {
    final tv = useTvLayout(context);
    Widget ordered(double order, Widget child) =>
        FocusTraversalOrder(order: NumericFocusOrder(order), child: child);
    Widget tvEditorShortcuts(FocusNode node, Widget child) {
      if (!tv) return child;
      void openKeyboard() => _openTvKeyboard(node);
      return CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.enter): openKeyboard,
          const SingleActivator(LogicalKeyboardKey.numpadEnter): openKeyboard,
          const SingleActivator(LogicalKeyboardKey.select): openKeyboard,
        },
        child: child,
      );
    }

    final mobileHero = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const BrandLockup(),
        const SizedBox(height: 36),
        Text(
          'Dit bibliotek.\nPå alle skærme.',
          style: Theme.of(
            context,
          ).textTheme.displayLarge?.copyWith(fontSize: 42, height: 0.95),
        ),
        const SizedBox(height: 14),
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 560),
          child: Text(
            'Log ind på din egen BoltBytes-server. På TV bruger du QR-login uden at skrive e-mail og adgangskode med fjernbetjeningen.',
            style: TextStyle(color: Colors.white60, height: 1.5),
          ),
        ),
      ],
    );

    final controls = ConstrainedBox(
      constraints: BoxConstraints(maxWidth: tv ? 500 : 460),
      child: Form(
        key: _form,
        child: Container(
          padding: tv ? const EdgeInsets.all(24) : EdgeInsets.zero,
          decoration: tv
              ? BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xF0182029), Color(0xEA070A0F)],
                  ),
                  borderRadius: BorderRadius.circular(
                    TvDesignTokens.panelRadius,
                  ),
                  border: Border.all(color: const Color(0x66FFE8A3)),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x99000000),
                      blurRadius: 38,
                      offset: Offset(0, 18),
                    ),
                  ],
                )
              : null,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (!tv && _editServer)
                ordered(
                  1,
                  TextFormField(
                    controller: _server,
                    focusNode: _serverFocus,
                    autofocus: false,
                    textInputAction: TextInputAction.next,
                    keyboardType: TextInputType.text,
                    autocorrect: false,
                    textCapitalization: TextCapitalization.none,
                    inputFormatters: [
                      FilteringTextInputFormatter.deny(RegExp(r'\s')),
                    ],
                    decoration: const InputDecoration(
                      labelText: 'Server',
                      hintText: 'fx media.boltbytes.com:6555',
                      prefixIcon: Icon(Icons.dns_outlined),
                      helperText: 'Du kan indsætte https://... direkte.',
                    ),
                    validator: _validateServerInput,
                    onFieldSubmitted: (_) => _emailFocus.requestFocus(),
                  ),
                ),
              if (!tv && !_editServer)
                ordered(
                  1,
                  _TvFocusFrame(
                    focusNode: _serverSwitchFocus,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF11171E),
                        border: Border.all(color: const Color(0xFF29323D)),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.verified_user_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'BoltBytes-server',
                                  style: TextStyle(fontWeight: FontWeight.w800),
                                ),
                                Text(
                                  _server.text,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: Colors.white60),
                                ),
                              ],
                            ),
                          ),
                          TextButton(
                            focusNode: _serverSwitchFocus,
                            onPressed: _editServerAddress,
                            child: const Text('Skift'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (tv) ...[
                Text(
                  'Log ind med e-mail',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 7),
                const Text(
                  'Log ind med e-mail og adgangskode, eller scan QR-koden til højre. Serveren er låst for TV.',
                  style: TextStyle(
                    color: TvDesignTokens.textMuted,
                    height: 1.35,
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 18),
              ] else
                const SizedBox(height: 14),
              ordered(
                tv ? 1 : 2,
                tvEditorShortcuts(
                  _emailFocus,
                  TextFormField(
                    controller: _email,
                    focusNode: _emailFocus,
                    autofocus: !tv,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    onTap: tv ? () => _openTvKeyboard(_emailFocus) : null,
                    onFieldSubmitted: (_) => tv
                        ? _openTvKeyboard(_passwordFocus)
                        : _passwordFocus.requestFocus(),
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(
                      labelText: 'E-mail',
                      prefixIcon: Icon(Icons.alternate_email),
                    ),
                    validator: (value) {
                      final raw = value?.trim() ?? '';
                      if (raw.isEmpty) return 'Indtast din e-mail.';
                      if (_isUrlLike(raw)) {
                        return 'Indtast kun e-mail, ikke URL.';
                      }
                      return raw.contains('@')
                          ? null
                          : 'Indtast en gyldig e-mail.';
                    },
                  ),
                ),
              ),
              const SizedBox(height: 12),
              ordered(
                tv ? 2 : 3,
                tvEditorShortcuts(
                  _passwordFocus,
                  TextFormField(
                    controller: _password,
                    focusNode: _passwordFocus,
                    obscureText: !_showPassword,
                    textInputAction: TextInputAction.done,
                    onTap: tv ? () => _openTvKeyboard(_passwordFocus) : null,
                    onFieldSubmitted: (_) {
                      if (tv) _closeTvKeyboard(nextFocus: _passwordFocus);
                      unawaited(_submit());
                    },
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Adgangskode',
                      prefixIcon: const Icon(Icons.lock_outline),
                      suffixIcon: ExcludeFocus(
                        excluding: tv,
                        child: IconButton(
                          onPressed: () =>
                              setState(() => _showPassword = !_showPassword),
                          icon: Icon(
                            _showPassword
                                ? Icons.visibility_off
                                : Icons.visibility,
                          ),
                        ),
                      ),
                    ),
                    validator: (value) => value == null || value.isEmpty
                        ? 'Indtast adgangskoden.'
                        : null,
                  ),
                ),
              ),
              if (widget.controller.visibleError != null) ...[
                const SizedBox(height: 14),
                _ErrorMessage(widget.controller.visibleError!),
              ],
              if (widget.controller.canRetryStartup) ...[
                const SizedBox(height: 12),
                ordered(
                  tv ? 4 : 5,
                  _TvFocusFrame(
                    focusNode: _startupRetryFocus,
                    child: OutlinedButton.icon(
                      focusNode: _startupRetryFocus,
                      onPressed: widget.controller.busy ? null : _retryStartup,
                      icon: const Icon(Icons.refresh_outlined),
                      label: const Text('Prøv igen'),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 18),
              ordered(
                tv ? 3 : 4,
                _TvFocusFrame(
                  focusNode: _loginButtonFocus,
                  child: FilledButton.icon(
                    focusNode: _loginButtonFocus,
                    onPressed: widget.controller.busy ? null : _submit,
                    icon: widget.controller.busy
                        ? const SizedBox.square(
                            dimension: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.login),
                    label: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Text('Log ind'),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    final qrPanel = ordered(
      5,
      _TvFocusFrame(
        focusNode: _qrActionFocus,
        child: _TvQrLoginPanel(
          pairing: _tvPairing,
          starting:
              _qrStarting || _manualLoginInFlight || widget.controller.busy,
          message: _qrMessage,
          error: widget.controller.visibleError,
          actionFocusNode: _qrActionFocus,
          onRefresh: _restartQrLogin,
        ),
      ),
    );

    Widget tvTraversal(Widget child) => CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.arrowDown): () {
          if (_tvKeyboardOpen) return;
          FocusScope.of(context).nextFocus();
        },
        const SingleActivator(LogicalKeyboardKey.arrowUp): () {
          if (_tvKeyboardOpen) return;
          FocusScope.of(context).previousFocus();
        },
      },
      child: FocusTraversalGroup(
        policy: OrderedTraversalPolicy(),
        child: child,
      ),
    );

    final screen = Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _AuthBackdrop(),
          SafeArea(
            child: tv
                ? LayoutBuilder(
                    builder: (context, constraints) {
                      // Android TV commonly reports 960 logical pixels on a
                      // 1920px panel. Use the TV-sized logical breakpoint so
                      // both login methods stay visible together.
                      final wide = constraints.maxWidth >= 900;
                      final horizontal = constraints.maxWidth >= 1500
                          ? 58.0
                          : 28.0;
                      final vertical = constraints.maxHeight >= 800
                          ? 24.0
                          : 14.0;
                      final panelWidth = (constraints.maxWidth * 0.46)
                          .clamp(410.0, 540.0)
                          .toDouble();
                      if (!wide) {
                        return tvTraversal(
                          SingleChildScrollView(
                            controller: _tvControlsScroll,
                            padding: EdgeInsets.symmetric(
                              horizontal: horizontal,
                              vertical: vertical,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const BrandLockup(),
                                const SizedBox(height: 20),
                                controls,
                                const SizedBox(height: 20),
                                qrPanel,
                              ],
                            ),
                          ),
                        );
                      }
                      return tvTraversal(
                        Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: horizontal,
                            vertical: vertical,
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Expanded(
                                child: SingleChildScrollView(
                                  controller: _tvControlsScroll,
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      const BrandLockup(),
                                      const SizedBox(height: 28),
                                      controls,
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 42),
                              SizedBox(
                                width: panelWidth,
                                height: constraints.maxHeight - (vertical * 2),
                                child: Center(
                                  child: SingleChildScrollView(child: qrPanel),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  )
                : SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 36,
                    ),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          mobileHero,
                          const SizedBox(height: 28),
                          controls,
                        ],
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
    if (!tv) return screen;
    return PopScope(
      canPop: !_tvKeyboardOpen,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _tvKeyboardOpen) _closeTvKeyboard();
      },
      child: screen,
    );
  }
}

class _TvQrLoginPanel extends StatelessWidget {
  const _TvQrLoginPanel({
    required this.pairing,
    required this.starting,
    required this.message,
    required this.error,
    required this.actionFocusNode,
    required this.onRefresh,
  });

  final TvLoginPairing? pairing;
  final bool starting;
  final String? message;
  final String? error;
  final FocusNode actionFocusNode;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final activePairing = pairing;
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xF019212A), Color(0xF2070A0F)],
        ),
        borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
        border: Border.all(color: const Color(0x66FFE8A3)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x99000000),
            blurRadius: 40,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.qr_code_2_outlined, color: TvDesignTokens.cyan),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Log ind med QR-kode',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (activePairing == null) ...[
            Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(
                    TvDesignTokens.panelRadius,
                  ),
                  border: Border.all(color: Colors.white12),
                ),
                child: SizedBox.square(
                  dimension: MediaQuery.sizeOf(context).height < 800
                      ? 174
                      : 204,
                  child: Center(
                    child: starting
                        ? const CircularProgressIndicator()
                        : const Icon(
                            Icons.qr_code_2_outlined,
                            size: 72,
                            color: Colors.white24,
                          ),
                  ),
                ),
              ),
            ),
            if (!starting) ...[
              const SizedBox(height: 14),
              OutlinedButton.icon(
                focusNode: actionFocusNode,
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh_outlined),
                label: const Text('Prøv igen'),
              ),
            ],
          ] else ...[
            Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(
                    TvDesignTokens.panelRadius,
                  ),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x558EDCFF),
                      blurRadius: 28,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: QrImageView(
                    data: activePairing.approveUrl,
                    version: QrVersions.auto,
                    size: MediaQuery.sizeOf(context).height < 800 ? 168 : 198,
                    eyeStyle: const QrEyeStyle(
                      eyeShape: QrEyeShape.square,
                      color: Color(0xFF071018),
                    ),
                    dataModuleStyle: const QrDataModuleStyle(
                      dataModuleShape: QrDataModuleShape.square,
                      color: Color(0xFF071018),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Center(
              child: SelectableText(
                activePairing.userCode,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: TvDesignTokens.goldSoft,
                  fontSize: 24,
                  letterSpacing: 3,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Godkend inden ${_minutesLeft(activePairing.expiresAt)} min.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white54),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              focusNode: actionFocusNode,
              onPressed: starting ? null : onRefresh,
              icon: const Icon(Icons.refresh_outlined),
              label: const Text('Ny QR-kode'),
            ),
          ],
          if ((message ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, height: 1.35),
            ),
          ],
          if ((error ?? '').isNotEmpty && activePairing == null) ...[
            const SizedBox(height: 12),
            Text(
              error!,
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }

  static int _minutesLeft(DateTime expiresAt) {
    final seconds = expiresAt.difference(DateTime.now()).inSeconds;
    if (seconds <= 0) return 0;
    return (seconds / 60).ceil();
  }
}

class _TvFocusFrame extends StatelessWidget {
  const _TvFocusFrame({required this.focusNode, required this.child});

  final FocusNode focusNode;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: focusNode,
    child: child,
    builder: (context, child) => AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      curve: Curves.easeOut,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius + 6),
        border: Border.all(
          color: focusNode.hasFocus
              ? TvDesignTokens.goldSoft
              : Colors.transparent,
          width: 2,
        ),
        boxShadow: focusNode.hasFocus
            ? const [
                BoxShadow(
                  color: Color(0x66F7C35F),
                  blurRadius: 24,
                  spreadRadius: 1,
                ),
              ]
            : const [],
      ),
      padding: const EdgeInsets.all(3),
      child: child,
    ),
  );
}

class PasswordChangeScreen extends StatefulWidget {
  const PasswordChangeScreen({required this.controller, super.key});

  final AppController controller;

  @override
  State<PasswordChangeScreen> createState() => _PasswordChangeScreenState();
}

class _PasswordChangeScreenState extends State<PasswordChangeScreen> {
  final _password = TextEditingController();
  final _confirmation = TextEditingController();
  final _form = GlobalKey<FormState>();

  @override
  void dispose() {
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    await widget.controller.completePasswordChange(_password.text);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Stack(
      fit: StackFit.expand,
      children: [
        const _AuthBackdrop(),
        Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(30),
                  child: Form(
                    key: _form,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const BrandLockup(compact: true),
                        const SizedBox(height: 28),
                        Text(
                          'Vælg din egen adgangskode',
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Den midlertidige kode kan kun bruges én gang. Den nye adgangskode skal være mindst 12 tegn.',
                          style: TextStyle(color: Colors.white60),
                        ),
                        const SizedBox(height: 24),
                        TextFormField(
                          controller: _password,
                          obscureText: true,
                          autofocus: true,
                          decoration: const InputDecoration(
                            labelText: 'Ny adgangskode',
                          ),
                          validator: (value) => (value?.length ?? 0) < 12
                              ? 'Brug mindst 12 tegn.'
                              : null,
                        ),
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: _confirmation,
                          obscureText: true,
                          onFieldSubmitted: (_) => _submit(),
                          decoration: const InputDecoration(
                            labelText: 'Gentag adgangskode',
                          ),
                          validator: (value) => value != _password.text
                              ? 'Adgangskoderne er ikke ens.'
                              : null,
                        ),
                        if (widget.controller.error != null) ...[
                          const SizedBox(height: 14),
                          _ErrorMessage(widget.controller.error!),
                        ],
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: widget.controller.busy ? null : _submit,
                          child: const Padding(
                            padding: EdgeInsets.all(14),
                            child: Text('Gem og fortsæt'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class _AuthBackdrop extends StatelessWidget {
  const _AuthBackdrop();

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              TvDesignTokens.background,
              Color(0xFF071018),
              Color(0xFF130F08),
            ],
            stops: [0, 0.58, 1],
          ),
        ),
      ),
      Positioned(
        top: -260,
        right: -180,
        child: Container(
          width: 660,
          height: 660,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [Color(0x264EA1FF), Color(0x00000000)],
            ),
          ),
        ),
      ),
      Positioned(
        bottom: -280,
        left: -140,
        child: Container(
          width: 620,
          height: 620,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(
              colors: [Color(0x24F7C35F), Color(0x00000000)],
            ),
          ),
        ),
      ),
      CustomPaint(painter: _GridPainter()),
    ],
  );
}

class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.025)
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 56) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += 56) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _ErrorMessage extends StatelessWidget {
  const _ErrorMessage(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Theme.of(context).colorScheme.error.withValues(alpha: 0.12),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(
        color: Theme.of(context).colorScheme.error.withValues(alpha: 0.5),
      ),
    ),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Text(
        message,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    ),
  );
}
