'use client';

import { Activity, AlertTriangle, CheckCircle2, Cloud, Database, HardDrive, HeartPulse, MemoryStick, RadioTower, RefreshCw, ShieldCheck, Wrench, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import styles from './diagnostics-center.module.css';

type State = 'ok' | 'warning' | 'error';
type Check = { id: string; group: string; label: string; state: State; summary: string; details?: Record<string, string | number | boolean | null>; latencyMs?: number | null };
type Diagnostics = { state: State; counts: Record<State, number>; checks: Check[]; sampledAt: string; runtime: { cpuCount: number; loadAverage: number[]; loadPerCpu: number; memoryUsedBytes: number; memoryTotalBytes: number; memoryPercent: number; uptimeSeconds: number } };

const groupIcons: Record<string, ReactNode> = { 'Kernetjenester': <Database />, 'Workers og kø': <RadioTower />, Playback: <Activity />, Storage: <HardDrive />, 'Netværk og sikkerhed': <ShieldCheck />, Opdatering: <Wrench /> };

export function DiagnosticsCenter() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await api<Diagnostics>('/system/diagnostics')); setError(''); }
    catch (failure) { setError((failure as ApiFailure)?.message ?? 'Diagnostikken kunne ikke hentes.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const groups = useMemo(() => [...new Set((data?.checks ?? []).map((check) => check.group))], [data]);

  return <section className={styles.page}>
    <header className={styles.hero} data-state={data?.state ?? 'warning'}><div><span>SYSTEMDIAGNOSTIK</span><h1>Hele serveren. Ét helhedsbillede.</h1><p>Aktive kontroller af services, mounts, workers, playback, sikkerhed og opdatering.</p></div><div className={styles.overall}>{stateIcon(data?.state)}<span>{stateLabel(data?.state)}</span><strong>{data ? `${data.counts.ok} af ${data.checks.length} grønne` : 'Måler...'}</strong></div></header>
    <section className={styles.metrics}><Metric icon={<CheckCircle2 />} label="Klar" value={data?.counts.ok ?? 0} state="ok" /><Metric icon={<AlertTriangle />} label="Advarsler" value={data?.counts.warning ?? 0} state="warning" /><Metric icon={<XCircle />} label="Fejl" value={data?.counts.error ?? 0} state="error" /><Metric icon={<MemoryStick />} label="RAM" value={data ? `${data.runtime.memoryPercent.toFixed(0)}%` : '...'} state={data && data.runtime.memoryPercent >= 85 ? 'warning' : 'ok'} /></section>
    {error && <p className={styles.error}><AlertTriangle />{error}</p>}
    <div className={styles.toolbar}><span>{data ? `Målt ${new Date(data.sampledAt).toLocaleString('da-DK')} · oppetid ${duration(data.runtime.uptimeSeconds)}` : 'Forbinder til serveren...'}</span><button disabled={loading} onClick={() => { setLoading(true); void load(); }}><RefreshCw className={loading ? styles.spin : ''} />{loading ? 'Måler...' : 'Kør igen'}</button></div>
    <div className={styles.groups}>{groups.map((group) => <section className={styles.group} key={group}><header>{groupIcons[group] ?? <HeartPulse />}<h2>{group}</h2><span>{data?.checks.filter((check) => check.group === group && check.state === 'ok').length}/{data?.checks.filter((check) => check.group === group).length}</span></header><div>{data?.checks.filter((check) => check.group === group).map((check) => <CheckCard check={check} key={check.id} />)}</div></section>)}</div>
    <footer className={styles.note}><Cloud /><span>Diagnostikken læser kun konfiguration og runtime-state. Den ændrer ikke mounts, jobs, streams eller Git-worktree.</span></footer>
  </section>;
}

function CheckCard({ check }: { check: Check }) { return <article className={styles.check} data-state={check.state}><span className={styles.checkIcon}>{stateIcon(check.state)}</span><div><header><strong>{check.label}</strong>{check.latencyMs !== undefined && check.latencyMs !== null && <em>{check.latencyMs.toFixed(1)} ms</em>}</header><p>{check.summary}</p>{check.details && <dl>{Object.entries(check.details).filter(([, value]) => value !== null).map(([key, value]) => <div key={key}><dt>{detailLabel(key)}</dt><dd>{detailValue(key, value!)}</dd></div>)}</dl>}</div></article>; }
function Metric({ icon, label, value, state }: { icon: ReactNode; label: string; value: string | number; state: State }) { return <article data-state={state}>{icon}<span>{label}</span><strong>{value}</strong></article>; }
function stateIcon(state?: State) { return state === 'ok' ? <CheckCircle2 /> : state === 'error' ? <XCircle /> : <AlertTriangle />; }
function stateLabel(state?: State) { return state === 'ok' ? 'Alle systemer klar' : state === 'error' ? 'Kritiske fejl fundet' : 'Kræver opmærksomhed'; }
function duration(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); return days ? `${days}d ${hours}t` : `${hours}t ${Math.floor((seconds % 3600) / 60)}m`; }
function detailLabel(key: string) { return ({ workerId: 'Worker', lastHeartbeatAt: 'Heartbeat', updatedAt: 'Opdateret', path: 'Sti', freeBytes: 'Ledig plads', totalBytes: 'Kapacitet', memoryUsedBytes: 'Brugt RAM', memoryTotalBytes: 'RAM i alt', effectivePublicUrl: 'Public URL', restartMode: 'Genstart', progressState: 'Updater-status', progressPhase: 'Updater-fase', oldestQueuedAgeSeconds: 'Ældste ventetid' } as Record<string, string>)[key] ?? key.replace(/([A-Z])/g, ' $1'); }
function detailValue(key: string, value: string | number | boolean) { if (/Bytes$/.test(key) && typeof value === 'number') return formatBytes(value); if (/At$/.test(key) && typeof value === 'string') return new Date(value).toLocaleString('da-DK'); if (key.endsWith('Seconds') && typeof value === 'number') return `${value} sek.`; if (typeof value === 'boolean') return value ? 'Ja' : 'Nej'; return String(value); }
function formatBytes(value: number) { return value >= 1024 ** 4 ? `${(value / 1024 ** 4).toFixed(1)} TB` : `${(value / 1024 ** 3).toFixed(1)} GB`; }
