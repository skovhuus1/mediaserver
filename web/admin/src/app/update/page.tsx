'use client';

import {
  Check,
  Circle,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  updateInProgress: boolean;
  transitionMode: 'up-to-date' | 'fast-forward' | 'squash-equivalent' | 'blocked';
  transitionReason: string;
  blockers: string[];
};
type UpdateProgress = {
  runId: string | null;
  state: 'idle' | 'running' | 'completed' | 'failed';
  phase: string;
  percent: number;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  previousCommit: string | null;
  targetCommit: string | null;
  error: string | null;
  logTail?: string[];
};
type Branches = { selected: string; branches: string[] };

const steps = [
  { threshold: 12, label: 'Worktree' },
  { threshold: 20, label: 'Fetch' },
  { threshold: 35, label: 'Validering' },
  { threshold: 48, label: 'Checkout' },
  { threshold: 65, label: 'Docker build' },
  { threshold: 82, label: 'Health checks' },
  { threshold: 94, label: 'Proxy' },
];

export default function UpdatePage() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);

  const loadProgress = useCallback(async () => {
    try {
      const next = await api<UpdateProgress>('/system/update/progress');
      setProgress(next);
      setServerUnavailable(false);
      if (next.state === 'completed' || next.state === 'failed') setBusy(false);
    } catch {
      setProgress((current) => current?.state === 'running'
        ? { ...current, phase: 'restarting', message: 'Serveren genstarter. Venter på at API’et bliver tilgængeligt igen.' }
        : current);
      setServerUnavailable(true);
    }
  }, []);

  async function check() {
    setBusy(true);
    setMessage('');
    try {
      setStatus(await api<UpdateStatus>('/system/update/check', { method: 'POST' }));
    } catch (failure) {
      setMessage(failureMessage(failure, 'Opdateringstjek fejlede'));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setMessage('');
    setProgress({
      runId: null,
      state: 'running',
      phase: 'checking',
      percent: 2,
      message: 'Starter den sikre opdatering...',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      previousCommit: status?.localCommit ?? null,
      targetCommit: status?.remoteCommit ?? null,
      error: null,
    });
    try {
      const result = await api<{ updated: boolean; restartScheduled: boolean; transitionMode: UpdateStatus['transitionMode'] }>('/system/update/apply', { method: 'POST' });
      setMessage(result.updated
        ? `Koden er skiftet via ${transitionLabel(result.transitionMode)}. Følg genstarten nedenfor.`
        : 'Serveren er allerede opdateret.');
      await loadProgress();
      if (!result.restartScheduled) {
        setBusy(false);
        await check();
      }
    } catch (failure) {
      setMessage(failureMessage(failure, 'Opdateringen fejlede'));
      await loadProgress();
      setBusy(false);
    }
  }

  async function selectBranch(branch: string) {
    setBusy(true);
    setMessage('');
    try {
      setStatus(await api<UpdateStatus>('/system/update/branch', { method: 'POST', body: JSON.stringify({ branch }) }));
    } catch (failure) {
      setMessage(failureMessage(failure, 'Branch kunne ikke vælges'));
    } finally {
      setBusy(false);
    }
  }

  async function resetUpdater() {
    setResetting(true);
    setMessage('');
    try {
      const resetProgress = await api<UpdateProgress>('/system/update/reset', {
        method: 'POST',
      });
      setProgress(resetProgress);
      setBusy(false);
      setStatus(await api<UpdateStatus>('/system/update/status'));
      setMessage('Updaterstatus er nulstillet. Du kan nu kontrollere eller installere igen.');
    } catch (failure) {
      setMessage(failureMessage(failure, 'Updateren kunne ikke nulstilles'));
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    void check();
    void loadProgress();
    void api<Branches>('/system/update/branches').then((result) => setBranches(result.branches)).catch(() => undefined);
    const timer = window.setInterval(() => void loadProgress(), 1_500);
    return () => window.clearInterval(timer);
  }, [loadProgress]);

  const updating = busy || progress?.state === 'running' || status?.updateInProgress;
  return (
    <AppShell rail={<aside className="rail-card"><ShieldCheck /><h3>Sikker update</h3><p>Clean worktree samt fast-forward eller eksakt squash-tree accepteres.</p></aside>}>
      <section className="update-page">
        <span className="eyebrow">SERVER MAINTENANCE</span>
        <h1>{t.updateTitle}</h1>
        <p>Hent ny kode fra den konfigurerede Git-branch, og følg hvert trin frem til en healthy server.</p>
        <div className="update-card">
          <Sparkles size={26} />
          <dl>
            <div><dt>Status</dt><dd>{status?.enabled ? (status.configured ? t.ready : 'Ikke konfigureret') : t.disabled}</dd></div>
            <div><dt>Branch</dt><dd>{status?.branch ?? '...'}</dd></div>
            <div><dt>Kørende checkout</dt><dd>{status?.currentBranch ?? '...'}</dd></div>
            <div><dt>Lokal commit</dt><dd>{status?.localCommit?.slice(0, 12) ?? '...'}</dd></div>
            <div><dt>Remote commit</dt><dd>{status?.remoteCommit?.slice(0, 12) ?? '...'}</dd></div>
            <div><dt>Overgang</dt><dd>{status ? transitionLabel(status.transitionMode) : '...'}</dd></div>
            <div><dt>Genstart</dt><dd>{status?.restartMode ?? '...'}</dd></div>
          </dl>
          {status?.transitionReason && <p>{status.transitionReason}</p>}
          <strong>{status?.hasUpdate ? 'Ny version fundet' : 'Ingen ventende opdatering'}</strong>
        </div>

        {progress && progress.state !== 'idle' && (
          <section className={`update-progress ${progress.state}`}>
            <header>
              <div><span>{progressStateLabel(progress.state)}</span><strong>{progress.message}</strong></div>
              <b>{progress.percent}%</b>
            </header>
            <div className="update-progress-track"><i style={{ width: `${progress.percent}%` }} /></div>
            <div className="update-steps">
              {steps.map((step) => {
                const complete = progress.percent >= step.threshold;
                const active = !complete && progress.state === 'running' && step.threshold === steps.find((candidate) => candidate.threshold > progress.percent)?.threshold;
                return (
                  <div className={complete ? 'complete' : active ? 'active' : ''} key={step.label}>
                    {complete ? <Check /> : active ? <LoaderCircle /> : <Circle />}
                    <span>{step.label}</span>
                  </div>
                );
              })}
            </div>
            <footer>
              <span>{serverUnavailable ? 'API genstarter...' : `Fase: ${progress.phase}`}</span>
              {progress.updatedAt && <time>Sidst opdateret {new Date(progress.updatedAt).toLocaleTimeString('da-DK')}</time>}
            </footer>
            {progress.error && <div className="update-progress-error"><CircleAlert />{progress.error}</div>}
            {progress.logTail && progress.logTail.length > 0 && (
              <details className="update-log"><summary>Vis runner-log</summary><pre>{progress.logTail.join('\n')}</pre></details>
            )}
          </section>
        )}

        {branches.length > 0 && <label className="branch-picker">Opdateringsbranch<select value={status?.branch ?? ''} disabled={Boolean(updating)} onChange={(event) => void selectBranch(event.target.value)}>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>}
        {status?.blockers.map((blocker) => <div className="form-error" key={blocker}>{blocker}</div>)}
        {message && <div className="update-message">{message}</div>}
        <div className="update-actions">
          <button onClick={() => void check()} disabled={Boolean(updating)}><RefreshCw size={16} />{t.checkUpdate}</button>
          <button className="primary" onClick={() => void apply()} disabled={Boolean(updating || !status?.hasUpdate || !status?.canApply)}><Sparkles size={16} />{updating ? 'Opdaterer...' : t.applyUpdate}</button>
          {progress && progress.state !== 'idle' && progress.state !== 'completed' && (
            <button
              className="reset"
              onClick={() => void resetUpdater()}
              disabled={resetting}
            >
              <RotateCcw size={16} />
              {resetting ? 'Nulstiller...' : 'Nulstil updater'}
            </button>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function failureMessage(failure: unknown, fallback: string): string {
  const apiFailure = failure as ApiFailure;
  const details = typeof apiFailure.details === 'string'
    ? apiFailure.details.trim()
    : apiFailure.details ? JSON.stringify(apiFailure.details) : '';
  return [apiFailure.message ?? fallback, details].filter(Boolean).join('\n');
}

function transitionLabel(mode: UpdateStatus['transitionMode']): string {
  if (mode === 'fast-forward') return 'fast-forward';
  if (mode === 'squash-equivalent') return 'squash-merge';
  if (mode === 'up-to-date') return 'allerede opdateret';
  return 'blokeret';
}

function progressStateLabel(state: UpdateProgress['state']): string {
  if (state === 'completed') return 'Opdatering gennemført';
  if (state === 'failed') return 'Opdatering fejlede';
  return 'Opdatering i gang';
}
