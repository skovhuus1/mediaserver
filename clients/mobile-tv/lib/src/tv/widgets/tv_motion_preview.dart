import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../shared_core/tv_preview_contract.dart';
import '../../shared_core/ui_tokens/tv_design_tokens.dart';

class TvMotionPreviewAnchor extends StatefulWidget {
  const TvMotionPreviewAnchor({
    required this.api,
    required this.media,
    this.delay = const Duration(milliseconds: 850),
    super.key,
  });

  final ApiClient api;
  final MediaItem media;
  final Duration delay;

  @override
  State<TvMotionPreviewAnchor> createState() => _TvMotionPreviewAnchorState();
}

class _TvMotionPreviewAnchorState extends State<TvMotionPreviewAnchor> {
  Timer? _delayTimer;
  Timer? _frameTimer;
  OverlayEntry? _entry;
  TvPreviewManifest? _manifest;
  Uint8List? _sheet;
  List<TvPreviewCue> _cues = const [];
  int _frame = 0;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(covariant TvMotionPreviewAnchor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.media.id != widget.media.id || oldWidget.api != widget.api) {
      _clear();
      _schedule();
    }
  }

  void _schedule() {
    final generation = ++_generation;
    _delayTimer = Timer(widget.delay, () => _start(generation));
  }

  Future<void> _start(int generation) async {
    if (!mounted || generation != _generation) return;
    _showOverlay();
    try {
      final contract = TvPreviewContract.shared(widget.api);
      final manifest = await contract
          .loadManifest(widget.media.id)
          .timeout(const Duration(seconds: 2));
      if (!mounted || generation != _generation || manifest == null) return;
      final cues = manifest.previewWindow();
      if (cues.isEmpty) return;
      final sheet = await contract
          .loadSheet(widget.media.id, cues.first.sheet)
          .timeout(const Duration(seconds: 3));
      if (!mounted || generation != _generation || sheet.isEmpty) return;
      _manifest = manifest;
      _cues = cues;
      _sheet = sheet;
      _frame = 0;
      _entry?.markNeedsBuild();
      _frameTimer = Timer.periodic(const Duration(milliseconds: 1100), (_) {
        if (!mounted || generation != _generation || _cues.isEmpty) return;
        _frame = (_frame + 1) % _cues.length;
        _entry?.markNeedsBuild();
      });
    } catch (_) {
      // Artwork fallback remains visible when analysis assets are unavailable.
    }
  }

  void _showOverlay() {
    if (_entry != null || !mounted) return;
    final box = context.findRenderObject();
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (box is! RenderBox || !box.hasSize || overlay == null) return;
    final origin = box.localToGlobal(Offset.zero);
    final screen = MediaQuery.sizeOf(context);
    const width = 400.0;
    const height = 225.0;
    var left = origin.dx + box.size.width + 18;
    if (left + width > screen.width - 24) left = origin.dx - width - 18;
    left = left.clamp(24, screen.width - width - 24).toDouble();
    var top = origin.dy + (box.size.height - height) / 2;
    top = top.clamp(24, screen.height - height - 24).toDouble();
    _entry = OverlayEntry(
      builder: (context) => Positioned(
        left: left,
        top: top,
        width: width,
        height: height,
        child: IgnorePointer(
          child: TvMotionPreviewSurface(
            media: widget.media,
            artworkUrl: widget.api.absoluteMediaUrl(
              widget.media.backdropPath ?? widget.media.posterPath,
              imageSize: 'w1280',
            ),
            manifest: _manifest,
            sheet: _sheet,
            cue: _cues.isEmpty ? null : _cues[_frame],
          ),
        ),
      ),
    );
    overlay.insert(_entry!);
  }

  void _clear() {
    _generation += 1;
    _delayTimer?.cancel();
    _frameTimer?.cancel();
    _delayTimer = null;
    _frameTimer = null;
    _entry?.remove();
    _entry = null;
    _manifest = null;
    _sheet = null;
    _cues = const [];
    _frame = 0;
  }

  @override
  void dispose() {
    _clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.expand();
}

class TvMotionPreviewSurface extends StatelessWidget {
  const TvMotionPreviewSurface({
    required this.media,
    this.artworkUrl = '',
    this.manifest,
    this.sheet,
    this.cue,
    super.key,
  });

  final MediaItem media;
  final String artworkUrl;
  final TvPreviewManifest? manifest;
  final Uint8List? sheet;
  final TvPreviewCue? cue;

  bool get _hasMotion => manifest != null && sheet != null && cue != null;

  @override
  Widget build(BuildContext context) {
    return TvMotionPreviewChrome(
      media: media,
      motion: _hasMotion,
      frame: AnimatedSwitcher(
        duration: const Duration(milliseconds: 300),
        switchInCurve: Curves.easeOut,
        child: _hasMotion
            ? _SpriteTile(
                key: ValueKey('${cue!.sheet}:${cue!.column}:${cue!.row}'),
                bytes: sheet!,
                manifest: manifest!,
                cue: cue!,
              )
            : _ArtworkPreview(
                key: ValueKey(artworkUrl),
                artworkUrl: artworkUrl,
                media: media,
              ),
      ),
    );
  }
}

class TvMotionPreviewChrome extends StatelessWidget {
  const TvMotionPreviewChrome({
    required this.media,
    required this.motion,
    required this.frame,
    super.key,
  });

  final MediaItem media;
  final bool motion;
  final Widget frame;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      duration: TvDesignTokens.luxuryRevealDuration,
      curve: Curves.easeOutCubic,
      tween: Tween<double>(begin: 0, end: 1),
      builder: (context, value, child) => Opacity(
        opacity: value,
        child: Transform.scale(
          scale: 0.96 + value * 0.04,
          alignment: Alignment.centerLeft,
          child: child,
        ),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: TvDesignTokens.luxuryGold.withValues(alpha: 0.66),
            width: 1.2,
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0xD9000000),
              blurRadius: 38,
              offset: Offset(0, 20),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(19),
          child: Stack(
            fit: StackFit.expand,
            children: [
              frame,
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: [0, 0.48, 1],
                    colors: [
                      Color(0x22000000),
                      Color(0x08000000),
                      Color(0xE8000000),
                    ],
                  ),
                ),
              ),
              Positioned(
                left: 14,
                top: 14,
                child: _PreviewBadge(motion: motion),
              ),
              Positioned(
                left: 16,
                right: 16,
                bottom: 14,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      media.displayTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.45,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _metadata(media),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: TvDesignTokens.textMuted,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _metadata(MediaItem media) {
    final parts = <String>[
      if (media.isEpisode) media.episodeLabel,
      if (!media.isEpisode && media.releaseYear != null) '${media.releaseYear}',
      if (media.is4k) '4K',
      if (media.isHdr) 'HDR',
    ];
    return parts.isEmpty ? 'Hold OK for flere handlinger' : parts.join('  ·  ');
  }
}

class _PreviewBadge extends StatelessWidget {
  const _PreviewBadge({required this.motion});

  final bool motion;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xD90A0F15),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x44FFFFFF)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              motion ? Icons.auto_awesome_motion_rounded : Icons.image_rounded,
              color: TvDesignTokens.luxuryGold,
              size: 13,
            ),
            const SizedBox(width: 5),
            Text(
              motion ? 'MOTION PREVIEW' : 'FORHÅNDSVISNING',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 9,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArtworkPreview extends StatelessWidget {
  const _ArtworkPreview({
    required this.artworkUrl,
    required this.media,
    super.key,
  });

  final String artworkUrl;
  final MediaItem media;

  @override
  Widget build(BuildContext context) {
    if (artworkUrl.isNotEmpty) {
      return Image.network(
        artworkUrl,
        fit: BoxFit.cover,
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, _, _) => _ProceduralArtwork(media: media),
      );
    }
    return _ProceduralArtwork(media: media);
  }
}

class _ProceduralArtwork extends StatelessWidget {
  const _ProceduralArtwork({required this.media});

  final MediaItem media;

  @override
  Widget build(BuildContext context) {
    final initial = media.displayTitle.trim().isEmpty
        ? 'B'
        : media.displayTitle.trim().characters.first.toUpperCase();
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF243847), Color(0xFF101820), Color(0xFF291C10)],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -24,
            top: -42,
            child: Container(
              width: 230,
              height: 230,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    TvDesignTokens.cyan.withValues(alpha: 0.24),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Center(
            child: Text(
              initial,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.14),
                fontSize: 126,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SpriteTile extends StatelessWidget {
  const _SpriteTile({
    required this.bytes,
    required this.manifest,
    required this.cue,
    super.key,
  });

  final Uint8List bytes;
  final TvPreviewManifest manifest;
  final TvPreviewCue cue;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight;
        final sheetWidth = width * manifest.columns;
        final sheetHeight = height * manifest.rows;
        return ClipRect(
          child: OverflowBox(
            alignment: Alignment.topLeft,
            minWidth: sheetWidth,
            maxWidth: sheetWidth,
            minHeight: sheetHeight,
            maxHeight: sheetHeight,
            child: Transform.translate(
              offset: Offset(-cue.column * width, -cue.row * height),
              child: SizedBox(
                width: sheetWidth,
                height: sheetHeight,
                child: Image.memory(
                  bytes,
                  fit: BoxFit.fill,
                  gaplessPlayback: true,
                  filterQuality: FilterQuality.medium,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
