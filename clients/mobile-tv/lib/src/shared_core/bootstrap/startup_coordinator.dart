import 'dart:async';

enum StartupDestination { online, login, offline }

class StartupResult {
  const StartupResult._({
    required this.destination,
    this.timedOut = false,
    this.retryable = false,
    this.message,
  });

  const StartupResult.online() : this._(destination: StartupDestination.online);

  const StartupResult.login({
    bool timedOut = false,
    bool retryable = false,
    String? message,
  }) : this._(
         destination: StartupDestination.login,
         timedOut: timedOut,
         retryable: retryable,
         message: message,
       );

  const StartupResult.offline({
    bool timedOut = false,
    bool retryable = true,
    String? message,
  }) : this._(
         destination: StartupDestination.offline,
         timedOut: timedOut,
         retryable: retryable,
         message: message,
       );

  final StartupDestination destination;
  final bool timedOut;
  final bool retryable;
  final String? message;
}

class StartupDeadlineResult<T> {
  const StartupDeadlineResult({
    required this.value,
    required this.timedOut,
    required this.elapsed,
  });

  final T value;
  final bool timedOut;
  final Duration elapsed;
}

abstract interface class StartupDeadlineScheduler {
  Future<StartupDeadlineResult<T>> waitFor<T>({
    required Future<T> operation,
    required Duration deadline,
    required T Function() onTimeout,
  });
}

class FutureStartupDeadlineScheduler implements StartupDeadlineScheduler {
  const FutureStartupDeadlineScheduler();

  @override
  Future<StartupDeadlineResult<T>> waitFor<T>({
    required Future<T> operation,
    required Duration deadline,
    required T Function() onTimeout,
  }) async {
    final stopwatch = Stopwatch()..start();
    var timedOut = false;
    final value = await operation.timeout(
      deadline,
      onTimeout: () {
        timedOut = true;
        return onTimeout();
      },
    );
    stopwatch.stop();
    return StartupDeadlineResult(
      value: value,
      timedOut: timedOut,
      elapsed: stopwatch.elapsed,
    );
  }
}

class StartupExecution<T> {
  const StartupExecution({
    required this.value,
    required this.shouldCommit,
    required this.timedOut,
    required this.elapsed,
  });

  final T value;
  final bool shouldCommit;
  final bool timedOut;
  final Duration elapsed;
}

class StartupCoordinator {
  StartupCoordinator({
    required this.deadline,
    this.scheduler = const FutureStartupDeadlineScheduler(),
  });

  final Duration deadline;
  final StartupDeadlineScheduler scheduler;
  int _generation = 0;

  int cancel() => ++_generation;
  bool isCurrent(int generation) => generation == _generation;

  Future<StartupExecution<T>> run<T>({
    required Future<T> Function(int generation) operation,
    required T Function() onTimeout,
  }) async {
    final generation = ++_generation;
    var timeoutWasCurrent = false;

    T timeoutValue() {
      timeoutWasCurrent = isCurrent(generation);
      if (timeoutWasCurrent) cancel();
      return onTimeout();
    }

    final deadlineResult = await scheduler.waitFor(
      operation: operation(generation),
      deadline: deadline,
      onTimeout: timeoutValue,
    );
    return StartupExecution(
      value: deadlineResult.value,
      shouldCommit: deadlineResult.timedOut
          ? timeoutWasCurrent
          : isCurrent(generation),
      timedOut: deadlineResult.timedOut,
      elapsed: deadlineResult.elapsed,
    );
  }
}
