'use client';

import { ChevronLeft, ChevronRight, Film, FolderOpen, SearchX, Tv, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type CatalogItem = {
  id: string;
  title: string;
  type: string;
  category: string | null;
  seriesTitle: string | null;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeCount?: number;
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
  | { kind: 'series'; item: CatalogItem; episodes: CatalogItem[] };

const emptyCatalog: CatalogResponse = {
  items: [],
  page: 1,
  pageSize: 24,
  total: 0,
  totalPages: 1,
  facets: { categories: [], libraries: [] },
};

export function CatalogView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const [catalog, setCatalog] = useState<CatalogResponse>(emptyCatalog);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const mediaId = searchParams.get('media');
    if (!mediaId) return;
    setDetailLoading(true);
    void api<CatalogItem>(`/media/${encodeURIComponent(mediaId)}`)
      .then((item) => setDetail({ kind: 'media', item }))
      .catch((failure) => setError(errorMessage(failure)))
      .finally(() => setDetailLoading(false));
  }, [queryKey, searchParams]);

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('media');
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/?${params.toString()}`);
  };
  const openItem = async (item: CatalogItem) => {
    setDetailLoading(true);
    setError(null);
    try {
      if (item.type === 'series') {
        const params = new URLSearchParams({
          type: 'episode',
          seriesTitle: item.seriesTitle ?? item.title,
          pageSize: '100',
          sort: 'title',
        });
        const episodes = await api<CatalogResponse>(`/media/catalog?${params.toString()}`);
        setDetail({ kind: 'series', item, episodes: episodes.items });
      } else {
        setDetail({ kind: 'media', item: await api<CatalogItem>(`/media/${encodeURIComponent(item.id)}`) });
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setDetailLoading(false);
    }
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
              <span className={`poster poster-${index % 6}`}>
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
        <div className="detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDetail(null)}>
          <aside className="media-detail" role="dialog" aria-modal="true" aria-label="Mediedetaljer">
            <button className="detail-close" onClick={() => setDetail(null)} aria-label="Luk"><X size={18} /></button>
            {detailLoading && !detail ? <p>Henter mediedetaljer...</p> : detail && <DetailContent detail={detail} />}
          </aside>
        </div>
      )}
    </>
  );
}

function DetailContent({ detail }: { detail: DetailState }) {
  const item = detail.item;
  return (
    <>
      <span className="detail-art">{item.type === 'movie' ? <Film size={38} /> : <Tv size={38} />}</span>
      <span className="eyebrow">{item.category ?? item.type}</span>
      <h2>{item.title}</h2>
      <p>{item.releaseYear ? `${item.releaseYear} · ` : ''}{item.library?.name ?? 'BoltBytes bibliotek'}</p>
      {detail.kind === 'series' ? (
        <div className="episode-list">
          {detail.episodes.map((episode) => (
            <div key={episode.id}><strong>{episodeLabel(episode)}</strong><span>{episode.title}</span><small>{durationLabel(episode.file?.durationMs)}</small></div>
          ))}
        </div>
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

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Kataloget kunne ikke hentes.';
}
