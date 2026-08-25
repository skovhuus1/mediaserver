import 'dart:ui';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/brand_theme.dart';
import '../core/models.dart';
import '../shared_core/ui_tokens/tv_design_tokens.dart';

class MediaPosterCard extends StatefulWidget {
  const MediaPosterCard({
    required this.api,
    required this.media,
    required this.onPressed,
    this.focusNode,
    this.width = 154,
    this.isTv = false,
    this.showMeta = true,
    this.heroTag,
    this.onFocus,
    super.key,
  });

  final ApiClient api;
  final MediaItem media;
  final VoidCallback onPressed;
  final double width;
  final bool isTv;
  final bool showMeta;
  final Object? heroTag;
  final ValueChanged<bool>? onFocus;
  final FocusNode? focusNode;

  @override
  State<MediaPosterCard> createState() => _MediaPosterCardState();
}

class _MediaPosterCardState extends State<MediaPosterCard> {
  bool _focused = false;

  void _setFocus(bool value) {
    if (_focused == value) return;
    setState(() => _focused = value);
    widget.onFocus?.call(value);
    if (value) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Scrollable.ensureVisible(
          context,
          alignment: 0.5,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = widget.media;
    final image = widget.api.absoluteMediaUrl(
      media.posterPath,
      imageSize: 'w500',
    );
    final progress = media.progress?.percent.clamp(0, 100) ?? 0;
    final posterHeight = widget.width * (widget.isTv ? 1.46 : 1.48);
    final focusScale = _focused ? (widget.isTv ? 1.045 : 1.05) : 1.0;
    final titleStyle = _focused ? FontWeight.w800 : FontWeight.w700;
    final radius = widget.isTv ? TvDesignTokens.chromeRadius : 18.0;
    final focusRing = _focused
        ? <BoxShadow>[
            BoxShadow(
              color: widget.isTv
                  ? const Color(0x66FFF4D0)
                  : const Color(0xB04EA1FF),
              blurRadius: widget.isTv ? 30 : 22,
              spreadRadius: widget.isTv ? 0.2 : 1,
              offset: const Offset(0, 12),
            ),
          ]
        : const <BoxShadow>[
            BoxShadow(
              color: Color(0x22000000),
              blurRadius: 18,
              spreadRadius: 0.3,
              offset: Offset(0, 4),
            ),
          ];

    return Hero(
      tag: widget.heroTag ?? 'media-card-${media.id}-${widget.width}',
      child: AnimatedScale(
        scale: focusScale,
        duration: const Duration(milliseconds: 170),
        curve: Curves.easeOutCubic,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          width: widget.width,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            color: widget.isTv ? const Color(0x00040506) : BoltColors.panel,
            border: widget.isTv
                ? null
                : Border.all(
                    width: _focused ? 2.5 : 1,
                    color: _focused
                        ? BoltColors.focus
                        : const Color(0xFF2B3540),
                  ),
            boxShadow: widget.isTv ? null : focusRing,
          ),
          clipBehavior: widget.isTv ? Clip.none : Clip.antiAlias,
          child: InkWell(
            focusNode: widget.focusNode,
            onFocusChange: _setFocus,
            onTap: widget.onPressed,
            autofocus: false,
            borderRadius: BorderRadius.circular(radius),
            focusColor: Colors.transparent,
            highlightColor: Colors.transparent,
            splashColor: Colors.transparent,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 170),
                  curve: Curves.easeOutCubic,
                  height: posterHeight,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(radius),
                    border: widget.isTv
                        ? Border.all(
                            color: _focused
                                ? TvDesignTokens.goldSoft
                                : const Color(0x444F5F6E),
                            width: _focused ? 2.2 : 1,
                          )
                        : null,
                    boxShadow: widget.isTv ? focusRing : null,
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (image.isNotEmpty)
                        Image.network(
                          image,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const _PosterFallback(),
                        )
                      else
                        const _PosterFallback(),
                      if (media.is4k || media.isHdr || media.isEpisode)
                        Positioned(
                          left: 8,
                          top: 8,
                          child: Wrap(
                            spacing: 6,
                            children: [
                              if (media.is4k) const _Badge('4K'),
                              if (media.isHdr) const _Badge('HDR'),
                              if (media.isEpisode) const _Badge('Sæson'),
                            ],
                          ),
                        ),
                      if (_focused && !widget.isTv)
                        Positioned(
                          left: 0,
                          right: 0,
                          top: 0,
                          bottom: 0,
                          child: Stack(
                            children: [
                              Container(
                                decoration: const BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Color(0x00090D12),
                                      Color(0xCC090D12),
                                    ],
                                  ),
                                ),
                              ),
                              Center(
                                child: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.black.withValues(alpha: 0.55),
                                  ),
                                  child: const Icon(
                                    Icons.play_circle_filled_rounded,
                                    size: 46,
                                    color: Colors.white,
                                    shadows: [
                                      Shadow(
                                        color: Color(0x88000000),
                                        blurRadius: 16,
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              Positioned(
                                left: 0,
                                right: 0,
                                bottom: 10,
                                child: BackdropFilter(
                                  filter: ImageFilter.blur(
                                    sigmaX: 8,
                                    sigmaY: 8,
                                  ),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 8,
                                    ),
                                    child: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            media.displayTitle,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontWeight: FontWeight.w800,
                                              height: 1.05,
                                            ),
                                          ),
                                        ),
                                        const Icon(
                                          Icons.info_outline_rounded,
                                          size: 16,
                                          color: Colors.white70,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      if (media.progress != null)
                        Positioned(
                          left: 0,
                          right: 0,
                          bottom: 0,
                          child: SizedBox(
                            height: 4.5,
                            child: LinearProgressIndicator(
                              value: progress / 100,
                              backgroundColor: Colors.white10,
                              valueColor: AlwaysStoppedAnimation(
                                BoltColors.primary,
                              ),
                            ),
                          ),
                        ),
                      if (widget.isTv && _focused)
                        Positioned(
                          left: 9,
                          right: 9,
                          bottom: 9,
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xD9040506),
                                  borderRadius: BorderRadius.circular(99),
                                  border: Border.all(
                                    color: const Color(0x99FFF4D0),
                                    width: 1.2,
                                  ),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      Icons.play_arrow_rounded,
                                      color: Color(0xFFFFF4D0),
                                      size: 18,
                                    ),
                                    SizedBox(width: 3),
                                    Text(
                                      'OK',
                                      style: TextStyle(
                                        color: Color(0xFFFFF4D0),
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Spacer(),
                              Container(
                                width: 5,
                                height: 24,
                                decoration: BoxDecoration(
                                  color: TvDesignTokens.gold,
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
                if (widget.showMeta)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(
                        widget.isTv ? 1 : 2,
                        widget.isTv ? 8 : 11,
                        widget.isTv ? 1 : 2,
                        4,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            media.displayTitle,
                            maxLines: widget.isTv ? 2 : 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: titleStyle,
                              fontSize: widget.isTv ? 13.5 : 14,
                              height: 1.12,
                            ),
                          ),
                          SizedBox(height: widget.isTv ? 4 : 6),
                          Text(
                            [
                              if (media.releaseYear != null)
                                media.releaseYear.toString(),
                              if (media.durationMs != null)
                                _formatDuration(media.durationMs!),
                              if (media.isEpisode &&
                                  media.episodeLabel.isNotEmpty)
                                media.episodeLabel,
                            ].join(' · '),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white60,
                              fontSize: widget.isTv ? 10.5 : 11.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const Spacer(),
                          if (media.progress != null)
                            AnimatedOpacity(
                              opacity: _focused ? 1 : 0.8,
                              duration: const Duration(milliseconds: 140),
                              child: Padding(
                                padding: const EdgeInsets.only(top: 7),
                                child: Row(
                                  children: [
                                    Text(
                                      '${media.progress!.percent.round()}% set',
                                      style: const TextStyle(
                                        color: Colors.white60,
                                        fontSize: 10,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Expanded(
                                      child: Container(
                                        height: 3,
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            99,
                                          ),
                                          color: Colors.white12,
                                        ),
                                        child: Align(
                                          alignment: Alignment.centerLeft,
                                          child: FractionallySizedBox(
                                            widthFactor:
                                                media.progress!.percent / 100,
                                            child: Container(
                                              decoration: BoxDecoration(
                                                borderRadius:
                                                    BorderRadius.circular(99),
                                                color: const Color(0xFFF7C35F),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _formatDuration(int ms) {
    final total = ms ~/ 1000;
    final hours = total ~/ 3600;
    final minutes = (total % 3600) ~/ 60;
    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}';
    }
    return '${minutes}m';
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xDD0A0E13),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: const Color(0x66FFF4D0)),
      boxShadow: const [
        BoxShadow(color: Color(0x441F2B36), blurRadius: 8, spreadRadius: 1),
      ],
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.8,
        ),
      ),
    ),
  );
}

class _PosterFallback extends StatelessWidget {
  const _PosterFallback();

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF211A10), Color(0xFF060708), Color(0xFF10161B)],
      ),
    ),
    child: const Center(
      child: Icon(Icons.movie_outlined, size: 42, color: Color(0x55FFF4D0)),
    ),
  );
}
