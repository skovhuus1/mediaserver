'use client';

import { ArrowLeft, Film, Play, Tv } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, clearSession, type SessionUser } from '@/lib/api';
import { CustomerShell } from './customer-shell';
import { requestPlayback, type PlayableMedia } from './web-player';
import styles from './watch-title-page.module.css';

type Media = PlayableMedia & {
  type: 'movie' | 'series' | 'episode';
  seriesDisplayTitle?: string | null;
  seriesMetadataProviderId?: string | null;
  seriesOverview?: string | null;
  rating?: number | null;
  metadataProvider?: string | null;
  episodeStillPath?: string | null;
  seasonPosterPath?: string | null;
};
type Season = { number: number; title: string; posterPath: string | null; episodeCount: number; episodes: Media[] };
type Detail = { kind: 'movie' | 'series'; item: Media; seasons: Season[] };
type NextEpisode = { media: Media; resumePositionMs: number };

export function WatchTitlePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [next, setNext] = useState<NextEpisode | null>(null);
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      api<SessionUser>('/auth/me'),
      api<Detail>(`/media/${encodeURIComponent(id)}/details`),
    ]).then(async ([session, mediaDetail]) => {
      setUser(session);
      setDetail(mediaDetail);
      setSeasonNumber(mediaDetail.seasons[0]?.number ?? null);
      if (mediaDetail.kind === 'series') {
        const query = new URLSearchParams();
        if (mediaDetail.item.seriesMetadataProviderId) query.set('seriesMetadataProviderId', mediaDetail.item.seriesMetadataProviderId);
        else if (mediaDetail.item.seriesDisplayTitle) query.set('seriesDisplayTitle', mediaDetail.item.seriesDisplayTitle);
        else if (mediaDetail.item.seriesTitle) query.set('seriesTitle', mediaDetail.item.seriesTitle);
        setNext(await api<NextEpisode | null>(`/playback/history/series-next?${query}`));
      }
    }).catch((failure) => {
      if ((failure as { status?: number }).status === 401) {
        clearSession();
        router.replace('/login');
      } else {
        setError(failure instanceof Error ? failure.message : 'Titlen kunne ikke hentes.');
      }
    });
  }, [id, router]);

  const season = useMemo(
    () => detail?.seasons.find((entry) => entry.number === seasonNumber) ?? null,
    [detail, seasonNumber],
  );
  async function selectSeason(number: number) {
    setSeasonNumber(number);
    if (detail?.seasons.find((entry) => entry.number === number)?.episodes.length) return;
    setSeasonLoading(true);
    try {
      const loaded = await api<Detail>(`/media/${encodeURIComponent(id)}/details?season=${number}`);
      setDetail(loaded);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sæsonen kunne ikke hentes.');
    } finally {
      setSeasonLoading(false);
    }
  }
  if (!user) return <main className="watch-loading" aria-busy={!error}>{error}</main>;
  if (!detail) return <CustomerShell user={user}><div className={styles.error}>{error}</div></CustomerShell>;
  const item = detail.item;
  const playTarget = detail.kind === 'series' ? next?.media ?? detail.seasons[0]?.episodes[0] : item;
  return (
    <CustomerShell user={user}>
      <article className={styles.page}>
        <header className={styles.hero} style={imageStyle(item.backdropPath)}>
          <div>
            <Link href="/watch"><ArrowLeft size={17} />Tilbage</Link>
            <span>{detail.kind === 'series' ? <Tv /> : <Film />}{detail.kind === 'series' ? 'Serie' : 'Film'}</span>
            <h1>{item.title}</h1>
            <p>{item.overview ?? item.seriesOverview ?? 'Beskrivelse afventer metadata.'}</p>
            <div className={styles.meta}>
              {item.releaseYear && <b>{item.releaseYear}</b>}
              {item.rating != null && <b>{item.rating.toFixed(1)}/10</b>}
              {detail.kind === 'series' && <b>{detail.seasons.reduce((sum, entry) => sum + entry.episodeCount, 0)} episoder</b>}
            </div>
            {playTarget && <button onClick={() => requestPlayback(playTarget, next?.media.id === playTarget.id ? next.resumePositionMs : 0)}><Play fill="currentColor" />{next?.resumePositionMs ? 'Fortsæt' : detail.kind === 'series' ? 'Afspil næste' : 'Afspil'}</button>}
          </div>
        </header>
        {detail.kind === 'series' && (
          <section className={styles.episodes}>
            <nav>{detail.seasons.map((entry) => <button className={entry.number === seasonNumber ? styles.active : ''} onClick={() => void selectSeason(entry.number)} key={entry.number}>{entry.title} <small>{entry.episodeCount}</small></button>)}</nav>
            <div aria-busy={seasonLoading}>{seasonLoading ? <p>Henter sæson...</p> : season?.episodes.map((episode) => (
              <button className={styles.episode} onClick={() => requestPlayback(episode, next?.media.id === episode.id ? next.resumePositionMs : 0)} key={episode.id}>
                <i style={imageStyle(episode.episodeStillPath ?? season.posterPath)} />
                <span><b>S{String(episode.seasonNumber ?? 0).padStart(2, '0')}E{String(episode.episodeNumber ?? 0).padStart(2, '0')} · {episode.title}</b><small>{episode.overview ?? 'Episodebeskrivelse afventer metadata.'}</small></span>
                <Play />
              </button>
            ))}</div>
          </section>
        )}
      </article>
    </CustomerShell>
  );
}

function imageStyle(path?: string | null) {
  if (!path) return undefined;
  const url = path.startsWith('http') ? path : `https://image.tmdb.org/t/p/original${path}`;
  return { backgroundImage: `linear-gradient(90deg,rgba(5,8,11,.97) 0%,rgba(5,8,11,.54) 58%,rgba(5,8,11,.16)),url("${url}")` };
}
