'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { playbackHistoryChangedEvent, requestPlayback, type PlayableMedia } from './web-player';
import styles from './playback.module.css';
import { PosterQualityBadges } from './poster-quality-badges';

type ContinueItem = PlayableMedia & {
  posterPath: string | null;
  backdropPath: string | null;
  progress: {
    positionMs: number;
    durationMs: number | null;
    percent: number;
    updatedAt: string;
  };
};

export function ContinueWatching() {
  const [items, setItems] = useState<ContinueItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems(await api<ContinueItem[]>('/playback/history/continue'));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(playbackHistoryChangedEvent, load);
    return () => window.removeEventListener(playbackHistoryChangedEvent, load);
  }, [load]);

  if (loaded && !items.length) return (
    <section className="media-section compact-empty">
      <div className="section-heading"><h2>Fortsæt med at se</h2></div>
      <div className="empty-row"><Radio size={18} /><span>Ingen gemt afspilning endnu</span></div>
    </section>
  );

  return (
    <section className={`media-section ${styles.continueSection}`}>
      <div className="section-heading"><h2>Fortsæt med at se</h2></div>
      <div className={styles.continueRow}>
        {items.map((item) => (
          <button className={styles.continueCard} key={item.id} onClick={() => requestPlayback(item, item.progress.positionMs)}>
            <span className={styles.continueArt} style={imageStyle(item.backdropPath ?? item.posterPath)}>
              <PosterQualityBadges media={item} />
            </span>
            <span className={styles.continueCopy}>
              <strong>{item.seriesTitle ?? item.title}</strong>
              <small>{item.seriesTitle ? episodeLabel(item) : timeLabel(item.progress.positionMs)}</small>
              <span className={styles.progress}><i style={{ width: `${item.progress.percent}%` }} /></span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function imageStyle(path: string | null) {
  return path ? { backgroundImage: `url("https://image.tmdb.org/t/p/w780${path}")` } : undefined;
}

function episodeLabel(item: ContinueItem) {
  return `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')} · ${timeLabel(item.progress.positionMs)}`;
}

function timeLabel(milliseconds: number) {
  return `${Math.floor(milliseconds / 60_000)} min. set`;
}
