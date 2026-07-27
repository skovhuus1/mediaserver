"use client";

import { FormEvent, useState } from 'react';

type UpdateStatus = {
  enabled: boolean;
  configured: boolean;
  repoPath: string;
  remote: string;
  branch: string;
  localCommit: string | null;
  remoteCommit: string | null;
  hasUpdate: boolean;
  reason?: string;
};

type UpdateApplyResult = UpdateStatus & {
  fetchOutput: string;
  pullOutput: string;
  restartMode: string;
  restartOutput: string;
  restarted: boolean;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export default function UpdatePage() {
  const [status, setStatus] = useState('Klik for at tjekke om der findes ny version.');
  const [checkResult, setCheckResult] = useState<UpdateStatus | null>(null);
  const [applyResult, setApplyResult] = useState<UpdateApplyResult | null>(null);

  function getToken(): string {
    const token = localStorage.getItem('bb-media-access');
    if (!token) {
      throw new Error('Ingen adgangstoken fundet. Login igen i admin first.');
    }
    return token;
  }

  async function callApi<T>(path: string, method: 'GET' | 'POST' = 'GET') {
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/v1/system/update/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const body = await res.json().catch(() => ({ error: { message: 'Tom respons' } }));
    if (!res.ok) {
      throw new Error(body?.message ?? body?.error?.message ?? `HTTP ${res.status}`);
    }

    return body as T;
  }

  async function checkUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('Checker main branch...');

    try {
      const result = await callApi<UpdateStatus>('check', 'POST');
      setCheckResult(result);
      setApplyResult(null);
      setStatus(result.hasUpdate ? 'Ny version fundet. Vurder at trykke installer.' : 'Ingen ny version fundet.');
    } catch (error: any) {
      setStatus(error?.message ?? 'Fejl ved check af update');
      setCheckResult(null);
      setApplyResult(null);
    }
  }

  async function applyUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('Anvender opdatering...');

    try {
      const result = await callApi<UpdateApplyResult>('apply', 'POST');
      setApplyResult(result);
      setCheckResult(result);
      setStatus(
        result.hasUpdate
          ? `Apply udforet. Restart strategy: ${result.restartMode}. Restartet: ${result.restarted ? 'Ja' : 'Nej'}`
          : 'Ingen opdatering blev gennemfoert.',
      );
    } catch (error: any) {
      setStatus(error?.message ?? 'Fejl ved install af update');
      setApplyResult(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
      <h1>Server-opdatering</h1>
      <p>Checker mod github main og opdaterer kode direkte fra admin.</p>

      <form onSubmit={checkUpdate} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
        <button type="submit">Tjek opdatering</button>
      </form>

      {checkResult ? (
        <section style={{ background: '#0e1e3d', border: '1px solid #3f6fb7', borderRadius: 10, padding: 12 }}>
          <h2>Status</h2>
          <div>
            <strong>Enabled:</strong> {String(checkResult.enabled)}
          </div>
          <div>
            <strong>Configured:</strong> {String(checkResult.configured)}
          </div>
          <div>
            <strong>Repo:</strong> {checkResult.repoPath}
          </div>
          <div>
            <strong>Remote:</strong> {checkResult.remote}
          </div>
          <div>
            <strong>Branch:</strong> {checkResult.branch}
          </div>
          <div>
            <strong>Local commit:</strong> {checkResult.localCommit ?? '-'}
          </div>
          <div>
            <strong>Remote commit:</strong> {checkResult.remoteCommit ?? '-'}
          </div>
          <div>
            <strong>Ny version:</strong> {checkResult.hasUpdate ? 'Ja' : 'Nej'}
          </div>
          {checkResult.reason ? <p>Reason: {checkResult.reason}</p> : null}
        </section>
      ) : null}

      {checkResult?.hasUpdate ? (
        <form onSubmit={applyUpdate} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
          <button type="submit">Installer opdatering og genstart</button>
          <p>Dette trækker ny kode fra main branch og forsøger genstart afhængigt af serverkonfiguration.</p>
        </form>
      ) : null}

      {applyResult ? (
        <section style={{ background: '#101f38', border: '1px solid #4c7dc0', borderRadius: 10, padding: 12 }}>
          <h2>Apply resultat</h2>
          <div>
            <strong>Fetch:</strong> {applyResult.fetchOutput || '-'}
          </div>
          <div>
            <strong>Pull:</strong> {applyResult.pullOutput || '-'}
          </div>
          <div>
            <strong>Restart mode:</strong> {applyResult.restartMode}
          </div>
          <div>
            <strong>Restart udført:</strong> {applyResult.restarted ? 'Ja' : 'Nej'}
          </div>
          <pre
            style={{
              background: '#08122a',
              color: '#d8e8ff',
              padding: 12,
              borderRadius: 6,
              overflowX: 'auto',
            }}
          >
            {applyResult.restartOutput}
          </pre>
        </section>
      ) : null}

      <p>{status}</p>
    </div>
  );
}
