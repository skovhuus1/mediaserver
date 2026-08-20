import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app.dart';
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
  bool _showPassword = false;

  @override
  void initState() {
    super.initState();
    _server = TextEditingController(text: widget.controller.serverUrl);
  }

  @override
  void dispose() {
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
    if (!(_form.currentState?.validate() ?? false)) return;
    _server.text = _normalizeServerInput(_server.text);
    await widget.controller.login(
      email: _email.text.trim(),
      password: _password.text,
      requestedServerUrl: _server.text,
    );
  }

  String _normalizeServerInput(String value) {
    var normalized = value.trim();
    if (normalized.isEmpty) return normalized;
    normalized = normalized.replaceFirst(
      RegExp(r'^(https?:\/\/)', caseSensitive: false),
      '',
    );
    normalized = normalized.split('/').first.trim();
    return normalized;
  }

  bool _isLikelyUrl(String value) {
    final lower = value.toLowerCase();
    return lower.contains('://') ||
        value.contains('/') ||
        value.contains('?') ||
        value.contains('#');
  }

  String? _validateServerInput(String? value) {
    final server = value?.trim() ?? '';
    if (server.isEmpty) return 'Indtast serveradressen.';
    if (_isLikelyUrl(server)) {
      return 'Brug kun serverhost (fx media.boltbytes.com:6555). Vi tilføjer https og /api/v1 automatisk.';
    }
    return _normalizeServerInput(server).isNotEmpty
        ? null
        : 'Indtast serveradressen.';
  }

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
              'Log ind på din egen BoltBytes-server. Dine tokens gemmes krypteret på enheden.',
              style: TextStyle(color: Colors.white60, height: 1.5),
            ),
            const SizedBox(height: 28),
            Focus(
              onKeyEvent: tv
                  ? (node, event) => _handleUpDown(event, _emailFocus, null)
                  : null,
              child: TextFormField(
                controller: _server,
                focusNode: _serverFocus,
                autofocus: tv,
                textInputAction: TextInputAction.next,
                keyboardType: TextInputType.text,
                autocorrect: false,
                textCapitalization: TextCapitalization.none,
                inputFormatters: [
                  FilteringTextInputFormatter.deny(RegExp(r'\s')),
                ],
                decoration: const InputDecoration(
                  labelText: 'Servernavn',
                  hintText: 'fx media.boltbytes.com:6555',
                  prefixIcon: Icon(Icons.dns_outlined),
                ),
                validator: _validateServerInput,
                onFieldSubmitted: (_) => _emailFocus.requestFocus(),
              ),
            ),
            const SizedBox(height: 14),
            Focus(
              onKeyEvent: tv
                  ? (node, event) => _handleUpDown(event, _passwordFocus, _serverFocus)
                  : null,
              child: TextFormField(
                controller: _email,
                focusNode: _emailFocus,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(
                  labelText: 'E-mail',
                  prefixIcon: Icon(Icons.alternate_email),
                ),
                validator: (value) => value != null && value.contains('@')
                    ? null
                    : 'Indtast en gyldig e-mail.',
              ),
            ),
            const SizedBox(height: 14),
            Focus(
              onKeyEvent: tv
                  ? (node, event) => _handleUpDown(
                      event,
                      _loginButtonFocus,
                      _emailFocus,
                    )
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
                validator: (value) => value == null || value.isEmpty
                    ? 'Indtast adgangskoden.'
                    : null,
              ),
            ),
            if (widget.controller.error != null) ...[
              const SizedBox(height: 14),
              _ErrorMessage(widget.controller.error!),
            ],
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
