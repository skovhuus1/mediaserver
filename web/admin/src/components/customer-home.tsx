'use client';

import { Info, Play, SlidersHorizontal, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import { MediaQuickActions, MediaRail, MediaSkeleton, type MediaExperienceItem } from './media-experience';
import { requestPlayback } from './web-player';
import styles from './customer-home.module.css';

type HomeRow = { id: string; title: string; items: MediaExperienceItem[]; nextCursor: string | null };
type HomeFeed = {
  hero: MediaExperienceItem | null;
  layout: { order: string[]; hidden: string[]; visible: string[] };
  rows: HomeRow[];
  generatedAt: string;
};

export function CustomerHome() {
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [error, setError] = useState('');
  const [loadingRow, setLoadingRow] = useState('');
  useEffect(() => {
    let active = true;
    void api<HomeFeed>('/experience/home').then((result) => { if (active) setFeed(result); }).catch((reason) => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, []);

  async function loadMore(row: HomeRow) {
    if (!row.nextCursor || loadingRow) return;
    setLoadingRow(row.id);
    try {
      const next = await api<HomeRow>(`/experience/home/rows/${encodeURIComponent(row.id)}?cursor=${encodeURIComponent(row.nextCursor)}`);
      setFeed((current) => current ? { ...current, rows: current.rows.map((entry) => entry.id === row.id ? { ...entry, items: [...entry.items, ...next.items], nextCursor: next.nextCursor } : entry) } : current);
    } catch (reason) { setError(message(reason)); } finally { setLoadingRow(''); }
  }

  if (error && !feed) return <section className={styles.state}><Sparkles /><h1>Din startside kunne ikke samles</h1><p>{error}</p><button onClick={() => location.reload()}>Prøv igen</button></section>;
  if (!feed) return <div className={styles.loading}><div /><MediaSkeleton count={8} /><MediaSkeleton count={8} /></div>;
  if (!feed.hero && !feed.rows.some((row) => row.items.length)) return <section className={styles.state}><Sparkles /><h1>Dit bibliotek venter</h1><p>Scan et bibliotek eller tilføj titler til Min liste for at bygge din personlige startside.</p></section>;
  const hero = feed.hero;
  return <div className={styles.home}>
    {hero && <section className={styles.hero} style={backdrop(hero.backdropPath ?? hero.posterPath ?? null)}>
      <div className={styles.heroShade} />
      <div className={styles.heroCopy}>
        <span><Sparkles /> PERSONLIGT UDVALGT</span>
        <h1>{hero.title}</h1>
        <p>{hero.overview ?? 'En titel fra dit eget BoltBytes-bibliotek, klar til afspilning.'}</p>
        <div className={styles.heroMeta}>{hero.releaseYear && <i>{hero.releaseYear}</i>}{hero.rating != null && <i>{hero.rating.toFixed(1)} / 10</i>}{hero.height && <i>{hero.height >= 2160 ? '4K UHD' : `${hero.height}p`}</i>}</div>
        <div className={styles.heroActions}>{hero.playback && <button onClick={() => requestPlayback(hero.playback!, hero.positionMs ?? 0)}><Play fill="currentColor" />{hero.positionMs ? 'Fortsæt' : 'Afspil'}</button>}<Link href={hero.href ?? `/watch/title/${hero.mediaId}`}><Info />Info</Link><MediaQuickActions item={hero} /></div>
      </div>
      <Link className={styles.customize} href="/watch/settings"><SlidersHorizontal />Tilpas forside</Link>
    </section>}
    {error && <p className={styles.notice}>{error}</p>}
    <div className={styles.rows}>{feed.rows.map((row) => <MediaRail key={row.id} title={row.title} items={row.items} nextCursor={row.nextCursor} loadMore={() => void loadMore(row)} allHref={allHref(row.id)} />)}</div>
  </div>;
}

function allHref(id: string) { if (id === 'watchlist') return '/watch/my-list'; if (id.startsWith('playlist:')) return `/watch/playlists/${id.slice(9)}`; if (id === 'new_movies') return '/watch?type=movie'; if (id === 'new_series' || id === 'latest_episodes') return '/watch?type=series'; return undefined; }
function message(reason: unknown) { return (reason as ApiFailure)?.message ?? 'Serveren kunne ikke levere kundeoplevelsen.'; }
function backdrop(path: string | null) { const url = imageUrl(path); return url ? { backgroundImage: `url("${url}")` } : undefined; }
function imageUrl(path: string | null) { if (!path) return null; if (/^https?:\/\//i.test(path)) return path; return /^\/[A-Za-z0-9._-]+$/.test(path) ? `https://image.tmdb.org/t/p/original${path}` : null; }
