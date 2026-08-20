import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/app_config.dart';
import 'screens/auth_screens.dart';
import 'screens/library_screen.dart';
import 'screens/offline_downloads_screen.dart';
import 'screens/profile_screen.dart';
import 'state/app_controller.dart';
import 'widgets/brand.dart';
import 'widgets/cast_miniplayer.dart';
import 'widgets/push_message_banner.dart';

class BoltBytesApp extends StatelessWidget {
  const BoltBytesApp({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFF05070C);
    const surface = Color(0xFF0B1018);
    const panel = Color(0xFF111A24);
    const rail = Color(0xFF0D151F);
    const violet = Color(0xFF8E66FF);
    const mint = Color(0xFF40DFC2);

    final scheme = ColorScheme.fromSeed(
      seedColor: violet,
      brightness: Brightness.dark,
      surface: surface,
    ).copyWith(
      primary: violet,
      secondary: mint,
      error: const Color(0xFFFF717C),
      surface: surface,
      onSurface: Colors.white,
      onPrimary: Colors.black,
      outline: const Color(0xFF2D3842),
      shadow: const Color(0x66000000),
      surfaceContainerLow: panel,
      surfaceContainerHighest: rail,
    );

    return MaterialApp(
      title: 'BoltBytes Media',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: scheme,
        scaffoldBackgroundColor: background,
        visualDensity: VisualDensity.adaptivePlatformDensity,
        fontFamily: 'Inter',
        splashFactory: NoSplash.splashFactory,
        pageTransitionsTheme: const PageTransitionsTheme(
          builders: {
            TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
            TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
            TargetPlatform.fuchsia: FadeForwardsPageTransitionsBuilder(),
          },
        ),
        textTheme: TextTheme(
          headlineLarge: const TextStyle(
            fontFamily: 'Inter',
            fontWeight: FontWeight.w800,
            letterSpacing: -1.1,
            height: 1,
          ),
          headlineMedium: const TextStyle(
            fontFamily: 'Inter',
            fontWeight: FontWeight.w800,
            letterSpacing: -0.45,
          ),
          headlineSmall: const TextStyle(
            fontFamily: 'Inter',
            fontWeight: FontWeight.w700,
          ),
          titleLarge: const TextStyle(fontWeight: FontWeight.w700),
          titleMedium: const TextStyle(fontWeight: FontWeight.w600),
          labelSmall: const TextStyle(
            fontFamily: 'Courier New',
            fontWeight: FontWeight.w700,
            letterSpacing: 1.1,
          ),
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: const Color(0xF20A0E13),
          surfaceTintColor: Colors.transparent,
          elevation: 0,
          toolbarHeight: 62,
          titleTextStyle: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.4,
          ),
          iconTheme: const IconThemeData(size: 24),
        ),
        cardTheme: CardThemeData(
          color: panel,
          elevation: 0,
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          surfaceTintColor: Colors.transparent,
        ),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: const Color(0xEE0D1A24),
          contentTextStyle: const TextStyle(fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        popupMenuTheme: PopupMenuThemeData(
          color: panel,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
        dividerTheme: const DividerThemeData(
          color: Color(0xFF27303B),
          thickness: 1,
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
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: scheme.secondary, width: 1.3),
          ),
          labelStyle: const TextStyle(color: Colors.white70),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            elevation: 0,
            backgroundColor: violet,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            textStyle: const TextStyle(
              fontWeight: FontWeight.w800,
              letterSpacing: 0.2,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            side: BorderSide(color: scheme.secondary.withValues(alpha: 0.7)),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.w700),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          foregroundColor: Colors.black,
          backgroundColor: mint,
        ),
        navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Color(0xF20A0E13),
          indicatorColor: Color(0xFF38205E),
          iconTheme: WidgetStatePropertyAll(IconThemeData(color: Color(0xFFDCE3EC))),
          labelTextStyle: WidgetStatePropertyAll(
            TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          ),
        ),
        navigationRailTheme: NavigationRailThemeData(
          backgroundColor: Color(0xEE0A1015),
          selectedIconTheme: const IconThemeData(color: Colors.white, size: 24),
          unselectedIconTheme: const IconThemeData(
            color: Color(0xFF8D98A5),
            size: 24,
          ),
          selectedLabelTextStyle: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
          ),
          unselectedLabelTextStyle: const TextStyle(
            color: Color(0xFF8D98A5),
            fontWeight: FontWeight.w600,
          ),
          indicatorColor: Color(0xFF221F47),
          useIndicator: true,
        ),
        focusColor: const Color(0x3345E7C4),
        hoverColor: const Color(0x1AFFFFFF),
        progressIndicatorTheme: const ProgressIndicatorThemeData(color: mint),
        chipTheme: ChipThemeData(
          backgroundColor: const Color(0xC40A121B),
          side: const BorderSide(color: Color(0xFF26313A)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        ),
        switchTheme: SwitchThemeData(
          thumbColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? scheme.secondary
                : const Color(0xFF737F8C),
          ),
          trackColor: WidgetStateProperty.resolveWith(
            (states) => states.contains(WidgetState.selected)
                ? const Color(0x3345E7C4)
                : const Color(0xFF2D3640),
          ),
        ),
        sliderTheme: const SliderThemeData(
          thumbColor: mint,
          activeTrackColor: mint,
          inactiveTrackColor: Color(0xFF29323D),
          overlayShape: RoundSliderOverlayShape(overlayRadius: 18),
          valueIndicatorTextStyle: TextStyle(
            color: Colors.black,
            fontWeight: FontWeight.w700,
          ),
        ),
        bottomSheetTheme: BottomSheetThemeData(
          backgroundColor: background,
          modalBackgroundColor: panel,
          showDragHandle: true,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
        ),
        listTileTheme: const ListTileThemeData(
          iconColor: Colors.white70,
          textColor: Colors.white,
          titleTextStyle: TextStyle(
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
      ),
      builder: (context, child) => AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light.copyWith(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: background,
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            child ?? const SizedBox.shrink(),
            const CastMiniPlayer(),
            const PushMessageBanner(),
          ],
        ),
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
          AppStage.offline => OfflineDownloadsScreen(
            api: controller.api,
            profileId: controller.activeProfile?.id,
            offline: true,
            onReconnect: controller.retryOnline,
          ),
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
    body: DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF090D14), Color(0xFF060A0F)],
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(size: 86),
            SizedBox(height: 16),
            Text(
              'BoltBytes',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w900,
                letterSpacing: -1,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'MEDIA CLIENT',
              style: TextStyle(
                color: Colors.white60,
                letterSpacing: 3,
                fontSize: 10,
              ),
            ),
            SizedBox(height: 34),
            SizedBox(width: 240, child: LinearProgressIndicator(minHeight: 7)),
            SizedBox(height: 14),
            Text('Forbinder sikkert til din server...'),
          ],
        ),
      ),
    ),
  );
}
