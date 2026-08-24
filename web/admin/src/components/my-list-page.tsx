'use client';

import { Bookmark, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import { AuthenticatedCustomerShell } from './authenticated-customer-shell';
import { MediaGrid, MediaSkeleton, type MediaExperienceItem } from './media-experience';
import styles from './customer-collection.module.css';

type WatchlistMedia = {
  id: string; title: string; type: string; targetType?: string; targetKey?: string; seriesTitle?: string | null; seriesDisplayTitle?: string | null;
  seasonNumber?: number | null; episodeNumber?: number | null; releaseYear?: number | null; overview?: string | null; posterPath?: string | null; backdropPath?: string | null;
  width?: number | null; height?: number | null; watched?: boolean; progress?: { positionMs: number; durationMs: number | null; percent: number } | null;
};

export function MyListPage() {
  const [items, setItems] = useState<MediaExperienceItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void api<WatchlistMedia[]>('/playback/watchlist').then((result) => setItems(result.map(toItem))).catch((reason) => setError(message(reason))); }, []);
  const visible = useMemo(() => (items ?? []).filter((item) => item.title.toLocaleLowerCase('da-DK').includes(query.toLocaleLowerCase('da-DK'))), [items, query]);
  return <AuthenticatedCustomerShell><main className={styles.page}><header className={styles.heading}><span>DIT PERSONLIGE BIBLIOTEK</span><h1>Min liste</h1><p>Film og serier, du har gemt på den aktive profil.</p><label><Search /><input placeholder="Søg i Min liste" value={query} onChange={(event) => setQuery(event.target.value)} /></label></header>
    {error && <div className={styles.error}>{error}</div>}
    {!items && !error ? <MediaSkeleton count={10} /> : visible.length ? <MediaGrid items={visible} /> : <section className={styles.empty}><Bookmark /><h2>{query ? 'Ingen match' : 'Min liste er tom'}</h2><p>{query ? 'Prøv et andet søgeord.' : 'Brug bogmærket på en film eller serie for at gemme den her.'}</p></section>}
  </main></AuthenticatedCustomerShell>;
}

function toItem(media: WatchlistMedia): MediaExperienceItem {
  const series = media.targetType === 'series';
  return { mediaId: media.id, targetType: media.targetType ?? (series ? 'series' : media.type), targetKey: media.targetKey ?? `media:${media.id}`, title: series ? media.seriesDisplayTitle ?? media.seriesTitle ?? media.title : media.title, type: series ? 'series' : media.type, seriesTitle: media.seriesDisplayTitle ?? media.seriesTitle, seasonNumber: media.seasonNumber, episodeNumber: media.episodeNumber, releaseYear: media.releaseYear, overview: media.overview, posterPath: media.posterPath, backdropPath: media.backdropPath, width: media.width, height: media.height, positionMs: media.progress?.positionMs ?? 0, durationMs: media.progress?.durationMs, progressPercent: media.progress?.percent ?? 0, viewerState: { inWatchlist: true, watched: Boolean(media.watched), playlistIds: [] }, playback: { ...media, id: media.id, title: media.title, seriesTitle: media.seriesTitle ?? null, seriesDisplayTitle: media.seriesDisplayTitle ?? null, file: { durationMs: media.progress?.durationMs ?? null } } as never };
}
function message(reason: unknown) { return (reason as ApiFailure)?.message ?? 'Min liste kunne ikke indlæses.'; }
