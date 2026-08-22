'use client';

import { ArrowRight, ChevronLeft, ChevronRight, Film, Library, Play, Tv } from 'lucide-react';
import { PersonalizedRecommendations } from './personalized-recommendations';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, clearSession, type SessionUser } from '@/lib/api';
import { CatalogView } from './catalog-view';
import { ContinueWatching } from './continue-watching';
import { CustomerShell } from './customer-shell';
import { PosterQualityBadges } from './poster-quality-badges';
import styles from './watch-portal.module.css';

type WatchItem = { id: string; title: string; type: string; seriesTitle: string | null; releaseYear: number | null; posterPath: string | null; width?: number | null; height?: number | null; hdr?: 'hdr10' | 'hlg' | 'dolby_vision' | null };
type CatalogResponse = { items: WatchItem[] };
type HomeRowId = 'recommendations' | 'continue' | 'new_movies' | 'new_series';
type ProfilePreferencesResponse = { preferences: { homeRowOrder: HomeRowId[]; hiddenHomeRows: HomeRowId[] } };
const DEFAULT_HOME_ROWS: HomeRowId[] = ['recommendations', 'continue', 'new_movies', 'new_series'];

export function WatchPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [movies, setMovies] = useState<WatchItem[]>([]);
  const [series, setSeries] = useState<WatchItem[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [homeRows, setHomeRows] = useState<HomeRowId[]>(DEFAULT_HOME_ROWS);
  const [hiddenHomeRows, setHiddenHomeRows] = useState<HomeRowId[]>([]);
  const browse = Boolean(Array.from(searchParams.keys()).some((key) => key !== 'view'));
  const continueOnly = searchParams.get('view') === 'continue';
  useEffect(() => {
    let active = true;
    void api<SessionUser>('/auth/me').then(async (session) => {
      if (!active) return;
      setUser(session);
      const [movieResult, seriesResult, preferenceResult] = await Promise.allSettled([
        api<CatalogResponse>('/media/catalog?type=movie&pageSize=18&sort=newest'),
        api<CatalogResponse>('/media/catalog?type=series&pageSize=18&sort=newest'),
        api<ProfilePreferencesResponse>('/profiles/me/preferences'),
      ]);
      if (!active) return;
      if (movieResult.status === 'fulfilled') setMovies(movieResult.value.items);
      if (seriesResult.status === 'fulfilled') setSeries(seriesResult.value.items);
      if (preferenceResult.status === 'fulfilled') {
        setHomeRows(preferenceResult.value.preferences.homeRowOrder);
        setHiddenHomeRows(preferenceResult.value.preferences.hiddenHomeRows);
      }
      if (movieResult.status === 'rejected' || seriesResult.status === 'rejected') {
        setCatalogError('En del af biblioteket kunne ikke hentes. Resten af portalen er stadig tilgængelig.');
      }
    }).catch(() => {
      clearSession();
      router.replace('/login');
    });
    return () => { active = false; };
  }, [router]);
  if (!user) return <main className="watch-loading" aria-busy="true" />;
  const visibleRows = homeRows.filter((row) => !hiddenHomeRows.includes(row));
  const homeRow = (row: HomeRowId) => row === 'recommendations'
    ? <PersonalizedRecommendations key={row} />
    : row === 'continue'
      ? <ContinueWatching key={row} />
      : row === 'new_movies'
        ? <DiscoveryRow key={row} title="Nye film" items={movies} allHref="/watch?type=movie" />
        : <DiscoveryRow key={row} title="Nye serier" items={series} allHref="/watch?type=series" />;
  return <CustomerShell user={user}><div className={styles.portal}>{catalogError && <p className={styles.catalogNotice}>{catalogError}</p>}{continueOnly ? <section className="watch-page-heading"><span className="eyebrow">DIN HISTORIK</span><h1>Fortsæt med at se</h1><ContinueWatching /></section> : browse ? <CatalogView basePath="/watch" /> : <><section className={styles.libraryBar}><div><Library size={22} /><strong>Dit BoltBytes-bibliotek</strong><span>{movies.length}+ film · {series.length}+ serier klar til afspilning</span></div><nav><Link href="/watch?type=movie"><Film size={14} />Film</Link><Link href="/watch?type=series"><Tv size={14} />Serier</Link></nav></section>{visibleRows.length ? visibleRows.map(homeRow) : <section className={styles.empty}><strong>Din forside er tom</strong><p>Vis mindst én række under Indstillinger → Anbefalinger.</p><Link href="/watch/settings">Tilpas forsiden</Link></section>}</>}</div></CustomerShell>;
}

function DiscoveryRow({ title, items, allHref }: { title: string; items: WatchItem[]; allHref: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * Math.max(420, rail.current.clientWidth * .78), behavior: 'smooth' });
  return <section className={styles.row}><header><h2>{title}</h2><Link href={allHref}>Se alle <ArrowRight size={14} /></Link></header>{items.length ? <div className={styles.railWrap}><button className={`${styles.arrow} ${styles.left}`} aria-label={`Rul ${title} til venstre`} onClick={() => scroll(-1)}><ChevronLeft /></button><div className={styles.rail} ref={rail}>{items.map((item) => <Link className={styles.card} href={`/watch/title/${encodeURIComponent(item.id)}`} key={`${item.type}-${item.id}`}><span className={styles.poster} style={posterStyle(item.posterPath)}><PosterQualityBadges media={item} /><i><Play size={16} fill="currentColor" /></i></span><strong>{item.title}</strong><small>{item.releaseYear ?? (item.type === 'series' ? 'Serie' : 'Film')}</small></Link>)}</div><button className={`${styles.arrow} ${styles.right}`} aria-label={`Rul ${title} til højre`} onClick={() => scroll(1)}><ChevronRight /></button></div> : <div className={styles.empty}>Ingen titler i denne række endnu.</div>}</section>;
}
function posterStyle(path: string | null): { backgroundImage: string } | undefined { const url = imageUrl(path); return url ? { backgroundImage: `linear-gradient(160deg,transparent 48%,rgba(0,0,0,.72)),url("${url}")` } : undefined; }
function imageUrl(path: string | null) { if (!path) return null; if (/^https:\/\//i.test(path)) return path; return `https://image.tmdb.org/t/p/w500${path}`; }
