'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Brand } from '@/components/brand';
import { accessToken, api, type ApiFailure, type SessionUser } from '@/lib/api';

type Approval = { status: 'approved'; deviceName: string; expiresAt: string };

export default function TvLoginApprovalPage() {
  return <Suspense fallback={<main className="watch-loading" aria-busy="true">Indlæser TV-login...</main>}><TvLoginApproval /></Suspense>;
}

function TvLoginApproval() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [session, setSession] = useState<SessionUser | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('QR-linket mangler en TV-login token.');
      return;
    }
    if (!accessToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/login/tv?token=${token}`)}`);
      return;
    }
    void api<SessionUser>('/auth/me')
      .then(setSession)
      .catch((failure) => setError((failure as ApiFailure).message ?? 'Du skal logge ind før TV’et kan godkendes.'));
  }, [router, token]);

  async function approve() {
    setBusy(true);
    setError('');
    try {
      const result = await api<Approval>('/auth/tv/approve', {
        method: 'POST',
        body: JSON.stringify({ approveToken: token }),
      });
      setApproval(result);
    } catch (failure) {
      setError((failure as ApiFailure).message ?? 'TV-login kunne ikke godkendes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Brand />
        <span className="eyebrow">TV LOGIN</span>
        <h1>Godkend TV’et</h1>
        {approval ? (
          <>
            <p>{approval.deviceName} er godkendt. Gå tilbage til TV’et, som logger ind automatisk.</p>
            <a href="/watch">Tilbage til biblioteket</a>
          </>
        ) : (
          <>
            <p>Du godkender et TV-login for {session?.displayName ?? 'din BoltBytes-konto'}. Del kun adgang med en skærm du selv kan se.</p>
            {error && <div className="form-error">{error}</div>}
            <button disabled={busy || !token || !session} onClick={() => void approve()}>{busy ? 'Godkender...' : 'Godkend TV-login'}</button>
            <a href="/watch">Annuller</a>
          </>
        )}
      </section>
      <aside className="auth-art"><span /><div><b>Scan.</b><b>Godkend.</b><b>Se videre.</b></div></aside>
    </main>
  );
}
