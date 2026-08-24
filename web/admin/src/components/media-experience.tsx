'use client';

import { Bookmark, Check, ChevronLeft, ChevronRight, CircleCheck, Info, ListPlus, LoaderCircle, Play, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import { requestPlayback, type PlayableMedia } from './web-player';
import styles from './media-experience.module.css';

export type ViewerState = {
  inWatchlist: boolean;
  watched: boolean;
  playlistIds: string[];
};

export type MediaExperienceItem = {
  mediaId: string;
  targetType: string;
  targetKey: string;
  title: string;
  type: string;
  seriesTitle?: string | null | undefined;
  seasonNumber?: number | null | undefined;
  episodeNumber?: number | null | undefined;
  releaseYear?: number | null | undefined;
  overview?: string | null | undefined;
  rating?: number | null | undefined;
  posterPath?: string | null | undefined;
  backdropPath?: string | null | undefined;
  width?: number | null | undefined;
  height?: number | null | undefined;
  positionMs?: number | undefined;
  durationMs?: number | null | undefined;
  progressPercent?: number | undefined;
  href?: string | undefined;
  playback?: PlayableMedia | null | undefined;
  viewerState?: ViewerState | undefined;
};

type PlaylistSummary = { id: string; name: string; itemCount: number };
type PlaylistResponse = { items: PlaylistSummary[]; nextCursor: string | null };
type StateEvent = { targetKey: string; mediaId: string; viewerState: ViewerState };

export const mediaStateChangedEvent = 'bb:media-state-changed';

export function MediaCard({ item }: { item: MediaExperienceItem }) {
  const href = item.href ?? `/watch/title/${encodeURIComponent(item.mediaId)}`;
  const artwork = imageUrl(item.posterPath ?? null, 'w500');
  const canPlay = Boolean(item.playback);
  return (
    <article className={styles.card} data-media-key={item.targetKey}>
      <Link className={styles.poster} href={href} aria-label={`Se information om ${item.title}`}>
        {artwork ? <img alt="" loading="lazy" decoding="async" src={artwork} /> : <span className={styles.fallback}>{initials(item.title)}</span>}
        <span className={styles.posterShade} />
        {item.height && <span className={styles.quality}>{item.height >= 2160 ? '4K' : `${item.height}p`}</span>}
        {Boolean(item.progressPercent) && <i className={styles.progress} style={{ '--progress': `${item.progressPercent}%` } as CSSProperties} />}
      </Link>
      <div className={styles.cardCopy}>
        <Link href={href}><strong>{item.title}</strong></Link>
        <small>{item.type === 'episode' ? episodeLabel(item) : item.releaseYear ?? labelForType(item.type)}</small>
      </div>
      <div className={styles.cardActions}>
        {canPlay && <button aria-label={`${item.positionMs ? 'Fortsæt' : 'Afspil'} ${item.title}`} onClick={() => requestPlayback(item.playback!, item.positionMs ?? 0)}><Play fill="currentColor" /></button>}
        <MediaQuickActions item={item} compact />
        <Link aria-label={`Information om ${item.title}`} href={href}><Info /></Link>
      </div>
    </article>
  );
}

export function MediaQuickActions({ item, compact = false }: { item: MediaExperienceItem; compact?: boolean }) {
  const [state, setState] = useState<ViewerState>(item.viewerState ?? { inWatchlist: false, watched: false, playlistIds: [] });
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (item.type === 'genre') return;
    void api<ViewerState & { playlistIds?: string[] }>(`/playback/history/${item.mediaId}/status`)
      .then((result) => setState({ inWatchlist: result.inWatchlist, watched: result.watched, playlistIds: result.playlistIds ?? [] }))
      .catch(() => undefined);
  }, [item.mediaId, item.type, item.viewerState]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<StateEvent>).detail;
      if (detail.targetKey === item.targetKey || detail.mediaId === item.mediaId) setState(detail.viewerState);
    };
    window.addEventListener(mediaStateChangedEvent, update);
    return () => window.removeEventListener(mediaStateChangedEvent, update);
  }, [item.mediaId, item.targetKey]);

  const publish = (next: ViewerState) => {
    setState(next);
    window.dispatchEvent(new CustomEvent<StateEvent>(mediaStateChangedEvent, { detail: { targetKey: item.targetKey, mediaId: item.mediaId, viewerState: next } }));
  };

  const stop = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
  async function toggleWatchlist(event: MouseEvent) {
    stop(event); setBusy('watchlist'); setError('');
    try {
      await api(`/playback/watchlist/${item.mediaId}`, {
        method: state.inWatchlist ? 'DELETE' : 'PUT',
        ...(!state.inWatchlist ? { body: JSON.stringify({ targetType: item.targetType }) } : {}),
      });
      publish({ ...state, inWatchlist: !state.inWatchlist });
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }
  async function toggleWatched(event: MouseEvent) {
    stop(event); setBusy('watched'); setError('');
    try {
      await api(`/playback/history/${item.mediaId}/watched`, { method: 'PATCH', body: JSON.stringify({ watched: !state.watched }) });
      publish({ ...state, watched: !state.watched });
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }
  async function openPicker(event: MouseEvent) {
    stop(event); setPicker((current) => !current); setError('');
    if (!playlists.length) {
      try { setPlaylists((await api<PlaylistResponse>('/playback/playlists?limit=50')).items); }
      catch (reason) { setError(message(reason)); }
    }
  }
  async function togglePlaylist(event: MouseEvent, playlistId: string) {
    stop(event); setBusy(playlistId); setError('');
    try {
      const selected = state.playlistIds.includes(playlistId);
      if (selected) {
        const playlist = await api<{ items: Array<{ id: string; targetKey: string }> }>(`/playback/playlists/${playlistId}`);
        const entry = playlist.items.find((candidate) => candidate.targetKey === item.targetKey);
        if (entry) await api(`/playback/playlists/${playlistId}/items/${entry.id}`, { method: 'DELETE' });
      } else {
        await api(`/playback/playlists/${playlistId}/items/${item.mediaId}`, { method: 'PUT', body: JSON.stringify({ targetType: item.targetType }) });
      }
      publish({ ...state, playlistIds: selected ? state.playlistIds.filter((id) => id !== playlistId) : [...state.playlistIds, playlistId] });
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }

  if (item.type === 'genre') return null;
  return (
    <span className={`${styles.quickActions} ${compact ? styles.compact : ''}`} onClick={(event) => event.stopPropagation()}>
      <button aria-label={state.inWatchlist ? 'Fjern fra Min liste' : 'Tilføj til Min liste'} aria-pressed={state.inWatchlist} onClick={toggleWatchlist} title={state.inWatchlist ? 'Fjern fra Min liste' : 'Min liste'}>
        {busy === 'watchlist' ? <LoaderCircle className={styles.spin} /> : <Bookmark fill={state.inWatchlist ? 'currentColor' : 'none'} />}
        {!compact && <span>{state.inWatchlist ? 'På Min liste' : 'Min liste'}</span>}
      </button>
      <button aria-label="Tilføj til playliste" aria-expanded={picker} onClick={openPicker} title="Playliste"><ListPlus />{!compact && <span>Playliste</span>}</button>
      <button aria-label={state.watched ? 'Markér som ikke set' : 'Markér som set'} aria-pressed={state.watched} onClick={toggleWatched} title={state.watched ? 'Markér som ikke set' : 'Markér som set'}>
        {busy === 'watched' ? <LoaderCircle className={styles.spin} /> : <CircleCheck fill={state.watched ? 'currentColor' : 'none'} />}
        {!compact && <span>{state.watched ? 'Set' : 'Markér set'}</span>}
      </button>
      {picker && <span className={styles.picker} role="dialog" aria-label={`Tilføj ${item.title} til playliste`}>
        <span className={styles.pickerHeader}><strong>Vælg playliste</strong><button aria-label="Luk" onClick={(event) => { stop(event); setPicker(false); }}><X /></button></span>
        {playlists.map((playlist) => <button key={playlist.id} onClick={(event) => void togglePlaylist(event, playlist.id)}>
          <span>{playlist.name}<small>{playlist.itemCount} titler</small></span>
          {busy === playlist.id ? <LoaderCircle className={styles.spin} /> : state.playlistIds.includes(playlist.id) ? <Check /> : <Plus />}
        </button>)}
        {!playlists.length && <small>Opret din første playliste under Playlister.</small>}
        {error && <em>{error}</em>}
      </span>}
    </span>
  );
}

export function MediaRail({ title, items, nextCursor, loadMore, allHref }: { title: string; items: MediaExperienceItem[]; nextCursor?: string | null | undefined; loadMore?: (() => void) | undefined; allHref?: string | undefined }) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = () => {
    const node = rail.current;
    if (node) setEdges({ left: node.scrollLeft > 4, right: node.scrollLeft + node.clientWidth < node.scrollWidth - 4 });
  };
  useEffect(() => { update(); const node = rail.current; if (!node) return; const observer = new ResizeObserver(update); observer.observe(node); return () => observer.disconnect(); }, [items]);
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * Math.max(440, rail.current.clientWidth * .82), behavior: 'smooth' });
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') { event.preventDefault(); rail.current?.scrollTo({ left: 0, behavior: 'smooth' }); }
    if (event.key === 'End') { event.preventDefault(); rail.current?.scrollTo({ left: rail.current.scrollWidth, behavior: 'smooth' }); }
    if (event.key === 'ArrowLeft') scroll(-1);
    if (event.key === 'ArrowRight') scroll(1);
  };
  return <section className={styles.railSection}><header><div><span>BOLTB YTES FOR DIG</span><h2>{title}</h2></div>{allHref && <Link href={allHref}>Se alle <ChevronRight /></Link>}</header>
    {!items.length ? <EmptyRow title={title} /> : <div className={styles.railWrap}>
      {edges.left && <button className={`${styles.arrow} ${styles.left}`} onClick={() => scroll(-1)} aria-label={`Rul ${title} til venstre`}><ChevronLeft /></button>}
      <div className={styles.rail} ref={rail} onScroll={update} onKeyDown={keyDown} tabIndex={0}>{items.map((item) => <MediaCard item={item} key={`${item.targetKey}-${item.mediaId}`} />)}{nextCursor && <button className={styles.loadCard} onClick={loadMore}>Hent flere<ChevronRight /></button>}</div>
      {edges.right && <button className={`${styles.arrow} ${styles.right}`} onClick={() => scroll(1)} aria-label={`Rul ${title} til højre`}><ChevronRight /></button>}
    </div>}
  </section>;
}

export function MediaGrid({ items }: { items: MediaExperienceItem[] }) {
  return <div className={styles.grid}>{items.map((item) => <MediaCard item={item} key={`${item.targetKey}-${item.mediaId}`} />)}</div>;
}

export function MediaSkeleton({ count = 6 }: { count?: number }) {
  return <div className={styles.skeletons} aria-busy="true">{Array.from({ length: count }, (_, index) => <i key={index} />)}</div>;
}

function EmptyRow({ title }: { title: string }) { return <div className={styles.empty}><Bookmark /><strong>Ingen titler i {title.toLocaleLowerCase('da-DK')} endnu</strong><span>Indholdet dukker op her, når profilen bruger funktionen.</span></div>; }
function message(reason: unknown) { return (reason as ApiFailure)?.message ?? 'Handlingen kunne ikke gennemføres.'; }
function labelForType(type: string) { return type === 'series' ? 'Serie' : type === 'episode' ? 'Episode' : 'Film'; }
function episodeLabel(item: MediaExperienceItem) { return `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')}`; }
function initials(value: string) { return value.split(/\s+/u).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(''); }
function imageUrl(path: string | null, size: string) { if (!path) return null; if (/^https?:\/\//i.test(path)) return path; return /^\/[A-Za-z0-9._-]+$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null; }
