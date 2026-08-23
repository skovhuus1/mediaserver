import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../app.dart';
import '../core/models.dart';
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
  final _serverFocus = FocusNode();
  final _emailFocus = FocusNode();
  final _passwordFocus = FocusNode();
  final _loginButtonFocus = FocusNode();
  Timer? _qrPollTimer;
  TvLoginPairing? _tvPairing;
  String? _qrMessage;
  bool _qrStarting = false;
  bool _showPasswordLogin = false;
  bool _showPassword = false;
  bool _editServer = false;

  @override
  void initState() {
    super.initState();
    _server = TextEditingController(text: widget.controller.serverUrl);
    _editServer = _server.text.trim().isEmpty;
  }

  @override
  void dispose() {
    _qrPollTimer?.cancel();
    _server.dispose();
    _email.dispose();
    _password.dispose();
    _serverFocus.dispose();
    _emailFocus.dispose();
    _passwordFocus.dispose();
    _loginButtonFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    _server.text = _normalizeServerInput(_server.text);
    if (!(_form.currentState?.validate() ?? false)) return;
    await widget.controller.login(
      email: _email.text.trim(),
      password: _password.text,
      requestedServerUrl: _server.text,
    );
  }

  Future<void> _startQrLogin() async {
    _server.text = _normalizeServerInput(_server.text);
    final serverError = _validateServerInput(_server.text);
    if (serverError != null) {
      setState(() => _qrMessage = serverError);
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
      _qrMessage = pairing == null
          ? null
          : 'Scan QR-koden med en mobil eller browser, hvor du allerede er logget ind.';
    });
    if (pairing != null) {
      _scheduleQrPoll(const Duration(milliseconds: 700));
    }
  }

  void _scheduleQrPoll([Duration? delay]) {
    _qrPollTimer?.cancel();
    final pairing = _tvPairing;
    if (pairing == null) return;
    final seconds = pairing.pollIntervalSeconds.clamp(1, 10);
    _qrPollTimer = Timer(delay ?? Duration(seconds: seconds), _pollQrLogin);
  }

  Future<void> _pollQrLogin() async {
    final pairing = _tvPairing;
    if (!mounted || pairing == null) return;
    if (DateTime.now().isAfter(pairing.expiresAt)) {
      setState(() {
        _tvPairing = null;
        _qrMessage = 'QR-koden er udløbet. Opret en ny kode.';
      });
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
          _qrMessage = 'QR-koden er udløbet. Opret en ny kode.';
        });
        return;
      }
      if (result.isConsumed) {
        setState(() {
          _tvPairing = null;
          _qrMessage = 'QR-koden er allerede brugt. Opret en ny kode.';
        });
        return;
      }
      setState(() {
        _qrMessage = 'Venter på godkendelse... Kode ${pairing.userCode}.';
      });
      _scheduleQrPoll(
        Duration(seconds: (result.pollIntervalSeconds ?? 2).clamp(1, 10)),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _qrMessage = 'QR-login fejlede. Opret en ny kode.');
    }
  }

  void _cancelQrLogin() {
    _qrPollTimer?.cancel();
    setState(() {
      _tvPairing = null;
      _qrMessage = null;
      _qrStarting = false;
    });
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

  KeyEventResult _handleUpDown(
    KeyEvent event,
    FocusNode next,
    FocusNode? previous,
  ) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
      next.requestFocus();
      return KeyEventResult.handled;
    }
    if (event.logicalKey == LogicalKeyboardKey.arrowUp && previous != null) {
      previous.requestFocus();
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final tv = useTvLayout(context);
    final showPasswordLogin = !tv || _showPasswordLogin;
    final form = ConstrainedBox(
      constraints: BoxConstraints(maxWidth: tv ? 520 : 460),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const BrandLockup(),
            SizedBox(height: tv ? 52 : 36),
            Text(
              'Dit bibliotek.\nPå alle skærme.',
              style: Theme.of(context).textTheme.displayLarge?.copyWith(
                fontSize: tv ? 58 : 42,
                height: 0.95,
              ),
            ),
            const SizedBox(height: 14),
            const Text(
              'Log ind på din egen BoltBytes-server. På TV kan du bruge QR-login uden at skrive e-mail og adgangskode med fjernbetjeningen.',
              style: TextStyle(color: Colors.white60, height: 1.5),
            ),
            const SizedBox(height: 28),
            if (_editServer)
              Focus(
                onKeyEvent: tv
                    ? (node, event) => _handleUpDown(event, _emailFocus, null)
                    : null,
                child: TextFormField(
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
            if (!_editServer)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
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
                            style: const TextStyle(color: Colors.white60),
                          ),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _editServer = true),
                      child: const Text('Skift'),
                    ),
                  ],
                ),
              ),
            if (tv) ...[
              const SizedBox(height: 18),
              _TvQrLoginPanel(
                pairing: _tvPairing,
                starting: _qrStarting || widget.controller.busy,
                message: _qrMessage,
                error: widget.controller.error,
                onStart: _startQrLogin,
                onCancel: _cancelQrLogin,
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () =>
                    setState(() => _showPasswordLogin = !_showPasswordLogin),
                icon: Icon(
                  _showPasswordLogin
                      ? Icons.qr_code_2_outlined
                      : Icons.keyboard_outlined,
                ),
                label: Text(
                  _showPasswordLogin
                      ? 'Brug QR-login i stedet'
                      : 'Log ind med e-mail og adgangskode',
                ),
              ),
            ],
            if (showPasswordLogin) ...[
              const SizedBox(height: 14),
              Focus(
                onKeyEvent: tv
                    ? (node, event) => _handleUpDown(
                        event,
                        _passwordFocus,
                        _editServer ? _serverFocus : null,
                      )
                    : null,
                child: TextFormField(
                  controller: _email,
                  focusNode: _emailFocus,
                  autofocus: !tv,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(
                    labelText: 'E-mail',
                    prefixIcon: Icon(Icons.alternate_email),
                  ),
                  validator: (value) {
                    if (!showPasswordLogin) return null;
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
              const SizedBox(height: 14),
              Focus(
                onKeyEvent: tv
                    ? (node, event) =>
                          _handleUpDown(event, _loginButtonFocus, _emailFocus)
                    : null,
                child: TextFormField(
                  controller: _password,
                  focusNode: _passwordFocus,
                  obscureText: !_showPassword,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(
                    labelText: 'Adgangskode',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      onPressed: () =>
                          setState(() => _showPassword = !_showPassword),
                      icon: Icon(
                        _showPassword ? Icons.visibility_off : Icons.visibility,
                      ),
                    ),
                  ),
                  validator: (value) {
                    if (!showPasswordLogin) return null;
                    return value == null || value.isEmpty
                        ? 'Indtast adgangskoden.'
                        : null;
                  },
                ),
              ),
            ],
            if (widget.controller.error != null) ...[
              const SizedBox(height: 14),
              _ErrorMessage(widget.controller.error!),
            ],
            if (showPasswordLogin) ...[
              const SizedBox(height: 20),
              FilledButton.icon(
                focusNode: _loginButtonFocus,
                onPressed: widget.controller.busy ? null : _submit,
                icon: widget.controller.busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.login),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 14),
                  child: Text('Log ind'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const _AuthBackdrop(),
          SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.symmetric(
                horizontal: tv ? 96 : 24,
                vertical: tv ? 68 : 36,
              ),
              child: Align(alignment: Alignment.centerLeft, child: form),
            ),
          ),
        ],
      ),
    );
  }
}

class _TvQrLoginPanel extends StatelessWidget {
  const _TvQrLoginPanel({
    required this.pairing,
    required this.starting,
    required this.message,
    required this.error,
    required this.onStart,
    required this.onCancel,
  });

  final TvLoginPairing? pairing;
  final bool starting;
  final String? message;
  final String? error;
  final VoidCallback onStart;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final activePairing = pairing;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF0F151D),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFF263241)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x66000000),
            blurRadius: 28,
            offset: Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.qr_code_2_outlined, color: Color(0xFFF7C66A)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'TV-login med QR',
                  style: Theme.of(
                    context,
                  ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (activePairing == null)
            FilledButton.icon(
              onPressed: starting ? null : onStart,
              icon: starting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.qr_code_scanner_outlined),
              label: const Padding(
                padding: EdgeInsets.symmetric(vertical: 14),
                child: Text('Vis QR-kode'),
              ),
            )
          else ...[
            Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: QrImageView(
                    data: activePairing.approveUrl,
                    version: QrVersions.auto,
                    size: 220,
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
                  color: const Color(0xFFF7C66A),
                  letterSpacing: 4,
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
              onPressed: onCancel,
              icon: const Icon(Icons.refresh_outlined),
              label: const Text('Opret ny kode'),
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
  Widget build(BuildContext context) => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF080C11), Color(0xFF111B23), Color(0xFF201331)],
        stops: [0, 0.62, 1],
      ),
    ),
    child: CustomPaint(painter: _GridPainter()),
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
