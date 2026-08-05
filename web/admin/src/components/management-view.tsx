'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { Database, FolderOpen, RefreshCw, Server, ShieldCheck, Users } from 'lucide-react';
import { api, type ApiFailure } from '@/lib/api';

type Root = { id: string; label: string; mountPath: string; isReadOnly: boolean };
type Scan = { id: string; status: string; filesSeen: number; filesCreated: number; errors: number; error: string | null };
type Library = { id: string; name: string; type: string; autoScanEnabled: boolean; scanIntervalMinutes: number; lastScheduledScanAt: string | null; storageRoot: Root; paths: Array<{ path: string; recursive: boolean }>; scans: Scan[] };
type DirectoryListing = { currentPath: string; parentPath: string | null; directories: Array<{ name: string; path: string }> };
type UserProfile = {
  id: string;
  name: string;
  isChildProfile: boolean;
  language: string;
  hasPin: boolean;
  archivedAt: string | null;
};
type UserSubscription = {
  id: string;
  status: string;
  planVersionId: string;
  startsAt: string;
  endsAt: string | null;
  planVersion: { version: number; plan: { name: string } };
};
type User = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  mustChangePassword: boolean;
  profiles: UserProfile[];
  subscriptions: UserSubscription[];
  roles: Array<{ role: { code: string } }>;
};
type Device = {
  id: string;
  userId: string;
  name: string;
  type: string;
  platform: string | null;
  appVersion: string | null;
  isRevoked: boolean;
  lastSeenAt: string;
};
type EntitlementOverride = {
  id: string;
  userId: string;
  profileId: string | null;
  values: Record<string, unknown>;
  reason: string;
  expiresAt: string | null;
};
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
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState(60);
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void api<Library[]>('/libraries').then(setLibraries).catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await api(editingId ? `/libraries/${editingId}` : '/libraries', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({ storageRootId: selectedRoot, name: libraryName, type: libraryType, path: selectedPath, recursive, autoScanEnabled, scanIntervalMinutes }),
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
      setAutoScanEnabled(library.autoScanEnabled);
      setScanIntervalMinutes(library.scanIntervalMinutes);
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
    setAutoScanEnabled(false);
    setScanIntervalMinutes(60);
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
          <label className="management-check"><input type="checkbox" checked={recursive} onChange={(event) => setRecursive(event.target.checked)} /> Scan undermapper</label>
          <label className="management-check"><input type="checkbox" checked={autoScanEnabled} onChange={(event) => setAutoScanEnabled(event.target.checked)} /> Automatisk ændringsscan</label>
          <label>Scaninterval i minutter<input type="number" min={5} max={10_080} value={scanIntervalMinutes} disabled={!autoScanEnabled} onChange={(event) => setScanIntervalMinutes(Number(event.target.value))} /><small>Workeren kontrollerer biblioteket uden at genanalysere uændrede filer.</small></label>
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
            return <div className="data-row" key={library.id}><div><strong>{library.name}</strong><small>{library.type} · {library.paths[0]?.path}</small><small>Automatik: {library.autoScanEnabled ? `hver ${library.scanIntervalMinutes} min.` : 'deaktiveret'}{library.lastScheduledScanAt ? ` · senest sat i kø ${new Date(library.lastScheduledScanAt).toLocaleString('da-DK')}` : ''}</small><small>Scan: {latest?.status ?? 'aldrig kørt'}{latest ? ` · set ${latest.filesSeen} · nye ${latest.filesCreated} · fejl ${latest.errors}` : ''}</small>{latest?.error && <small className="scan-error">{latest.error}</small>}</div><div className="row-actions"><button disabled={busy || active} onClick={() => void edit(library)}>Rediger</button><button disabled={busy || active} onClick={() => void scan(library.id)}>Scan nu</button><button disabled={busy || active} onClick={() => void remove(library)}>Slet</button></div></div>;
          })}
        </div>
      </div>
      {message && <div className="update-message">{message}</div>}
    </section>
  );
}

function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [overrides, setOverrides] = useState<EntitlementOverride[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [message, setMessage] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [nextUsers, nextPlans, nextDevices, nextOverrides, session] = await Promise.all([
      api<User[]>('/users'),
      api<Plan[]>('/plans'),
      api<Device[]>('/devices'),
      api<EntitlementOverride[]>('/entitlement-overrides'),
      api<{ roles: string[] }>('/auth/me'),
    ]);
    setUsers(nextUsers);
    setPlans(nextPlans);
    setDevices(nextDevices);
    setOverrides(nextOverrides);
    setCanWrite(session.roles.includes('admin'));
    setSelectedUserId((current) => current && nextUsers.some((user) => user.id === current)
      ? current
      : nextUsers[0]?.id ?? '');
  }

  useEffect(() => { void refresh().catch((error) => setMessage(errorMessage(error))); }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    setTemporaryPassword('');
    try {
      const created = await api<{ id: string; temporaryPassword: string }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          displayName: form.get('displayName'),
          profileName: form.get('profileName'),
          planVersionId: form.get('planVersionId') || undefined,
        }),
      });
      setTemporaryPassword(created.temporaryPassword);
      setSelectedUserId(created.id);
      event.currentTarget.reset();
      setMessage('Kunden er oprettet. Den midlertidige adgangskode vises kun her.');
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const selected = users.find((user) => user.id === selectedUserId);
  const activeSubscription = selected?.subscriptions.find((subscription) =>
    ['pending', 'trialing', 'active', 'grace_period'].includes(subscription.status));
  const planVersions = plans.flatMap((plan) => plan.versions.map((version) => ({
    id: version.id,
    label: `${plan.name} · version ${version.version}`,
  })));

  return (
    <section className="management-page customer-admin">
      <span className="eyebrow">ACCESS CONTROL</span><h1>Kundeadministration</h1>
      <p>Konti, profiler, abonnementer, enheder og individuelle rettigheder.</p>
      <div className="customer-admin-grid">
        <div>
          <form className="management-card management-form" onSubmit={createUser}>
            <h2><Users size={18} /> Opret kunde</h2>
            <label>Navn<input name="displayName" minLength={2} required disabled={!canWrite || busy} /></label>
            <label>E-mail<input name="email" type="email" required disabled={!canWrite || busy} /></label>
            <label>Profilnavn<input name="profileName" required disabled={!canWrite || busy} /></label>
            <label>Plan<select name="planVersionId" required disabled={!canWrite || busy}><option value="">Vælg plan</option>{planVersions.map((plan) => <option value={plan.id} key={plan.id}>{plan.label}</option>)}</select></label>
            <button className="primary-action" disabled={!canWrite || busy}>Opret med midlertidig kode</button>
          </form>
          {temporaryPassword && (
            <div className="temporary-password">
              <strong>Midlertidig adgangskode</strong><code>{temporaryPassword}</code>
              <button onClick={() => void navigator.clipboard.writeText(temporaryPassword)}>Kopiér</button>
            </div>
          )}
          <div className="management-card customer-list">
            <h2>Brugere</h2>
            {users.map((user) => (
              <button className={selectedUserId === user.id ? 'selected' : ''} onClick={() => setSelectedUserId(user.id)} key={user.id}>
                <span><strong>{user.displayName}</strong><small>{user.email}</small></span>
                <i className={`state-badge ${user.status}`}>{user.status}</i>
              </button>
            ))}
          </div>
        </div>
        <div>
          {!selected && <div className="management-card"><p>Vælg en kunde.</p></div>}
          {selected && (
            <>
              <form className="management-card management-form" onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void run(() => api(`/users/${selected.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ displayName: form.get('displayName'), email: form.get('email') }),
                }), 'Kunden er opdateret.');
              }}>
                <div className="management-heading"><h2>Konto</h2><span className={`state-badge ${selected.status}`}>{selected.status}</span></div>
                <label>Navn<input name="displayName" defaultValue={selected.displayName} required disabled={!canWrite || busy} /></label>
                <label>E-mail<input name="email" type="email" defaultValue={selected.email} required disabled={!canWrite || busy} /></label>
                <small>{selected.mustChangePassword ? 'Afventer første passwordskifte' : 'Adgangskode aktiveret'}</small>
                <div className="row-actions">
                  <button className="primary-action" disabled={!canWrite || busy}>Gem</button>
                  <button type="button" disabled={!canWrite || busy} onClick={() => void run(
                    () => api(`/users/${selected.id}/suspend`, {
                      method: 'PATCH',
                      body: JSON.stringify({ suspended: selected.status !== 'suspended' }),
                    }),
                    selected.status === 'suspended' ? 'Kunden er reaktiveret.' : 'Kunden er suspenderet.',
                  )}>{selected.status === 'suspended' ? 'Reaktivér' : 'Suspendér'}</button>
                  <button type="button" disabled={!canWrite || busy} onClick={() => void (async () => {
                    setBusy(true);
                    try {
                      const result = await api<{ temporaryPassword: string }>(`/users/${selected.id}/reset-password`, { method: 'POST' });
                      setTemporaryPassword(result.temporaryPassword);
                      setMessage('Ny midlertidig adgangskode er oprettet.');
                      await refresh();
                    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
                  })()}>Nulstil adgangskode</button>
                </div>
              </form>

              <div className="management-card">
                <h2>Profiler</h2>
                {selected.profiles.map((profile) => (
                  <form className="profile-admin-row" key={profile.id} onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void run(() => api(`/profiles/${profile.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        name: form.get('name'),
                        language: form.get('language'),
                        isChildProfile: form.get('isChildProfile') === 'on',
                        pin: form.get('pin') || undefined,
                        clearPin: form.get('clearPin') === 'on',
                      }),
                    }), 'Profilen er opdateret.');
                  }}>
                    <input name="name" defaultValue={profile.name} required disabled={!canWrite || busy} />
                    <input name="language" defaultValue={profile.language} pattern="[a-z]{2}(-[A-Z]{2})?" required disabled={!canWrite || busy} />
                    <input name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" placeholder={profile.hasPin ? 'Ny PIN' : 'Valgfri PIN'} disabled={!canWrite || busy} />
                    <label><input name="isChildProfile" type="checkbox" defaultChecked={profile.isChildProfile} disabled={!canWrite || busy} /> Barn</label>
                    {profile.hasPin && <label><input name="clearPin" type="checkbox" disabled={!canWrite || busy} /> Fjern PIN</label>}
                    <div className="row-actions"><button disabled={!canWrite || busy}>Gem</button><button type="button" disabled={!canWrite || busy} onClick={() => void run(
                      () => api(`/profiles/${profile.id}/archive`, {
                        method: 'PATCH',
                        body: JSON.stringify({ archived: !profile.archivedAt }),
                      }),
                      profile.archivedAt ? 'Profilen er gendannet.' : 'Profilen er arkiveret.',
                    )}>{profile.archivedAt ? 'Gendan' : 'Arkivér'}</button></div>
                  </form>
                ))}
                <form className="profile-admin-row profile-create-row" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(() => api('/profiles', {
                    method: 'POST',
                    body: JSON.stringify({
                      userId: selected.id,
                      name: form.get('name'),
                      language: form.get('language'),
                      pin: form.get('pin') || undefined,
                      isChildProfile: form.get('isChildProfile') === 'on',
                    }),
                  }), 'Profilen er oprettet.');
                  event.currentTarget.reset();
                }}>
                  <input name="name" placeholder="Ny profil" required disabled={!canWrite || busy} />
                  <input name="language" defaultValue="da" required disabled={!canWrite || busy} />
                  <input name="pin" type="password" inputMode="numeric" pattern="\d{4,8}" placeholder="Valgfri PIN" disabled={!canWrite || busy} />
                  <label><input name="isChildProfile" type="checkbox" disabled={!canWrite || busy} /> Barn</label>
                  <button disabled={!canWrite || busy}>Opret profil</button>
                </form>
              </div>

              <div className="management-card">
                <h2>Abonnement</h2>
                <p>{activeSubscription ? `${activeSubscription.planVersion.plan.name} · ${activeSubscription.status}` : 'Intet aktivt abonnement'}</p>
                <label className="inline-select">Plan<select defaultValue={activeSubscription?.planVersionId ?? ''} id={`plan-${selected.id}`} disabled={!canWrite || busy}><option value="">Vælg plan</option>{planVersions.map((plan) => <option value={plan.id} key={plan.id}>{plan.label}</option>)}</select></label>
                <div className="row-actions">
                  <button disabled={!canWrite || busy} onClick={() => {
                    const planVersionId = (document.getElementById(`plan-${selected.id}`) as HTMLSelectElement | null)?.value;
                    if (!planVersionId) return;
                    void run(
                      () => activeSubscription
                        ? api(`/subscriptions/${activeSubscription.id}/change-plan`, { method: 'PATCH', body: JSON.stringify({ planVersionId }) })
                        : api('/subscriptions', { method: 'POST', body: JSON.stringify({ userId: selected.id, planVersionId, status: 'active' }) }),
                      'Abonnementet er opdateret.',
                    );
                  }}>{activeSubscription ? 'Skift plan' : 'Aktivér abonnement'}</button>
                  {activeSubscription && <button disabled={!canWrite || busy} onClick={() => void run(
                    () => api(`/subscriptions/${activeSubscription.id}/cancel`, { method: 'PATCH' }),
                    'Abonnementet er annulleret.',
                  )}>Annuller abonnement</button>}
                </div>
              </div>

              <div className="management-card">
                <h2>Enheder</h2>
                {devices.filter((device) => device.userId === selected.id).map((device) => (
                  <div className="data-row" key={device.id}><div><strong>{device.name}</strong><small>{device.platform ?? device.type} · {device.appVersion ?? 'ukendt version'}</small><small>Senest set {new Date(device.lastSeenAt).toLocaleString('da-DK')}</small></div><button disabled={!canWrite || busy || device.isRevoked} onClick={() => void run(() => api(`/devices/${device.id}`, { method: 'DELETE' }), 'Enheden er tilbagekaldt.')}>{device.isRevoked ? 'Tilbagekaldt' : 'Tilbagekald'}</button></div>
                ))}
              </div>

              <div className="management-card">
                <h2>Entitlement-overrides</h2>
                {overrides.filter((override) => override.userId === selected.id).map((override) => (
                  <div className="data-row" key={override.id}><div><strong>{override.reason}</strong><small>{JSON.stringify(override.values)}</small><small>{override.expiresAt ? `Udløber ${new Date(override.expiresAt).toLocaleString('da-DK')}` : 'Ingen udløbsdato'}</small></div><button disabled={!canWrite || busy} onClick={() => void run(() => api(`/entitlement-overrides/${override.id}`, { method: 'DELETE' }), 'Override er fjernet.')}>Fjern</button></div>
                ))}
                <form className="management-form" onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  let values: Record<string, unknown>;
                  try { values = JSON.parse(String(form.get('values'))) as Record<string, unknown>; } catch { setMessage('Override-værdier skal være gyldig JSON.'); return; }
                  void run(() => api('/entitlement-overrides', {
                    method: 'POST',
                    body: JSON.stringify({
                      userId: selected.id,
                      profileId: form.get('profileId') || undefined,
                      values,
                      reason: form.get('reason'),
                      expiresAt: form.get('expiresAt') ? new Date(String(form.get('expiresAt'))).toISOString() : undefined,
                    }),
                  }), 'Override er oprettet.');
                  event.currentTarget.reset();
                }}>
                  <label>Profil<select name="profileId" disabled={!canWrite || busy}><option value="">Hele kontoen</option>{selected.profiles.filter((profile) => !profile.archivedAt).map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select></label>
                  <label>Værdier (JSON)<input name="values" defaultValue='{"maxConcurrentStreams":2}' required disabled={!canWrite || busy} /></label>
                  <label>Begrundelse<input name="reason" minLength={3} required disabled={!canWrite || busy} /></label>
                  <label>Udløber<input name="expiresAt" type="datetime-local" disabled={!canWrite || busy} /></label>
                  <button disabled={!canWrite || busy}>Opret override</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
      {!canWrite && <div className="update-message">Operator-adgang er skrivebeskyttet.</div>}
      {message && <div className="update-message">{message}</div>}
    </section>
  );
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
    ['allowAudioTranscode', 'Audio-transcoding'], ['allowChromecast', 'Chromecast'], ['allowOfflineDownload', 'Offline-download'],
  ];

  return (
    <section className="management-page">
      <span className="eyebrow">ENTITLEMENTS</span><h1>Planer</h1><p>Opret immutable planversioner. 4K kræver 2160p, passende bitrate og en tilladt afspilningsmetode. Undertekster, inklusive nødvendigt burn-in, er altid tilgængelige.</p>
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

function ServerSettingsCard() {
  const [settings, setSettings] = useState<{
    serverName: string;
    externalUrl: string | null;
    language: string;
    timezone: string;
    effectivePublicUrl: string | null;
    publicUrlSource: 'environment' | 'account' | 'unset';
    httpsReady: boolean;
    castReady: boolean;
    corsOrigins: string[];
  } | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const [nextSettings, me] = await Promise.all([
      api<NonNullable<typeof settings>>('/system/server-settings'),
      api<{ roles: string[] }>('/auth/me'),
    ]);
    setSettings(nextSettings);
    setCanWrite(me.roles.includes('admin'));
  };

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : 'Serverindstillinger kunne ikke hentes'));
  }, []);

  if (!settings) {
    return (
      <div className="management-card">
        <p>{message ?? 'Henter serverindstillinger...'}</p>
      </div>
    );
  }

  return (
    <div className="management-card settings-card">
      <div className="management-card-header">
        <div>
          <span className="eyebrow">Domæne og streaming</span>
          <h2>Offentlig serveradresse</h2>
        </div>
        <span className={`status-pill ${settings.httpsReady && settings.castReady ? 'success' : 'warning'}`}>
          {settings.httpsReady && settings.castReady ? 'HTTPS og Cast klar' : 'Kræver HTTPS-konfiguration'}
        </span>
      </div>
      <form
        className="management-form server-settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void api('/system/server-settings', {
            method: 'PATCH',
            body: JSON.stringify({
              serverName: form.get('serverName'),
              externalUrl: form.get('externalUrl'),
              language: form.get('language'),
              timezone: form.get('timezone'),
            }),
          })
            .then(() => load())
            .then(() => setMessage('Serverindstillingerne er gemt.'))
            .catch((error) => setMessage(error instanceof Error ? error.message : 'Serverindstillingerne kunne ikke gemmes'));
        }}
      >
        <div className="server-settings-grid">
          <label>
            <span>Servernavn</span>
            <input name="serverName" defaultValue={settings.serverName} disabled={!canWrite} required />
            <small>Navnet kunder og enheder ser.</small>
          </label>
          <label>
            <span>Ekstern URL</span>
            <input
              name="externalUrl"
              type="url"
              defaultValue={settings.externalUrl ?? ''}
              placeholder="https://media.boltbytes.com"
              disabled={!canWrite}
              required
            />
            <small>Den offentlige HTTPS-adresse uden afsluttende skråstreg.</small>
          </label>
          <label>
            <span>Standardsprog</span>
            <select name="language" defaultValue={settings.language} disabled={!canWrite} required>
              <option value="da">Dansk</option>
              <option value="en">English</option>
            </select>
            <small>Bruges som standard ved nye profiler.</small>
          </label>
          <label>
            <span>Tidszone</span>
            <input name="timezone" defaultValue={settings.timezone} disabled={!canWrite} required />
            <small>IANA-navn, eksempelvis Europe/Copenhagen.</small>
          </label>
        </div>
        {canWrite ? (
          <footer className="server-settings-actions">
            <span>Ændringer bruges af streaminglinks, CORS og Chromecast.</span>
            <button className="primary-action" type="submit">Gem serverindstillinger</button>
          </footer>
        ) : null}
      </form>
      <div className="server-settings-status">
        <article className={settings.effectivePublicUrl ? 'ready' : 'warning'}>
          <span>Effektiv URL</span>
          <strong>{settings.effectivePublicUrl ?? 'Ikke konfigureret'}</strong>
          <small>{settings.httpsReady ? 'HTTPS er aktiv' : 'HTTPS mangler'}</small>
        </article>
        <article>
          <span>Konfigurationskilde</span>
          <strong>{settings.publicUrlSource === 'environment' ? 'Miljøvariabel' : settings.publicUrlSource === 'account' ? 'Serverindstilling' : 'Ikke angivet'}</strong>
          <small>{settings.castReady ? 'Chromecast er klar' : 'Chromecast afventer offentlig URL'}</small>
        </article>
        <article>
          <span>Tilladte CORS-origins</span>
          <strong>{settings.corsOrigins.join(', ') || 'Ingen origins'}</strong>
          <small>Kun disse origins må kalde media-API&apos;et.</small>
        </article>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
    </div>
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
  async function clearErrors() {
    setLoadingErrors(true);
    try {
      await api('/system/errors', { method: 'DELETE' });
      setErrors([]);
    } finally {
      setLoadingErrors(false);
    }
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
      <ServerSettingsCard />
      <div className="management-card">
        <h2><Server size={18} /> Serveropdatering</h2>
        <div className="data-row"><div><strong>{update?.enabled ? 'Updater aktiveret' : 'Updater deaktiveret'}</strong><small>Branch: {update?.branch ?? '...'}</small><small>Genstart: {update?.restartMode ?? '...'}</small></div><Link className="inline-action" href="/update">Åbn updater</Link></div>
      </div>
      <div className="management-card">
        <h2><Database size={18} /> Metadata</h2>
        <div className="data-row metadata-overview"><div><strong>{metadata?.enabled ? 'Metadata aktiveret' : 'Metadata deaktiveret'}</strong><small>TMDB film: {metadata?.providers?.tmdb.enabled ? 'aktiv' : 'inaktiv'} · TVDB serier: {metadata?.providers?.tvdb.enabled ? 'aktiv' : 'inaktiv'}</small><small>Sprog: {metadata?.language ?? 'da-DK'} · Seneste job: {metadata?.latestJob?.status ?? 'aldrig kørt'}</small></div><div className="row-actions"><select aria-label="Medietype til metadata" value={metadataScope} onChange={(event) => setMetadataScope(event.target.value as 'all' | 'movie' | 'series')}><option value="all">Alle medier</option><option value="movie">Kun film</option><option value="series">Kun serier</option></select><button disabled={!metadata?.enabled || metadataBusy || ['queued', 'running'].includes(metadata?.latestJob?.status ?? '')} onClick={() => void queueMetadata()}>{metadataBusy ? 'Arbejder...' : 'Kør metadata'}</button></div></div>
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
        <div className="management-heading"><h2><ShieldCheck size={18} /> Fejllog</h2><div className="row-actions"><button onClick={() => void clearErrors()} disabled={loadingErrors || !errors.length}>Ryd viste</button><button onClick={() => void loadErrors()} disabled={loadingErrors}>{loadingErrors ? 'Henter...' : 'Opdater'}</button></div></div>
        {!errors.length && <p>Ingen durable scanner- eller workerfejl er registreret.</p>}
        {errors.map((entry) => <article className={`error-entry ${entry.severity}`} key={entry.id}><div><strong>{entry.source} · {entry.code}</strong><time>{new Date(entry.timestamp).toLocaleString('da-DK')}</time></div><p>{entry.message}</p><pre>{JSON.stringify(entry.details, null, 2)}</pre></article>)}
      </div>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return (error as ApiFailure)?.message ?? 'Handlingen mislykkedes.';
}
