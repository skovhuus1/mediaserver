'use client';

import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, Film, LoaderCircle, PlayCircle, RefreshCw, ScanLine, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import styles from './operations-center.module.css';

type Library = { id: string; name: string; type: string };
type Task = { id: string; type: string; status: string; target: string; attemptCount: number; maxAttempts: number; error: string | null; createdAt: string; updatedAt: string; startedAt: string | null; finishedAt: string | null; progress: { stage: string; percent: number | null; current: number | null; total: number | null; message: string | null } };
type TaskFeed = { summary: { total: number; queued: number; running: number; completed: number; failed: number }; items: Task[]; sampledAt: string };

export function OperationsCenter() {
  const [feed, setFeed] = useState<TaskFeed | null>(null);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [libraryId, setLibraryId] = useState('');
  const [metadataScope, setMetadataScope] = useState<'all' | 'movie' | 'series'>('all');
  const [analysisScope, setAnalysisScope] = useState<'all' | 'movie' | 'series'>('all');
  const [analysisMode, setAnalysisMode] = useState<'missing' | 'all'>('missing');
  const [filter, setFilter] = useState<'active' | 'all' | 'failed' | 'completed'>('active');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [canWrite, setCanWrite] = useState(false);

  const load = useCallback(async () => {
    const [nextFeed, nextLibraries] = await Promise.all([api<TaskFeed>('/system/jobs'), api<Library[]>('/libraries')]);
    setFeed(nextFeed); setLibraries(nextLibraries); setLibraryId((current) => current || nextLibraries[0]?.id || '');
  }, []);
  useEffect(() => {
    void api<SessionUser>('/auth/me').then((user) => setCanWrite(user.roles.includes('admin'))).catch(() => undefined);
    void load().catch((error) => setMessage(errorMessage(error)));
    const timer = window.setInterval(() => void load().catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const visible = useMemo(() => (feed?.items ?? []).filter((task) => filter === 'active' ? ['queued', 'running'].includes(task.status) : filter === 'all' ? true : task.status === filter), [feed, filter]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(null); }
  }

  return <section className={styles.page}>
    <header className={styles.hero}><div><span>DRIFTSCENTER</span><h1>Opgaver</h1><p>Start, følg og fejlfind serverens tunge biblioteksarbejde fra ét sted.</p></div><div className={styles.live}><Activity size={16} /><span>Live</span><strong>{feed?.summary.running ?? 0} aktive</strong></div></header>
    <div className={styles.summary}><Metric icon={<LoaderCircle />} label="Kører" value={feed?.summary.running ?? 0} tone="active" /><Metric icon={<Clock3 />} label="I kø" value={feed?.summary.queued ?? 0} tone="queued" /><Metric icon={<CheckCircle2 />} label="Fuldført" value={feed?.summary.completed ?? 0} tone="done" /><Metric icon={<AlertTriangle />} label="Fejlet" value={feed?.summary.failed ?? 0} tone="failed" /></div>
    <section className={styles.launchpad}><header><div><span>START NY OPGAVE</span><h2>Vedligehold biblioteket</h2></div><small>Opgaver kører i worker-køen og fortsætter, hvis du forlader siden.</small></header><div className={styles.actions}>
      <article><ScanLine /><div><strong>Scan bibliotek</strong><p>Find nye, ændrede og manglende filer.</p></div><select value={libraryId} onChange={(event) => setLibraryId(event.target.value)}>{libraries.map((library) => <option value={library.id} key={library.id}>{library.name}</option>)}</select><button disabled={!canWrite || !libraryId || busy !== null} onClick={() => void run('scan', () => api(`/libraries/${libraryId}/scans`, { method: 'POST' }), 'Biblioteksscanningen er sat i kø.')}>{busy === 'scan' ? 'Starter...' : 'Start scan'}</button></article>
      <article><Sparkles /><div><strong>Hent metadata</strong><p>Opdater plakater, beskrivelser, credits og genrer.</p></div><select value={metadataScope} onChange={(event) => setMetadataScope(event.target.value as typeof metadataScope)}><option value="all">Alle medier</option><option value="movie">Kun film</option><option value="series">Kun serier</option></select><button disabled={!canWrite || busy !== null} onClick={() => void run('metadata', () => api('/media/metadata/jobs', { method: 'POST', body: JSON.stringify({ mediaType: metadataScope }) }), 'Metadataopdateringen er sat i kø.')}>{busy === 'metadata' ? 'Starter...' : 'Hent metadata'}</button></article>
      <article><Film /><div><strong>Playback-analyse</strong><p>Byg seek-preview og find intro, recap og rulletekst.</p></div><div className={styles.doubleSelect}><select value={analysisScope} onChange={(event) => setAnalysisScope(event.target.value as typeof analysisScope)}><option value="all">Film og serier</option><option value="movie">Kun film</option><option value="series">Kun serier</option></select><select value={analysisMode} onChange={(event) => setAnalysisMode(event.target.value as typeof analysisMode)}><option value="missing">Kun manglende</option><option value="all">Genopbyg alle</option></select></div><button disabled={!canWrite || busy !== null} onClick={() => void run('analysis', () => api('/media/playback-assets/jobs', { method: 'POST', body: JSON.stringify({ mediaType: analysisScope, mode: analysisMode }) }), 'Playback-analyserne er sat i kø.')}>{busy === 'analysis' ? 'Starter...' : 'Start analyse'}</button></article>
    </div>{!canWrite && <p className={styles.readOnly}>Operatorer kan følge opgaver, men kun administratorer kan starte dem.</p>}{message && <p className={styles.message}>{message}</p>}</section>
    <section className={styles.queue}><header><div><span>WORKER-LEDGER</span><h2>Aktivitet og historik</h2></div><div className={styles.filters}>{(['active', 'all', 'failed', 'completed'] as const).map((value) => <button className={filter === value ? styles.activeFilter : ''} onClick={() => setFilter(value)} key={value}>{value === 'active' ? 'Aktive' : value === 'all' ? 'Alle' : value === 'failed' ? 'Fejlede' : 'Fuldførte'}</button>)}<button aria-label="Opdater" onClick={() => void load()}><RefreshCw size={14} /></button></div></header>{!visible.length ? <div className={styles.empty}><Database size={28} /><strong>Ingen opgaver i denne visning</strong><span>Start en opgave ovenfor, eller skift filter.</span></div> : <div className={styles.taskList}>{visible.map((task) => <TaskRow task={task} key={task.id} />)}</div>}<footer><span>Senest synkroniseret {feed ? new Date(feed.sampledAt).toLocaleTimeString('da-DK') : '...'}</span><Link href="/?admin=playback-analysis"><PlayCircle size={15} />Åbn playback-analyse</Link></footer></section>
  </section>;
}

function TaskRow({ task }: { task: Task }) { const percent = task.progress.percent; return <article className={styles.task} data-status={task.status}><span className={styles.taskIcon}>{task.status === 'running' ? <LoaderCircle /> : task.status === 'completed' ? <CheckCircle2 /> : task.status === 'failed' ? <AlertTriangle /> : <Clock3 />}</span><div className={styles.taskBody}><header><div><strong>{taskLabel(task.type)}</strong><span>{task.target}</span></div><em>{statusLabel(task.status)}</em></header><div className={percent === null && task.status === 'running' ? styles.indeterminate : styles.progress}><i style={percent === null ? undefined : { width: `${percent}%` }} /></div><footer><span>{task.progress.stage}{task.progress.message ? ` · ${task.progress.message}` : ''}</span><span>{percent === null ? task.status === 'running' ? 'Arbejder...' : '' : `${percent}%`} · forsøg {task.attemptCount}/{task.maxAttempts} · {relativeTime(task.updatedAt)}</span></footer>{task.error && <p>{task.error}</p>}</div></article>; }
function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) { return <article className={styles.metric} data-tone={tone}>{icon}<span>{label}</span><strong>{value}</strong></article>; }
function taskLabel(type: string) { return ({ 'library.scan': 'Biblioteksscan', 'media.metadata': 'Metadata', 'media.playback-assets': 'Playback-analyse', 'playback.transcode': 'Transcoding', 'offline.prepare': 'Offline-klargøring', 'push.deliver': 'Push-notifikation' } as Record<string, string>)[type] ?? type; }
function statusLabel(status: string) { return ({ queued: 'I kø', running: 'Kører', completed: 'Fuldført', failed: 'Fejlet' } as Record<string, string>)[status] ?? status; }
function relativeTime(value: string) { const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000)); return seconds < 60 ? `${seconds} sek. siden` : seconds < 3600 ? `${Math.floor(seconds / 60)} min. siden` : new Date(value).toLocaleString('da-DK'); }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message || 'Opgaven kunne ikke startes.'; }
