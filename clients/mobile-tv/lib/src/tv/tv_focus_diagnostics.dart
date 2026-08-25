import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

const _diagnosticsEnabled = bool.fromEnvironment(
  'BB_MEDIA_TV_FOCUS_DIAGNOSTICS',
  defaultValue: false,
);

typedef TvFocusLatencyReporter = void Function(TvFocusLatencySample sample);

class TvFocusLatencySample {
  const TvFocusLatencySample({
    required this.key,
    required this.latency,
    required this.focusBefore,
    required this.focusAfter,
  });

  final LogicalKeyboardKey key;
  final Duration latency;
  final String? focusBefore;
  final String? focusAfter;
}

class TvFocusDiagnostics extends StatefulWidget {
  const TvFocusDiagnostics({
    required this.child,
    this.enabled = _diagnosticsEnabled,
    this.reporter,
    this.nowMicros,
    super.key,
  });

  final Widget child;
  final bool enabled;
  final TvFocusLatencyReporter? reporter;
  final int Function()? nowMicros;

  @override
  State<TvFocusDiagnostics> createState() => _TvFocusDiagnosticsState();
}

class _TvFocusDiagnosticsState extends State<TvFocusDiagnostics> {
  final Stopwatch _clock = Stopwatch()..start();
  bool _registered = false;

  int get _nowMicros => widget.nowMicros?.call() ?? _clock.elapsedMicroseconds;

  @override
  void initState() {
    super.initState();
    if (widget.enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _register());
    }
  }

  void _register() {
    if (!mounted || _registered || !widget.enabled) return;
    FocusManager.instance.addEarlyKeyEventHandler(_handleKeyEvent);
    _registered = true;
  }

  @override
  void dispose() {
    if (_registered) {
      FocusManager.instance.removeEarlyKeyEventHandler(_handleKeyEvent);
      _registered = false;
    }
    super.dispose();
  }

  KeyEventResult _handleKeyEvent(KeyEvent event) {
    if (event is! KeyDownEvent && event is! KeyRepeatEvent) {
      return KeyEventResult.ignored;
    }
    final key = event.logicalKey;
    if (key != LogicalKeyboardKey.arrowUp &&
        key != LogicalKeyboardKey.arrowDown &&
        key != LogicalKeyboardKey.arrowLeft &&
        key != LogicalKeyboardKey.arrowRight) {
      return KeyEventResult.ignored;
    }
    final startedAt = _nowMicros;
    final focusBefore = FocusManager.instance.primaryFocus?.debugLabel;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final sample = TvFocusLatencySample(
        key: key,
        latency: Duration(microseconds: _nowMicros - startedAt),
        focusBefore: focusBefore,
        focusAfter: FocusManager.instance.primaryFocus?.debugLabel,
      );
      widget.reporter?.call(sample);
      debugPrint(
        'BB_TV_FOCUS_LATENCY_MS='
        '${sample.latency.inMicroseconds / 1000} '
        'key=${sample.key.keyLabel} '
        'from=${sample.focusBefore ?? 'none'} '
        'to=${sample.focusAfter ?? 'none'}',
      );
    });
    SchedulerBinding.instance.ensureVisualUpdate();
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
