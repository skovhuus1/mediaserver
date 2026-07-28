'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, RefreshCw, Server, ShieldCheck, Users } from 'lucide-react';
import { api, type ApiFailure } from '@/lib/api';

type Root = { id: string; label: string; mountPath: string; isReadOnly: boolean };
type Scan = { id: string; status: string; filesSeen: number; filesCreated: number; errors: number; error: string | null };
type Library = { id: string; name: string; type: string; paths: Array<{ path: string }>; scans: Scan[] };
type DirectoryListing = { currentPath: string; parentPath: string | null; directories: Array<{ name: string; path: string }> };
type User = { id: string; email: string; displayName: string; status: string; profiles: Array<{ id: string; name: string }>; roles: Array<{ role: { code: string } }> };
type Plan = { id: string; name: string; internalCode: string; description: string | null; versions: Array<{ version: number; isActive: boolean; maxConcurrentStreams: number; maxVideoResolution: number }> };
type UpdateStatus = { enabled: boolean; configured: boolean; branch: string; restartMode: string; hasUpdate: boolean };

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

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage('');
    try {
      await api('/libraries', {
        method: 'POST',
        body: JSON.stringify({
          storageRootId: selectedRoot,
          name: form.get('name'),
          type: form.get('type'),
          path: selectedPath,
          recursive: true,
        }),
      });
      setMessage('Biblioteket er oprettet.');
      await refresh();
      formElement.reset();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function scan(libraryId: string) {
    setBusy(true);
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
      <span className="eyebrow">MEDIA CONTROL</span><h1>Biblioteker</h1><p>Opret rigtige biblioteker, vælg mapper og start scanning.</p>
      <div className="management-grid">
        <form className="management-card management-form" onSubmit={create}>
          <h2><FolderOpen size={18} /> Opret bibliotek</h2>
          <label>Storage root<select value={selectedRoot} onChange={(event) => { setSelectedRoot(event.target.value); void browse(event.target.value); }}>{roots.map((root) => <option key={root.id} value={root.id}>{root.label} · {root.mountPath}</option>)}</select></label>
          <label>Navn<input name="name" required placeholder="Film" /></label>
          <label>Type<select name="type"><option value="movie">Film</option><option value="series">Serier</option><option value="mixed">Blandet</option></select></label>
          <label>Valgt mappe<input value={selectedPath} readOnly /></label>
          <div className="folder-picker">
            <button type="button" disabled={!listing?.parentPath} onClick={() => listing?.parentPath && void browse(selectedRoot, listing.parentPath)}>Et niveau op</button>
            {listing?.directories.map((directory) => <button type="button" key={directory.path} onClick={() => void browse(selectedRoot, directory.path)}>{directory.name}</button>)}
          </div>
          <button className="primary-action" disabled={busy || !selectedPath}>Opret bibliotek</button>
        </form>
        <div className="management-card">
          <h2><RefreshCw size={18} /> Eksisterende biblioteker</h2>
          {!libraries.length && <p>Ingen biblioteker er oprettet endnu.</p>}
          {libraries.map((library) => <div className="data-row" key={library.id}><div><strong>{library.name}</strong><small>{library.type} · {library.paths[0]?.path}</small><small>Scan: {library.scans[0]?.status ?? 'aldrig kørt'}</small>{library.scans[0]?.error && <small className="scan-error">{library.scans[0].error}</small>}</div><button disabled={busy} onClick={() => void scan(library.id)}>Scan nu</button></div>)}
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
  useEffect(() => { void api<UpdateStatus>('/system/update/status').then(setUpdate).catch(() => undefined); }, []);
  return <section className="management-page"><span className="eyebrow">SERVER CONTROL</span><h1>Indstillinger</h1><p>Driftsstatus og vedligeholdelse uden tomme kontrolknapper.</p><div className="management-card"><h2><Server size={18} /> Serveropdatering</h2><div className="data-row"><div><strong>{update?.enabled ? 'Updater aktiveret' : 'Updater deaktiveret'}</strong><small>Branch: {update?.branch ?? '...'}</small><small>Genstart: {update?.restartMode ?? '...'}</small></div><Link className="inline-action" href="/update">Åbn updater</Link></div></div></section>;
}

function errorMessage(error: unknown): string {
  return (error as ApiFailure)?.message ?? 'Handlingen mislykkedes.';
}
