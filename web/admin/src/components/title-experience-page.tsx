'use client';

import { CheckCircle2, ChevronRight, Film, Play, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import { WatchTitlePage } from './watch-title-page';
import styles from './title-experience-page.module.css';

type Person = { key: string; name: string; role: string | null; profilePath: string | null };
type Collection = { key: string; label: string; type: string };
type Episode = {
  id: string; title: string; overview: string | null; seasonNumber: number | null; episodeNumber: number | null; releaseYear: number | null;
  stillPath: string | null; posterPath: string | null; durationMs: number | null; watched: boolean; positionMs: number; progressPercent: number;
  markers: Array<{ kind: string; startMs: number; endMs: number; source: string }>;
};
type Season = { number: number; label: string; episodeCount: number; watchedCount: number; durationMs: number; episodes: Episode[] };
type Experience = {
  mode: 'title' | 'series';
  title: { id: string; displayTitle: string; episodeTitle: string | null; releaseYear: number | null; overview: string | null; rating: number | null; posterPath: string | null; backdropPath: string | null; genres: string[] };
  discovery: { people: Person[]; collections: Collection[] };
  series?: { seasons: Season[]; resumeEpisode: Episode | null; nextEpisode: Episode | null; selectedSeasonNumber: number };
};

export function TitleExperiencePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const mediaId = Array.isArray(params.id) ? params.id[0] : params.id;
  const legacyPlayback = searchParams.get('play') === '1';
  const [experience, setExperience] = useState<Experience | null>(null);
  const [error, setError] = useState('');
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    if (!mediaId || legacyPlayback) return;
    void api<Experience>(`/experience/titles/${mediaId}`)
      .then((result) => { setExperience(result); setSeason(result.series?.selectedSeasonNumber ?? null); })
      .catch((reason) => setError(errorMessage(reason)));
  }, [mediaId, legacyPlayback]);

  const selectedSeason = useMemo(() => experience?.series?.seasons.find((entry) => entry.number === season) ?? experience?.series?.seasons[0] ?? null, [experience, season]);
  if (legacyPlayback) return <WatchTitlePage />;
  if (error) return <section className={styles.state}><Film size={28} /><strong>Titlen kunne ikke åbnes</strong><p>{error}</p><Link href="/watch">Tilbage til biblioteket</Link></section>;
  if (!experience) return <section className={styles.state} aria-busy="true"><Sparkles size={28} /><strong>Samler titeloplevelsen...</strong></section>;
  if (experience.mode !== 'series' || !experience.series) return <><DiscoveryStrip discovery={experience.discovery} /><WatchTitlePage /></>;

  const resume = experience.series.resumeEpisode;
  return (
    <article className={styles.seriesPage}>
      <section className={styles.hero} style={backdrop(experience.title.backdropPath)}>
        <div className={styles.heroShade} />
        <div className={styles.heroContent}>
          <span className={styles.eyebrow}>SERIE · {experience.series.seasons.length} SÆSONER</span>
          <h1>{experience.title.displayTitle}</h1>
          <div className={styles.meta}>{experience.title.releaseYear && <span>{experience.title.releaseYear}</span>}{experience.title.rating && <span>★ {experience.title.rating.toFixed(1)}</span>}{experience.title.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}</div>
          <p>{experience.title.overview ?? 'Serien er samlet fra serverens lokale episoder.'}</p>
          {resume && <div className={styles.heroActions}><Link className={styles.playButton} href={`/watch/title/${resume.id}?play=1&autoplay=1`}><Play size={18} fill="currentColor" />{resume.positionMs > 0 ? 'Fortsæt' : 'Afspil'} S{String(resume.seasonNumber ?? 0).padStart(2, '0')}E{String(resume.episodeNumber ?? 0).padStart(2, '0')}</Link>{experience.series.nextEpisode && <span>Næste: {experience.series.nextEpisode.title}</span>}</div>}
        </div>
      </section>
      <DiscoveryStrip discovery={experience.discovery} />
      <div className={styles.seriesGrid}>
        <main>
          <header className={styles.seasonHeader}><div><span>EPISODEGUIDE</span><h2>{selectedSeason?.label ?? 'Episoder'}</h2></div><div className={styles.seasonTabs}>{experience.series.seasons.map((entry) => <button className={entry.number === selectedSeason?.number ? styles.activeSeason : ''} key={entry.number} onClick={() => setSeason(entry.number)}>{entry.label}<small>{entry.watchedCount}/{entry.episodeCount} set</small></button>)}</div></header>
          <div className={styles.episodes}>{selectedSeason?.episodes.map((episode) => <EpisodeRow episode={episode} key={episode.id} />)}</div>
        </main>
        <aside className={styles.queue}>
          <span className={styles.eyebrow}>AFSPILNINGSKØ</span><h3>Kommer bagefter</h3>
          {(selectedSeason?.episodes.filter((episode) => !episode.watched).slice(0, 6) ?? []).map((episode, index) => <Link href={`/watch/title/${episode.id}?play=1`} key={episode.id}><b>{index + 1}</b><span><strong>S{String(episode.seasonNumber ?? 0).padStart(2, '0')}E{String(episode.episodeNumber ?? 0).padStart(2, '0')} · {episode.title}</strong><small>{duration(episode.durationMs)}{episode.positionMs > 0 ? ` · fortsæt ved ${duration(episode.positionMs)}` : ''}</small></span><ChevronRight size={16} /></Link>)}
          {!selectedSeason?.episodes.some((episode) => !episode.watched) && <p>Hele sæsonen er set.</p>}
        </aside>
      </div>
    </article>
  );
}

function EpisodeRow({ episode }: { episode: Episode }) {
  const markerKinds = new Set(episode.markers.map((marker) => marker.kind));
  return <article className={styles.episode}><Link className={styles.still} href={`/watch/title/${episode.id}?play=1`} style={backdrop(episode.stillPath ?? episode.posterPath)}><Play size={22} fill="currentColor" />{episode.watched && <span><CheckCircle2 size={15} />Set</span>}{episode.progressPercent > 0 && <i style={{ width: `${episode.progressPercent}%` }} />}</Link><div className={styles.episodeCopy}><header><span>S{String(episode.seasonNumber ?? 0).padStart(2, '0')}E{String(episode.episodeNumber ?? 0).padStart(2, '0')}</span><strong>{episode.title}</strong><em>{duration(episode.durationMs)}</em></header><p>{episode.overview ?? 'Der er endnu ingen episodebeskrivelse.'}</p><footer>{markerKinds.has('intro') && <span>Spring intro over</span>}{markerKinds.has('recap') && <span>Recap-marker</span>}{markerKinds.has('credits') && <span>Automatisk næste episode</span>}</footer></div><Link className={styles.episodeAction} href={`/watch/title/${episode.id}?play=1&autoplay=1`}>{episode.positionMs > 0 ? 'Fortsæt' : 'Afspil'}<ChevronRight size={16} /></Link></article>;
}

function DiscoveryStrip({ discovery }: { discovery: Experience['discovery'] }) {
  if (!discovery.people.length && !discovery.collections.length) return null;
  return <section className={styles.discovery}><div><Users size={17} /><strong>Udforsk titlen</strong></div><nav>{discovery.people.slice(0, 8).map((person) => <Link href={`/watch/person/${encodeURIComponent(person.key)}`} key={person.key}>{person.name}{person.role && <small>{person.role}</small>}</Link>)}{discovery.collections.map((collection) => <Link href={`/watch/collection/${encodeURIComponent(collection.key)}`} key={collection.key}>{collection.label}<small>{collection.type === 'genre' ? 'Genre' : 'Samling'}</small></Link>)}</nav></section>;
}
function imageUrl(path: string | null) { if (!path) return null; if (/^https?:\/\//i.test(path)) return path; if (/^\/[A-Za-z0-9._-]+$/.test(path)) return `https://image.tmdb.org/t/p/original${path}`; return null; }
function backdrop(path: string | null) { const url = imageUrl(path); return url ? { backgroundImage: `url("${url}")` } : undefined; }
function duration(ms: number | null) { if (!ms) return 'Ukendt'; const minutes = Math.max(1, Math.round(ms / 60_000)); return minutes >= 60 ? `${Math.floor(minutes / 60)} t ${minutes % 60} min` : `${minutes} min`; }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Titlen kunne ikke indlæses.'); }
