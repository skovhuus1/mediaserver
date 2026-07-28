'use client';

import { RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { api, type ApiFailure } from '@/lib/api';
import { t } from '@/lib/messages';

type UpdateStatus = {
  enabled: boolean;
  configured: boolean;
  branch: string;
  localCommit: string | null;
  remoteCommit: string | null;
  hasUpdate: boolean;
  restartMode: string;
  currentBranch: string | null;
  canApply: boolean;
  blockers: string[];
};
type Branches = { selected: string; branches: string[] };

export default function UpdatePage() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);

  async function check() {
    setBusy(true);
    setMessage('');
    try {
      setStatus(await api<UpdateStatus>('/system/update/check', { method: 'POST' }));
    } catch (failure) {
      setMessage((failure as ApiFailure).message ?? 'Opdateringstjek fejlede');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ updated: boolean; restartScheduled: boolean }>('/system/update/apply', { method: 'POST' });
      setMessage(result.updated ? `Opdateret. Genstart ${result.restartScheduled ? 'er planlagt' : 'skal udføres manuelt'}.` : 'Serveren er allerede opdateret.');
      await check();
    } catch (failure) {
      setMessage((failure as ApiFailure).message ?? 'Opdateringen fejlede');
      setBusy(false);
    }
  }

  async function selectBranch(branch: string) {
    setBusy(true);
    setMessage('');
    try {
      setStatus(await api<UpdateStatus>('/system/update/branch', { method: 'POST', body: JSON.stringify({ branch }) }));
    } catch (failure) {
      setMessage((failure as ApiFailure).message ?? 'Branch kunne ikke vælges');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void check();
    void api<Branches>('/system/update/branches').then((result) => setBranches(result.branches)).catch(() => undefined);
  }, []);

  return (
    <AppShell rail={<aside className="rail-card"><ShieldCheck /><h3>Sikker update</h3><p>Kun clean worktree og fast-forward accepteres.</p></aside>}>
      <section className="update-page">
        <span className="eyebrow">SERVER MAINTENANCE</span>
        <h1>{t.updateTitle}</h1>
        <p>Hent ny kode fra den konfigurerede Git-branch og genstart med valgt driftsmetode.</p>
        <div className="update-card">
          <Sparkles size={26} />
          <dl>
            <div><dt>Status</dt><dd>{status?.enabled ? (status.configured ? t.ready : 'Ikke konfigureret') : t.disabled}</dd></div>
            <div><dt>Branch</dt><dd>{status?.branch ?? '...'}</dd></div>
            <div><dt>Kørende checkout</dt><dd>{status?.currentBranch ?? '...'}</dd></div>
            <div><dt>Lokal commit</dt><dd>{status?.localCommit?.slice(0, 12) ?? '...'}</dd></div>
            <div><dt>Remote commit</dt><dd>{status?.remoteCommit?.slice(0, 12) ?? '...'}</dd></div>
            <div><dt>Genstart</dt><dd>{status?.restartMode ?? '...'}</dd></div>
          </dl>
          <strong>{status?.hasUpdate ? 'Ny version fundet' : 'Ingen ventende opdatering'}</strong>
        </div>
        {branches.length > 0 && <label className="branch-picker">Opdateringsbranch<select value={status?.branch ?? ''} disabled={busy} onChange={(event) => void selectBranch(event.target.value)}>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>}
        {status?.blockers.map((blocker) => <div className="form-error" key={blocker}>{blocker}</div>)}
        {message && <div className="update-message">{message}</div>}
        <div className="update-actions">
          <button onClick={() => void check()} disabled={busy}><RefreshCw size={16} />{t.checkUpdate}</button>
          <button className="primary" onClick={() => void apply()} disabled={busy || !status?.hasUpdate || !status?.canApply}><Sparkles size={16} />{t.applyUpdate}</button>
        </div>
      </section>
    </AppShell>
  );
}
