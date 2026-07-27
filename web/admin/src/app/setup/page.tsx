"use client";

import { FormEvent, useState } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const apiUrl = (path: string) => `${API_BASE || ''}${path}`;

export default function SetupPage() {
  const [status, setStatus] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const payload = {
      accountName: String(form.get('accountName') || ''),
      adminEmail: String(form.get('adminEmail') || ''),
      adminPassword: String(form.get('adminPassword') || ''),
      adminDisplayName: String(form.get('adminDisplayName') || 'Administrator'),
      serverName: String(form.get('serverName') || 'BoltBytes Media'),
      externalUrl: String(form.get('externalUrl') || ''),
      mountPath: String(form.get('mountPath') || '/media'),
      language: String(form.get('language') || 'da'),
      timezone: String(form.get('timezone') || 'Europe/Copenhagen'),
    };

    const res = await fetch(apiUrl('/api/v1/system/setup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({
      message: 'Setup fejlede uden body',
    }));

    if (!res.ok && res.status !== 200 && res.status !== 201) {
      setStatus(body?.message ?? body?.error?.message ?? body?.reason ?? 'Setup fejlede');
      return;
    }

    setStatus(`Setup gennemført for ${body.accountName ?? 'server'} (${body.accountId ?? 'n/a'})`);
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <h1>Første konfiguration</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <label>
          Kontonavn
          <br />
          <input name="accountName" required />
        </label>
        <label>
          Admin e-mail
          <br />
          <input name="adminEmail" type="email" required />
        </label>
        <label>
          Admin navn
          <br />
          <input name="adminDisplayName" required />
        </label>
        <label>
          Adgangskode
          <br />
          <input name="adminPassword" type="password" minLength={10} required />
        </label>
        <label>
          Servernavn
          <br />
          <input name="serverName" defaultValue="BoltBytes Media" />
        </label>
        <label>
          Externe URL
          <br />
          <input name="externalUrl" defaultValue="https://media.local" />
        </label>
        <label>
          Mount-sti
          <br />
          <input name="mountPath" defaultValue="/media" />
        </label>
        <label>
          Sprog
          <select name="language" defaultValue="da">
            <option value="da">Dansk</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          Tidszone
          <br />
          <input name="timezone" defaultValue="Europe/Copenhagen" />
        </label>
        <button type="submit">Start setup</button>
      </form>
      <p>{status}</p>
    </div>
  );
}
