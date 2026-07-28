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
type Plan = { id: string; name: string; internalCode: string; description: string | null; versions: Array<{ version: number; isActive: boolean; maxConcurrentStreams: number; maxVideoResolution: number }> };
type UpdateStatus = { enabled: boolean; configured: boolean; branch: string; restartMode: string; hasUpdate: boolean };
type ErrorEntry = { id: string; severity: string; source: string; code: string; message: string; timestamp: string; details: Record<string, unknown> };
type MetadataStatus = { enabled: boolean; provider: string; language: string; source?: string; latestJob: { id: string; status: string; updatedAt: string } | null };

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
  const [message, setMessage] = useState('');
  useEffect(() => { void api<Plan[]>('/plans').then(setPlans).catch((error) => setMessage(errorMessage(error))); }, []);
  return <section className="management-page"><span className="eyebrow">ENTITLEMENTS</span><h1>Planer</h1><p>Aktive planversioner og server-side begrænsninger.</p><div className="management-card"><h2><ShieldCheck size={18} /> Planer</h2>{plans.map((plan) => { const version = plan.versions[0]; return <div className="data-row" key={plan.id}><div><strong>{plan.name}</strong><small>{plan.internalCode} · version {version?.version ?? '-'}</small><small>{version?.maxConcurrentStreams ?? 0} stream(s) · {version?.maxVideoResolution ?? 0}p</small></div><span className={`state-badge ${version?.isActive ? 'active' : ''}`}>{version?.isActive ? 'aktiv' : 'inaktiv'}</span></div>; })}</div>{message && <div className="update-message">{message}</div>}</section>;
}

function SettingsView() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [metadata, setMetadata] = useState<MetadataStatus | null>(null);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [metadataToken, setMetadataToken] = useState('');
  const [metadataLanguage, setMetadataLanguage] = useState('da-DK');
  const [metadataScope, setMetadataScope] = useState<'all' | 'movie' | 'series'>('all');
  async function loadErrors() {
    setLoadingErrors(true);
    try {
      setErrors(await api<ErrorEntry[]>('/system/errors'));
    } finally {
      setLoadingErrors(false);
    }
  }
  useEffect(() => {
    void api<UpdateStatus>('/system/update/status').then(setUpdate).catch(() => undefined);
    void api<MetadataStatus>('/media/metadata/status').then((status) => {
      setMetadata(status);
      setMetadataLanguage(status.language);
    }).catch(() => undefined);
    void loadErrors();
  }, []);
  async function queueMetadata() {
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      await api('/media/metadata/jobs', {
        method: 'POST',
        body: JSON.stringify({ mediaType: metadataScope }),
      });
      setMetadataMessage(`Metadataopdatering for ${metadataScope === 'all' ? 'alle medier' : metadataScope === 'movie' ? 'alle film' : 'alle serier'} er sat i kø.`);
      setMetadata(await api<MetadataStatus>('/media/metadata/status'));
    } catch (error) {
      setMetadataMessage(errorMessage(error));
    } finally {
      setMetadataBusy(false);
    }
  }
  async function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMetadataBusy(true);
    setMetadataMessage('');
    try {
      await api('/system/metadata/settings', {
        method: 'PUT',
        body: JSON.stringify({ token: metadataToken, language: metadataLanguage }),
      });
      setMetadataToken('');
      const next = await api<MetadataStatus>('/media/metadata/status');
      setMetadata(next);
      setMetadataMessage('TMDB-nøglen er testet og gemt krypteret.');
    } catch (error) {
      setMetadataMessage(errorMessage(error));
    } finally {
      setMetadataBusy(false);
    }
  }
  return (
    <section className="management-page">
      <span className="eyebrow">SERVER CONTROL</span><h1>Indstillinger</h1><p>Driftsstatus, vedligeholdelse og durable fejl fra serveren.</p>
      <div className="management-card">
        <h2><Server size={18} /> Serveropdatering</h2>
        <div className="data-row"><div><strong>{update?.enabled ? 'Updater aktiveret' : 'Updater deaktiveret'}</strong><small>Branch: {update?.branch ?? '...'}</small><small>Genstart: {update?.restartMode ?? '...'}</small></div><Link className="inline-action" href="/update">Åbn updater</Link></div>
      </div>
      <div className="management-card">
        <h2><Database size={18} /> Metadata</h2>
        <div className="data-row"><div><strong>{metadata?.enabled ? 'TMDB aktiveret' : 'TMDB deaktiveret'}</strong><small>Sprog: {metadata?.language ?? 'da-DK'} · Kilde: {metadata?.source ?? 'ukendt'}</small><small>Seneste job: {metadata?.latestJob?.status ?? 'aldrig kørt'}</small></div><div className="row-actions"><select aria-label="Medietype til metadata" value={metadataScope} onChange={(event) => setMetadataScope(event.target.value as 'all' | 'movie' | 'series')}><option value="all">Alle</option><option value="movie">Film</option><option value="series">Serier</option></select><button disabled={!metadata?.enabled || metadataBusy || ['queued', 'running'].includes(metadata?.latestJob?.status ?? '')} onClick={() => void queueMetadata()}>{metadataBusy ? 'Arbejder...' : 'Kør metadata'}</button></div></div>
        <form className="management-form" onSubmit={saveMetadata}>
          <label>TMDB API Read Access Token<input type="password" autoComplete="off" value={metadataToken} onChange={(event) => setMetadataToken(event.target.value)} minLength={20} required placeholder={metadata?.enabled ? 'Indtast kun for at erstatte den gemte nøgle' : 'eyJ...'} /></label>
          <label>Metadata-sprog<input value={metadataLanguage} onChange={(event) => setMetadataLanguage(event.target.value)} pattern="[a-z]{2}(-[A-Z]{2})?" required /></label>
          <button className="primary-action" disabled={metadataBusy || metadataToken.length < 20}>{metadataBusy ? 'Tester...' : 'Test og gem nøgle'}</button>
        </form>
        <p>Nøglen valideres mod TMDB før lagring, krypteres med serverens <code>ENCRYPTION_KEY</code> og sendes aldrig tilbage til browseren. TMDB dækker både film og serier; TVDB er derfor ikke påkrævet.</p>
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
