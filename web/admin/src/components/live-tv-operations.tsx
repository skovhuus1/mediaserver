'use client';

import { Activity, AlertTriangle, Antenna, CheckCircle2, Clock3, LoaderCircle, Radio, RefreshCw, Save, Server, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import styles from './live-tv-operations.module.css';

type Connection = { id: string; name: string; enabled: boolean; priority: number; maxConcurrentStreams: number; healthStatus: string; lastError: string | null; lastImportedAt: string | null };
type EpgSource = { id: string; enabled: boolean; healthStatus: string; lastError: string | null; lastImportedAt: string | null };
type Provider = { id: string; name: string; enabled: boolean; autoRefreshEnabled: boolean; playlistRefreshMinutes: number; epgRefreshMinutes: number; lastPlaylistQueuedAt: string | null; lastEpgQueuedAt: string | null; connections: Connection[]; epgSource: EpgSource | null };
type Lease = { id: string; userId: string; profileId: string; deviceId: string; status: string; method: string; runtimeState: string; currentBitrate: number | null; bufferAheadMs: number | null; stallCount: number; leaseExpiresAt: string; startedAt: string; channel: { id: string; name: string; number: number | null; logoUrl: string | null }; connection: { id: string; name: string; provider: { id: string; name: string } } };
type Job = { id: string; type: string; status: string; error: string | null; createdAt: string; updatedAt: string; payload: unknown };
type Operations = { sampledAt: string; scheduler: { enabled: boolean; intervalSeconds: number; programRetentionHours: number }; providers: Provider[]; activeLeases: Lease[]; jobs: Job[] };

export function LiveTvOperations() {
  const [state, setState] = useState<Operations | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const dirtyProviders = useRef(new Set<string>());

  const load = useCallback(async () => {
    const next = await api<Operations>('/live-tv/admin/operations');
    setState((current) => ({ ...next, providers: next.providers.map((provider) => {
      if (!dirtyProviders.current.has(provider.id)) return provider;
      const local = current?.providers.find((entry) => entry.id === provider.id);
      return local ? { ...provider, autoRefreshEnabled: local.autoRefreshEnabled, playlistRefreshMinutes: local.playlistRefreshMinutes, epgRefreshMinutes: local.epgRefreshMinutes } : provider;
    }) }));
  }, []);
  useEffect(() => {
    void api<SessionUser>('/auth/me').then((user) => setCanWrite(user.roles.includes('admin'))).catch(() => undefined);
    void load().catch((error) => setMessage(errorMessage(error)));
    const timer = window.setInterval(() => void load().catch(() => undefined), 3_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(null); }
  }

  function updateProvider(providerId: string, update: Partial<Provider>) {
    dirtyProviders.current.add(providerId);
    setState((current) => current ? { ...current, providers: current.providers.map((provider) => provider.id === providerId ? { ...provider, ...update } : provider) } : current);
  }

  return <section className={styles.page}>
    <header className={styles.hero}><div><span>LIVE TV CONTROL ROOM</span><h1>TV-drift</h1><p>Automatik, forbindelser, guidejobs og aktive seere samlet i ét operationelt overblik.</p></div><div className={styles.pulse}><Radio size={18} /><span>Live</span><strong>{state?.activeLeases.length ?? 0} aktive</strong></div></header>
    <div className={styles.metrics}><Metric icon={<Antenna />} label="Udbydere" value={state?.providers.length ?? 0} /><Metric icon={<Activity />} label="Aktive streams" value={state?.activeLeases.length ?? 0} /><Metric icon={<LoaderCircle />} label="TV-jobs" value={state?.jobs.filter((job) => ['queued', 'running'].includes(job.status)).length ?? 0} /><Metric icon={<Clock3 />} label="Scheduler" value={`${state?.scheduler.intervalSeconds ?? 60}s`} /></div>
    {message && <p className={styles.message}>{message}</p>}{!canWrite && <p className={styles.readOnly}>Operatorer kan følge TV-driften. Kun administratorer kan ændre automatik eller afbryde streams.</p>}
    <section className={styles.section}><header><div><span>AUTOMATIK</span><h2>Kilder og kanalguide</h2></div><small>Gamle EPG-programmer ryddes efter {state?.scheduler.programRetentionHours ?? 48} timer.</small></header><div className={styles.providers}>{state?.providers.map((provider) => <article className={styles.provider} key={provider.id}>
      <header><div><Server /><span><strong>{provider.name}</strong><small>{provider.connections.length} forbindelser · {provider.epgSource ? 'XMLTV tilsluttet' : 'Ingen XMLTV'}</small></span></div><label className={styles.toggle}><input type="checkbox" checked={provider.autoRefreshEnabled} disabled={!canWrite || busy !== null} onChange={(event) => updateProvider(provider.id, { autoRefreshEnabled: event.target.checked })} /><i /><span>Automatisk</span></label></header>
      <div className={styles.schedule}><label>M3U hvert<input type="number" min="5" max="1440" value={provider.playlistRefreshMinutes} disabled={!canWrite || busy !== null} onChange={(event) => updateProvider(provider.id, { playlistRefreshMinutes: Number(event.target.value) })} /><span>min.</span></label><label>EPG hvert<input type="number" min="15" max="4320" value={provider.epgRefreshMinutes} disabled={!canWrite || busy !== null || !provider.epgSource} onChange={(event) => updateProvider(provider.id, { epgRefreshMinutes: Number(event.target.value) })} /><span>min.</span></label></div>
      <div className={styles.sourceHealth}>{provider.connections.map((connection) => <span key={connection.id} data-health={connection.healthStatus}><i>{connection.healthStatus === 'healthy' ? <CheckCircle2 /> : <AlertTriangle />}</i><b>{connection.name}</b><small>{connection.lastImportedAt ? relativeTime(connection.lastImportedAt) : 'Aldrig importeret'}</small></span>)}{provider.epgSource && <span data-health={provider.epgSource.healthStatus}><i>{provider.epgSource.healthStatus === 'healthy' ? <CheckCircle2 /> : <AlertTriangle />}</i><b>XMLTV</b><small>{provider.epgSource.lastImportedAt ? relativeTime(provider.epgSource.lastImportedAt) : 'Aldrig importeret'}</small></span>}</div>
      <footer><div><small>M3U: {provider.lastPlaylistQueuedAt ? relativeTime(provider.lastPlaylistQueuedAt) : 'venter på første kørsel'}</small><small>EPG: {provider.lastEpgQueuedAt ? relativeTime(provider.lastEpgQueuedAt) : 'venter på første kørsel'}</small></div><div><button disabled={!canWrite || busy !== null} onClick={() => void run(`save:${provider.id}`, async () => { await api(`/live-tv/admin/providers/${provider.id}/automation`, { method: 'PATCH', body: JSON.stringify({ autoRefreshEnabled: provider.autoRefreshEnabled, playlistRefreshMinutes: provider.playlistRefreshMinutes, epgRefreshMinutes: provider.epgRefreshMinutes }) }); dirtyProviders.current.delete(provider.id); }, `${provider.name} er gemt.`)}><Save />Gem</button><button disabled={!canWrite || busy !== null} onClick={() => void run(`m3u:${provider.id}`, () => api(`/live-tv/admin/providers/${provider.id}/run`, { method: 'POST', body: JSON.stringify({ kind: 'playlist' }) }), 'M3U-refresh er sat i kø.')}><RefreshCw />M3U nu</button><button disabled={!canWrite || busy !== null || !provider.epgSource} onClick={() => void run(`epg:${provider.id}`, () => api(`/live-tv/admin/providers/${provider.id}/run`, { method: 'POST', body: JSON.stringify({ kind: 'epg' }) }), 'EPG-refresh er sat i kø.')}><RefreshCw />EPG nu</button></div></footer>
    </article>)}</div></section>
    <section className={styles.section}><header><div><span>FORBINDELSESPULJE</span><h2>Aktive afspilninger</h2></div><small>Opdateres hvert tredje sekund med runtime, bitrate og buffer.</small></header>{!state?.activeLeases.length ? <div className={styles.empty}><Antenna /><strong>Ingen aktive TV-streams</strong><span>Puljen er ledig.</span></div> : <div className={styles.leases}>{state.activeLeases.map((lease) => <article key={lease.id}><div className={styles.channel}>{lease.channel.logoUrl ? <img src={lease.channel.logoUrl} alt="" /> : <Antenna />}<span><strong>{lease.channel.number ? `${lease.channel.number} · ` : ''}{lease.channel.name}</strong><small>{lease.connection.provider.name} · {lease.connection.name}</small></span></div><div className={styles.runtime}><span data-state={lease.runtimeState}>{lease.runtimeState}</span><b>{methodLabel(lease.method)}</b><small>{lease.currentBitrate ? `${(lease.currentBitrate / 1_000_000).toFixed(1)} Mbps` : 'Måler bitrate'} · {lease.bufferAheadMs !== null ? `${(lease.bufferAheadMs / 1000).toFixed(1)}s buffer` : 'buffer ukendt'} · {lease.stallCount} stop</small></div><div className={styles.identity}><small>Bruger {shortId(lease.userId)}</small><small>Profil {shortId(lease.profileId)}</small><small>Startet {relativeTime(lease.startedAt)}</small></div><button className={styles.stop} disabled={!canWrite || busy !== null} onClick={() => void run(`lease:${lease.id}`, () => api(`/live-tv/admin/leases/${lease.id}`, { method: 'DELETE' }), `${lease.channel.name} blev afbrudt.`)}><Square />Afbryd</button></article>)}</div>}</section>
    <section className={styles.section}><header><div><span>JOB LEDGER</span><h2>Seneste TV-opgaver</h2></div><button className={styles.refresh} onClick={() => void load()} aria-label="Opdater"><RefreshCw /></button></header><div className={styles.jobs}>{state?.jobs.length ? state.jobs.map((job) => <article key={job.id} data-status={job.status}><i>{job.status === 'completed' ? <CheckCircle2 /> : job.status === 'failed' ? <AlertTriangle /> : <LoaderCircle />}</i><span><strong>{jobLabel(job.type)}</strong><small>{job.error || relativeTime(job.updatedAt)}</small></span><em>{statusLabel(job.status)}</em></article>) : <div className={styles.empty}><Clock3 /><strong>Ingen TV-opgaver endnu</strong><span>Schedulerens første kørsel opretter dem automatisk.</span></div>}</div></section>
  </section>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) { return <article>{icon}<span>{label}</span><strong>{value}</strong></article>; }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message || 'TV-handlingen kunne ikke gennemføres.'; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000)); return seconds < 60 ? `${seconds} sek. siden` : seconds < 3600 ? `${Math.floor(seconds / 60)} min. siden` : new Date(value).toLocaleString('da-DK'); }
function shortId(value: string) { return value.slice(0, 8); }
function methodLabel(value: string) { return ({ direct_play: 'Direct Play', direct_stream: 'Remux', transcode: 'Transcode' } as Record<string, string>)[value] ?? value; }
function jobLabel(value: string) { return ({ 'live-tv.import': 'M3U-import', 'live-tv.epg': 'XMLTV-guide', 'live-tv.stream': 'Live stream' } as Record<string, string>)[value] ?? value; }
function statusLabel(value: string) { return ({ queued: 'I kø', running: 'Kører', completed: 'Færdig', failed: 'Fejlet', cancelled: 'Afbrudt' } as Record<string, string>)[value] ?? value; }
