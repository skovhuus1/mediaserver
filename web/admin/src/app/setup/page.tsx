'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/brand';
import { api, type ApiFailure } from '@/lib/api';
import { t } from '@/lib/messages';

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ configured: boolean }>('/setup/status', {}, false)
      .then(({ configured }) => { if (configured) router.replace('/login'); })
      .catch(() => setError('API kan ikke kontaktes'));
  }, [router]);

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
          <label className="full">{t.mountPath}<input name="mountPath" defaultValue="/media" required /></label>
          {error && <div className="form-error full">{error}</div>}
          <button className="full" disabled={busy}>{busy ? 'Opretter...' : t.saveSetup}</button>
        </form>
      </section>
    </main>
  );
}
