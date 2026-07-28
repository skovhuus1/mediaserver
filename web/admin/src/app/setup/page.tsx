'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/brand';
import { api, type ApiFailure } from '@/lib/api';
import { t } from '@/lib/messages';

type DirectoryListing = {
  mountRoot: string;
  hostRoot: string;
  currentPath: string;
  currentHostPath: string;
  parentPath: string | null;
  directories: Array<{ name: string; path: string; hostPath: string }>;
};

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [directoryBusy, setDirectoryBusy] = useState(true);
  const [mountPath, setMountPath] = useState('/media');
  const [directoryListing, setDirectoryListing] = useState<DirectoryListing | null>(null);

  useEffect(() => {
    api<{ configured: boolean }>('/setup/status', {}, false)
      .then(({ configured }) => {
        if (configured) {
          router.replace('/login');
          return;
        }
        return loadDirectories();
      })
      .catch(() => setError('API kan ikke kontaktes'));
  }, [router]);

  async function loadDirectories(path?: string) {
    setDirectoryBusy(true);
    setError('');
    try {
      const query = path ? `?path=${encodeURIComponent(path)}` : '';
      const listing = await api<DirectoryListing>(`/setup/directories${query}`, {}, false);
      setDirectoryListing(listing);
      setMountPath(listing.currentPath);
    } catch (failure) {
      setError((failure as ApiFailure).message ?? 'Mapperne kunne ikke indlæses');
    } finally {
      setDirectoryBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/setup', {
        method: 'POST',
        body: JSON.stringify({
          accountName: form.get('accountName'),
          serverName: form.get('serverName'),
          adminDisplayName: form.get('adminDisplayName'),
          adminEmail: form.get('adminEmail'),
          adminPassword: form.get('adminPassword'),
          language: 'da',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          mountPath: form.get('mountPath'),
        }),
      }, false);
      router.replace('/login');
    } catch (failure) {
      setError((failure as ApiFailure).message ?? 'Opsætningen mislykkedes');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup-page">
      <header><Brand /><span>TRIN 1 AF 1</span></header>
      <section className="setup-card">
        <span className="eyebrow">FØRSTEGANGSOPSÆTNING</span>
        <h1>{t.setupTitle}</h1>
        <p>{t.setupLead}</p>
        <form onSubmit={submit} className="setup-form">
          <label>{t.accountName}<input name="accountName" defaultValue="BoltBytes" required /></label>
          <label>{t.serverName}<input name="serverName" defaultValue="BoltBytes Media" required /></label>
          <label>{t.displayName}<input name="adminDisplayName" required /></label>
          <label>{t.email}<input name="adminEmail" type="email" required /></label>
          <label className="full">{t.password}<input name="adminPassword" type="password" minLength={12} required /><small>Minimum 12 tegn</small></label>
          <label className="full">
            {t.mountPath}
            <input name="mountPath" value={mountPath} readOnly required />
            <small>
              Host: {directoryListing?.currentHostPath ?? 'Indlæser det konfigurerede MEDIA_PATH...'}
            </small>
          </label>
          <div className="directory-browser full">
            <div className="directory-browser-header">
              <div>
                <strong>Vælg mediemappe</strong>
                <small>{directoryListing?.currentHostPath ?? mountPath}</small>
              </div>
              <button
                type="button"
                disabled={directoryBusy || !directoryListing?.parentPath}
                onClick={() => directoryListing?.parentPath && loadDirectories(directoryListing.parentPath)}
              >
                Et niveau op
              </button>
            </div>
            <div className="directory-list">
              {directoryBusy && <span>Indlæser mapper...</span>}
              {!directoryBusy && directoryListing?.directories.length === 0 && <span>Ingen undermapper</span>}
              {!directoryBusy && directoryListing?.directories.map((directory) => (
                <button type="button" key={directory.path} onClick={() => loadDirectories(directory.path)}>
                  <span>MAPPE</span>
                  <strong>{directory.name}</strong>
                  <small>{directory.hostPath}</small>
                </button>
              ))}
            </div>
          </div>
          {error && <div className="form-error full">{error}</div>}
          <button className="full" disabled={busy}>{busy ? 'Opretter...' : t.saveSetup}</button>
        </form>
      </section>
    </main>
  );
}
