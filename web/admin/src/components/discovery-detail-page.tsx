'use client';

import { ArrowLeft, Film, Sparkles, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import styles from './discovery-detail-page.module.css';

type DiscoveryResult = {
  kind: 'person' | 'collection'; key: string; title: string; subtitle: string; imagePath: string | null;
  items: Array<{ mediaId: string; title: string; type: string; releaseYear: number | null; overview: string | null; rating: number | null; posterPath: string | null; backdropPath: string | null; genres: string[]; episodeCount: number | null }>;
};

export function DiscoveryDetailPage({ kind }: { kind: 'people' | 'collections' }) {
  const params = useParams<{ key: string }>();
  const key = Array.isArray(params.key) ? params.key[0] : params.key;
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!key) return;
    void api<DiscoveryResult>(`/experience/${kind}/${encodeURIComponent(key)}`).then(setResult).catch((reason) => setError(errorMessage(reason)));
  }, [key, kind]);
  if (error) return <section className={styles.state}><Film size={28} /><strong>Siden kunne ikke åbnes</strong><p>{error}</p><Link href="/watch">Tilbage til biblioteket</Link></section>;
  if (!result) return <section className={styles.state} aria-busy="true"><Sparkles size={28} /><strong>Finder lokale titler...</strong></section>;
  return <article className={styles.page}>
    <header className={styles.hero} style={backdrop(result.imagePath)}><div className={styles.shade}/><div><Link href="/watch"><ArrowLeft size={16}/>Bibliotek</Link><span>{result.kind === 'person' ? 'PERSON' : 'SAMLING'}</span><h1>{result.title}</h1><p>{result.subtitle}</p><strong>{result.items.length} lokale titler</strong></div></header>
    <section className={styles.catalog}><header><span>KUN PÅ DIN SERVER</span><h2>Tilgængelige titler</h2></header><div className={styles.grid}>{result.items.map((item) => <Link className={styles.card} href={`/watch/title/${item.mediaId}`} key={item.mediaId}><div className={styles.poster} style={poster(item.posterPath)}>{!item.posterPath && <Film size={28}/>} {item.episodeCount && <em>{item.episodeCount} episoder</em>}</div><div><strong>{item.title}</strong><p>{item.releaseYear ?? 'År ukendt'}{item.rating ? <><Star size={11} fill="currentColor"/>{item.rating.toFixed(1)}</> : null}</p><small>{item.genres.slice(0,2).join(' · ') || item.type}</small></div></Link>)}</div></section>
  </article>;
}
function imageUrl(path: string | null) { if (!path) return null; if (/^https?:\/\//i.test(path)) return path; if (/^\/[A-Za-z0-9._-]+$/.test(path)) return `https://image.tmdb.org/t/p/original${path}`; return null; }
function backdrop(path: string | null) { const url=imageUrl(path); return url?{backgroundImage:`url("${url}")`}:undefined; }
function poster(path: string | null) { const url=imageUrl(path); return url?{backgroundImage:`url("${url.replace('/original','/w500')}")`}:undefined; }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Siden kunne ikke indlæses.'); }
