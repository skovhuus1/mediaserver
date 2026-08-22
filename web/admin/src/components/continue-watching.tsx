'use client';

import { ChevronLeft, ChevronRight, Clapperboard, LoaderCircle, Play, Radio, X } from 'lucide-react';
import { type WheelEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
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
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [railEdges, setRailEdges] = useState({ left: false, right: false });
  const railRef = useRef<HTMLDivElement>(null);
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

  const syncRailEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setRailEdges({ left: rail.scrollLeft > 2, right: rail.scrollLeft < maximum - 2 });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const frame = window.requestAnimationFrame(syncRailEdges);
    const observer = new ResizeObserver(syncRailEdges);
    observer.observe(rail);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [items.length, syncRailEdges]);

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(300, rail.clientWidth * 0.74), behavior: 'smooth' });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const canMove = (delta < 0 && railEdges.left) || (delta > 0 && railEdges.right);
    if (!canMove) return;
    event.preventDefault();
    rail.scrollLeft += delta;
  };

  const removeItem = async (item: ContinueItem) => {
    if (removingIds.has(item.id)) return;
    setRemoveError(null);
    setRemovingIds((current) => new Set(current).add(item.id));
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await api<{ mediaId: string; removed: boolean }>(`/playback/history/${item.id}`, { method: 'DELETE' });
      window.dispatchEvent(new Event(playbackHistoryChangedEvent));
    } catch (failure) {
      setItems((current) => current.some((candidate) => candidate.id === item.id)
        ? current
        : [...current, item].sort((left, right) => right.progress.updatedAt.localeCompare(left.progress.updatedAt)));
      setRemoveError((failure as ApiFailure)?.message ?? 'Titlen kunne ikke fjernes. Prøv igen.');
    } finally {
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  };

  if (loaded && !items.length) return (
    <section className={`media-section compact-empty ${styles.continueSection}`}>
      <div className={`section-heading ${styles.continueHeading}`}><h2>Fortsæt med at se</h2></div>
      {removeError
        ? <div className={styles.continueError} role="alert">{removeError}</div>
        : <div className="empty-row"><Radio size={18} /><span>Ingen gemt afspilning endnu</span></div>}
    </section>
  );

  return (
    <section className={`media-section ${styles.continueSection}`}>
      <div className={`section-heading ${styles.continueHeading}`}>
        <div><h2>Fortsæt med at se</h2><small>Fortsæt præcis, hvor du slap</small></div>
        <div className={styles.continueNav} aria-label="Rul gennem fortsæt med at se">
          <button aria-label="Rul til venstre" disabled={!railEdges.left} onClick={() => scrollRail(-1)} type="button"><ChevronLeft size={18} /></button>
          <button aria-label="Rul til højre" disabled={!railEdges.right} onClick={() => scrollRail(1)} type="button"><ChevronRight size={18} /></button>
        </div>
      </div>
      {removeError && <div className={styles.continueError} role="alert">{removeError}</div>}
      <div className={styles.continueRailFrame} data-can-scroll-left={railEdges.left} data-can-scroll-right={railEdges.right}>
        <div className={styles.continueRow} data-horizontal-scroller onScroll={syncRailEdges} onWheel={handleWheel} ref={railRef}>
          {items.map((item) => {
            const hasArtwork = Boolean(item.backdropPath ?? item.posterPath);
            const removing = removingIds.has(item.id);
            return (
              <article className={styles.continueCard} key={item.id}>
                <button className={styles.continuePlay} onClick={() => requestPlayback(item, item.progress.positionMs)} type="button">
                  <span className={styles.continueArt} data-has-artwork={hasArtwork} style={imageStyle(item.backdropPath ?? item.posterPath)}>
                    <PosterQualityBadges media={item} />
                    {!hasArtwork && <span className={styles.continueFallback}><Clapperboard aria-hidden="true" /><b>BoltBytes</b></span>}
                    <span className={styles.continuePlayCue}><Play aria-hidden="true" fill="currentColor" size={20} /></span>
                  </span>
                  <span className={styles.continueCopy}>
                    <strong>{item.seriesTitle ?? item.title}</strong>
                    <small>{item.seriesTitle ? episodeLabel(item) : timeLabel(item.progress.positionMs)}</small>
                    <span className={styles.progress} aria-label={`${item.progress.percent} procent set`}><i style={{ width: `${item.progress.percent}%` }} /></span>
                  </span>
                </button>
                <button
                  aria-label={`Fjern ${item.seriesTitle ?? item.title} fra Fortsæt med at se`}
                  className={styles.continueRemove}
                  disabled={removing}
                  onClick={() => void removeItem(item)}
                  title="Fjern fra Fortsæt med at se"
                  type="button"
                >
                  {removing ? <LoaderCircle className={styles.continueSpinner} aria-hidden="true" size={17} /> : <X aria-hidden="true" size={17} />}
                </button>
              </article>
            );
          })}
        </div>
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
