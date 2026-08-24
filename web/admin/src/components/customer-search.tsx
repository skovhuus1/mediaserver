'use client';

import { ArrowRight, Clock3, Film, Layers3, ListVideo, LoaderCircle, Search, Tv, UserRound, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import styles from './customer-search.module.css';

type TitleResult = { mediaId: string; title: string; type: string; releaseYear: number | null; posterPath: string | null; genres: string[]; episodeCount: number | null; matchReason: string };
type EpisodeResult = { mediaId: string; title: string; seriesTitle: string; seasonNumber: number | null; episodeNumber: number | null; releaseYear: number | null; imagePath: string | null; matchReason: string };
type PersonResult = { key: string; name: string; role: string | null; department: string | null; profilePath: string | null; titleCount: number };
type GenreResult = { key: string; name: string; titleCount: number; imagePath: string | null };
type SearchResponse = { query: string; total: number; groups: { titles: TitleResult[]; episodes: EpisodeResult[]; people: PersonResult[]; genres: GenreResult[] } };
type SearchTarget = { key: string; href: string };

const RECENT_KEY = 'bb_watch_recent_searches';

export function CustomerSearch({ className, initialQuery }: { className?: string; initialQuery: string }) {
  const router = useRouter();
  const root = useRef<HTMLFormElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => {
    try { setRecent(JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as string[]); } catch { setRecent([]); }
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResult(null); setLoading(false); setError(''); return; }
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    setResult(null);
    const timer = window.setTimeout(() => {
      void api<SearchResponse>(`/experience/search?q=${encodeURIComponent(trimmed)}`)
        .then((payload) => { if (current === requestId.current) { setResult(payload); setActiveIndex(-1); } })
        .catch((reason: ApiFailure) => { if (current === requestId.current) setError(reason.message ?? 'Søgningen kunne ikke gennemføres.'); })
        .finally(() => { if (current === requestId.current) setLoading(false); });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const targets = useMemo<SearchTarget[]>(() => result ? [
    ...result.groups.titles.map((item) => ({ key: `title:${item.mediaId}`, href: `/watch/title/${encodeURIComponent(item.mediaId)}` })),
    ...result.groups.episodes.map((item) => ({ key: `episode:${item.mediaId}`, href: `/watch/title/${encodeURIComponent(item.mediaId)}` })),
    ...result.groups.people.map((item) => ({ key: `person:${item.key}`, href: `/watch/person/${encodeURIComponent(item.key)}` })),
    ...result.groups.genres.map((item) => ({ key: `genre:${item.key}`, href: `/watch/collection/${encodeURIComponent(item.key)}` })),
  ] : [], [result]);

  function remember(value: string) {
    const next = [value.trim(), ...recent.filter((entry) => entry.toLocaleLowerCase('da') !== value.trim().toLocaleLowerCase('da'))].filter(Boolean).slice(0, 6);
    setRecent(next);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }
  function navigate(href: string) { remember(query); setOpen(false); router.push(href); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const selected = targets[activeIndex];
    navigate(selected?.href ?? `/watch?q=${encodeURIComponent(trimmed)}`);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { setOpen(false); setActiveIndex(-1); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => event.key === 'ArrowDown' ? Math.min(targets.length - 1, index + 1) : Math.max(-1, index - 1));
    }
  }
  let targetOffset = 0;
  return <form className={`${className ?? ''} ${styles.root}`} onSubmit={submit} ref={root} role="search">
    <Search size={17} aria-hidden="true" />
    <input aria-activedescendant={activeIndex >= 0 ? `watch-search-${activeIndex}` : undefined} aria-autocomplete="list" aria-controls="watch-search-results" aria-expanded={open} aria-label="Søg i dit bibliotek" autoComplete="off" onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={keyDown} placeholder="Titler, afsnit, skuespillere og genrer" role="combobox" type="search" value={query} />
    {loading && <LoaderCircle className={styles.spinner} size={16} aria-label="Søger" />}
    {query && !loading && <button className={styles.clear} type="button" aria-label="Ryd søgning" onClick={() => { setQuery(''); setResult(null); }}><X size={15} /></button>}
    {open && <section className={styles.panel} id="watch-search-results" role="listbox">
      {query.trim().length < 2 ? <RecentSearches recent={recent} choose={(value) => { setQuery(value); setOpen(true); }} clear={() => { setRecent([]); window.localStorage.removeItem(RECENT_KEY); }} /> : error ? <div className={styles.state}><strong>Søgningen fejlede</strong><span>{error}</span></div> : result && result.total === 0 && !loading ? <div className={styles.state}><strong>Ingen lokale resultater</strong><span>Prøv titel, person eller genre med en anden stavemåde.</span></div> : <>
        {result?.groups.titles.length ? <SearchGroup title="Titler"><div className={styles.titleGrid}>{result.groups.titles.map((item, index) => { const itemIndex = targetOffset + index; return <button className={itemIndex === activeIndex ? styles.active : ''} id={`watch-search-${itemIndex}`} key={item.mediaId} onClick={() => navigate(`/watch/title/${encodeURIComponent(item.mediaId)}`)} onMouseEnter={() => setActiveIndex(itemIndex)} role="option" type="button"><i className={styles.poster} style={image(item.posterPath)}>{item.type === 'series' ? <Tv /> : <Film />}</i><span><strong>{item.title}</strong><small>{item.releaseYear ?? (item.type === 'series' ? 'Serie' : 'Film')} · {item.matchReason}{item.episodeCount ? ` · ${item.episodeCount} episoder` : ''}</small></span><ArrowRight /></button>; })}</div></SearchGroup> : null}
        {result?.groups.titles.length ? (() => { targetOffset += result.groups.titles.length; return null; })() : null}
        {result?.groups.episodes.length ? <SearchGroup title="Afsnit"><div className={styles.titleGrid}>{result.groups.episodes.map((item, index) => { const itemIndex = targetOffset + index; return <button className={itemIndex === activeIndex ? styles.active : ''} id={`watch-search-${itemIndex}`} key={item.mediaId} onClick={() => navigate(`/watch/title/${encodeURIComponent(item.mediaId)}`)} onMouseEnter={() => setActiveIndex(itemIndex)} role="option" type="button"><i className={styles.poster} style={image(item.imagePath)}><ListVideo /></i><span><strong>{item.title}</strong><small>{item.matchReason}</small></span><ArrowRight /></button>; })}</div></SearchGroup> : null}
        {result?.groups.episodes.length ? (() => { targetOffset += result.groups.episodes.length; return null; })() : null}
        {result?.groups.people.length ? <SearchGroup title="Personer"><div className={styles.compactGrid}>{result.groups.people.map((item, index) => { const itemIndex = targetOffset + index; return <button className={itemIndex === activeIndex ? styles.active : ''} id={`watch-search-${itemIndex}`} key={item.key} onClick={() => navigate(`/watch/person/${encodeURIComponent(item.key)}`)} onMouseEnter={() => setActiveIndex(itemIndex)} role="option" type="button"><i className={styles.avatar} style={image(item.profilePath)}><UserRound /></i><span><strong>{item.name}</strong><small>{item.role ?? item.department ?? 'Medvirkende'} · {item.titleCount} lokale titler</small></span></button>; })}</div></SearchGroup> : null}
        {result?.groups.people.length ? (() => { targetOffset += result.groups.people.length; return null; })() : null}
        {result?.groups.genres.length ? <SearchGroup title="Genrer"><div className={styles.genreGrid}>{result.groups.genres.map((item, index) => { const itemIndex = targetOffset + index; return <button className={itemIndex === activeIndex ? styles.active : ''} id={`watch-search-${itemIndex}`} key={item.key} onClick={() => navigate(`/watch/collection/${encodeURIComponent(item.key)}`)} onMouseEnter={() => setActiveIndex(itemIndex)} role="option" type="button"><i style={image(item.imagePath)}><Layers3 /></i><span><strong>{item.name}</strong><small>{item.titleCount} lokale titler</small></span></button>; })}</div></SearchGroup> : null}
        {result && result.total > 0 && <button className={styles.all} onClick={() => navigate(`/watch?q=${encodeURIComponent(result.query)}`)} type="button">Vis alle resultater for “{result.query}”<ArrowRight /></button>}
      </>}
    </section>}
  </form>;
}

function SearchGroup({ title, children }: { title: string; children: ReactNode }) { return <div className={styles.group}><h2>{title}</h2>{children}</div>; }
function RecentSearches({ recent, choose, clear }: { recent: string[]; choose: (value: string) => void; clear: () => void }) { return <div className={styles.recent}><header><strong>Seneste søgninger</strong>{recent.length > 0 && <button onClick={clear} type="button">Ryd</button>}</header>{recent.length ? recent.map((value) => <button onClick={() => choose(value)} type="button" key={value}><Clock3 />{value}</button>) : <span>Skriv mindst to tegn for at søge på hele serveren.</span>}</div>; }
function image(path: string | null) { if (!path) return undefined; const url = /^https?:\/\//i.test(path) ? path : `https://image.tmdb.org/t/p/w342${path}`; return { backgroundImage: `url("${url.replace(/["\\]/g, '')}")` }; }
