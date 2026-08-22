'use client';

import { ChevronLeft, ChevronRight, Film, FolderOpen, Play, SearchX, Tv, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import styles from './catalog-view.module.css';
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
type TvdbEpisodeOrder = { key: string; label: string };
type CurrentMetadataBinding = { provider: string; providerId: string; episodeOrder: string };
type MetadataOverride = {
  id: string;
  title: string | null;
  overview: string | null;
  releaseDate: string | null;
  imagePath: string | null;
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
  const categoryRailRef = useRef<HTMLDivElement>(null);
  const [categoryEdges, setCategoryEdges] = useState({ left: false, right: false });

  const syncCategoryEdges = useCallback(() => {
    const rail = categoryRailRef.current;
    if (!rail) return;

    const maximum = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setCategoryEdges({ left: rail.scrollLeft > 2, right: rail.scrollLeft < maximum - 2 });
  }, []);

  useEffect(() => {
    const rail = categoryRailRef.current;
    if (!rail) return;

    const frame = window.requestAnimationFrame(syncCategoryEdges);
    const observer = new ResizeObserver(syncCategoryEdges);
    observer.observe(rail);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [catalog.facets.categories.length, syncCategoryEdges]);

  const scrollCategories = (direction: -1 | 1) => {
    const rail = categoryRailRef.current;
    if (!rail) return;

    rail.scrollBy({ left: direction * Math.max(280, rail.clientWidth * 0.72), behavior: 'smooth' });
  };

  const handleCategoryWheel = (event: WheelEvent<HTMLDivElement>) => {
    const rail = categoryRailRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const canMove = (delta < 0 && categoryEdges.left) || (delta > 0 && categoryEdges.right);
    if (!canMove) return;

    event.preventDefault();
    rail.scrollLeft += delta;
  };

  const handleCategoryKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rail = categoryRailRef.current;
    if (!rail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const buttons = [...rail.querySelectorAll<HTMLButtonElement>('button')];
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const targetIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : Math.min(buttons.length - 1, Math.max(0, currentIndex + (event.key === 'ArrowRight' ? 1 : -1)));
    const target = buttons[targetIndex];
    if (!target) return;

    event.preventDefault();
    target.focus();
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };
  const adminMode = basePath !== '/watch';

  useEffect(() => {
    let active = true;
    const currentSearchParams = new URLSearchParams(queryKey);
    const params = new URLSearchParams();
    for (const key of ['q', 'type', 'category', 'libraryId', 'page', 'sort']) {
      const value = currentSearchParams.get(key);
      if (value) params.set(key, value);
    }
    setLoading(true);
    setError(null);
    void api<CatalogResponse>(`/media/catalog?${params.toString()}`)
      .then((result) => { if (active) setCatalog(result); })
      .catch((failure) => { if (active) setError(errorMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [queryKey]);

  useEffect(() => {
    let active = true;
    const currentSearchParams = new URLSearchParams(queryKey);
    const mediaId = currentSearchParams.get('media') ?? currentSearchParams.get('info') ?? currentSearchParams.get('play');
    if (!mediaId) {
      setDetail(null);
      setDetailLoading(false);
      return () => { active = false; };
    }
    setDetailLoading(true);
    void api<CatalogItem>(`/media/${encodeURIComponent(mediaId)}`)
      .then(async (item) => {
        if (!active) return;
        if (currentSearchParams.get('play') && item.type !== 'series') {
          requestPlayback(item);
          return;
        }
        const nextDetail = item.type === 'episode' || item.type === 'series'
          ? await fetchSeriesDetail(item)
          : { kind: 'media', item } satisfies DetailState;
        if (active) setDetail(nextDetail);
      })
      .catch((failure) => { if (active) setError(errorMessage(failure)); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [queryKey]);

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
        <div className={styles.categoryShell}>
          <div className={styles.categoryHeading}>
            <div>
              <span>Overordnede genrer</span>
              <small>Rul vandret, eller brug pilene, for at se alle genrer.</small>
            </div>
            <div className={styles.categoryControls} aria-label="Rul gennem genrer">
              <button aria-label="Rul genrer til venstre" disabled={!categoryEdges.left} onClick={() => scrollCategories(-1)} type="button">
                <ChevronLeft aria-hidden="true" size={18} />
              </button>
              <button aria-label="Rul genrer til højre" disabled={!categoryEdges.right} onClick={() => scrollCategories(1)} type="button">
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
          <div className={`${styles.categoryRailFrame} ${categoryEdges.left ? styles.canScrollLeft : ''} ${categoryEdges.right ? styles.canScrollRight : ''}`}>
            <div
              className={`category-filters ${styles.categoryRail}`}
              data-horizontal-scroller
              onKeyDown={handleCategoryKeyboard}
              onScroll={syncCategoryEdges}
              onWheel={handleCategoryWheel}
              ref={categoryRailRef}
            >
              <button className={!searchParams.get('category') ? 'active' : ''} onClick={() => updateFilter('category', null)} type="button">Alle</button>
              {catalog.facets.categories.map((category) => (
                <button className={searchParams.get('category') === category ? 'active' : ''} onClick={() => updateFilter('category', category)} key={category} type="button">{category}</button>
              ))}
            </div>
          </div>
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
  const [selectedMatch, setSelectedMatch] = useState<string | null>(null);
  const [episodeOrders, setEpisodeOrders] = useState<TvdbEpisodeOrder[]>([]);
  const [episodeOrder, setEpisodeOrder] = useState('default');
  const [currentBinding, setCurrentBinding] = useState<CurrentMetadataBinding | null>(null);

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
      const result = await api<{ candidates: MetadataMatchCandidate[]; currentBinding: CurrentMetadataBinding | null }>(
        `/media/${encodeURIComponent(item.id)}/metadata/matches?q=${encodeURIComponent(matchQuery.trim())}`,
      );
      setMatchCandidates(result.candidates);
      setCurrentBinding(result.currentBinding);
      setSelectedMatch(null);
      setEpisodeOrders([]);
      if (!result.candidates.length) setMetadataMessage('Ingen match blev fundet. Prøv en anden titel.');
    } catch (failure) {
      setMetadataMessage(errorMessage(failure));
    } finally {
      setMetadataBusy(false);
    }
  }

  async function prepareMatch(candidate: MetadataMatchCandidate) {
    if (candidate.provider !== 'tvdb') {
      await applyMatch(candidate, 'default');
      return;
    }
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      const result = await api<{ orders: TvdbEpisodeOrder[] }>(
        `/media/${encodeURIComponent(item.id)}/metadata/episode-orders?providerId=${encodeURIComponent(candidate.providerId)}`,
      );
      const savedOrder = currentBinding?.provider === 'tvdb' && currentBinding.providerId === candidate.providerId
        ? currentBinding.episodeOrder
        : 'default';
      setEpisodeOrders(result.orders);
      setEpisodeOrder(result.orders.some((order) => order.key === savedOrder) ? savedOrder : 'default');
      setSelectedMatch(`${candidate.provider}:${candidate.providerId}`);
    } catch (failure) {
      setMetadataMessage(errorMessage(failure));
    } finally {
      setMetadataBusy(false);
    }
  }

  async function applyMatch(candidate: MetadataMatchCandidate, selectedEpisodeOrder: string) {
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      const result = await api<{ affectedItems: number }>(`/media/${encodeURIComponent(item.id)}/metadata/match`, {
        method: 'POST',
        body: JSON.stringify({ provider: candidate.provider, providerId: candidate.providerId, locked: true, episodeOrder: selectedEpisodeOrder }),
      });
      setMetadataLocked(true);
      setMatchOpen(false);
      setMatchCandidates([]);
      setSelectedMatch(null);
      setEpisodeOrders([]);
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
              <button disabled={metadataBusy} onClick={() => void prepareMatch(candidate)}>{candidate.provider === 'tvdb' ? 'Vælg orden' : 'Vælg match'}</button>
              {selectedMatch === `${candidate.provider}:${candidate.providerId}` && <div className="metadata-order-picker">
                <label>Episodeorden<select value={episodeOrder} onChange={(event) => setEpisodeOrder(event.target.value)}>{episodeOrders.map((order) => <option key={order.key} value={order.key}>{order.label}</option>)}</select></label>
                <button disabled={metadataBusy} onClick={() => void applyMatch(candidate, episodeOrder)}>Gem TVDB-match</button>
              </div>}
            </article>)}
          </div>
        </div>}
      </div>}
      {detail.kind !== 'series' && <button className={playerStyles.playButton} onClick={() => requestPlayback(item)}><Play size={16} /> Afspil</button>}
      {detail.kind === 'series' ? (
        <SeriesEpisodes key={item.seriesTitle ?? item.title} episodes={detail.episodes} next={detail.next} adminMode={adminMode} />
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

function SeriesEpisodes({ episodes, next, adminMode }: { episodes: CatalogItem[]; next: SeriesNext | null; adminMode: boolean }) {
  const seasons = Array.from(new Set(episodes.map((episode) => episode.seasonNumber ?? 0))).sort((left, right) => left - right);
  const [season, setSeason] = useState(seasons[0] ?? 0);
  const [overrideEditor, setOverrideEditor] = useState<{ scope: 'season' | 'episode'; episode: CatalogItem } | null>(null);
  const visible = episodes
    .filter((episode) => (episode.seasonNumber ?? 0) === season)
    .sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
  const seasonRepresentative = visible[0] ?? null;
  return (
    <div className="episode-list">
      {next && <button className={playerStyles.playButton} onClick={() => requestPlayback(next.media, next.resumePositionMs)}><Play size={16} /> {next.resumePositionMs > 0 ? 'Fortsæt episode' : 'Afspil næste episode'} · {episodeLabel(next.media)}</button>}
      <nav className="season-tabs" aria-label="Sæsoner">
        {seasons.map((value) => <button className={season === value ? 'active' : ''} onClick={() => setSeason(value)} key={value}>{value === 0 ? 'Specials' : `Sæson ${value}`}</button>)}
      </nav>
      <header className="series-episode-heading"><strong>{season === 0 ? 'Specials' : `Sæson ${season}`}</strong><span>{visible.length} afsnit</span>{adminMode && seasonRepresentative && <button onClick={() => setOverrideEditor({ scope: 'season', episode: seasonRepresentative })}>Ret sæson-artwork</button>}</header>
      {visible.map((episode) => (
        <div className="admin-episode-row" key={episode.id}>
          <button className={`${playerStyles.episodeButton} ${playerStyles.episodeRich}`} onClick={() => requestPlayback(episode)}>
            <span className={playerStyles.episodeStill} style={imageStyle(episode.episodeStillPath ?? episode.seasonPosterPath, 'w500')} />
            <strong>{episodeLabel(episode)}</strong>
            <span className={playerStyles.episodeCopy}><b>{episode.title}</b><small>{episode.overview ?? (episode.releaseDate ? new Date(episode.releaseDate).toLocaleDateString('da-DK') : 'Episodebeskrivelse afventer')}</small></span>
            <small>{durationLabel(episode.file?.durationMs)}</small>
          </button>
          {adminMode && <button className="episode-metadata-edit" onClick={() => setOverrideEditor({ scope: 'episode', episode })}>Ret metadata</button>}
        </div>
      ))}
      {overrideEditor && <MetadataOverrideEditor scope={overrideEditor.scope} episode={overrideEditor.episode} onClose={() => setOverrideEditor(null)} />}
    </div>
  );
}

function MetadataOverrideEditor({ scope, episode, onClose }: { scope: 'season' | 'episode'; episode: CatalogItem; onClose: () => void }) {
  const [existing, setExisting] = useState<MetadataOverride | null>(null);
  const [title, setTitle] = useState('');
  const [overview, setOverview] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void api<{ season: MetadataOverride | null; episode: MetadataOverride | null }>(`/media/${encodeURIComponent(episode.id)}/metadata/overrides`)
      .then((result) => {
        if (!active) return;
        const value = result[scope];
        setExisting(value);
        setTitle(value?.title ?? '');
        setOverview(value?.overview ?? '');
        setReleaseDate(value?.releaseDate?.slice(0, 10) ?? '');
        setImagePath(value?.imagePath ?? '');
      })
      .catch((failure) => { if (active) setMessage(errorMessage(failure)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [episode.id, scope]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const body = scope === 'season'
      ? { imagePath: imagePath.trim() || undefined }
      : {
          title: title.trim() || undefined,
          overview: overview.trim() || undefined,
          releaseDate: releaseDate ? new Date(`${releaseDate}T00:00:00.000Z`).toISOString() : undefined,
          imagePath: imagePath.trim() || undefined,
        };
    try {
      const result = await api<{ override: MetadataOverride }>(`/media/${encodeURIComponent(episode.id)}/metadata/overrides/${scope}`, {
        method: 'PUT', body: JSON.stringify(body),
      });
      setExisting(result.override);
      setMessage('Override er gemt. Metadataopdateringen er sat i kø.');
    } catch (failure) {
      setMessage(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage('');
    try {
      await api(`/media/${encodeURIComponent(episode.id)}/metadata/overrides/${scope}`, { method: 'DELETE' });
      setExisting(null);
      setMessage('Override er fjernet. Providerens metadata gendannes i baggrunden.');
    } catch (failure) {
      setMessage(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <div className="metadata-override-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="metadata-override-editor" onSubmit={save}>
      <header><div><span className="eyebrow">MANUEL OVERRIDE</span><h3>{scope === 'season' ? `Sæson ${episode.seasonNumber} artwork` : `${episodeLabel(episode)} metadata`}</h3></div><button type="button" onClick={onClose} aria-label="Luk"><X size={17} /></button></header>
      {scope === 'episode' && <><label>Titel<input value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} /></label><label>Beskrivelse<textarea value={overview} maxLength={5000} rows={5} onChange={(event) => setOverview(event.target.value)} /></label><label>Premieredato<input type="date" value={releaseDate} onChange={(event) => setReleaseDate(event.target.value)} /></label></>}
      <label>{scope === 'season' ? 'Sæsonposter' : 'Episodebillede'}<input value={imagePath} maxLength={500} onChange={(event) => setImagePath(event.target.value)} placeholder="/tmdb-fil.jpg eller https://thetvdb.com/..." required={scope === 'season'} /></label>
      {message && <small>{message}</small>}
      <footer>{existing && <button className="danger" type="button" disabled={busy} onClick={() => void remove()}>Fjern override</button>}<button type="button" onClick={onClose}>Luk</button><button type="submit" disabled={busy}>{busy ? 'Arbejder...' : 'Gem override'}</button></footer>
    </form>
  </div>;
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
