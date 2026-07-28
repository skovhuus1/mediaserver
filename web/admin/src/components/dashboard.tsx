'use client';

import { Activity, Database, Film, HardDrive, Radio, Server, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearSession } from '@/lib/api';
import { t } from '@/lib/messages';
import { AppShell } from './app-shell';
import { CatalogView } from './catalog-view';
import { ManagementView } from './management-view';
import { ContinueWatching } from './continue-watching';

type Media = { id: string; title: string; type: string; codec: string | null; container: string | null };
type Session = {
  id: string;
  method: string;
  isCastSession: boolean;
  media: { title: string };
  device: { name: string; type: string };
  user: { displayName: string };
};
type Health = { status: string; version: string };
type LibraryScan = {
  id: string;
  status: string;
  filesSeen: number;
  filesCreated: number;
  filesUpdated: number;
  filesMissing: number;
  errors: number;
  error: string | null;
};
type Library = {
  id: string;
  name: string;
  scans: LibraryScan[];
};

export function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [media, setMedia] = useState<Media[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanPending, setScanPending] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<unknown>('/auth/me'),
      api<Media[]>('/media'),
      api<Library[]>('/libraries'),
      api<Session[]>('/playback/sessions'),
      api<Health>('/system/health', {}, false),
    ]).then(([, mediaItems, libraryItems, activeSessions, status]) => {
      setMedia(mediaItems);
      setLibraries(libraryItems);
      setSessions(activeSessions);
      setHealth(status);
    }).catch(() => {
      clearSession();
      router.replace('/login');
    }).finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api<Library[]>('/libraries').then(setLibraries).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const query = (searchParams.get('q') ?? '').trim().toLocaleLowerCase('da');
  const requestedType = searchParams.get('type');
  const adminView = searchParams.get('admin');
  const catalogMode = Boolean(
    searchParams.get('q') ||
    requestedType ||
    searchParams.get('category') ||
    searchParams.get('libraryId') ||
    searchParams.get('media') ||
    searchParams.get('view') === 'catalog'
  );
  const visibleMedia = media.filter((item) =>
    (!query || item.title.toLocaleLowerCase('da').includes(query)) &&
    (requestedType === 'movie' ? item.type === 'movie' : requestedType === 'series' ? ['series', 'season', 'episode'].includes(item.type) : true)
  );
  const movies = visibleMedia.filter((item) => item.type === 'movie');
  const series = visibleMedia.filter((item) => ['series', 'season', 'episode'].includes(item.type));
  const queueScan = async () => {
    const library = libraries[0];
    if (!library || scanPending) return;
    setScanPending(true);
    setScanMessage(null);
    try {
      const scan = await api<LibraryScan>(`/libraries/${library.id}/scans`, { method: 'POST' });
      setLibraries((current) => current.map((item) => item.id === library.id ? { ...item, scans: [scan] } : item));
      setScanMessage('Scanning er sat i kø.');
    } catch (error) {
      setScanMessage(errorMessage(error));
    } finally {
      setScanPending(false);
    }
  };

  return (
    <AppShell rail={<StatusRail health={health} sessions={sessions} mediaCount={media.length} libraries={libraries} scanPending={scanPending} scanMessage={scanMessage} onScan={queueScan} />}>
      {adminView ? <ManagementView view={adminView} /> : catalogMode ? <CatalogView /> : (
      <>
      <section className="hero-line">
        <div><span className="eyebrow">CONTROL PLANE</span><h1>{requestedType === 'movie' ? 'Film' : requestedType === 'series' ? 'Serier' : query ? `Søgning: ${searchParams.get('q')}` : 'Dit mediebibliotek'}</h1><p>Rigtig server-state, ingen demodata.</p></div>
        <span className={health?.status === 'ok' ? 'health-pill online' : 'health-pill'}><i />{health?.status ?? 'forbinder'}</span>
      </section>
      {loading ? <LoadingGrid /> : (
        <>
          <ContinueWatching />
          <MediaSection title="Nyeste film" items={movies} emptyLabel={t.noMedia} onSeeAll={() => router.push('/?type=movie')} />
          <MediaSection title="Nyeste serier" items={series} emptyLabel={t.noMedia} onSeeAll={() => router.push('/?type=series')} />
          {!media.length && (
            <div className="empty-library">
              <span className="empty-orbit"><Database size={28} /></span>
              <h2>{t.noMedia}</h2>
              <p>{t.noMediaDescription}</p>
              {libraries.length
                ? <button disabled={scanPending} onClick={() => void queueScan()}>{scanPending ? 'Scanner sættes i kø...' : `Scan ${libraries[0]?.name}`}</button>
                : <button onClick={() => router.push('/?admin=libraries')}>Opret bibliotek</button>}
            </div>
          )}
        </>
      )}
      </>
      )}
    </AppShell>
  );
}

function MediaSection({ title, items, emptyLabel, wide = false, onSeeAll }: { title: string; items: Media[]; emptyLabel: string; wide?: boolean; onSeeAll?: () => void }) {
  if (!items.length) return (
    <section className="media-section compact-empty">
      <div className="section-heading"><h2>{title}</h2></div>
      <div className="empty-row"><Radio size={18} /><span>{emptyLabel}</span></div>
    </section>
  );
  return (
    <section className="media-section">
      <div className="section-heading"><h2>{title}</h2>{onSeeAll && <button onClick={onSeeAll}>Se alle</button>}</div>
      <div className={wide ? 'media-grid wide' : 'media-grid'}>
        {items.slice(0, wide ? 4 : 6).map((item, index) => (
          <article className="media-card" key={item.id}>
            <div className={`poster poster-${index % 6}`}>
              {item.type === 'movie' ? <Film /> : <Tv />}
              <span>{item.codec ?? 'Ikke analyseret'}</span>
            </div>
            <strong>{item.title}</strong>
            <small>{item.container ?? 'Metadata afventer'}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function StatusRail({
  health,
  sessions,
  mediaCount,
  libraries,
  scanPending,
  scanMessage,
  onScan,
}: {
  health: Health | null;
  sessions: Session[];
  mediaCount: number;
  libraries: Library[];
  scanPending: boolean;
  scanMessage: string | null;
  onScan: () => Promise<void>;
}) {
  const latestScan = libraries[0]?.scans[0];
  return (
    <>
      <section className="rail-card">
        <div className="rail-title"><h3>{t.serverStatus}</h3><Server size={17} /></div>
        <div className="status-disc"><span>{health?.status === 'ok' ? 'OK' : '...'}</span><small>API</small></div>
        <dl className="status-list">
          <div><dt>Version</dt><dd>{health?.version ?? '...'}</dd></div>
          <div><dt>Medier</dt><dd>{mediaCount}</dd></div>
          <div><dt>Sessions</dt><dd>{sessions.length}</dd></div>
        </dl>
      </section>
      <section className="rail-card sessions-card">
        <div className="rail-title"><h3>{t.activities}</h3><Activity size={17} /></div>
        {!sessions.length ? <div className="rail-empty"><Radio size={20} /><span>{t.noSessions}</span></div> : sessions.map((session) => (
          <div className="session-row" key={session.id}>
            <span className="session-poster"><Film size={16} /></span>
            <span><strong>{session.media.title}</strong><small>{session.method.replace('_', ' ')} · {session.device.name}</small></span>
            <i />
          </div>
        ))}
      </section>
      <section className="rail-card storage-card">
        <div className="rail-title"><h3>Biblioteksscanner</h3><HardDrive size={17} /></div>
        {latestScan
          ? <><p>Status: <strong>{latestScan.status}</strong><br />Set {latestScan.filesSeen} · Nye {latestScan.filesCreated} · Fejl {latestScan.errors}</p>{latestScan.error && <p className="scan-error">{latestScan.error}</p>}</>
          : <p>Ingen scanninger er kørt endnu.</p>}
        {scanMessage ? <p>{scanMessage}</p> : null}
        <button disabled={!libraries.length || scanPending || ['queued', 'running'].includes(latestScan?.status ?? '')} onClick={() => void onScan()}>
          {scanPending ? 'Sætter i kø...' : 'Scan nu'}
        </button>
      </section>
    </>
  );
}

function LoadingGrid() {
  return <div className="loading-grid">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Scanning kunne ikke startes.';
}
