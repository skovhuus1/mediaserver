'use client';

import { Activity, Database, Film, HardDrive, Radio, Server, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearSession } from '@/lib/api';
import { t } from '@/lib/messages';
import { AppShell } from './app-shell';

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

export function Dashboard() {
  const router = useRouter();
  const [media, setMedia] = useState<Media[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<unknown>('/auth/me'),
      api<Media[]>('/media'),
      api<Session[]>('/playback/sessions'),
      api<Health>('/system/health', {}, false),
    ]).then(([, mediaItems, activeSessions, status]) => {
      setMedia(mediaItems);
      setSessions(activeSessions);
      setHealth(status);
    }).catch(() => {
      clearSession();
      router.replace('/login');
    }).finally(() => setLoading(false));
  }, [router]);

  const movies = media.filter((item) => item.type === 'movie');
  const series = media.filter((item) => item.type === 'series');

  return (
    <AppShell rail={<StatusRail health={health} sessions={sessions} mediaCount={media.length} />}>
      <section className="hero-line">
        <div><span className="eyebrow">CONTROL PLANE</span><h1>Dit mediebibliotek</h1><p>Rigtig server-state, ingen demodata.</p></div>
        <span className={health?.status === 'ok' ? 'health-pill online' : 'health-pill'}><i />{health?.status ?? 'forbinder'}</span>
      </section>
      {loading ? <LoadingGrid /> : (
        <>
          <MediaSection title={t.continueWatching} items={[]} emptyLabel={t.noSessions} wide />
          <MediaSection title="Nyeste film" items={movies} emptyLabel={t.noMedia} />
          <MediaSection title="Nyeste serier" items={series} emptyLabel={t.noMedia} />
          {!media.length && (
            <div className="empty-library">
              <span className="empty-orbit"><Database size={28} /></span>
              <h2>{t.noMedia}</h2>
              <p>{t.noMediaDescription}</p>
              <button onClick={() => router.push('/?admin=libraries')}>Opret bibliotek</button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function MediaSection({ title, items, emptyLabel, wide = false }: { title: string; items: Media[]; emptyLabel: string; wide?: boolean }) {
  if (!items.length) return (
    <section className="media-section compact-empty">
      <div className="section-heading"><h2>{title}</h2></div>
      <div className="empty-row"><Radio size={18} /><span>{emptyLabel}</span></div>
    </section>
  );
  return (
    <section className="media-section">
      <div className="section-heading"><h2>{title}</h2><button>Se alle</button></div>
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

function StatusRail({ health, sessions, mediaCount }: { health: Health | null; sessions: Session[]; mediaCount: number }) {
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
        <div className="rail-title"><h3>Lager</h3><HardDrive size={17} /></div>
        <p>Lagertelemetri tilsluttes scanner-workeren i næste fase.</p>
      </section>
    </>
  );
}

function LoadingGrid() {
  return <div className="loading-grid">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>;
}
