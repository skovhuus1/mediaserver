"use client";

import { FormEvent, useState } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const apiUrl = (path: string) => `${API_BASE || ''}${path}`;

export default function LoginPage() {
  const [state, setState] = useState('');

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
      deviceName: 'web-admin',
      deviceType: 'web',
    };

    const res = await fetch(apiUrl('/api/v1/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ error: { message: 'Login mislykkedes uden body' } }));
      setState(body?.error?.message ?? body?.message ?? 'Login mislykkedes');
      return;
    }

    const data = await res.json();
    localStorage.setItem('bb-media-access', data.accessToken);
    localStorage.setItem('bb-media-refresh', data.refreshToken);
    setState('Login ok');
  }

  return (
    <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
      <h1>Login</h1>
      <form onSubmit={submitForm} style={{ display: 'grid', gap: 10 }}>
        <label>
          E-mail
          <br />
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <br />
          <input name="password" type="password" required minLength={8} />
        </label>
        <button type="submit">Login</button>
      </form>
      <p>{state}</p>
    </div>
  );
}
