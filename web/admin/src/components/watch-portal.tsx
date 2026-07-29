'use client';

import { ArrowRight, Play, Sparkles } from 'lucide-react';
import { PersonalizedRecommendations } from './personalized-recommendations';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearSession, type SessionUser } from '@/lib/api';
import { CatalogView } from './catalog-view';
import { ContinueWatching } from './continue-watching';
import { CustomerShell } from './customer-shell';
import { PosterQualityBadges } from './poster-quality-badges';

type WatchItem = {
  id: string;
  title: string;
  type: string;
  seriesTitle: string | null;
  releaseYear: number | null;
  posterPath: string | null;
  width?: number | null;
  height?: number | null;
  hdr?: 'hdr10' | 'hlg' | 'dolby_vision' | null;
};
type CatalogResponse = { items: WatchItem[] };

export function WatchPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [movies, setMovies] = useState<WatchItem[]>([]);
  const [series, setSeries] = useState<WatchItem[]>([]);
  const browse = Boolean(Array.from(searchParams.keys()).some((key) => key !== 'view'));
  const continueOnly = searchParams.get('view') === 'continue';
  useEffect(() => {
    void api<SessionUser>('/auth/me').then((session) => {
      setUser(session);
      return Promise.all([
        api<CatalogResponse>('/media/catalog?type=movie&pageSize=12&sort=newest'),
        api<CatalogResponse>('/media/catalog?type=series&pageSize=12&sort=newest'),
      ]);
    }).then(([movieCatalog, seriesCatalog]) => {
      setMovies(movieCatalog.items);
      setSeries(seriesCatalog.items);
    }).catch(() => {
      clearSession();
      router.replace('/login');
    });
  }, [router]);
  if (!user) return <main className="watch-loading" aria-busy="true" />;
  return (
    <CustomerShell user={user}>
      <PersonalizedRecommendations />
      {continueOnly ? <section className="watch-page-heading"><span className="eyebrow">DIN HISTORIK</span><h1>Fortsæt med at se</h1><ContinueWatching /></section> : browse ? <CatalogView basePath="/watch" /> : (
        <>
          <section className="watch-hero">
            <div className="watch-hero-copy"><span className="eyebrow"><Sparkles size={13} /> DIT BIBLIOTEK</span><h1>Din næste historie<br />venter allerede.</h1><p>Film, serier og fortsæt-positioner fra din egen BoltBytes-server.</p><div><Link className="watch-primary" href="/watch?type=movie"><Play size={16} />Se film</Link><Link className="watch-secondary" href="/watch?type=series">Udforsk serier <ArrowRight size={15} /></Link></div></div>
            <div className="watch-hero-art"><i /><i /><i /></div>
          </section>
          <ContinueWatching />
          <DiscoveryRow title="Nyeste film" items={movies} allHref="/watch?type=movie" />
          <DiscoveryRow title="Serier" items={series} allHref="/watch?type=series" />
        </>
      )}
    </CustomerShell>
  );
}

function DiscoveryRow({ title, items, allHref }: { title: string; items: WatchItem[]; allHref: string }) {
  return (
    <section className="watch-discovery">
      <header><h2>{title}</h2><Link href={allHref}>Se alle <ArrowRight size={14} /></Link></header>
      <div>
        {items.slice(0, 6).map((item) => {
          const href = item.type === 'series'
            ? `/watch?type=series&q=${encodeURIComponent(item.seriesTitle ?? item.title)}`
            : `/watch?type=movie&media=${encodeURIComponent(item.id)}`;
          return <Link className="watch-card" href={href} key={`${item.type}-${item.id}`}><span className="watch-poster" style={posterStyle(item.posterPath)}><PosterQualityBadges media={item} /></span><strong>{item.title}</strong><small>{item.releaseYear ?? (item.type === 'series' ? 'Serie' : 'Film')}</small></Link>;
        })}
      </div>
    </section>
  );
}

function posterStyle(path: string | null): { backgroundImage: string } | undefined {
  if (!path) return undefined;
  const url = /^https:\/\/(?:artworks\.)?thetvdb\.com\//i.test(path) ? path : `https://image.tmdb.org/t/p/w500${path}`;
  return { backgroundImage: `linear-gradient(160deg, transparent 45%, rgba(0,0,0,.6)), url("${url}")` };
}
