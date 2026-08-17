import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';

class MediaPosterCard extends StatefulWidget {
  const MediaPosterCard({
    required this.api,
    required this.media,
    required this.onPressed,
    this.width = 154,
    super.key,
  });

  final ApiClient api;
  final MediaItem media;
  final VoidCallback onPressed;
  final double width;

  @override
  State<MediaPosterCard> createState() => _MediaPosterCardState();
}

class _MediaPosterCardState extends State<MediaPosterCard> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final media = widget.media;
    final image = widget.api.absoluteMediaUrl(
      media.posterPath,
      imageSize: 'w500',
    );
    return AnimatedScale(
      scale: _focused ? 1.045 : 1,
      duration: const Duration(milliseconds: 160),
      child: SizedBox(
        width: widget.width,
        child: InkWell(
          onTap: widget.onPressed,
          onFocusChange: (value) => setState(() => _focused = value),
          borderRadius: BorderRadius.circular(15),
          focusColor: Colors.transparent,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                height: widget.width * 1.48,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(15),
                  border: Border.all(
                    color: _focused
                        ? Theme.of(context).colorScheme.secondary
                        : const Color(0xFF252E38),
                    width: _focused ? 3 : 1,
                  ),
                  boxShadow: _focused
                      ? const [
                          BoxShadow(
                            color: Color(0x5543E7C4),
                            blurRadius: 24,
                            spreadRadius: 1,
                          ),
                        ]
                      : null,
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
                    Positioned(
                      left: 8,
                      top: 8,
                      child: Wrap(
                        spacing: 5,
                        children: [
                          if (media.is4k) const _Badge('4K'),
                          if (media.isHdr) const _Badge('HDR'),
                        ],
                      ),
                    ),
                    if (media.progress != null)
                      Positioned(
                        left: 8,
                        right: 8,
                        bottom: 8,
                        child: LinearProgressIndicator(
                          value: (media.progress!.percent / 100).clamp(0, 1),
                          minHeight: 4,
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 9),
              Text(
                media.displayTitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              if (media.isEpisode)
                Text(
                  media.episodeLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.white54),
                )
              else if (media.releaseYear != null)
                Text(
                  '${media.releaseYear}',
                  style: const TextStyle(fontSize: 12, color: Colors.white54),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xDD0A0E13),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: Colors.white24),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      child: Text(
        label,
        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900),
      ),
    ),
  );
}

class _PosterFallback extends StatelessWidget {
  const _PosterFallback();

  @override
  Widget build(BuildContext context) => const ColoredBox(
    color: Color(0xFF151D25),
    child: Center(
      child: Icon(Icons.movie_outlined, size: 42, color: Colors.white24),
    ),
  );
}
