'use client';

import { AlertTriangle, CheckCircle2, Download, FileArchive, HardDriveDownload, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiBlob, type ApiFailure } from '@/lib/api';
import styles from './backup-manager.module.css';

type Backup = { filename: string; createdAt: string; modifiedAt: string; sizeBytes: number; reason: string; schemaVersion: string; formatVersion: number; cipher: string; restoreCompatible: boolean };
type BackupList = { encrypted: boolean; cipher: string; retention: number; schemaVersion: string; operation: { kind: string; stage: string; startedAt: string } | null; items: Backup[] };
type RestorePlan = { allowed: boolean; blockers: string[]; confirmation: string; expiresAt: string; challengeToken: string | null; backup: Backup };

export function BackupManager() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<BackupList | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const load = useCallback(async () => { try { setData(await api<BackupList>('/system/backups')); } catch (reason) { setError(failure(reason)); } }, []);
  const operationActive = Boolean(data?.operation);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), operationActive || busy ? 1800 : 10000); return () => window.clearInterval(timer); }, [load, operationActive, busy]);
  async function action(name: string, task: () => Promise<void>) { setBusy(name); setMessage(''); setError(''); try { await task(); await load(); } catch (reason) { setError(failure(reason)); } finally { setBusy(''); } }
  async function create() { await action('create', async () => { const item = await api<Backup>('/system/backups', { method: 'POST' }); setMessage(`Krypteret backup oprettet: ${item.filename}`); }); }
  async function download(item: Backup) { await action(`download:${item.filename}`, async () => { const blob = await apiBlob(`/system/backups/${encodeURIComponent(item.filename)}/download`); const href = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = href; anchor.download = item.filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(href), 1000); setMessage(`${item.filename} er hentet.`); }); }
  async function importFile(file: File) { await action('import', async () => { await api('/system/backups/import', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file }); setMessage(`${file.name} er importeret og kryptografisk valideret.`); if (fileInput.current) fileInput.current.value = ''; }); }
  async function remove(item: Backup) { if (!window.confirm(`Slet ${item.filename}? Denne handling kan ikke fortrydes.`)) return; await action(`delete:${item.filename}`, async () => { await api(`/system/backups/${encodeURIComponent(item.filename)}`, { method: 'DELETE' }); setMessage(`${item.filename} er slettet.`); }); }
  async function prepareRestore(item: Backup) { await action(`plan:${item.filename}`, async () => { const next = await api<RestorePlan>(`/system/backups/${encodeURIComponent(item.filename)}/restore-plan`, { method: 'POST' }); setPlan(next); setConfirmation(''); if (!next.allowed) setError(next.blockers.join(' ')); }); }
  async function restore() { if (!plan?.challengeToken) return; await action(`restore:${plan.backup.filename}`, async () => { const result = await api<{ restored: boolean; safetyBackup: string }>(`/system/backups/${encodeURIComponent(plan.backup.filename)}/restore`, { method: 'POST', body: JSON.stringify({ challengeToken: plan.challengeToken, confirmation }) }); setPlan(null); setConfirmation(''); setMessage(`Restore fuldført. Sikkerhedsbackup: ${result.safetyBackup}. Alle gamle sessions er tilbagekaldt.`); }); }

  return <section className={styles.page}>
    <header className={styles.hero}><div><span>DISASTER RECOVERY</span><h1>Krypteret backup</h1><p>Versionsstyrede PostgreSQL-arkiver med autentificeret kryptering og atomisk restore.</p></div><div><button disabled={Boolean(busy || data?.operation)} onClick={() => void create()}><HardDriveDownload />{busy === 'create' ? 'Opretter...' : 'Opret backup'}</button><button className={styles.secondary} disabled={Boolean(busy || data?.operation)} onClick={() => fileInput.current?.click()}><Upload />Importér</button><input accept=".bbbackup,application/vnd.boltbytes.backup" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} ref={fileInput} type="file" /></div></header>
    {data?.operation && <article className={styles.operation}><LoaderCircle /><div><strong>{operationLabel(data.operation.kind)}</strong><span>{data.operation.stage}</span></div><i /></article>}
    {error && <div className={styles.error}><AlertTriangle />{error}</div>}{message && <div className={styles.notice}><CheckCircle2 />{message}</div>}
    <section className={styles.summary}><article><ShieldCheck /><span><small>Kryptering</small><strong>{data?.cipher ?? 'Kontrollerer...'}</strong></span></article><article><FileArchive /><span><small>Backups</small><strong>{data?.items.length ?? 0} / {data?.retention ?? '...'}</strong></span></article><article><RefreshCw /><span><small>Aktivt schema</small><strong>{data?.schemaVersion ?? '...'}</strong></span></article></section>
    <section className={styles.archive}><header><div><span>SERVERARKIV</span><h2>Tilgængelige backups</h2></div><button aria-label="Opdater" onClick={() => void load()}><RefreshCw /></button></header>{!data?.items.length ? <div className={styles.empty}><HardDriveDownload /><strong>Ingen backups endnu</strong><span>Opret den første krypterede sikkerhedskopi.</span></div> : <div className={styles.list}>{data.items.map((item) => <article key={item.filename}><FileArchive /><div><strong>{item.filename}</strong><span>{new Date(item.createdAt).toLocaleString('da-DK')} · {bytes(item.sizeBytes)} · {item.reason === 'pre-restore' ? 'Automatisk før restore' : item.reason === 'manual' ? 'Manuel' : 'Importeret'}</span><small className={item.restoreCompatible ? styles.compatible : styles.incompatible}>{item.restoreCompatible ? 'Restore-kompatibel' : `Kræver schema ${item.schemaVersion}`}</small></div><nav><button title="Download" disabled={Boolean(busy)} onClick={() => void download(item)}><Download /></button><button title="Gendan" disabled={Boolean(busy || !item.restoreCompatible)} onClick={() => void prepareRestore(item)}><RotateCcw /></button><button title="Slet" disabled={Boolean(busy)} onClick={() => void remove(item)}><Trash2 /></button></nav></article>)}</div>}</section>
    {plan && <div className={styles.modalBackdrop}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="restore-title"><AlertTriangle /><span>KRITISK HANDLING</span><h2 id="restore-title">Gendan hele databasen?</h2><p>Der oprettes først en automatisk sikkerhedsbackup. Restore kører i én PostgreSQL-transaktion, tilbagekalder sessions og rydder Redis-cache.</p>{plan.blockers.map((blocker) => <div className={styles.blocker} key={blocker}>{blocker}</div>)}{plan.allowed && <label>Skriv præcis <code>{plan.confirmation}</code><input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}<footer><button className={styles.secondary} disabled={Boolean(busy)} onClick={() => setPlan(null)}>Annuller</button><button className={styles.danger} disabled={!plan.allowed || confirmation !== plan.confirmation || Boolean(busy)} onClick={() => void restore()}>{busy.startsWith('restore:') ? 'Gendanner...' : 'Gendan database'}</button></footer></section></div>}
  </section>;
}

function failure(reason: unknown) { return (reason as ApiFailure)?.message ?? 'Backuphandlingen mislykkedes.'; }
function bytes(value: number) { if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`; return `${(value / 1024 ** 3).toFixed(2)} GB`; }
function operationLabel(kind: string) { return kind === 'restore' ? 'Database restore' : kind === 'import' ? 'Validerer import' : kind === 'delete' ? 'Sletter backup' : 'Opretter backup'; }
