'use client';

import { ArrowLeft, CheckCircle2, ChevronRight, Film, Play, Sparkles, Star, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import { AuthenticatedCustomerShell } from './authenticated-customer-shell';
import { requestPlayback, type PlayableMedia } from './web-player';
import styles from './title-experience-page.module.css';

type Person = { key: string; name: string; role: string | null; profilePath: string | null };
type Collection = { key: string; label: string; type: string };
type Playback = { media: PlayableMedia; positionMs: number; completed: boolean; progressPercent: number; lastPlayedAt: string | null };
type Episode = { id: string; title: string; overview: string | null; seasonNumber: number | null; episodeNumber: number | null; releaseYear: number | null; stillPath: string | null; posterPath: string | null; durationMs: number | null; watched: boolean; positionMs: number; progressPercent: number; markers: Array<{ kind: string; startMs: number; endMs: number; source: string }>; playback: PlayableMedia };
type Season = { number: number; label: string; episodeCount: number; watchedCount: number; durationMs: number; episodes: Episode[] };
type Related = { mediaId: string; title: string; type: string; releaseYear: number | null; overview: string | null; rating: number | null; posterPath: string | null; backdropPath: string | null; genres: string[]; episodeCount: number | null; reason: string };
type Title = { id: string; displayTitle: string; episodeTitle: string | null; type: string; releaseYear: number | null; overview: string | null; rating: number | null; posterPath: string | null; backdropPath: string | null; genres: string[]; durationMs: number | null; width: number | null; height: number | null; bitrate: number | null; container: string | null; videoCodec: string | null; audioCodec: string | null; hdr: string | null };
type Experience = { mode: 'title' | 'series'; title: Title; playback?: Playback; discovery: { people: Person[]; collections: Collection[] }; related: Related[]; series?: { seasons: Season[]; resumeEpisode: Episode | null; nextEpisode: Episode | null; selectedSeasonNumber: number } };

export function TitleExperiencePage() {
  const params = useParams<{ id: string }>();
  const mediaId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [experience, setExperience] = useState<Experience | null>(null);
  const [error, setError] = useState('');
  const [season, setSeason] = useState<number | null>(null);

  useEffect(() => {
    if (!mediaId) return;
    setExperience(null);
    setError('');
    void api<Experience>(`/experience/titles/${mediaId}`)
      .then((result) => { setExperience(result); setSeason(result.series?.selectedSeasonNumber ?? null); })
      .catch((reason) => setError(errorMessage(reason)));
  }, [mediaId]);

  const selectedSeason = useMemo(() => experience?.series?.seasons.find((entry) => entry.number === season) ?? experience?.series?.seasons[0] ?? null, [experience, season]);
  if (error) return <AuthenticatedCustomerShell><section className={styles.state}><Film size={28} /><strong>Titlen kunne ikke åbnes</strong><p>{error}</p><Link href="/watch">Tilbage til biblioteket</Link></section></AuthenticatedCustomerShell>;
  if (!experience) return <AuthenticatedCustomerShell><section className={styles.state} aria-busy="true"><Sparkles size={28} /><strong>Samler titeloplevelsen...</strong></section></AuthenticatedCustomerShell>;

  if (experience.mode !== 'series' || !experience.series) {
    return <AuthenticatedCustomerShell><article className={styles.titlePage}>
      <section className={`${styles.hero} ${styles.filmHero}`} style={backdrop(experience.title.backdropPath)}><div className={styles.heroShade} /><Link className={styles.back} href="/watch"><ArrowLeft />Tilbage</Link><div className={styles.filmPoster} style={poster(experience.title.posterPath)} /><div className={styles.heroContent}><span className={styles.eyebrow}>FILM · {qualityLabel(experience.title)}</span><h1>{experience.title.displayTitle}</h1><TitleMeta title={experience.title} /><p>{experience.title.overview ?? 'Der er endnu ingen beskrivelse af denne film.'}</p>{experience.playback && <div className={styles.heroActions}><button className={styles.playButton} onClick={() => requestPlayback(experience.playback!.media, experience.playback!.positionMs)}><Play fill="currentColor" />{experience.playback.positionMs > 0 ? `Fortsæt · ${duration(experience.playback.positionMs)}` : 'Afspil film'}</button>{experience.playback.progressPercent > 0 && <span>{experience.playback.progressPercent}% set</span>}</div>}</div></section>
      <DiscoveryStrip discovery={experience.discovery} />
      <RelatedTitles items={experience.related} heading={`Mere som ${experience.title.displayTitle}`} />
    </article></AuthenticatedCustomerShell>;
  }

  const resume = experience.series.resumeEpisode;
  return <AuthenticatedCustomerShell><article className={styles.seriesPage}>
    <section className={styles.hero} style={backdrop(experience.title.backdropPath)}><div className={styles.heroShade} /><Link className={styles.back} href="/watch"><ArrowLeft />Tilbage</Link><div className={styles.heroContent}><span className={styles.eyebrow}>SERIE · {experience.series.seasons.length} SÆSONER</span><h1>{experience.title.displayTitle}</h1><TitleMeta title={experience.title} /><p>{experience.title.overview ?? 'Serien er samlet fra serverens lokale episoder.'}</p>{resume && <div className={styles.heroActions}><button className={styles.playButton} onClick={() => requestPlayback(resume.playback, resume.positionMs)}><Play size={18} fill="currentColor" />{resume.positionMs > 0 ? 'Fortsæt' : 'Afspil'} S{pad(resume.seasonNumber)}E{pad(resume.episodeNumber)}</button>{experience.series.nextEpisode && <span>Næste: {experience.series.nextEpisode.title}</span>}</div>}</div></section>
    <DiscoveryStrip discovery={experience.discovery} />
    <div className={styles.seriesGrid}><main><header className={styles.seasonHeader}><div><span>EPISODEGUIDE</span><h2>{selectedSeason?.label ?? 'Episoder'}</h2><small>{selectedSeason ? `${selectedSeason.watchedCount} af ${selectedSeason.episodeCount} set · ${duration(selectedSeason.durationMs)}` : ''}</small></div><div className={styles.seasonTabs}>{experience.series.seasons.map((entry) => <button className={entry.number === selectedSeason?.number ? styles.activeSeason : ''} key={entry.number} onClick={() => setSeason(entry.number)}>{entry.label}<small>{entry.watchedCount}/{entry.episodeCount} set</small></button>)}</div></header><div className={styles.episodes}>{selectedSeason?.episodes.map((episode) => <EpisodeRow episode={episode} key={episode.id} />)}</div></main><aside className={styles.queue}><span className={styles.eyebrow}>AFSPILNINGSKØ</span><h3>Kommer bagefter</h3>{(selectedSeason?.episodes.filter((episode) => !episode.watched).slice(0, 6) ?? []).map((episode, index) => <button onClick={() => requestPlayback(episode.playback, episode.positionMs)} key={episode.id}><b>{index + 1}</b><span><strong>S{pad(episode.seasonNumber)}E{pad(episode.episodeNumber)} · {episode.title}</strong><small>{duration(episode.durationMs)}{episode.positionMs > 0 ? ` · fortsæt ved ${duration(episode.positionMs)}` : ''}</small></span><ChevronRight /></button>)}{!selectedSeason?.episodes.some((episode) => !episode.watched) && <p>Hele sæsonen er set.</p>}</aside></div>
    <RelatedTitles items={experience.related} heading="Flere serier til dig" />
  </article></AuthenticatedCustomerShell>;
}

function EpisodeRow({ episode }: { episode: Episode }) { const markerKinds = new Set(episode.markers.map((marker) => marker.kind)); return <article className={styles.episode}><button className={styles.still} onClick={() => requestPlayback(episode.playback, episode.positionMs)} style={backdrop(episode.stillPath ?? episode.posterPath)} aria-label={`Afspil ${episode.title}`}><Play fill="currentColor" />{episode.watched && <span><CheckCircle2 />Set</span>}{episode.progressPercent > 0 && <i style={{ width: `${episode.progressPercent}%` }} />}</button><div className={styles.episodeCopy}><header><span>S{pad(episode.seasonNumber)}E{pad(episode.episodeNumber)}</span><strong>{episode.title}</strong><em>{duration(episode.durationMs)}</em></header><p>{episode.overview ?? 'Der er endnu ingen episodebeskrivelse.'}</p><footer>{markerKinds.has('intro') && <span>Spring intro over</span>}{markerKinds.has('recap') && <span>Recap</span>}{markerKinds.has('credits') && <span>Automatisk næste episode</span>}</footer></div><button className={styles.episodeAction} onClick={() => requestPlayback(episode.playback, episode.positionMs)}>{episode.positionMs > 0 ? 'Fortsæt' : 'Afspil'}<ChevronRight /></button></article>; }
function TitleMeta({ title }: { title: Title }) { return <div className={styles.meta}>{title.releaseYear && <span>{title.releaseYear}</span>}{title.rating != null && <span><Star fill="currentColor" />{title.rating.toFixed(1)}</span>}{title.durationMs && <span>{duration(title.durationMs)}</span>}{title.height && <span>{title.height >= 2160 ? '4K UHD' : `${title.height}p`}</span>}{title.hdr && <span>{title.hdr.replaceAll('_', ' ').toUpperCase()}</span>}{title.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}</div>; }
function DiscoveryStrip({ discovery }: { discovery: Experience['discovery'] }) { if (!discovery.people.length && !discovery.collections.length) return null; return <section className={styles.discovery}><div><Users /><strong>Medvirkende og samlinger</strong></div><nav>{discovery.people.slice(0, 8).map((person) => <Link href={`/watch/person/${encodeURIComponent(person.key)}`} key={person.key}>{person.name}{person.role && <small>{person.role}</small>}</Link>)}{discovery.collections.map((collection) => <Link href={`/watch/collection/${encodeURIComponent(collection.key)}`} key={collection.key}>{collection.label}<small>{collection.type === 'genre' ? 'Genre' : collection.type === 'similar' ? 'Lignende' : 'Samling'}</small></Link>)}</nav></section>; }
function RelatedTitles({ items, heading }: { items: Related[]; heading: string }) { if (!items.length) return null; return <section className={styles.related}><header><span className={styles.eyebrow}>KUN FRA DIT BIBLIOTEK</span><h2>{heading}</h2></header><div className={styles.relatedGrid}>{items.map((item) => <Link className={styles.relatedCard} href={`/watch/title/${encodeURIComponent(item.mediaId)}`} key={item.mediaId}><i style={poster(item.posterPath)}><Play fill="currentColor" /></i><strong>{item.title}</strong><span>{item.reason}</span><small>{item.releaseYear ?? (item.type === 'series' ? 'Serie' : 'Film')}{item.episodeCount ? ` · ${item.episodeCount} episoder` : ''}</small></Link>)}</div></section>; }
function imageUrl(path: string | null) { if (!path) return null; if (/^https?:\/\//i.test(path)) return path; if (/^\/[A-Za-z0-9._-]+$/.test(path)) return `https://image.tmdb.org/t/p/original${path}`; return null; }
function backdrop(path: string | null) { const url = imageUrl(path); return url ? { backgroundImage: `url("${url}")` } : undefined; }
function poster(path: string | null) { const url = imageUrl(path); return url ? { backgroundImage: `url("${url}")` } : undefined; }
function duration(ms: number | null) { if (!ms) return 'Ukendt'; const minutes = Math.max(1, Math.round(ms / 60_000)); return minutes >= 60 ? `${Math.floor(minutes / 60)} t ${minutes % 60} min` : `${minutes} min`; }
function qualityLabel(title: Title) { return `${title.height && title.height >= 2160 ? '4K UHD' : title.height ? `${title.height}P` : 'LOKAL'}${title.hdr ? ` · ${title.hdr.replaceAll('_', ' ').toUpperCase()}` : ''}`; }
function pad(value: number | null) { return String(value ?? 0).padStart(2, '0'); }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Titlen kunne ikke indlæses.'); }
