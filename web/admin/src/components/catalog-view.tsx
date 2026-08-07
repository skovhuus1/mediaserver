'use client';

import { ChevronLeft, ChevronRight, Film, FolderOpen, Play, SearchX, Tv, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { requestPlayback } from './web-player';
import { PosterQualityBadges } from './poster-quality-badges';
import playerStyles from './playback.module.css';

type CatalogItem = {
  id: string;
  title: string;
  type: string;
  category: string | null;
  seriesTitle: string | null;
  seriesDisplayTitle?: string | null;
  seriesOverview?: string | null;
  seriesMetadataProviderId?: string | null;
  releaseYear: number | null;
  releaseDate?: string | null;
  seasonNumber: number | null;
  seasonMetadataProviderId?: string | null;
  seasonPosterPath?: string | null;
  episodeNumber: number | null;
  episodeStillPath?: string | null;
  episodeCount?: number;
  overview?: string | null;
  rating?: number | null;
  metadataProvider?: string | null;
  metadataLocked?: boolean;
  posterPath?: string | null;
  backdropPath?: string | null;
  width?: number | null;
  height?: number | null;
  hdr?: 'hdr10' | 'hlg' | 'dolby_vision' | null;
  codec?: string | null;
  container?: string | null;
  library?: { id: string; name: string; type: string };
  file?: {
    relativePath: string;
    sizeBytes: string;
    status: string;
    durationMs: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
  } | null;
};

type CatalogResponse = {
  items: CatalogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: {
    categories: string[];
    libraries: { id: string; name: string; type: string }[];
  };
};

type DetailState =
  | { kind: 'media'; item: CatalogItem }
  | { kind: 'series'; item: CatalogItem; episodes: CatalogItem[]; next: SeriesNext | null };

type SeriesNext = { media: CatalogItem; resumePositionMs: number };
type MetadataMatchCandidate = {
  provider: 'tmdb' | 'tvdb';
  providerId: string;
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  overview: string | null;
  posterPath: string | null;
};

const emptyCatalog: CatalogResponse = {
  items: [],
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 1,
  facets: { categories: [], libraries: [] },
};

export function CatalogView({ basePath = '/' }: { basePath?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [catalog, setCatalog] = useState<CatalogResponse>(emptyCatalog);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminMode = basePath !== '/watch';

  useEffect(() => {
    const params = new URLSearchParams();
    for (const key of ['q', 'type', 'category', 'libraryId', 'page', 'sort']) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    setLoading(true);
    setError(null);
    void api<CatalogResponse>(`/media/catalog?${params.toString()}`)
      .then(setCatalog)
      .catch((failure) => setError(errorMessage(failure)))
      .finally(() => setLoading(false));
  }, [queryKey, searchParams]);

  useEffect(() => {
    const mediaId = searchParams.get('media') ?? searchParams.get('info') ?? searchParams.get('play');
    if (!mediaId) return;
    setDetailLoading(true);
    void api<CatalogItem>(`/media/${encodeURIComponent(mediaId)}`)
      .then(async (item) => {
        if (searchParams.get('play') && item.type !== 'series') {
          requestPlayback(item);
          return;
        }
        setDetail(item.type === 'episode' || item.type === 'series'
          ? await fetchSeriesDetail(item)
          : { kind: 'media', item });
      })
      .catch((failure) => setError(errorMessage(failure)))
      .finally(() => setDetailLoading(false));
  }, [queryKey, searchParams]);

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('media');
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`${basePath}?${params.toString()}`);
  };
  const openItem = (item: CatalogItem) => {
    if (!adminMode) {
      router.push(`/watch/title/${encodeURIComponent(item.id)}`);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set('media', item.id);
    router.push(`${basePath}?${params.toString()}`);
  };
  const closeDetail = () => {
    setDetail(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('media');
    params.delete('info');
    params.delete('play');
    router.push(`${basePath}?${params.toString()}`);
  };
  const heading = searchParams.get('q')
    ? `Søgning: ${searchParams.get('q')}`
    : searchParams.get('type') === 'movie'
      ? 'Film'
      : searchParams.get('type') === 'series'
        ? 'Serier'
        : 'Mediekatalog';

  return (
    <>
      <section className="hero-line">
        <div><span className="eyebrow">MEDIA CATALOG</span><h1>{heading}</h1><p>{catalog.total} resultater fra serverens importerede katalog.</p></div>
      </section>
      <section className="catalog-toolbar" aria-label="Katalogfiltre">
        <label>Bibliotek
          <select value={searchParams.get('libraryId') ?? ''} onChange={(event) => updateFilter('libraryId', event.target.value || null)}>
            <option value="">Alle biblioteker</option>
            {catalog.facets.libraries.map((library) => <option value={library.id} key={library.id}>{library.name}</option>)}
          </select>
        </label>
        <label>Sortering
          <select value={searchParams.get('sort') ?? 'newest'} onChange={(event) => updateFilter('sort', event.target.value)}>
            <option value="newest">Senest ændret</option>
            <option value="title">Titel A-Å</option>
            <option value="year">Nyeste årstal</option>
          </select>
        </label>
        <div className="category-filters">
          <button className={!searchParams.get('category') ? 'active' : ''} onClick={() => updateFilter('category', null)}>Alle</button>
          {catalog.facets.categories.map((category) => (
            <button className={searchParams.get('category') === category ? 'active' : ''} onClick={() => updateFilter('category', category)} key={category}>{category}</button>
          ))}
        </div>
      </section>
      {error && <div className="form-error">{error}</div>}
      {loading ? <div className="loading-grid">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div> : !catalog.items.length ? (
        <div className="empty-library"><span className="empty-orbit"><SearchX size={28} /></span><h2>Ingen medier matcher</h2><p>Prøv en anden søgning eller fjern et filter.</p></div>
      ) : (
        <section className="catalog-grid">
          {catalog.items.map((item, index) => (
            <button className="catalog-card" onClick={() => void openItem(item)} key={`${item.type}-${item.id}`}>
              <span className={`poster poster-${index % 6}${imageUrl(item.posterPath, 'w500') ? ' has-image' : ''}`} style={imageStyle(item.posterPath, 'w500')}>
                <PosterQualityBadges media={item} />
                {item.type === 'movie' ? <Film /> : <Tv />}
                <span>{item.category ?? (item.type === 'series' ? 'Serie' : 'Ukategoriseret')}</span>
              </span>
              <strong>{item.title}</strong>
              <small>{item.type === 'series' ? `${item.episodeCount ?? 0} episoder` : episodeLabel(item)}</small>
              <i>{item.releaseYear ?? item.library?.name ?? 'Metadata afventer'}</i>
            </button>
          ))}
        </section>
      )}
      <nav className="catalog-pagination" aria-label="Sider">
        <button disabled={catalog.page <= 1 || loading} onClick={() => updateFilter('page', String(catalog.page - 1))}><ChevronLeft size={15} /> Forrige</button>
        <span>Side {catalog.page} af {catalog.totalPages}</span>
        <button disabled={catalog.page >= catalog.totalPages || loading} onClick={() => updateFilter('page', String(catalog.page + 1))}>Næste <ChevronRight size={15} /></button>
      </nav>
      {(detail || detailLoading) && (
        <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDetail()}>
          <aside className={`media-detail${detail?.kind === 'series' ? ' series-detail' : ''}`} role="dialog" aria-modal="true" aria-label="Mediedetaljer">
            <button className="detail-close" onClick={closeDetail} aria-label="Luk"><X size={18} /></button>
            {detailLoading && !detail ? <p>Henter mediedetaljer...</p> : detail && <DetailContent key={detail.item.id} detail={detail} adminMode={adminMode} />}
          </aside>
        </div>
      )}
    </>
  );
}

function DetailContent({ detail, adminMode }: { detail: DetailState; adminMode: boolean }) {
  const item = detail.item;
  const [metadataLocked, setMetadataLocked] = useState(item.metadataLocked ?? false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchQuery, setMatchQuery] = useState(item.seriesTitle ?? item.title);
  const [matchCandidates, setMatchCandidates] = useState<MetadataMatchCandidate[]>([]);

  async function refreshMetadata() {
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      await api(`/media/${encodeURIComponent(item.id)}/metadata/jobs`, { method: 'POST' });
      setMetadataMessage('Metadataopdateringen er sat i kø.');
    } catch (failure) {
      setMetadataMessage(errorMessage(failure));
    } finally {
      setMetadataBusy(false);
    }
  }

  async function toggleMetadataLock() {
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      const next = !metadataLocked;
      await api(`/media/${encodeURIComponent(item.id)}/metadata-lock`, { method: 'PATCH', body: JSON.stringify({ locked: next }) });
      setMetadataLocked(next);
      setMetadataMessage(next ? 'Automatiske metadataændringer er låst.' : 'Automatiske metadataændringer er tilladt.');
    } catch (failure) {
      setMetadataMessage(errorMessage(failure));
    } finally {
      setMetadataBusy(false);
    }
  }

  async function searchMatches(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      const result = await api<{ candidates: MetadataMatchCandidate[] }>(
        `/media/${encodeURIComponent(item.id)}/metadata/matches?q=${encodeURIComponent(matchQuery.trim())}`,
      );
      setMatchCandidates(result.candidates);
      if (!result.candidates.length) setMetadataMessage('Ingen match blev fundet. Prøv en anden titel.');
    } catch (failure) {
      setMetadataMessage(errorMessage(failure));
    } finally {
      setMetadataBusy(false);
    }
  }

  async function applyMatch(candidate: MetadataMatchCandidate) {
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      const result = await api<{ affectedItems: number }>(`/media/${encodeURIComponent(item.id)}/metadata/match`, {
        method: 'POST',
        body: JSON.stringify({ provider: candidate.provider, providerId: candidate.providerId, locked: true }),
      });
      setMetadataLocked(true);
      setMatchOpen(false);
      setMatchCandidates([]);
      setMetadataMessage(`Match til "${candidate.title}" er gemt og ${result.affectedItems} katalogpost(er) er sat i kø til opdatering.`);
    } catch (failure) {
      setMetadataMessage(errorMessage(failure));
    } finally {
      setMetadataBusy(false);
    }
  }
  return (
    <>
      <span className={`detail-art${imageUrl(item.backdropPath, 'w780') ? ' has-image' : ''}`} style={imageStyle(item.backdropPath, 'w780')}>{item.type === 'movie' ? <Film size={38} /> : <Tv size={38} />}</span>
      <span className="eyebrow">{item.category ?? item.type}</span>
      <h2>{item.title}</h2>
      <p>{item.releaseYear ? `${item.releaseYear} · ` : ''}{item.library?.name ?? 'BoltBytes bibliotek'}</p>
      {item.overview && <p className="media-overview">{item.overview}</p>}
      {item.rating !== null && item.rating !== undefined && <p className="metadata-credit">TMDB rating {item.rating.toFixed(1)}/10</p>}
      {item.metadataProvider === 'tvdb' && <p className="metadata-credit">Metadata via <a href="https://thetvdb.com/" target="_blank" rel="noreferrer">TheTVDB.com</a></p>}
      {item.metadataProvider === 'tmdb' && <p className="metadata-credit">Metadata via TMDB</p>}
      {adminMode && <div className="metadata-actions">
        <button disabled={metadataBusy} onClick={() => void refreshMetadata()}>{metadataBusy ? 'Arbejder...' : 'Opdater metadata'}</button>
        <button disabled={metadataBusy} onClick={() => void toggleMetadataLock()}>{metadataLocked ? 'Lås metadata op' : 'Lås metadata'}</button>
        <button disabled={metadataBusy} onClick={() => setMatchOpen((open) => !open)}>{matchOpen ? 'Luk matchning' : 'Find korrekt match'}</button>
        {metadataMessage && <small>{metadataMessage}</small>}
        {matchOpen && <div className="metadata-match-panel">
          <form onSubmit={searchMatches}>
            <label htmlFor={`metadata-query-${item.id}`}>Søg efter korrekt {item.type === 'movie' ? 'film' : 'serie'}</label>
            <div><input id={`metadata-query-${item.id}`} value={matchQuery} maxLength={120} onChange={(event) => setMatchQuery(event.target.value)} required /><button disabled={metadataBusy || !matchQuery.trim()}>Søg</button></div>
          </form>
          <div className="metadata-match-results">
            {matchCandidates.map((candidate) => <article key={`${candidate.provider}:${candidate.providerId}`}>
              <span className="metadata-match-poster" style={imageStyle(candidate.posterPath, 'w500')} />
              <div><strong>{candidate.title}</strong><small>{candidate.provider.toUpperCase()} #{candidate.providerId}{candidate.releaseYear ? ` · ${candidate.releaseYear}` : ''}</small>{candidate.originalTitle && candidate.originalTitle !== candidate.title && <small>{candidate.originalTitle}</small>}<p>{candidate.overview ?? 'Ingen beskrivelse fra provideren.'}</p></div>
              <button disabled={metadataBusy} onClick={() => void applyMatch(candidate)}>Vælg match</button>
            </article>)}
          </div>
        </div>}
      </div>}
      {detail.kind !== 'series' && <button className={playerStyles.playButton} onClick={() => requestPlayback(item)}><Play size={16} /> Afspil</button>}
      {detail.kind === 'series' ? (
        <SeriesEpisodes key={item.seriesTitle ?? item.title} episodes={detail.episodes} next={detail.next} />
      ) : (
        <dl className="detail-facts">
          <div><dt>Type</dt><dd>{episodeLabel(item)}</dd></div>
          <div><dt>Status</dt><dd>{item.file?.status ?? 'Uden fil'}</dd></div>
          <div><dt>Video</dt><dd>{item.file?.videoCodec ?? item.codec ?? 'Ukendt'}</dd></div>
          <div><dt>Længde</dt><dd>{durationLabel(item.file?.durationMs)}</dd></div>
          <div><dt>Placering</dt><dd><FolderOpen size={13} /> {item.file?.relativePath ?? 'Ikke tilknyttet'}</dd></div>
        </dl>
      )}
    </>
  );
}

function SeriesEpisodes({ episodes, next }: { episodes: CatalogItem[]; next: SeriesNext | null }) {
  const seasons = Array.from(new Set(episodes.map((episode) => episode.seasonNumber ?? 0))).sort((left, right) => left - right);
  const [season, setSeason] = useState(seasons[0] ?? 0);
  const visible = episodes
    .filter((episode) => (episode.seasonNumber ?? 0) === season)
    .sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
  return (
    <div className="episode-list">
      {next && <button className={playerStyles.playButton} onClick={() => requestPlayback(next.media, next.resumePositionMs)}><Play size={16} /> {next.resumePositionMs > 0 ? 'Fortsæt episode' : 'Afspil næste episode'} · {episodeLabel(next.media)}</button>}
      <nav className="season-tabs" aria-label="Sæsoner">
        {seasons.map((value) => <button className={season === value ? 'active' : ''} onClick={() => setSeason(value)} key={value}>{value === 0 ? 'Specials' : `Sæson ${value}`}</button>)}
      </nav>
      <header className="series-episode-heading"><strong>{season === 0 ? 'Specials' : `Sæson ${season}`}</strong><span>{visible.length} afsnit</span></header>
      {visible.map((episode) => (
        <button className={`${playerStyles.episodeButton} ${playerStyles.episodeRich}`} onClick={() => requestPlayback(episode)} key={episode.id}>
          <span className={playerStyles.episodeStill} style={imageStyle(episode.episodeStillPath ?? episode.seasonPosterPath, 'w500')} />
          <strong>{episodeLabel(episode)}</strong>
          <span className={playerStyles.episodeCopy}><b>{episode.title}</b><small>{episode.overview ?? (episode.releaseDate ? new Date(episode.releaseDate).toLocaleDateString('da-DK') : 'Episodebeskrivelse afventer')}</small></span>
          <small>{durationLabel(episode.file?.durationMs)}</small>
        </button>
      ))}
    </div>
  );
}

async function fetchSeriesDetail(item: CatalogItem): Promise<DetailState> {
  const catalogParams = new URLSearchParams({
    type: 'episode',
    pageSize: '100',
    sort: 'title',
  });
  appendSeriesIdentity(catalogParams, item);
  const historyParams = new URLSearchParams();
  appendSeriesIdentity(historyParams, item);
  const [episodes, next] = await Promise.all([
    api<CatalogResponse>(`/media/catalog?${catalogParams.toString()}`),
    api<SeriesNext | null>(`/playback/history/series-next?${historyParams.toString()}`),
  ]);
  const representative = episodes.items[0] ?? item;
  return {
    kind: 'series',
    item: {
      ...representative,
      ...item,
      type: 'series',
      title: item.seriesDisplayTitle ?? representative.seriesDisplayTitle
        ?? item.seriesTitle ?? representative.seriesTitle ?? item.title,
      overview: item.seriesOverview ?? representative.seriesOverview
        ?? item.overview ?? representative.overview ?? null,
      posterPath: item.posterPath ?? representative.posterPath ?? null,
      backdropPath: item.backdropPath ?? representative.backdropPath ?? null,
    },
    episodes: episodes.items,
    next,
  };
}

function appendSeriesIdentity(params: URLSearchParams, item: CatalogItem) {
  if (item.seriesMetadataProviderId) {
    params.set('seriesMetadataProviderId', item.seriesMetadataProviderId);
  } else if (item.seriesDisplayTitle) {
    params.set('seriesDisplayTitle', item.seriesDisplayTitle);
  } else {
    params.set('seriesTitle', item.seriesTitle ?? item.title);
  }
}

function episodeLabel(item: CatalogItem): string {
  if (item.type !== 'episode') return item.type === 'movie' ? 'Film' : item.type;
  const season = String(item.seasonNumber ?? 0).padStart(2, '0');
  const episode = String(item.episodeNumber ?? 0).padStart(2, '0');
  return `S${season}E${episode}`;
}

function durationLabel(durationMs?: number | null): string {
  if (!durationMs) return 'Ukendt';
  const totalMinutes = Math.round(durationMs / 60_000);
  return `${Math.floor(totalMinutes / 60)} t ${totalMinutes % 60} min`;
}

function imageUrl(path: string | null | undefined, size: 'w500' | 'w780'): string | null {
  if (path && /^https:\/\/(?:artworks\.)?thetvdb\.com\/[A-Za-z0-9_./%-]+$/i.test(path)) return path;
  if (!path || !/^\/[A-Za-z0-9._-]+$/.test(path)) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function imageStyle(path: string | null | undefined, size: 'w500' | 'w780') {
  const url = imageUrl(path, size);
  return url ? { backgroundImage: `linear-gradient(155deg, transparent 48%, rgba(0,0,0,.62)), url("${url}")` } : undefined;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Kataloget kunne ikke hentes.';
}
