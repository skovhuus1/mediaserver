'use client';

import { Activity, Antenna, Check, CircleAlert, CloudDownload, ListRestart, Plus, Radio, Server, Shield, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import { AppShell } from './app-shell';
import styles from './live-tv-admin.module.css';

type Connection = { id: string; name: string; enabled: boolean; priority: number; maxConcurrentStreams: number; activeStreams: number; playlistUrl: string; healthStatus: string; lastError: string | null; lastImportedAt: string | null };
type Provider = { id: string; name: string; enabled: boolean; priority: number; perUserStreamLimit: number; epg: null | { configured: boolean; enabled: boolean; url: string; healthStatus: string; lastError: string | null; lastImportedAt: string | null }; connections: Connection[] };
type Source = { id: string; sourceName: string; enabled: boolean; priority: number; streamFormat: string; connectionName: string; providerName: string };
type Channel = { id: string; name: string; number: number | null; logoUrl: string | null; groupName: string | null; enabled: boolean; isAdult: boolean; metadataLocked: boolean; sortOrder: number; sources: Source[]; suspectedDuplicates: Array<{ id: string; name: string }> };
type Job = { id: string; type: string; status: string; payload: { progress?: { stage?: string; percent?: number | null; current?: number | null; total?: number | null; message?: string | null } }; attemptCount: number; updatedAt: string };

export function LiveTvAdmin() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canWrite = user?.roles.includes('admin') ?? false;

  const load = useCallback(async () => {
    const [me, providerRows, channelRows, jobRows] = await Promise.all([
      api<SessionUser>('/auth/me'), api<Provider[]>('/live-tv/admin/providers'),
      api<Channel[]>(`/live-tv/admin/channels${search ? `?search=${encodeURIComponent(search)}` : ''}`), api<Job[]>('/live-tv/admin/jobs'),
    ]);
    if (!me.roles.some((role) => role === 'admin' || role === 'operator')) { router.replace('/watch'); return; }
    setUser(me); setProviders(providerRows); setChannels(channelRows); setJobs(jobRows);
  }, [router, search]);

  useEffect(() => { void load().catch((failure) => setError(message(failure))); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load().catch(() => undefined), 3_000); return () => window.clearInterval(timer); }, [load]);

  const action = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key); setError(null);
    try { await operation(); await load(); } catch (failure) { setError(message(failure)); } finally { setBusy(null); }
  };

  if (!user) return <main className="watch-loading" aria-busy="true">{error}</main>;
  const activeLeases = providers.flatMap((provider) => provider.connections).reduce((sum, connection) => sum + connection.activeStreams, 0);
  return (
    <AppShell rail={<LiveTvRail providers={providers} channels={channels} jobs={jobs} activeLeases={activeLeases} />}>
      <section className={styles.page}>
        <header className={styles.hero}><div><span>LIVE CONTROL PLANE</span><h1>Live TV</h1><p>M3U-puljer, kanalstyring, XMLTV og aktive tunerpladser.</p></div><Antenna aria-hidden="true" /></header>
        {error && <div className={styles.error} role="alert"><CircleAlert />{error}</div>}
        {canWrite && <ProviderCreate onCreate={(payload) => action('create-provider', () => api('/live-tv/admin/providers', { method: 'POST', body: JSON.stringify(payload) }))} busy={busy === 'create-provider'} />}
        <section className={styles.jobs}><header><div><span>OPGAVER</span><h2>Import og EPG-progress</h2></div><Activity /></header><div>{jobs.slice(0, 8).map((job) => <JobRow job={job} key={job.id} />)}{!jobs.length && <p>Ingen Live TV-opgaver endnu.</p>}</div></section>
        <section className={styles.providers}><header><div><span>KILDEPULJE</span><h2>Providers og M3U-linjer</h2></div><b>{activeLeases} aktive</b></header>
          <div className={styles.providerGrid}>{providers.map((provider) => <ProviderCard provider={provider} canWrite={canWrite} busy={busy} key={provider.id} onAction={action} />)}{!providers.length && <p className={styles.empty}>Opret den første provider ovenfor.</p>}</div>
        </section>
        <section className={styles.channels}><header><div><span>KANALSTYRING</span><h2>{channels.length} importerede kanaler</h2></div><input aria-label="Søg kanaler" onChange={(event) => setSearch(event.target.value)} placeholder="Søg kanal..." value={search} /></header>
          <div className={styles.channelTable}>{channels.map((channel) => <ChannelRow channel={channel} canWrite={canWrite} busy={busy} key={channel.id} onAction={action} />)}{!channels.length && <p className={styles.empty}>Ingen kanaler matcher. Kør M3U-import på en provider.</p>}</div>
        </section>
      </section>
    </AppShell>
  );
}

function ProviderCreate({ onCreate, busy }: { onCreate: (payload: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onCreate({ name: data.get('name'), connectionName: data.get('connectionName'), playlistUrl: data.get('playlistUrl'), epgUrl: data.get('epgUrl') || undefined, priority: Number(data.get('priority')), perUserStreamLimit: Number(data.get('perUserStreamLimit')), maxConcurrentStreams: Number(data.get('maxConcurrentStreams')) }); };
  return <form className={styles.create} onSubmit={submit}><header><div><span>NY PROVIDER</span><h2>Tilføj krypteret M3U-kilde</h2></div><Shield /></header><div className={styles.formGrid}><label>Provider<input name="name" placeholder="Eksempel TV" required /></label><label>Linjenavn<input name="connectionName" placeholder="Linje 1" required /></label><label className={styles.wide}>M3U URL<input name="playlistUrl" placeholder="https://.../playlist.m3u" required type="url" /></label><label className={styles.wide}>XMLTV URL (valgfri)<input name="epgUrl" placeholder="https://.../epg.xml.gz" type="url" /></label><label>Providerprioritet<input defaultValue="100" min="0" name="priority" type="number" /></label><label>Streams pr. bruger<input defaultValue="1" min="1" name="perUserStreamLimit" type="number" /></label><label>Kapacitet på linjen<input defaultValue="1" min="1" name="maxConcurrentStreams" type="number" /></label><button disabled={busy}><Plus />{busy ? 'Opretter...' : 'Opret provider'}</button></div></form>;
}

function ProviderCard({ provider, canWrite, busy, onAction }: { provider: Provider; canWrite: boolean; busy: string | null; onAction: (key: string, operation: () => Promise<unknown>) => Promise<void> }) {
  const addConnection = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void onAction(`connection-${provider.id}`, () => api(`/live-tv/admin/providers/${provider.id}/connections`, { method: 'POST', body: JSON.stringify({ name: data.get('name'), playlistUrl: data.get('playlistUrl'), priority: Number(data.get('priority')), maxConcurrentStreams: Number(data.get('maxConcurrentStreams')) }) }).then(() => form.reset())); };
  return <article className={styles.providerCard} data-enabled={provider.enabled}><header><span><Radio /><div><strong>{provider.name}</strong><small>Prioritet {provider.priority} · maks. {provider.perUserStreamLimit} pr. bruger</small></div></span><i>{provider.enabled ? 'Aktiv' : 'Deaktiveret'}</i></header><div className={styles.providerActions}><button disabled={!canWrite || busy !== null} onClick={() => void onAction(`import-${provider.id}`, () => api(`/live-tv/admin/providers/${provider.id}/import`, { method: 'POST' }))}><CloudDownload />Importer M3U</button><button disabled={!canWrite || !provider.epg || busy !== null} onClick={() => void onAction(`epg-${provider.id}`, () => api(`/live-tv/admin/providers/${provider.id}/epg`, { method: 'POST' }))}><ListRestart />Hent XMLTV</button><button className={styles.danger} disabled={!canWrite || busy !== null} onClick={() => void onAction(`disable-${provider.id}`, () => api(`/live-tv/admin/providers/${provider.id}`, { method: 'DELETE' }))}><Trash2 />Deaktivér</button></div>
    {provider.epg && <p className={styles.epg} data-health={provider.epg.healthStatus}><b>XMLTV</b><span>{provider.epg.url}</span><small>{provider.epg.healthStatus}{provider.epg.lastImportedAt ? ` · ${date(provider.epg.lastImportedAt)}` : ''}</small>{provider.epg.lastError && <em>{provider.epg.lastError}</em>}</p>}
    <div className={styles.connections}>{provider.connections.map((connection) => <div className={styles.connection} key={connection.id}><span data-health={connection.healthStatus}><Server /><b>{connection.name}</b></span><small>{connection.playlistUrl}</small><small>{connection.activeStreams}/{connection.maxConcurrentStreams} optaget · prioritet {connection.priority}</small>{connection.lastError && <em>{connection.lastError}</em>}{canWrite && <button disabled={busy !== null} onClick={() => void onAction(`toggle-${connection.id}`, () => api(`/live-tv/admin/connections/${connection.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !connection.enabled }) }))}>{connection.enabled ? 'Sæt på pause' : 'Aktivér'}</button>}</div>)}</div>
    {canWrite && <details className={styles.addConnection}><summary><Plus />Tilføj ekstra M3U-linje</summary><form onSubmit={addConnection}><input name="name" placeholder="Linje 2" required /><input name="playlistUrl" placeholder="https://..." required type="url" /><input defaultValue="200" min="0" name="priority" type="number" /><input defaultValue="1" min="1" name="maxConcurrentStreams" type="number" /><button disabled={busy !== null}>Gem linje</button></form></details>}
  </article>;
}

function ChannelRow({ channel, canWrite, busy, onAction }: { channel: Channel; canWrite: boolean; busy: string | null; onAction: (key: string, operation: () => Promise<unknown>) => Promise<void> }) {
  const patch = (payload: Record<string, unknown>) => onAction(`channel-${channel.id}`, () => api(`/live-tv/admin/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify(payload) }));
  return <article className={styles.channelRow} data-disabled={!channel.enabled}><span className={styles.channelLogo}>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</span><label>Nr.<input defaultValue={channel.number ?? ''} disabled={!canWrite} min="1" onBlur={(event) => { const value = Number(event.target.value); if (value && value !== channel.number) void patch({ number: value, metadataLocked: true }); }} type="number" /></label><label>Navn<input defaultValue={channel.name} disabled={!canWrite} onBlur={(event) => { if (event.target.value.trim() !== channel.name) void patch({ name: event.target.value.trim(), metadataLocked: true }); }} /></label><label>Gruppe<input defaultValue={channel.groupName ?? ''} disabled={!canWrite} onBlur={(event) => { if (event.target.value.trim() !== (channel.groupName ?? '')) void patch({ groupName: event.target.value.trim(), metadataLocked: true }); }} /></label><div className={styles.flags}><button aria-pressed={channel.enabled} disabled={!canWrite || busy !== null} onClick={() => void patch({ enabled: !channel.enabled })}>{channel.enabled ? <Check /> : <CircleAlert />}Aktiv</button><button aria-pressed={channel.isAdult} disabled={!canWrite || busy !== null} onClick={() => void patch({ isAdult: !channel.isAdult })}>18+</button></div><details className={styles.sources}><summary>{channel.sources.length} kilde(r)</summary>{channel.sources.map((source) => <div key={source.id}><span><b>{source.providerName}</b><small>{source.connectionName}</small></span><select disabled={!canWrite} onChange={(event) => void onAction(`source-${source.id}`, () => api(`/live-tv/admin/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ streamFormat: event.target.value }) }))} value={source.streamFormat}><option value="auto">Auto</option><option value="hls">HLS</option><option value="mpegts">MPEG-TS</option></select><input aria-label="Kildeprioritet" defaultValue={source.priority} disabled={!canWrite} min="0" onBlur={(event) => void onAction(`source-${source.id}`, () => api(`/live-tv/admin/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ priority: Number(event.target.value) }) }))} type="number" /></div>)}</details>{canWrite && channel.suspectedDuplicates.length > 0 && <select className={styles.merge} defaultValue="" onChange={(event) => { if (event.target.value) void onAction(`merge-${channel.id}`, () => api(`/live-tv/admin/channels/${channel.id}/merge`, { method: 'POST', body: JSON.stringify({ sourceChannelId: event.target.value }) })); }}><option value="">Flet mulig dublet...</option>{channel.suspectedDuplicates.map((duplicate) => <option key={duplicate.id} value={duplicate.id}>{duplicate.name}</option>)}</select>}</article>;
}

function JobRow({ job }: { job: Job }) { const progress = job.payload.progress; return <article className={styles.job} data-status={job.status}><span><b>{job.type === 'live-tv.import' ? 'M3U-import' : job.type === 'live-tv.epg' ? 'XMLTV' : 'Live stream'}</b><small>{progress?.stage ?? job.status} · {progress?.message ?? `forsøg ${job.attemptCount}`}</small></span><div><i style={{ width: `${progress?.percent ?? (job.status === 'completed' ? 100 : 8)}%` }} /></div><time>{date(job.updatedAt)}</time></article>; }
function LiveTvRail({ providers, channels, jobs, activeLeases }: { providers: Provider[]; channels: Channel[]; jobs: Job[]; activeLeases: number }) { const running = jobs.filter((job) => ['queued', 'running'].includes(job.status)).length; return <><section className="rail-card"><div className="rail-title"><h3>Live TV-status</h3><Antenna /></div><dl className="status-list"><div><dt>Providers</dt><dd>{providers.length}</dd></div><div><dt>M3U-linjer</dt><dd>{providers.flatMap((provider) => provider.connections).length}</dd></div><div><dt>Kanaler</dt><dd>{channels.length}</dd></div><div><dt>Aktive streams</dt><dd>{activeLeases}</dd></div><div><dt>Opgaver</dt><dd>{running}</dd></div></dl></section></>; }
function message(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Live TV-handlingen fejlede.'); }
function date(value: string) { return new Date(value).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }); }
