'use client';

import { Activity, AlertTriangle, BellRing, CheckCircle2, Cloud, Database, Download, HardDrive, HeartPulse, MemoryStick, RadioTower, RefreshCw, ShieldCheck, Wrench, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import styles from './diagnostics-center.module.css';

type State = 'ok' | 'warning' | 'error';
type Check = { id: string; group: string; label: string; state: State; summary: string; details?: Record<string, string | number | boolean | null>; latencyMs?: number | null };
type Diagnostics = { state: State; counts: Record<State, number>; checks: Check[]; sampledAt: string; runtime: { cpuCount: number; loadAverage: number[]; loadPerCpu: number; memoryUsedBytes: number; memoryTotalBytes: number; memoryPercent: number; uptimeSeconds: number } };
type MetricPoint = { sampledAt: string; cpuPercent: number; memoryPercent: number; diskUsedPercent: number; activeSessions: number; bufferingSessions: number; queuedJobs: number; failedAttempts1h: number };
type Telemetry = { range: string; from: string; to: string; points: MetricPoint[] };
type Alert = { id: string; key: string; severity: 'warning' | 'error'; status: 'open' | 'acknowledged' | 'resolved'; title: string; message: string; firstSeenAt: string; lastSeenAt: string };

const groupIcons: Record<string, ReactNode> = { 'Kernetjenester': <Database />, 'Workers og kø': <RadioTower />, Playback: <Activity />, Storage: <HardDrive />, 'Netværk og sikkerhed': <ShieldCheck />, Opdatering: <Wrench /> };

export function DiagnosticsCenter() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('24h');
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const load = useCallback(async () => {
    try {
      const [diagnostics, history, currentAlerts] = await Promise.all([
        api<Diagnostics>('/system/diagnostics'), api<Telemetry>(`/system/telemetry?range=${range}`), api<Alert[]>('/system/alerts'),
      ]);
      setData(diagnostics); setTelemetry(history); setAlerts(currentAlerts); setError('');
    }
    catch (failure) { setError((failure as ApiFailure)?.message ?? 'Diagnostikken kunne ikke hentes.'); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const groups = useMemo(() => [...new Set((data?.checks ?? []).map((check) => check.group))], [data]);
  const activeAlerts = alerts.filter((alert) => alert.status !== 'resolved');
  const acknowledge = async (id: string) => { await api(`/system/alerts/${id}/acknowledge`, { method: 'PATCH' }); await load(); };
  const exportDiagnostics = async () => { const payload = await api<unknown>('/system/diagnostics/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `boltbytes-diagnostics-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); };

  return <section className={styles.page}>
    <header className={styles.hero} data-state={data?.state ?? 'warning'}><div><span>SYSTEMDIAGNOSTIK</span><h1>Hele serveren. Ét helhedsbillede.</h1><p>Aktive kontroller af services, mounts, workers, playback, sikkerhed og opdatering.</p></div><div className={styles.overall}>{stateIcon(data?.state)}<span>{stateLabel(data?.state)}</span><strong>{data ? `${data.counts.ok} af ${data.checks.length} grønne` : 'Måler...'}</strong></div></header>
    <section className={styles.metrics}><Metric icon={<CheckCircle2 />} label="Klar" value={data?.counts.ok ?? 0} state="ok" /><Metric icon={<AlertTriangle />} label="Advarsler" value={data?.counts.warning ?? 0} state="warning" /><Metric icon={<XCircle />} label="Fejl" value={data?.counts.error ?? 0} state="error" /><Metric icon={<MemoryStick />} label="RAM" value={data ? `${data.runtime.memoryPercent.toFixed(0)}%` : '...'} state={data && data.runtime.memoryPercent >= 85 ? 'warning' : 'ok'} /></section>
    {error && <p className={styles.error}><AlertTriangle />{error}</p>}
    <div className={styles.toolbar}><span>{data ? `Målt ${new Date(data.sampledAt).toLocaleString('da-DK')} · oppetid ${duration(data.runtime.uptimeSeconds)}` : 'Forbinder til serveren...'}</span><button onClick={() => void exportDiagnostics()}><Download />Eksportér diagnostik</button><button disabled={loading} onClick={() => { setLoading(true); void load(); }}><RefreshCw className={loading ? styles.spin : ''} />{loading ? 'Måler...' : 'Kør igen'}</button></div>
    <section className={styles.history}><header><div><span>HISTORISK DRIFT</span><h2>Belastning og playback</h2></div><nav aria-label="Tidsinterval">{['1h', '6h', '24h', '7d', '30d'].map((value) => <button aria-pressed={range === value} key={value} onClick={() => setRange(value)}>{value}</button>)}</nav></header><div className={styles.charts}><TelemetryChart color="#54cfee" label="CPU" points={telemetry?.points ?? []} value={(point) => point.cpuPercent} suffix="%" /><TelemetryChart color="#e6b45f" label="RAM" points={telemetry?.points ?? []} value={(point) => point.memoryPercent} suffix="%" /><TelemetryChart color="#74d5aa" label="Aktive streams" points={telemetry?.points ?? []} value={(point) => point.activeSessions} /></div></section>
    <section className={styles.alerts}><header><BellRing /><div><span>DRIFTSALARMER</span><h2>{activeAlerts.length ? `${activeAlerts.length} kræver opmærksomhed` : 'Ingen aktive alarmer'}</h2></div></header>{activeAlerts.length ? <div>{activeAlerts.map((alert) => <article data-severity={alert.severity} key={alert.id}><span>{alert.severity === 'error' ? <XCircle /> : <AlertTriangle />}</span><div><strong>{alert.title}</strong><p>{alert.message}</p><small>Senest set {new Date(alert.lastSeenAt).toLocaleString('da-DK')}</small></div>{alert.status === 'open' && <button onClick={() => void acknowledge(alert.id)}>Kvittér</button>}</article>)}</div> : <p>CPU, RAM, disk, buffering og jobkø er inden for de definerede grænser.</p>}</section>
    <div className={styles.groups}>{groups.map((group) => <section className={styles.group} key={group}><header>{groupIcons[group] ?? <HeartPulse />}<h2>{group}</h2><span>{data?.checks.filter((check) => check.group === group && check.state === 'ok').length}/{data?.checks.filter((check) => check.group === group).length}</span></header><div>{data?.checks.filter((check) => check.group === group).map((check) => <CheckCard check={check} key={check.id} />)}</div></section>)}</div>
    <footer className={styles.note}><Cloud /><span>Diagnostikken læser kun konfiguration og runtime-state. Den ændrer ikke mounts, jobs, streams eller Git-worktree.</span></footer>
  </section>;
}

function CheckCard({ check }: { check: Check }) { return <article className={styles.check} data-state={check.state}><span className={styles.checkIcon}>{stateIcon(check.state)}</span><div><header><strong>{check.label}</strong>{check.latencyMs !== undefined && check.latencyMs !== null && <em>{check.latencyMs.toFixed(1)} ms</em>}</header><p>{check.summary}</p>{check.details && <dl>{Object.entries(check.details).filter(([, value]) => value !== null).map(([key, value]) => <div key={key}><dt>{detailLabel(key)}</dt><dd>{detailValue(key, value!)}</dd></div>)}</dl>}</div></article>; }
function Metric({ icon, label, value, state }: { icon: ReactNode; label: string; value: string | number; state: State }) { return <article data-state={state}>{icon}<span>{label}</span><strong>{value}</strong></article>; }
function TelemetryChart({ color, label, points, value, suffix = '' }: { color: string; label: string; points: MetricPoint[]; value: (point: MetricPoint) => number; suffix?: string }) { const values = points.map(value); const maximum = Math.max(1, ...values); const polyline = values.map((entry, index) => `${values.length <= 1 ? 0 : (index / (values.length - 1)) * 100},${36 - (entry / maximum) * 32}`).join(' '); const latest = values.at(-1) ?? 0; const gradientId = `chart-${label.replaceAll(' ', '-')}`; return <article><header><span>{label}</span><strong>{latest.toFixed(label === 'Aktive streams' ? 0 : 1)}{suffix}</strong></header><svg aria-label={`${label} historik`} preserveAspectRatio="none" role="img" viewBox="0 0 100 40"><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>{polyline && <><polygon fill={`url(#${gradientId})`} points={`0,40 ${polyline} 100,40`} /><polyline fill="none" points={polyline} stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></>}</svg><small>{points.length ? `${points.length} målepunkter` : 'Afventer første måling'}</small></article>; }
function stateIcon(state?: State) { return state === 'ok' ? <CheckCircle2 /> : state === 'error' ? <XCircle /> : <AlertTriangle />; }
function stateLabel(state?: State) { return state === 'ok' ? 'Alle systemer klar' : state === 'error' ? 'Kritiske fejl fundet' : 'Kræver opmærksomhed'; }
function duration(seconds: number) { const days = Math.floor(seconds / 86400); const hours = Math.floor((seconds % 86400) / 3600); return days ? `${days}d ${hours}t` : `${hours}t ${Math.floor((seconds % 3600) / 60)}m`; }
function detailLabel(key: string) { return ({ workerId: 'Worker', lastHeartbeatAt: 'Heartbeat', updatedAt: 'Opdateret', path: 'Sti', freeBytes: 'Ledig plads', totalBytes: 'Kapacitet', memoryUsedBytes: 'Brugt RAM', memoryTotalBytes: 'RAM i alt', effectivePublicUrl: 'Public URL', restartMode: 'Genstart', progressState: 'Updater-status', progressPhase: 'Updater-fase', oldestQueuedAgeSeconds: 'Ældste ventetid' } as Record<string, string>)[key] ?? key.replace(/([A-Z])/g, ' $1'); }
function detailValue(key: string, value: string | number | boolean) { if (/Bytes$/.test(key) && typeof value === 'number') return formatBytes(value); if (/At$/.test(key) && typeof value === 'string') return new Date(value).toLocaleString('da-DK'); if (key.endsWith('Seconds') && typeof value === 'number') return `${value} sek.`; if (typeof value === 'boolean') return value ? 'Ja' : 'Nej'; return String(value); }
function formatBytes(value: number) { return value >= 1024 ** 4 ? `${(value / 1024 ** 4).toFixed(1)} TB` : `${(value / 1024 ** 3).toFixed(1)} GB`; }
