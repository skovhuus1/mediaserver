type QualityMedia = {
  type?: string;
  width?: number | null;
  height?: number | null;
  hdr?: 'hdr10' | 'hlg' | 'dolby_vision' | null;
};

export function PosterQualityBadges({ media }: { media: QualityMedia }) {
  if (media.type === 'series') return null;
  const is4k = (media.width ?? 0) >= 3840 || (media.height ?? 0) >= 2160;
  const isHdr = Boolean(media.hdr);
  if (!is4k && !isHdr) return null;
  const hdrTitle = media.hdr === 'dolby_vision'
    ? 'Dolby Vision'
    : media.hdr === 'hlg'
      ? 'HLG HDR'
      : 'HDR10';
  return (
    <em className="poster-quality-badges" aria-label={[is4k ? '4K' : '', isHdr ? hdrTitle : ''].filter(Boolean).join(', ')}>
      {is4k && <b className="quality-4k">4K</b>}
      {isHdr && <b className="quality-hdr" title={hdrTitle}>HDR</b>}
    </em>
  );
}
