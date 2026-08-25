'use client';

import { Activity, Antenna, Check, CircleAlert, CloudDownload, Eye, EyeOff, GripVertical, ListChecks, ListRestart, Plus, Radio, Server, Shield, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import { AppShell } from './app-shell';
import styles from './live-tv-admin.module.css';

type Connection = { id: string; name: string; enabled: boolean; priority: number; maxConcurrentStreams: number; activeStreams: number; playlistUrl: string; healthStatus: string; lastError: string | null; lastImportedAt: string | null };
type Provider = { id: string; name: string; enabled: boolean; priority: number; perUserStreamLimit: number; epg: null | { configured: boolean; enabled: boolean; url: string; healthStatus: string; lastError: string | null; lastImportedAt: string | null }; connections: Connection[] };
type Source = { id: string; sourceName: string; enabled: boolean; priority: number; streamFormat: string; qualityLabel: string; qualityRank: number; connectionName: string; providerName: string };
type Channel = { id: string; name: string; number: number | null; logoUrl: string | null; groupName: string | null; enabled: boolean; isAdult: boolean; metadataLocked: boolean; sortOrder: number; sources: Source[]; suspectedDuplicates: Array<{ id: string; name: string }> };
type ChannelGroup = { name: string; total: number; visible: number; hidden: number };
type ChannelCatalog = { items: Channel[]; total: number; visibleCount: number; hiddenCount: number; filteredTotal: number; page: number; pageSize: number; totalPages: number; groups: ChannelGroup[] };
type JobResult = { changedCount?: number; matchedCount?: number; releasedStreams?: number; cancelledRecordings?: number; processed?: number; createdSources?: number; updatedSources?: number; unchangedSources?: number; disabledSources?: number; updatedChannels?: number; sourceErrors?: number; durationMs?: number; auditAction?: string };
type Job = { id: string; type: string; status: string; payload: { progress?: { stage?: string; percent?: number | null; current?: number | null; total?: number | null; message?: string | null }; result?: JobResult }; attemptCount: number; error: string | null; durationMs: number | null; createdAt: string; updatedAt: string };

export function LiveTvAdmin() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [catalog, setCatalog] = useState<ChannelCatalog>({ items: [], total: 0, visibleCount: 0, hiddenCount: 0, filteredTotal: 0, page: 1, pageSize: 100, totalPages: 1, groups: [] });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupQuery, setGroupQuery] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'visible' | 'hidden'>('visible');
  const [page, setPage] = useState(1);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [lastSelectedChannelId, setLastSelectedChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draggedChannelId, setDraggedChannelId] = useState<string | null>(null);
  const canWrite = user?.roles.includes('admin') ?? false;

  const load = useCallback(async () => {
    const channelQuery = new URLSearchParams({ page: String(page), pageSize: '100', visibility });
    if (searchQuery) channelQuery.set('search', searchQuery);
    if (groupQuery) channelQuery.set('group', groupQuery);
    const [me, providerRows, channelRows, jobRows] = await Promise.all([
      api<SessionUser>('/auth/me'), api<Provider[]>('/live-tv/admin/providers'),
      api<ChannelCatalog>(`/live-tv/admin/channels?${channelQuery.toString()}`), api<Job[]>('/live-tv/admin/jobs'),
    ]);
    if (!me.roles.some((role) => role === 'admin' || role === 'operator')) { router.replace('/watch'); return; }
    setUser(me); setProviders(providerRows); setCatalog(channelRows); setJobs(jobRows);
    setSelectedChannelIds((current) => current.filter((id) => channelRows.items.some((channel) => channel.id === id)));
  }, [groupQuery, page, router, searchQuery, visibility]);

  useEffect(() => { const timer = window.setTimeout(() => { setSearchQuery(search.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { const timer = window.setTimeout(() => { setGroupQuery(groupSearch.trim()); setPage(1); }, 300); return () => window.clearTimeout(timer); }, [groupSearch]);
  useEffect(() => { void load().catch((failure) => setError(message(failure))); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => void load().catch(() => undefined), 10_000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void api<Job[]>('/live-tv/admin/jobs').then(setJobs).catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, []);

  const action = async (key: string, operation: () => Promise<unknown>, successMessage?: string) => {
    setBusy(key); setError(null); setNotice(null);
    try { await operation(); await load(); setNotice(successMessage ?? null); } catch (failure) { setError(message(failure)); } finally { setBusy(null); }
  };

  if (!user) return <main className="watch-loading" aria-busy="true">{error}</main>;
  const channels = catalog.items;
  const activeLeases = providers.flatMap((provider) => provider.connections).reduce((sum, connection) => sum + connection.activeStreams, 0);
  const visibleCount = catalog.visibleCount;
  const filteredChannels = channels;
  const filteredChannelIds = filteredChannels.map((channel) => channel.id);
  const allFilteredSelected = filteredChannelIds.length > 0 && filteredChannelIds.every((id) => selectedChannelIds.includes(id));
  const bulkVisibility = (nextVisibility: 'show' | 'hide') => action(`bulk-${nextVisibility}`, async () => {
    await api('/live-tv/admin/channels/bulk', { method: 'PATCH', body: JSON.stringify({ channelIds: selectedChannelIds, action: nextVisibility }) });
    setSelectedChannelIds([]);
    setLastSelectedChannelId(null);
  });
  const exactGroup = catalog.groups.find((group) => group.name.localeCompare(groupQuery, 'da', { sensitivity: 'base' }) === 0) ?? null;
  const allVisibility = (nextVisibility: 'show' | 'hide') => {
    const affectedCount = nextVisibility === 'show' ? catalog.hiddenCount : catalog.visibleCount;
    if (affectedCount === 0) return Promise.resolve();
    if (nextVisibility === 'hide' && !window.confirm(`Skjul alle ${affectedCount.toLocaleString('da-DK')} synlige kanaler? Aktive Live TV-streams stoppes, og planlagte/aktive optagelser på kanalerne annulleres.`)) return Promise.resolve();
    return action(`all-${nextVisibility}`, async () => {
      await api('/live-tv/admin/channels/all/visibility', {
        method: 'PATCH',
        body: JSON.stringify({ action: nextVisibility }),
      });
      setSelectedChannelIds([]);
      setLastSelectedChannelId(null);
      setPage(1);
    }, nextVisibility === 'hide'
      ? `Skjulning af ${affectedCount.toLocaleString('da-DK')} kanaler er sat i kø.`
      : `Visning af ${affectedCount.toLocaleString('da-DK')} kanaler er sat i kø.`);
  };
  const bulkGroupVisibility = (nextVisibility: 'show' | 'hide') => {
    if (!exactGroup) return Promise.resolve();
    return action(`group-${nextVisibility}`, () => api('/live-tv/admin/channels/groups/visibility', {
      method: 'PATCH', body: JSON.stringify({ groupName: exactGroup.name, action: nextVisibility }),
    }), `${nextVisibility === 'hide' ? 'Skjulning' : 'Visning'} af ${exactGroup.total.toLocaleString('da-DK')} kanaler er sat i kø.`);
  };
  const cancelJob = (jobId: string) => action(`cancel-job-${jobId}`, () => api(`/live-tv/admin/jobs/${jobId}`, {
    method: 'DELETE',
  }), 'Kanalopgaven er annulleret.');
  const reorderChannel = (channelId: string, targetChannelId: string, placement: 'before' | 'after') => action(
    `reorder-${channelId}`,
    () => api(`/live-tv/admin/channels/${channelId}/reorder`, {
      method: 'PATCH', body: JSON.stringify({ targetChannelId, placement }),
    }),
    'Kanalrækkefølgen er gemt og bruges i kundernes guide.',
  ).finally(() => setDraggedChannelId(null));
  const moveChannelToPosition = (channelId: string, position: number) => action(
    `reorder-${channelId}`,
    () => api(`/live-tv/admin/channels/${channelId}/reorder`, {
      method: 'PATCH', body: JSON.stringify({ position }),
    }),
    `Kanalen er flyttet til nummer ${position}. De efterfølgende kanaler er rykket automatisk.`,
  );
  const selectChannel = (channelId: string, selected: boolean, extendRange: boolean) => {
    setSelectedChannelIds((current) => {
      const anchorIndex = lastSelectedChannelId ? filteredChannelIds.indexOf(lastSelectedChannelId) : -1;
      const channelIndex = filteredChannelIds.indexOf(channelId);
      const affectedIds = extendRange && anchorIndex >= 0 && channelIndex >= 0
        ? filteredChannelIds.slice(Math.min(anchorIndex, channelIndex), Math.max(anchorIndex, channelIndex) + 1)
        : [channelId];
      return selected
        ? [...new Set([...current, ...affectedIds])]
        : current.filter((id) => !affectedIds.includes(id));
    });
    setLastSelectedChannelId(channelId);
  };
  return (
    <AppShell rail={<LiveTvRail providers={providers} channelTotal={catalog.total} jobs={jobs} activeLeases={activeLeases} />}>
      <section className={styles.page}>
        <header className={styles.hero}><div><span>LIVE CONTROL PLANE</span><h1>Live TV</h1><p>M3U-puljer, kanalstyring, XMLTV og aktive tunerpladser.</p></div><Antenna aria-hidden="true" /></header>
        {error && <div className={styles.error} role="alert"><CircleAlert />{error}</div>}
        {notice && <div className={styles.notice} role="status" aria-live="polite"><Check />{notice}</div>}
        {canWrite && <ProviderCreate onCreate={(payload) => action('create-provider', () => api('/live-tv/admin/providers', { method: 'POST', body: JSON.stringify(payload) }))} busy={busy === 'create-provider'} />}
        <section className={styles.jobs}><header><div><span>OPGAVER</span><h2>Import, kanalændringer og EPG</h2></div><Activity /></header><div>{jobs.slice(0, 8).map((job) => <JobRow job={job} canWrite={canWrite} busy={busy} key={job.id} onCancel={cancelJob} />)}{!jobs.length && <p>Ingen Live TV-opgaver endnu.</p>}</div></section>
        <section className={styles.providers}><header><div><span>KILDEPULJE</span><h2>Providers og M3U-linjer</h2></div><b>{activeLeases} aktive</b></header>
          <div className={styles.providerGrid}>{providers.map((provider) => <ProviderCard provider={provider} canWrite={canWrite} busy={busy} key={provider.id} onAction={action} />)}{!providers.length && <p className={styles.empty}>Opret den første provider ovenfor.</p>}</div>
        </section>
        <section className={styles.channels}><header><div><span>KANALSTYRING</span><h2>{catalog.total.toLocaleString('da-DK')} importerede · {visibleCount.toLocaleString('da-DK')} synlige</h2><small>{catalog.filteredTotal.toLocaleString('da-DK')} matcher det aktive filter</small></div><div className={styles.channelSearches}><input aria-label="Søg kanaler" onChange={(event) => setSearch(event.target.value)} placeholder="Søg kanal..." value={search} /><input aria-label="Søg kanalgrupper" list="live-tv-channel-groups" onChange={(event) => setGroupSearch(event.target.value)} placeholder="Søg gruppe..." value={groupSearch} /><datalist id="live-tv-channel-groups">{catalog.groups.map((group) => <option key={group.name} value={group.name}>{group.total} kanaler</option>)}</datalist></div></header>
          <div className={styles.channelToolbar}>
            <div className={styles.visibilityTabs} aria-label="Filtrer kanalvisning">
              <button type="button" aria-pressed={visibility === 'all'} onClick={() => { setVisibility('all'); setPage(1); }}>Alle <strong>{catalog.total.toLocaleString('da-DK')}</strong></button>
              <button type="button" aria-pressed={visibility === 'visible'} onClick={() => { setVisibility('visible'); setPage(1); }}><Eye size={15} />Synlige <strong>{visibleCount.toLocaleString('da-DK')}</strong></button>
              <button type="button" aria-pressed={visibility === 'hidden'} onClick={() => { setVisibility('hidden'); setPage(1); }}><EyeOff size={15} />Skjulte <strong>{catalog.hiddenCount.toLocaleString('da-DK')}</strong></button>
            </div>
            {canWrite && <div className={styles.globalActions}><span><b>Hele kataloget</b><small>Kun Danmark er aktiv som standard. Træk i håndtaget på en aktiv kanal for at gemme en ny guiderækkefølge.</small></span><div><button type="button" disabled={busy !== null || catalog.hiddenCount === 0} onClick={() => void allVisibility('show')}><Eye size={16} />{busy === 'all-show' ? 'Viser...' : 'Vis alle'}</button><button type="button" className={styles.hideAction} disabled={busy !== null || visibleCount === 0} onClick={() => void allVisibility('hide')}><EyeOff size={16} />{busy === 'all-hide' ? 'Skjuler...' : 'Skjul alle'}</button></div></div>}
            {canWrite && exactGroup && <div className={styles.groupActions}><span><b>{exactGroup.name} · {exactGroup.total.toLocaleString('da-DK')}</b><small>Ændrer hele den valgte gruppe.</small></span><div><button type="button" disabled={busy !== null || exactGroup.visible === exactGroup.total} onClick={() => void bulkGroupVisibility('show')}><Eye size={16} />Vis hele gruppen</button><button type="button" className={styles.hideAction} disabled={busy !== null || exactGroup.hidden === exactGroup.total} onClick={() => void bulkGroupVisibility('hide')}><EyeOff size={16} />Skjul hele gruppen</button></div></div>}
            {canWrite && <div className={styles.bulkActions}>
              <button type="button" disabled={filteredChannels.length === 0 || busy !== null} onClick={() => setSelectedChannelIds((current) => allFilteredSelected ? current.filter((id) => !filteredChannelIds.includes(id)) : [...new Set([...current, ...filteredChannelIds])])}><ListChecks size={16} />{allFilteredSelected ? 'Ryd viste' : 'Vælg viste'}</button>
              <span>{selectedChannelIds.length} valgt · Shift-klik for interval</span>
              <button type="button" disabled={selectedChannelIds.length === 0 || busy !== null} onClick={() => void bulkVisibility('show')}><Eye size={16} />Vis</button>
              <button type="button" className={styles.hideAction} disabled={selectedChannelIds.length === 0 || busy !== null} onClick={() => void bulkVisibility('hide')}><EyeOff size={16} />Skjul</button>
            </div>}
          </div>
          <nav className={styles.pagination} aria-label="Kanalnavigation"><button type="button" disabled={page <= 1 || busy !== null} onClick={() => setPage((current) => Math.max(1, current - 1))}>Forrige</button><span>Side {page} af {catalog.totalPages}</span><button type="button" disabled={page >= catalog.totalPages || busy !== null} onClick={() => setPage((current) => Math.min(catalog.totalPages, current + 1))}>Næste</button></nav>
          <div className={styles.channelTable}>{filteredChannels.map((channel) => <ChannelRow channel={channel} canWrite={canWrite} busy={busy} draggedChannelId={draggedChannelId} key={channel.id} selected={selectedChannelIds.includes(channel.id)} onSelect={selectChannel} onAction={action} onDragStart={setDraggedChannelId} onDragEnd={() => setDraggedChannelId(null)} onMoveToPosition={moveChannelToPosition} onReorder={reorderChannel} />)}{!filteredChannels.length && <p className={styles.empty}>Ingen kanaler matcher det valgte filter.</p>}</div>
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

function ChannelRow({ channel, canWrite, busy, draggedChannelId, selected, onSelect, onAction, onDragStart, onDragEnd, onMoveToPosition, onReorder }: { channel: Channel; canWrite: boolean; busy: string | null; draggedChannelId: string | null; selected: boolean; onSelect: (id: string, selected: boolean, extendRange: boolean) => void; onAction: (key: string, operation: () => Promise<unknown>) => Promise<void>; onDragStart: (id: string) => void; onDragEnd: () => void; onMoveToPosition: (id: string, position: number) => Promise<void>; onReorder: (id: string, targetId: string, placement: 'before' | 'after') => Promise<void> }) {
  const patch = (payload: Record<string, unknown>) => onAction(`channel-${channel.id}`, () => api(`/live-tv/admin/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify(payload) }));
  return <article className={styles.channelRow} data-disabled={!channel.enabled} data-dragging={draggedChannelId === channel.id} onDragOver={(event) => { if (channel.enabled && draggedChannelId && draggedChannelId !== channel.id) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (!draggedChannelId || draggedChannelId === channel.id) return; const bounds = event.currentTarget.getBoundingClientRect(); void onReorder(draggedChannelId, channel.id, event.clientY > bounds.top + bounds.height / 2 ? 'after' : 'before'); }}><button className={styles.dragHandle} type="button" draggable={canWrite && channel.enabled && busy === null} disabled={!canWrite || !channel.enabled || busy !== null} aria-label={`Flyt ${channel.name}`} title="Træk for at ændre kanalrækkefølgen" onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', channel.id); onDragStart(channel.id); }} onDragEnd={onDragEnd}><GripVertical /></button><input className={styles.channelSelect} type="checkbox" checked={selected} disabled={!canWrite || busy !== null} aria-label={`Vælg ${channel.name}`} title="Hold Shift nede for at markere et interval" onChange={(event) => onSelect(channel.id, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey)} /><span className={styles.channelLogo}>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</span><label>Kanalnr.<input key={`${channel.id}-${channel.number ?? 'none'}`} defaultValue={channel.number ?? ''} disabled={!canWrite || !channel.enabled || busy !== null} max="5000" min="1" title={channel.enabled ? 'Skriv en placering og tryk Enter eller forlad feltet' : 'Aktivér kanalen før den kan placeres'} onBlur={(event) => { const value = Number(event.target.value); if (!Number.isInteger(value) || value < 1) { event.target.value = String(channel.number ?? ''); return; } if (value !== channel.number) void onMoveToPosition(channel.id, value); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.currentTarget.value = String(channel.number ?? ''); event.currentTarget.blur(); } }} type="number" /></label><label>Navn<input defaultValue={channel.name} disabled={!canWrite} onBlur={(event) => { if (event.target.value.trim() !== channel.name) void patch({ name: event.target.value.trim(), metadataLocked: true }); }} /></label><label>Gruppe<input defaultValue={channel.groupName ?? ''} disabled={!canWrite} onBlur={(event) => { if (event.target.value.trim() !== (channel.groupName ?? '')) void patch({ groupName: event.target.value.trim(), metadataLocked: true }); }} /></label><div className={styles.flags}><button aria-pressed={channel.enabled} disabled={!canWrite || busy !== null} onClick={() => void patch({ enabled: !channel.enabled })}>{channel.enabled ? <Check /> : <CircleAlert />}Aktiv</button><button aria-pressed={channel.isAdult} disabled={!canWrite || busy !== null} onClick={() => void patch({ isAdult: !channel.isAdult })}>18+</button></div><details className={styles.sources}><summary>{channel.sources.length} kilde(r)</summary>{channel.sources.map((source) => <div key={source.id}><span><b>{source.providerName}</b><small>{source.connectionName} · {source.qualityLabel === 'standard' ? 'Standard' : source.qualityLabel.toUpperCase()}</small></span><select disabled={!canWrite} onChange={(event) => void onAction(`source-${source.id}`, () => api(`/live-tv/admin/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ streamFormat: event.target.value }) }))} value={source.streamFormat}><option value="auto">Auto</option><option value="hls">HLS</option><option value="mpegts">MPEG-TS</option></select><input aria-label="Kildeprioritet" defaultValue={source.priority} disabled={!canWrite} min="0" onBlur={(event) => void onAction(`source-${source.id}`, () => api(`/live-tv/admin/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ priority: Number(event.target.value) }) }))} type="number" /></div>)}</details>{canWrite && channel.suspectedDuplicates.length > 0 && <select className={styles.merge} defaultValue="" onChange={(event) => { if (event.target.value) void onAction(`merge-${channel.id}`, () => api(`/live-tv/admin/channels/${channel.id}/merge`, { method: 'POST', body: JSON.stringify({ sourceChannelId: event.target.value }) })); }}><option value="">Flet mulig dublet...</option>{channel.suspectedDuplicates.map((duplicate) => <option key={duplicate.id} value={duplicate.id}>{duplicate.name}</option>)}</select>}</article>;
}

function JobRow({ job, canWrite, busy, onCancel }: { job: Job; canWrite: boolean; busy: string | null; onCancel: (jobId: string) => Promise<void> }) {
  const progress = job.payload.progress;
  const active = ['queued', 'running'].includes(job.status);
  const label = ({
    'live-tv.import': 'M3U-import',
    'live-tv.epg': 'XMLTV',
    'live-tv.channel-visibility': 'Kanalsynlighed',
    'live-tv.stream': 'Live stream',
    'live-tv.record': 'Live optagelse',
  } as Record<string, string>)[job.type] ?? job.type;
  return <article className={styles.job} data-status={job.status}>
    <span><b>{label}</b><small>{progress?.stage ?? job.status} · {progress?.message ?? `forsøg ${job.attemptCount}`}</small>{job.payload.result && <small className={styles.jobResult}>{jobResult(job.payload.result)}</small>}{job.error && <em className={styles.jobError}>{job.error}</em>}</span>
    <div><i style={{ width: `${progress?.percent ?? (job.status === 'completed' ? 100 : active ? 8 : 0)}%` }} /></div>
    <time>{duration(job.durationMs)} · {date(job.updatedAt)}</time>
    {canWrite && active && job.type === 'live-tv.channel-visibility' && <button className={styles.jobCancel} disabled={busy !== null} onClick={() => void onCancel(job.id)} type="button">Annuller</button>}
  </article>;
}

function jobResult(result: JobResult) {
  if (result.changedCount !== undefined) return `${result.changedCount.toLocaleString('da-DK')} ændret · ${result.releasedStreams ?? 0} streams frigivet · ${result.cancelledRecordings ?? 0} optagelser annulleret`;
  if (result.processed !== undefined) return `${result.createdSources ?? 0} nye · ${result.updatedSources ?? 0} ændret · ${result.unchangedSources ?? 0} uændret · ${result.disabledSources ?? 0} deaktiveret`;
  return 'Resultat gemt i auditloggen';
}

function duration(milliseconds: number | null) {
  if (milliseconds === null) return 'venter';
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)} sek.`;
  return `${Math.floor(milliseconds / 60_000)} min. ${Math.round((milliseconds % 60_000) / 1_000)} sek.`;
}
function LiveTvRail({ providers, channelTotal, jobs, activeLeases }: { providers: Provider[]; channelTotal: number; jobs: Job[]; activeLeases: number }) { const running = jobs.filter((job) => ['queued', 'running'].includes(job.status)).length; return <><section className="rail-card"><div className="rail-title"><h3>Live TV-status</h3><Antenna /></div><dl className="status-list"><div><dt>Providers</dt><dd>{providers.length}</dd></div><div><dt>M3U-linjer</dt><dd>{providers.flatMap((provider) => provider.connections).length}</dd></div><div><dt>Kanaler</dt><dd>{channelTotal.toLocaleString('da-DK')}</dd></div><div><dt>Aktive streams</dt><dd>{activeLeases}</dd></div><div><dt>Opgaver</dt><dd>{running}</dd></div></dl></section></>; }
function message(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Live TV-handlingen fejlede.'); }
function date(value: string) { return new Date(value).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }); }
