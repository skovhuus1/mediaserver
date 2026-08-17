import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/app_config.dart';
import 'screens/auth_screens.dart';
import 'screens/library_screen.dart';
import 'screens/profile_screen.dart';
import 'state/app_controller.dart';
import 'widgets/brand.dart';

class BoltBytesApp extends StatelessWidget {
  const BoltBytesApp({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFF090D12);
    const surface = Color(0xFF121820);
    const violet = Color(0xFF9D6CFF);
    const mint = Color(0xFF43E7C4);
    final scheme =
        ColorScheme.fromSeed(
          seedColor: violet,
          brightness: Brightness.dark,
          surface: surface,
        ).copyWith(
          primary: violet,
          secondary: mint,
          error: const Color(0xFFFF6B73),
        );
    return MaterialApp(
      title: 'BoltBytes Media',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: scheme,
        scaffoldBackgroundColor: background,
        fontFamily: 'sans-serif',
        textTheme: const TextTheme(
          displayLarge: TextStyle(
            fontFamily: 'sans-serif-condensed',
            fontWeight: FontWeight.w800,
            letterSpacing: -2,
          ),
          headlineMedium: TextStyle(
            fontFamily: 'sans-serif-condensed',
            fontWeight: FontWeight.w800,
          ),
          titleLarge: TextStyle(fontWeight: FontWeight.w700),
          labelSmall: TextStyle(
            fontFamily: 'monospace',
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
        cardTheme: CardThemeData(
          color: const Color(0xFF11171E),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF11171E),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xFF29323D)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: Color(0xFF29323D)),
          ),
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Color(0xF20B1016),
          indicatorColor: Color(0xFF38205E),
        ),
        progressIndicatorTheme: const ProgressIndicatorThemeData(color: mint),
      ),
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light.copyWith(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: background,
        ),
        child: child ?? const SizedBox.shrink(),
      ),
      home: AnimatedBuilder(
        animation: controller,
        builder: (context, _) => switch (controller.stage) {
          AppStage.booting => const _BootScreen(),
          AppStage.login => LoginScreen(controller: controller),
          AppStage.passwordChange => PasswordChangeScreen(
            controller: controller,
          ),
          AppStage.profiles => ProfileScreen(controller: controller),
          AppStage.library => LibraryScreen(controller: controller),
        },
      ),
    );
  }
}

bool useTvLayout(BuildContext context) {
  if (AppConfig.isTvBuild) return true;
  final size = MediaQuery.sizeOf(context);
  return size.width >= 1100 && size.shortestSide >= 600;
}

class _BootScreen extends StatelessWidget {
  const _BootScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          BrandMark(size: 72),
          SizedBox(height: 24),
          SizedBox(width: 180, child: LinearProgressIndicator()),
          SizedBox(height: 12),
          Text('Forbinder sikkert til serveren...'),
        ],
      ),
    ),
  );
}
