'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/brand';
import { api, deviceFingerprint, saveSession, type ApiFailure, type SessionUser } from '@/lib/api';
import { t } from '@/lib/messages';

type LoginResult = { accessToken: string; refreshToken: string };

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          deviceFingerprint: deviceFingerprint(),
          deviceName: navigator.platform || 'Webbrowser',
          deviceType: 'web',
          platform: navigator.platform,
        }),
      }, false);
      saveSession(result.accessToken, result.refreshToken);
      const session = await api<SessionUser>('/auth/me');
      const isAdmin = session.roles.some((role) => role === 'admin' || role === 'operator');
      router.replace(isAdmin ? '/' : session.profiles.length > 1 ? '/profiles' : '/watch');
    } catch (failure) {
      const apiFailure = failure as ApiFailure;
      setError(apiFailure.message ?? 'Login mislykkedes');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand />
        <span className="eyebrow">SECURE ACCESS</span>
        <h1>{t.loginTitle}</h1>
        <p>Log ind på din BoltBytes-server for at se medier eller administrere serveren.</p>
        <form onSubmit={submit}>
          <label>{t.email}<input name="email" type="email" autoComplete="email" required /></label>
          <label>{t.password}<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          {error && <div className="form-error">{error}</div>}
          <button disabled={busy}>{busy ? 'Logger ind...' : t.signIn}</button>
        </form>
        <a href="/setup">Første opsætning</a>
      </section>
      <aside className="auth-art"><span /><div><b>Din server.</b><b>Dine medier.</b><b>Dine regler.</b></div></aside>
    </main>
  );
}
