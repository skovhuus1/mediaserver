import 'package:flutter/material.dart';

import '../../shared_core/ui_tokens/tv_design_tokens.dart';
import 'tv_luxury_backdrop.dart';

class TvPageScaffold extends StatelessWidget {
  const TvPageScaffold({
    required this.title,
    required this.icon,
    required this.body,
    this.eyebrow = 'BOLTBYTES TV',
    this.subtitle,
    this.trailing,
    this.footer,
    this.focusNode,
    this.onKeyEvent,
    this.autofocus = false,
    this.showHeader = true,
    this.padding,
    super.key,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget body;
  final Widget? trailing;
  final Widget? footer;
  final FocusNode? focusNode;
  final KeyEventResult Function(FocusNode, KeyEvent)? onKeyEvent;
  final bool autofocus;
  final bool showHeader;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final content = Stack(
      children: [
        const Positioned.fill(child: TvLuxuryBackdrop()),
        Positioned(
          right: -150,
          top: -190,
          width: 540,
          height: 540,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    TvDesignTokens.gold.withValues(alpha: 0.10),
                    TvDesignTokens.cyan.withValues(alpha: 0.035),
                    Colors.transparent,
                  ],
                  stops: const [0, 0.46, 1],
                ),
              ),
            ),
          ),
        ),
        Positioned(
          left: -210,
          bottom: -280,
          width: 620,
          height: 620,
          child: IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    TvDesignTokens.cyan.withValues(alpha: 0.055),
                    TvDesignTokens.gold.withValues(alpha: 0.025),
                    Colors.transparent,
                  ],
                  stops: const [0, 0.42, 1],
                ),
              ),
            ),
          ),
        ),
        SafeArea(
          child: Padding(
            padding:
                padding ??
                const EdgeInsets.symmetric(
                  horizontal: TvDesignTokens.pageHorizontalPadding,
                  vertical: TvDesignTokens.pageVerticalPadding,
                ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showHeader) ...[
                  TvPageHeader(
                    eyebrow: eyebrow,
                    title: title,
                    subtitle: subtitle,
                    icon: icon,
                    trailing: trailing,
                  ),
                  const SizedBox(height: 12),
                  Container(
                    height: 1,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Color(0x77FFC857),
                          Color(0x334A5662),
                          Color(0x004A5662),
                        ],
                        stops: [0, 0.48, 1],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                Expanded(child: body),
                if (footer != null) ...[
                  const SizedBox(height: 12),
                  footer!,
                ],
              ],
            ),
          ),
        ),
      ],
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Focus(
        focusNode: focusNode,
        autofocus: autofocus,
        onKeyEvent: onKeyEvent,
        child: TweenAnimationBuilder<double>(
          duration: TvDesignTokens.luxuryRevealDuration,
          curve: Curves.easeOutCubic,
          tween: Tween<double>(begin: 0, end: 1),
          builder: (context, value, child) => Opacity(
            opacity: value,
            child: Transform.translate(
              offset: Offset(0, 8 * (1 - value)),
              child: child,
            ),
          ),
          child: content,
        ),
      ),
    );
  }
}

class TvPageHeader extends StatelessWidget {
  const TvPageHeader({
    required this.eyebrow,
    required this.title,
    required this.icon,
    this.subtitle,
    this.trailing,
    super.key,
  });

  final String eyebrow;
  final String title;
  final String? subtitle;
  final IconData icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      Container(
        width: TvDesignTokens.pageHeaderIconSize,
        height: TvDesignTokens.pageHeaderIconSize,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              TvDesignTokens.gold.withValues(alpha: 0.24),
              TvDesignTokens.cyan.withValues(alpha: 0.08),
              const Color(0xB8070A0F),
            ],
          ),
          borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
          border: Border.all(
            color: TvDesignTokens.gold.withValues(alpha: 0.34),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x44000000),
              blurRadius: 22,
              offset: Offset(0, 10),
            ),
          ],
        ),
        child: Icon(icon, size: 27, color: TvDesignTokens.goldSoft),
      ),
      const SizedBox(width: 16),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              eyebrow.toUpperCase(),
              style: const TextStyle(
                color: TvDesignTokens.gold,
                fontSize: 10.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.8,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: TvDesignTokens.pageTitleSize,
                height: 1,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.7,
              ),
            ),
            if ((subtitle ?? '').trim().isNotEmpty) ...[
              const SizedBox(height: 5),
              Text(
                subtitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: TvDesignTokens.textMuted,
                  fontSize: TvDesignTokens.pageSubtitleSize,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ],
        ),
      ),
      if (trailing != null) ...[
        const SizedBox(width: 20),
        trailing!,
      ],
    ],
  );
}

class TvPanel extends StatelessWidget {
  const TvPanel({
    required this.child,
    this.padding = const EdgeInsets.all(TvDesignTokens.contentPanelPadding),
    this.width,
    this.focused = false,
    this.selected = false,
    this.clipBehavior = Clip.none,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double? width;
  final bool focused;
  final bool selected;
  final Clip clipBehavior;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
    duration: TvDesignTokens.focusAnimationDuration,
    width: width,
    padding: padding,
    clipBehavior: clipBehavior,
    decoration: BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: focused
            ? const [Color(0xFF2C2416), Color(0xF0131A22)]
            : selected
            ? const [Color(0xE8151A20), Color(0xE6090C10)]
            : const [Color(0xE80E141B), Color(0xE607090D)],
      ),
      borderRadius: BorderRadius.circular(TvDesignTokens.panelRadius),
      border: Border.all(
        color: focused
            ? TvDesignTokens.goldSoft
            : selected
            ? const Color(0x66FFC857)
            : TvDesignTokens.panelBorderSoft,
        width: focused ? TvDesignTokens.focusBorderWidth : 1,
      ),
      boxShadow: [
        const BoxShadow(
          color: Color(0x80000000),
          blurRadius: 28,
          offset: Offset(0, 14),
        ),
        if (focused)
          const BoxShadow(
            color: Color(0x40FFC857),
            blurRadius: 18,
            spreadRadius: 1,
          ),
      ],
    ),
    child: child,
  );
}

class TvStatusPill extends StatelessWidget {
  const TvStatusPill({
    required this.label,
    this.icon,
    this.emphasized = false,
    super.key,
  });

  final String label;
  final IconData? icon;
  final bool emphasized;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
    decoration: BoxDecoration(
      color: emphasized
          ? TvDesignTokens.gold.withValues(alpha: 0.15)
          : Colors.white.withValues(alpha: 0.045),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(
        color: emphasized
            ? TvDesignTokens.gold.withValues(alpha: 0.32)
            : Colors.white.withValues(alpha: 0.10),
      ),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(
            icon,
            size: 16,
            color: emphasized
                ? TvDesignTokens.goldSoft
                : TvDesignTokens.textMuted,
          ),
          const SizedBox(width: 7),
        ],
        Text(
          label,
          style: TextStyle(
            color: emphasized
                ? TvDesignTokens.goldSoft
                : TvDesignTokens.textMuted,
            fontSize: 12.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    ),
  );
}

class TvActionPill extends StatelessWidget {
  const TvActionPill({
    required this.label,
    required this.icon,
    required this.focused,
    this.enabled = true,
    this.primary = false,
    super.key,
  });

  final String label;
  final IconData icon;
  final bool focused;
  final bool enabled;
  final bool primary;

  @override
  Widget build(BuildContext context) => AnimatedScale(
    scale: focused ? 1.035 : 1,
    duration: TvDesignTokens.focusAnimationDuration,
    child: AnimatedContainer(
      duration: TvDesignTokens.focusAnimationDuration,
      height: 40,
      padding: const EdgeInsets.symmetric(horizontal: 17),
      decoration: BoxDecoration(
        gradient: focused
            ? const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFFFF2C1), TvDesignTokens.gold],
              )
            : primary
            ? const LinearGradient(
                colors: [Color(0x442A2214), Color(0x22141A21)],
              )
            : null,
        color: !enabled
            ? Colors.white.withValues(alpha: 0.035)
            : focused || primary
            ? null
            : const Color(0xB8080B0F),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: focused
              ? Colors.white
              : primary
              ? const Color(0x66FFC857)
              : TvDesignTokens.panelBorderSoft,
          width: focused ? 2 : 1,
        ),
        boxShadow: focused
            ? const [
                BoxShadow(
                  color: Color(0x55FFC857),
                  blurRadius: 18,
                  offset: Offset(0, 8),
                ),
              ]
            : const [],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 19,
            color: !enabled
                ? Colors.white30
                : focused
                ? const Color(0xFF090806)
                : Colors.white,
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              color: !enabled
                  ? Colors.white30
                  : focused
                  ? const Color(0xFF090806)
                  : Colors.white,
              fontSize: 13.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    ),
  );
}

class TvInlineNotice extends StatelessWidget {
  const TvInlineNotice({
    required this.message,
    this.error = false,
    super.key,
  });

  final String message;
  final bool error;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
    decoration: BoxDecoration(
      color: error ? const Color(0x22FF737D) : const Color(0x2265C58A),
      borderRadius: BorderRadius.circular(TvDesignTokens.chromeRadius),
      border: Border.all(
        color: error ? const Color(0x55FF737D) : const Color(0x5565C58A),
      ),
    ),
    child: Row(
      children: [
        Icon(
          error ? Icons.error_outline_rounded : Icons.check_circle_outline,
          size: 18,
          color: error ? const Color(0xFFFF9299) : const Color(0xFF8DE0AC),
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            message,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ],
    ),
  );
}

class TvStateView extends StatelessWidget {
  const TvStateView({
    required this.icon,
    required this.title,
    required this.message,
    this.busy = false,
    super.key,
  });

  final IconData icon;
  final String title;
  final String message;
  final bool busy;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 520),
      child: TvPanel(
        padding: const EdgeInsets.symmetric(horizontal: 34, vertical: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy)
              const SizedBox.square(
                dimension: 34,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              )
            else
              Icon(icon, size: 42, color: TvDesignTokens.goldSoft),
            const SizedBox(height: 15),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: TvDesignTokens.textMuted,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
