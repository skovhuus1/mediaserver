import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/app_config.dart';
import 'core/brand_theme.dart';
import 'state/app_controller.dart';
import 'widgets/cast_miniplayer.dart';
import 'widgets/push_message_banner.dart';
import 'shared_core/app_shell_screens.dart';
import 'shared_core/ui_tokens/tv_design_tokens.dart';
import 'shared_core/ui_mode.dart';

class BoltBytesApp extends StatelessWidget {
  const BoltBytesApp({
    required this.controller,
    required this.screens,
    this.forceTvLayout,
    super.key,
  });

  final AppController controller;
  final AppShellScreens screens;
  final bool? forceTvLayout;

  @override
  Widget build(BuildContext context) {
    final tv = forceTvLayout == true;
    final background = tv ? Colors.transparent : BoltColors.background;
    final surface = tv ? TvDesignTokens.surface : BoltColors.surface;
    final panel = tv ? TvDesignTokens.surfaceRaised : BoltColors.panel;
    final rail = tv ? TvDesignTokens.surfaceGlass : BoltColors.backgroundRaised;
    final blue = tv ? TvDesignTokens.gold : BoltColors.primary;
    final cyan = tv ? TvDesignTokens.cyan : BoltColors.cyan;

    final scheme =
        ColorScheme.fromSeed(
          seedColor: blue,
          brightness: Brightness.dark,
          surface: surface,
        ).copyWith(
          primary: blue,
          secondary: cyan,
          error: BoltColors.error,
          surface: surface,
          onSurface: Colors.white,
          onPrimary: Colors.black,
          outline: BoltColors.line,
          shadow: const Color(0x66000000),
          surfaceContainerLow: panel,
          surfaceContainerHighest: rail,
        );

    return AppUiModeScope(
      forceTvLayout: forceTvLayout,
      child: MaterialApp(
        title: 'BoltBytes Media',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          colorScheme: scheme,
          scaffoldBackgroundColor: background,
          visualDensity: tv
              ? const VisualDensity(horizontal: -0.55, vertical: -0.35)
              : VisualDensity.adaptivePlatformDensity,
          fontFamily: tv ? 'sans-serif-condensed' : 'sans-serif',
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
              fontFamily: 'sans-serif-condensed',
              fontWeight: FontWeight.w800,
              letterSpacing: -1.1,
              height: 1,
            ),
            headlineMedium: const TextStyle(
              fontFamily: 'sans-serif-condensed',
              fontWeight: FontWeight.w800,
              letterSpacing: -0.45,
            ),
            headlineSmall: const TextStyle(
              fontFamily: 'sans-serif-condensed',
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
            toolbarHeight: tv ? 74 : 62,
            titleTextStyle: TextStyle(
              fontSize: tv ? 24 : 20,
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
              borderRadius: BorderRadius.circular(tv ? 12 : 18),
            ),
            surfaceTintColor: Colors.transparent,
          ),
          snackBarTheme: SnackBarThemeData(
            backgroundColor: const Color(0xEE0D1A24),
            contentTextStyle: const TextStyle(fontWeight: FontWeight.w600),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          popupMenuTheme: PopupMenuThemeData(
            color: panel,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
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
              backgroundColor: blue,
              foregroundColor: const Color(0xFF03101C),
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
          floatingActionButtonTheme: FloatingActionButtonThemeData(
            foregroundColor: Colors.black,
            backgroundColor: blue,
          ),
          navigationBarTheme: const NavigationBarThemeData(
            backgroundColor: Color(0xF20A0E13),
            indicatorColor: Color(0xFF12365C),
            iconTheme: WidgetStatePropertyAll(
              IconThemeData(color: Color(0xFFDCE3EC)),
            ),
            labelTextStyle: WidgetStatePropertyAll(
              TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
          navigationRailTheme: NavigationRailThemeData(
            backgroundColor: Color(0xEE0A1015),
            selectedIconTheme: const IconThemeData(
              color: Colors.white,
              size: 24,
            ),
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
            indicatorColor: Color(0xFF12365C),
            useIndicator: true,
          ),
          focusColor: const Color(0x554EA1FF),
          hoverColor: const Color(0x1AFFFFFF),
          progressIndicatorTheme: ProgressIndicatorThemeData(color: blue),
          chipTheme: ChipThemeData(
            backgroundColor: const Color(0xC40A121B),
            side: const BorderSide(color: Color(0xFF26313A)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(999),
            ),
            labelStyle: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
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
                  ? const Color(0x554EA1FF)
                  : const Color(0xFF2D3640),
            ),
          ),
          sliderTheme: SliderThemeData(
            thumbColor: blue,
            activeTrackColor: blue,
            inactiveTrackColor: const Color(0xFF29323D),
            overlayShape: const RoundSliderOverlayShape(overlayRadius: 18),
            valueIndicatorTextStyle: const TextStyle(
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
          builder: (context, _) => screens.buildByStage(context, controller),
        ),
      ),
    );
  }
}

bool useTvLayout(BuildContext context) {
  return uiUseTvLayout(context, fallbackToDeviceType: AppConfig.isTvBuild);
}
