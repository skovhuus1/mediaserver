'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Database, FolderOpen, RefreshCw, Server, ShieldCheck, Users } from 'lucide-react';
import { api, type ApiFailure } from '@/lib/api';

type Root = { id: string; label: string; mountPath: string; isReadOnly: boolean };
type Scan = { id: string; status: string; filesSeen: number; filesCreated: number; errors: number; error: string | null };
type Library = { id: string; name: string; type: string; storageRoot: Root; paths: Array<{ path: string; recursive: boolean }>; scans: Scan[] };
type DirectoryListing = { currentPath: string; parentPath: string | null; directories: Array<{ name: string; path: string }> };
type User = { id: string; email: string; displayName: string; status: string; profiles: Array<{ id: string; name: string }>; roles: Array<{ role: { code: string } }> };
type PlanEntitlements = {
  maxConcurrentStreams: number; maxRegisteredDevices: number; maxVideoResolution: number; maxVideoBitrate: number;
  allowDirectPlay: boolean; allowDirectStream: boolean; allowVideoTranscode: boolean; allowAudioTranscode: boolean;
  allowSubtitleBurnIn: boolean; allowChromecast: boolean; allowOfflineDownload: boolean; releaseDelayMonths: number; releaseDelayDays: number;
};
type PlanVersion = PlanEntitlements & { id: string; version: number; isActive: boolean };
type Plan = { id: string; name: string; internalCode: string; description: string | null; versions: PlanVersion[] };
type UpdateStatus = { enabled: boolean; configured: boolean; branch: string; restartMode: string; hasUpdate: boolean };
type ErrorEntry = { id: string; severity: string; source: string; code: string; message: string; timestamp: string; details: Record<string, unknown> };
type MetadataStatus = {
  enabled: boolean; provider: string; language: string; source?: string;
  providers?: { tmdb: { enabled: boolean; source: string }; tvdb: { enabled: boolean; source: string } };
  latestJob: { id: string; status: string; updatedAt: string } | null;
};

export function ManagementView({ view }: { view: string }) {
  if (view === 'libraries') return <LibrariesView />;
  if (view === 'users') return <UsersView />;
  if (view === 'plans') return <PlansView />;
  return <SettingsView />;
}

function LibrariesView() {
  const [roots, setRoots] = useState<Root[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [selectedRoot, setSelectedRoot] = useState('');
  const [selectedPath, setSelectedPath] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [libraryName, setLibraryName] = useState('');
  const [libraryType, setLibraryType] = useState('movie');
  const [recursive, setRecursive] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [nextRoots, nextLibraries] = await Promise.all([api<Root[]>('/storage-roots'), api<Library[]>('/libraries')]);
    setRoots(nextRoots);
    setLibraries(nextLibraries);
    const rootId = selectedRoot || nextRoots[0]?.id || '';
    setSelectedRoot(rootId);
    if (rootId && !listing) await browse(rootId);
  }

  async function browse(rootId: string, path?: string) {
    const query = new URLSearchParams({ storageRootId: rootId });
    if (path) query.set('path', path);
    const next = await api<DirectoryListing>(`/libraries/directories?${query}`);
    setListing(next);
    setSelectedPath(next.currentPath);
  }

  useEffect(() => { void refresh().catch((error) => setMessage(errorMessage(error))); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api(editingId ? `/libraries/${editingId}` : '/libraries', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({ storageRootId: selectedRoot, name: libraryName, type: libraryType, path: selectedPath, recursive }),
      });
      setMessage(editingId ? 'Biblioteket er opdateret.' : 'Biblioteket er oprettet.');
      cancelEdit();
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function edit(library: Library) {
    setBusy(true);
    setMessage('');
    try {
      setEditingId(library.id);
      setLibraryName(library.name);
      setLibraryType(library.type);
      setRecursive(library.paths[0]?.recursive ?? true);
      setSelectedRoot(library.storageRoot.id);
      await browse(library.storageRoot.id, library.paths[0]?.path);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setLibraryName('');
    setLibraryType('movie');
    setRecursive(true);
  }

  async function remove(library: Library) {
    if (!window.confirm(`Slet biblioteket "${library.name}" og dets importerede katalogdata? Mediefilerne på disken slettes ikke.`)) return;
    setBusy(true);
    setMessage('');
    try {
      await api(`/libraries/${library.id}`, { method: 'DELETE' });
      if (editingId === library.id) cancelEdit();
      setMessage('Biblioteket er slettet. Mediefilerne er ikke ændret.');
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function scan(libraryId: string) {
    setBusy(true);
    setMessage('');
    try {
      await api(`/libraries/${libraryId}/scans`, { method: 'POST' });
      setMessage('Scanning er sat i kø.');
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="management-page">
      <span className="eyebrow">MEDIA CONTROL</span><h1>Biblioteker</h1><p>Opret, rediger, slet og scan biblioteker med sikre servermapper.</p>
      <div className="management-grid">
        <form className="management-card management-form" onSubmit={save}>
          <h2><FolderOpen size={18} /> {editingId ? 'Rediger bibliotek' : 'Opret bibliotek'}</h2>
          <label>Storage root<select value={selectedRoot} onChange={(event) => { setSelectedRoot(event.target.value); void browse(event.target.value); }}>{roots.map((root) => <option key={root.id} value={root.id}>{root.label} · {root.mountPath}</option>)}</select></label>
          <label>Navn<input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} required placeholder="Film" /></label>
          <label>Type<select value={libraryType} onChange={(event) => setLibraryType(event.target.value)}><option value="movie">Film</option><option value="series">Serier</option><option value="mixed">Blandet</option></select></label>
          <label>Valgt mappe<input value={selectedPath} readOnly /></label>
          <label><input type="checkbox" checked={recursive} onChange={(event) => setRecursive(event.target.checked)} /> Scan undermapper</label>
          <div className="folder-picker">
            <button type="button" disabled={!listing?.parentPath} onClick={() => listing?.parentPath && void browse(selectedRoot, listing.parentPath)}>Et niveau op</button>
            {listing?.directories.map((directory) => <button type="button" key={directory.path} onClick={() => void browse(selectedRoot, directory.path)}>{directory.name}</button>)}
          </div>
          <button className="primary-action" disabled={busy || !selectedPath || !libraryName.trim()}>{editingId ? 'Gem ændringer' : 'Opret bibliotek'}</button>
          {editingId && <button type="button" disabled={busy} onClick={cancelEdit}>Annuller</button>}
        </form>
        <div className="management-card">
          <h2><RefreshCw size={18} /> Eksisterende biblioteker</h2>
          {!libraries.length && <p>Ingen biblioteker er oprettet endnu.</p>}
          {libraries.map((library) => {
            const latest = library.scans[0];
            const active = latest?.status === 'queued' || latest?.status === 'running';
            return <div className="data-row" key={library.id}><div><strong>{library.name}</strong><small>{library.type} · {library.paths[0]?.path}</small><small>Scan: {latest?.status ?? 'aldrig kørt'}{latest ? ` · set ${latest.filesSeen} · nye ${latest.filesCreated} · fejl ${latest.errors}` : ''}</small>{latest?.error && <small className="scan-error">{latest.error}</small>}</div><div className="row-actions"><button disabled={busy || active} onClick={() => void edit(library)}>Rediger</button><button disabled={busy || active} onClick={() => void scan(library.id)}>Scan nu</button><button disabled={busy || active} onClick={() => void remove(library)}>Slet</button></div></div>;
          })}
        </div>
      </div>
      {message && <div className="update-message">{message}</div>}
    </section>
  );
}

function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => { void api<User[]>('/users').then(setUsers).catch((error) => setMessage(errorMessage(error))); }, []);
  return <section className="management-page"><span className="eyebrow">ACCESS CONTROL</span><h1>Brugere</h1><p>Rigtige konti, roller og profiler fra serveren.</p><div className="management-card"><h2><Users size={18} /> Brugere</h2>{users.map((user) => <div className="data-row" key={user.id}><div><strong>{user.displayName}</strong><small>{user.email}</small><small>{user.roles.map(({ role }) => role.code).join(', ')} · {user.profiles.length} profil(er)</small></div><span className={`state-badge ${user.status}`}>{user.status}</span></div>)}</div>{message && <div className="update-message">{message}</div>}</section>;
}

function PlansView() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null);
  const [migrateSubscriptions, setMigrateSubscriptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    const next = await api<Plan[]>('/plans');
    setPlans(next);
    if (selectedPlanId && !next.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId('');
      setEntitlements(null);
    }
  }

  useEffect(() => { void refresh().catch((error) => setMessage(errorMessage(error))); }, []);

  function edit(plan: Plan) {
    const version = plan.versions[0];
    if (!version) return;
    setSelectedPlanId(plan.id);
    setEntitlements({
      maxConcurrentStreams: version.maxConcurrentStreams,
      maxRegisteredDevices: version.maxRegisteredDevices,
      maxVideoResolution: version.maxVideoResolution,
      maxVideoBitrate: version.maxVideoBitrate,
      allowDirectPlay: version.allowDirectPlay,
      allowDirectStream: version.allowDirectStream,
      allowVideoTranscode: version.allowVideoTranscode,
      allowAudioTranscode: version.allowAudioTranscode,
      allowSubtitleBurnIn: version.allowSubtitleBurnIn,
      allowChromecast: version.allowChromecast,
      allowOfflineDownload: version.allowOfflineDownload,
      releaseDelayMonths: version.releaseDelayMonths,
      releaseDelayDays: version.releaseDelayDays,
    });
    setMessage('');
  }

  function setNumber(key: keyof PlanEntitlements, value: string) {
    setEntitlements((current) => current ? { ...current, [key]: Number(value) } : current);
  }

  function setFlag(key: keyof PlanEntitlements, value: boolean) {
    setEntitlements((current) => current ? { ...current, [key]: value } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlanId || !entitlements) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ version: number; migratedSubscriptions: number }>('/plan-versions', {
        method: 'POST',
        body: JSON.stringify({ planId: selectedPlanId, isActive: true, migrateActiveSubscriptions: migrateSubscriptions, entitlements }),
      });
      setMessage(`Version ${result.version} er aktiv. ${result.migratedSubscriptions} abonnement(er) blev flyttet.`);
      setSelectedPlanId('');
      setEntitlements(null);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const flags: Array<[keyof PlanEntitlements, string]> = [
    ['allowDirectPlay', 'Direct Play'], ['allowDirectStream', 'Direct Stream'], ['allowVideoTranscode', 'Video-transcoding'],
    ['allowAudioTranscode', 'Audio-transcoding'], ['allowSubtitleBurnIn', 'Indbrændte undertekster'],
    ['allowChromecast', 'Chromecast'], ['allowOfflineDownload', 'Offline-download'],
  ];

  return (
    <section className="management-page">
      <span className="eyebrow">ENTITLEMENTS</span><h1>Planer</h1><p>Opret immutable planversioner. 4K kræver 2160p, passende bitrate og en tilladt afspilningsmetode.</p>
      <div className="management-grid">
        <div className="management-card">
          <h2><ShieldCheck size={18} /> Aktive planer</h2>
          {plans.map((plan) => {
            const version = plan.versions[0];
            return <div className="data-row" key={plan.id}><div><strong>{plan.name}</strong><small>{plan.internalCode} · version {version?.version ?? '-'}</small><small>{version?.maxConcurrentStreams ?? 0} stream(s) · {version?.maxVideoResolution ?? 0}p · {version ? (version.maxVideoBitrate / 1000).toFixed(1) : '0'} Mbps</small></div><div className="row-actions"><span className={`state-badge ${version?.isActive ? 'active' : ''}`}>{version?.isActive ? 'aktiv' : 'inaktiv'}</span><button disabled={!version || busy} onClick={() => edit(plan)}>Ny version</button></div></div>;
          })}
        </div>
        {selectedPlan && entitlements && <form className="management-card management-form" onSubmit={save}>
          <h2>Ny version af {selectedPlan.name}</h2>
          <label>Maks. samtidige streams<input type="number" min="1" max="20" value={entitlements.maxConcurrentStreams} onChange={(event) => setNumber('maxConcurrentStreams', event.target.value)} required /></label>
          <label>Maks. registrerede enheder<input type="number" min="1" max="100" value={entitlements.maxRegisteredDevices} onChange={(event) => setNumber('maxRegisteredDevices', event.target.value)} required /></label>
          <label>Maks. videoopløsning<select value={entitlements.maxVideoResolution} onChange={(event) => setNumber('maxVideoResolution', event.target.value)}><option value="720">720p</option><option value="1080">1080p</option><option value="2160">2160p (4K)</option><option value="4320">4320p (8K)</option></select></label>
          <label>Maks. videobitrate (Kbps)<input type="number" min="128" max="500000" value={entitlements.maxVideoBitrate} onChange={(event) => setNumber('maxVideoBitrate', event.target.value)} required /></label>
          <label>Forsinkelse i måneder<input type="number" min="0" max="120" value={entitlements.releaseDelayMonths} onChange={(event) => setNumber('releaseDelayMonths', event.target.value)} required /></label>
          <label>Ekstra forsinkelse i dage<input type="number" min="0" max="3650" value={entitlements.releaseDelayDays} onChange={(event) => setNumber('releaseDelayDays', event.target.value)} required /></label>
          {flags.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(entitlements[key])} onChange={(event) => setFlag(key, event.target.checked)} /> {label}</label>)}
          <label><input type="checkbox" checked={migrateSubscriptions} onChange={(event) => setMigrateSubscriptions(event.target.checked)} /> Flyt aktive abonnementer atomisk til den nye version</label>
          <div className="row-actions"><button className="primary-action" disabled={busy}>{busy ? 'Gemmer...' : 'Aktivér ny version'}</button><button type="button" disabled={busy} onClick={() => { setSelectedPlanId(''); setEntitlements(null); }}>Annuller</button></div>
        </form>}
      </div>
      {message && <div className="update-message">{message}</div>}
    </section>
  );
}

function SettingsView() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [metadata, setMetadata] = useState<MetadataStatus | null>(null);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [tmdbToken, setTmdbToken] = useState('');
  const [tvdbApiKey, setTvdbApiKey] = useState('');
  const [tvdbPin, setTvdbPin] = useState('');
  const [metadataLanguage, setMetadataLanguage] = useState('da-DK');
  const [metadataScope, setMetadataScope] = useState<'all' | 'movie' | 'series'>('all');
  async function loadErrors() {
    setLoadingErrors(true);
    try { setErrors(await api<ErrorEntry[]>('/system/errors')); } finally { setLoadingErrors(false); }
  }
  useEffect(() => {
    void api<UpdateStatus>('/system/update/status').then(setUpdate).catch(() => undefined);
    void api<MetadataStatus>('/media/metadata/status').then((status) => { setMetadata(status); setMetadataLanguage(status.language); }).catch(() => undefined);
    void loadErrors();
  }, []);
  async function queueMetadata() {
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      await api('/media/metadata/jobs', { method: 'POST', body: JSON.stringify({ mediaType: metadataScope }) });
      setMetadataMessage(`Metadataopdatering for ${metadataScope === 'all' ? 'alle medier' : metadataScope === 'movie' ? 'alle film' : 'alle serier'} er sat i kø.`);
      setMetadata(await api<MetadataStatus>('/media/metadata/status'));
    } catch (error) { setMetadataMessage(errorMessage(error)); } finally { setMetadataBusy(false); }
  }
  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      await api('/system/metadata/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...(tmdbToken ? { tmdbToken } : {}),
          ...(tvdbApiKey ? { tvdbApiKey } : {}),
          ...(tvdbPin ? { tvdbPin } : {}),
          language: metadataLanguage,
        }),
      });
      setTmdbToken(''); setTvdbApiKey(''); setTvdbPin('');
      const next = await api<MetadataStatus>('/media/metadata/status');
      setMetadata(next);
      setMetadataMessage('Metadata-nøglerne er testet og gemt krypteret.');
    } catch (error) { setMetadataMessage(errorMessage(error)); } finally { setMetadataBusy(false); }
  }
  const canSaveMetadata = Boolean(tmdbToken.length >= 20 || tvdbApiKey.length >= 10 || metadata?.enabled);
  return (
    <section className="management-page">
      <span className="eyebrow">SERVER CONTROL</span><h1>Indstillinger</h1><p>Driftsstatus, vedligeholdelse og durable fejl fra serveren.</p>
      <div className="management-card">
        <h2><Server size={18} /> Serveropdatering</h2>
        <div className="data-row"><div><strong>{update?.enabled ? 'Updater aktiveret' : 'Updater deaktiveret'}</strong><small>Branch: {update?.branch ?? '...'}</small><small>Genstart: {update?.restartMode ?? '...'}</small></div><Link className="inline-action" href="/update">Åbn updater</Link></div>
      </div>
      <div className="management-card">
        <h2><Database size={18} /> Metadata</h2>
        <div className="data-row"><div><strong>{metadata?.enabled ? 'Metadata aktiveret' : 'Metadata deaktiveret'}</strong><small>TMDB film: {metadata?.providers?.tmdb.enabled ? 'aktiv' : 'inaktiv'} · TVDB serier: {metadata?.providers?.tvdb.enabled ? 'aktiv' : 'inaktiv'}</small><small>Sprog: {metadata?.language ?? 'da-DK'} · Seneste job: {metadata?.latestJob?.status ?? 'aldrig kørt'}</small></div><div className="row-actions"><select aria-label="Medietype til metadata" value={metadataScope} onChange={(event) => setMetadataScope(event.target.value as 'all' | 'movie' | 'series')}><option value="all">Alle</option><option value="movie">Film</option><option value="series">Serier</option></select><button disabled={!metadata?.enabled || metadataBusy || ['queued', 'running'].includes(metadata?.latestJob?.status ?? '')} onClick={() => void queueMetadata()}>{metadataBusy ? 'Arbejder...' : 'Kør metadata'}</button></div></div>
        <form className="management-form" onSubmit={saveMetadata}>
          <label>TMDB API Read Access Token (film)<input type="password" autoComplete="off" value={tmdbToken} onChange={(event) => setTmdbToken(event.target.value)} minLength={20} placeholder={metadata?.providers?.tmdb.enabled ? 'Lad stå tomt for at beholde den gemte nøgle' : 'eyJ...'} /></label>
          <label>TVDB API Key (serier)<input type="password" autoComplete="off" value={tvdbApiKey} onChange={(event) => setTvdbApiKey(event.target.value)} minLength={10} placeholder={metadata?.providers?.tvdb.enabled ? 'Lad stå tomt for at beholde den gemte nøgle' : 'TVDB API key'} /></label>
          <label>TVDB Subscriber PIN (valgfri)<input type="password" autoComplete="off" value={tvdbPin} onChange={(event) => setTvdbPin(event.target.value)} placeholder="Kun hvis din TVDB-nøgle kræver PIN" /></label>
          <label>Metadata-sprog<input value={metadataLanguage} onChange={(event) => setMetadataLanguage(event.target.value)} pattern="[a-z]{2}(-[A-Z]{2})?" required /></label>
          <button className="primary-action" disabled={metadataBusy || !canSaveMetadata}>{metadataBusy ? 'Tester...' : 'Test og gem nøgler'}</button>
        </form>
        <p>TMDB bruges til film. TVDB foretrækkes til serier, mens TMDB bruges som fallback, hvis TVDB ikke er konfigureret. Nøglerne valideres før lagring, krypteres med serverens <code>ENCRYPTION_KEY</code> og sendes aldrig tilbage til browseren.</p>
        <p>Serieoplysninger fra TVDB skal vises med attribution til TheTVDB.com i klienten.</p>
        {metadataMessage && <div className="update-message">{metadataMessage}</div>}
      </div>
      <div className="management-card">
        <div className="management-heading"><h2><ShieldCheck size={18} /> Fejllog</h2><button onClick={() => void loadErrors()} disabled={loadingErrors}>{loadingErrors ? 'Henter...' : 'Opdater'}</button></div>
        {!errors.length && <p>Ingen durable scanner- eller workerfejl er registreret.</p>}
        {errors.map((entry) => <article className={`error-entry ${entry.severity}`} key={entry.id}><div><strong>{entry.source} · {entry.code}</strong><time>{new Date(entry.timestamp).toLocaleString('da-DK')}</time></div><p>{entry.message}</p><pre>{JSON.stringify(entry.details, null, 2)}</pre></article>)}
      </div>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return (error as ApiFailure)?.message ?? 'Handlingen mislykkedes.';
}
