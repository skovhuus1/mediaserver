'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brand } from '@/components/brand';
import { api, type ApiFailure } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem('bb_password_change_token');
    if (!stored) {
      router.replace('/login');
      return;
    }
    setToken(stored);
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirmation = String(form.get('confirmation') ?? '');
    if (password !== confirmation) {
      setError('Adgangskoderne er ikke ens.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/complete-password-change', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      }, false);
      window.sessionStorage.removeItem('bb_password_change_token');
      router.replace('/login');
    } catch (failure) {
      setError((failure as ApiFailure).message ?? 'Adgangskoden kunne ikke ændres.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand />
        <span className="eyebrow">FØRSTE LOGIN</span>
        <h1>Vælg din adgangskode</h1>
        <p>Den midlertidige kode kan kun bruges til dette passwordskifte.</p>
        <form onSubmit={submit}>
          <label>Ny adgangskode<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
          <label>Gentag adgangskode<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
          {error && <div className="form-error">{error}</div>}
          <button disabled={busy || !token}>{busy ? 'Gemmer...' : 'Gem adgangskode'}</button>
        </form>
      </section>
      <aside className="auth-art"><span /><div><b>Din konto.</b><b>Din adgang.</b><b>Dine medier.</b></div></aside>
    </main>
  );
}
