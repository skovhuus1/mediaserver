'use client';

import { AlertTriangle, Check, Clock3, Eye, Film, Layers3, ListChecks, PlayCircle, RefreshCw, RotateCcw, Search, Sparkles, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import styles from './playback-analysis.module.css';

type Marker = { kind: 'intro' | 'recap' | 'credits'; startMs: number; endMs: number; source: string; confidence: number | null };
type IntroAnalysis = { state: 'detected' | 'pending' | 'not-detected'; reason: 'detected' | 'chapter_marker' | 'insufficient_references' | 'low_information' | 'no_repeated_sequence'; referenceCount: number; supportCount: number; usableFrameRatio: number; confidence: number | null };
type MarkerAnalysis = { intro: IntroAnalysis | null; recap: IntroAnalysis | null };
type AnalysisRow = { id: string; title: string; episodeTitle: string | null; type: string; seasonNumber: number | null; episodeNumber: number | null; libraryName: string; fileStatus: string; durationMs: number | null; status: string; markers: Marker[]; introAnalysis: IntroAnalysis | null; markerAnalysis?: MarkerAnalysis; updatedAt: string; asset: { status: string; frameCount: number; sheetCount: number; durationMs: number | null; generatedAt: string | null; error: string | null } | null };
type AnalysisPage = { items: AnalysisRow[]; total: number; page: number; take: number };
type AnalysisDetail = AnalysisRow & { file: { status: string; durationMs: number | null; width: number | null; height: number | null; videoCodec: string | null; audioCodec: string | null; container: string | null; bitrate: number | null } | null; asset: (AnalysisRow['asset'] & { intervalSeconds: number; tileWidth: number; tileHeight: number; columns: number; rows: number; manifest: unknown; updatedAt: string }) | null; latestJob: { id: string; status: string; attemptCount: number; maxAttempts: number; updatedAt: string; attempts: Array<{ number: number; status: string; error: string | null }> } | null; previewDataUrl: string | null };
type MarkerDraft = Record<Marker['kind'], { enabled: boolean; start: string; end: string }>;
type BulkAction = 'rebuild' | 'reset';
type BulkResult = { requested: number; queued: number; deduplicated: number; skipped: number; failed: Array<{ mediaId: string; title: string | null; reason: string }> };
const emptyDraft = (): MarkerDraft => ({ intro: { enabled: false, start: '00:00', end: '00:00' }, recap: { enabled: false, start: '00:00', end: '00:00' }, credits: { enabled: false, start: '00:00', end: '00:00' } });

export function PlaybackAnalysis() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState<AnalysisPage>({ items: [], total: 0, page: 1, take: 100 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>('rebuild');
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [draft, setDraft] = useState<MarkerDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [canWrite, setCanWrite] = useState(false);

  const loadRows = useCallback(async () => {
    const params = new URLSearchParams({ status, page: '1', take: '100' });
    if (query.trim()) params.set('q', query.trim());
    const result = await api<AnalysisPage>(`/playback-analysis?${params}`);
    setPage(result);
    setSelectedIds((current) => {
      const visible = new Set(result.items.map((item) => item.id));
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
    setSelectedId((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null);
  }, [query, status]);
  const loadDetail = useCallback(async (id: string) => {
    const result = await api<AnalysisDetail>(`/playback-analysis/${id}`);
    setDetail(result);
    const next = emptyDraft();
    result.markers.forEach((marker) => { if (marker.kind in next) next[marker.kind] = { enabled: true, start: formatTime(marker.startMs), end: formatTime(marker.endMs) }; });
    setDraft(next);
  }, []);
  useEffect(() => { void api<SessionUser>('/auth/me').then((user) => setCanWrite(user.roles.includes('admin'))).catch(() => undefined); }, []);
  useEffect(() => { setLoading(true); const timer = window.setTimeout(() => void loadRows().catch((error) => setMessage(errorMessage(error))).finally(() => setLoading(false)), 220); return () => window.clearTimeout(timer); }, [loadRows]);
  useEffect(() => { if (!selectedId) { setDetail(null); return; } void loadDetail(selectedId).catch((error) => setMessage(errorMessage(error))); }, [selectedId, loadDetail]);
  const counts = useMemo(() => page.items.reduce((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {} as Record<string, number>), [page.items]);
  const selectedItems = useMemo(() => page.items.filter((item) => selectedIds.has(item.id)), [page.items, selectedIds]);
  const selectedCount = selectedItems.length;
  const allVisibleSelected = page.items.length > 0 && page.items.every((item) => selectedIds.has(item.id));
  const hasActiveWork = useMemo(() => page.items.some((item) => ['queued', 'generating'].includes(item.status)) || ['queued', 'running', 'processing', 'retrying'].includes(detail?.latestJob?.status ?? ''), [page.items, detail]);
  useEffect(() => { if (!hasActiveWork) return; const timer = window.setInterval(() => { void loadRows(); if (selectedId) void loadDetail(selectedId); }, 3_000); return () => window.clearInterval(timer); }, [hasActiveWork, loadRows, loadDetail, selectedId]);

  async function perform(action: () => Promise<void>) { setBusy(true); setMessage(''); try { await action(); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); } }
  async function rebuild() { if (!selectedId) return; await perform(async () => { await api(`/playback-analysis/${selectedId}/rebuild`, { method: 'POST' }); setMessage('Analysen er sat i kø.'); await Promise.all([loadRows(), loadDetail(selectedId)]); }); }
  async function rebuildMissing() { setBatchBusy(true); setMessage(''); try { const result = await api<{ queued: number; skipped: number }>('/media/playback-assets/jobs', { method: 'POST', body: JSON.stringify({ mode: 'missing', mediaType: 'all' }) }); setMessage(`${result.queued} analyser sat i kø · ${result.skipped} allerede klar eller aktive.`); await loadRows(); } catch (error) { setMessage(errorMessage(error)); } finally { setBatchBusy(false); } }
  function toggleSelection(id: string, checked: boolean) { setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; }); }
  function toggleVisibleSelection() { setSelectedIds((current) => { const next = new Set(current); if (allVisibleSelected) page.items.forEach((item) => next.delete(item.id)); else page.items.forEach((item) => next.add(item.id)); return next; }); }
  async function runBulkAction() {
    if (!selectedCount) return;
    if (bulkAction === 'reset' && !window.confirm(`Nulstil manuelle markører og genanalyser ${selectedCount} valgte titler?`)) return;
    setBatchBusy(true);
    setMessage('');
    try {
      const result = await api<BulkResult>('/playback-analysis/bulk', { method: 'POST', body: JSON.stringify({ action: bulkAction, mediaIds: selectedItems.map((item) => item.id) }) });
      const skipped = result.skipped ? ` · ${result.skipped} sprunget over` : '';
      const deduplicated = result.deduplicated ? ` · ${result.deduplicated} allerede i kø` : '';
      const firstFailure = result.failed[0] ? ` · Første fejl: ${result.failed[0].title ?? result.failed[0].mediaId}: ${result.failed[0].reason}` : '';
      setMessage(bulkAction === 'rebuild' ? `${result.queued} analyser sat i kø${deduplicated}${skipped}${firstFailure}.` : `${result.queued} titler nulstillet og sat til genanalyse${deduplicated}${skipped}${firstFailure}.`);
      setSelectedIds(new Set());
      await loadRows();
      if (selectedId) await loadDetail(selectedId);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBatchBusy(false);
    }
  }
  async function saveMarkers(event: FormEvent) { event.preventDefault(); if (!selectedId) return; const markers = (Object.entries(draft) as Array<[Marker['kind'], MarkerDraft[Marker['kind']]]>).flatMap(([kind, value]) => value.enabled ? [{ kind, startMs: parseTime(value.start), endMs: parseTime(value.end) }] : []); await perform(async () => { const result = await api<AnalysisDetail>(`/playback-analysis/${selectedId}/markers`, { method: 'PUT', body: JSON.stringify({ markers }) }); setDetail(result); setMessage('De manuelle markører er gemt.'); await loadRows(); }); }
  async function resetMarkers() { if (!selectedId || !window.confirm('Fjern manuelle markører og kør automatisk analyse igen?')) return; await perform(async () => { await api(`/playback-analysis/${selectedId}/markers`, { method: 'DELETE' }); setMessage('Markørerne er nulstillet, og analysen er sat i kø.'); await Promise.all([loadRows(), loadDetail(selectedId)]); }); }

  return <section className={styles.page}>
    <header className={styles.hero}><div><span>PLAYBACK LAB</span><h1>Playback-analyse</h1><p>Seek-preview, intro, recap og rulletekst samlet i en kontrolleret pipeline.</p></div><div className={styles.heroActions}><Link href="/?admin=tasks"><Layers3 size={16} />Se opgavekø</Link><button disabled={!canWrite || batchBusy} onClick={() => void rebuildMissing()}><WandSparkles size={16} />{batchBusy ? 'Sætter i kø...' : 'Analysér manglende'}</button></div></header>
    <div className={styles.overview}><Summary label="Titler" value={page.total} /><Summary label="Klar" value={counts.ready ?? 0} tone="ready" /><Summary label="Arbejder" value={(counts.queued ?? 0) + (counts.generating ?? 0)} tone="working" /><Summary label="Kræver handling" value={(counts.failed ?? 0) + (counts.missing ?? 0)} tone="failed" /></div>
    <div className={styles.toolbar}><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg titel, serie eller episode" /></label><div>{['all', 'missing', 'queued', 'generating', 'ready', 'failed'].map((value) => <button className={status === value ? styles.activeFilter : ''} onClick={() => setStatus(value)} key={value}>{statusLabel(value)}</button>)}</div></div>
    <div className={styles.bulkBar} data-active={selectedCount > 0}><button type="button" onClick={toggleVisibleSelection} disabled={!page.items.length}><ListChecks size={16} />{allVisibleSelected ? 'Fjern markering på viste' : 'Markér alle viste'}</button><strong>{selectedCount ? `${selectedCount} valgt` : 'Ingen markeret'}</strong><select value={bulkAction} onChange={(event) => setBulkAction(event.target.value as BulkAction)} disabled={!selectedCount || batchBusy}><option value="rebuild">Genopbyg analyse</option><option value="reset">Nulstil markører + genanalyser</option></select><button type="button" disabled={!canWrite || !selectedCount || batchBusy} onClick={() => void runBulkAction()}><Check size={16} />{batchBusy ? 'Kører...' : 'Kør action'}</button>{selectedCount > 0 && <button className={styles.secondaryBulk} type="button" onClick={() => setSelectedIds(new Set())} disabled={batchBusy}>Ryd valg</button>}</div>
    {message && <p className={styles.message}>{message}</p>}
    <div className={styles.workspace}>
      <section className={styles.master} aria-busy={loading}><header><strong>Medier</strong><span>{page.items.length} vist</span></header><div>{!page.items.length && <Empty icon={<Film />} title="Ingen titler matcher" text="Skift søgning eller statusfilter." />}{page.items.map((item) => { const checked = selectedIds.has(item.id); const active = selectedId === item.id; return <div className={`${active ? styles.selectedRow : styles.row} ${checked ? styles.bulkSelected : ''}`} key={item.id}><label className={styles.rowCheck} title="Markér til bulk-action"><input type="checkbox" checked={checked} onChange={(event) => toggleSelection(item.id, event.target.checked)} /></label><button className={styles.rowMain} type="button" onClick={() => setSelectedId(item.id)}><StatusIcon status={item.status} /><span><strong>{item.title}</strong><small>{episodeLabel(item)} · {item.libraryName}</small>{item.type === 'episode' && analysisSummary(item) && <small className={styles.introHint}>{analysisSummary(item)}</small>}</span><em data-status={item.status}>{statusLabel(item.status)}</em></button></div>; })}</div></section>
      <section className={styles.detail}>{!detail ? <Empty icon={<Eye />} title="Vælg en titel" text="Preview, status og markører vises her." /> : <><header className={styles.detailHeader}><div><span>{episodeLabel(detail)}</span><h2>{detail.title}</h2>{detail.episodeTitle && <p>{detail.episodeTitle}</p>}</div><StatusPill status={detail.asset?.status ?? 'missing'} /></header><div className={styles.metrics}><Metric label="Varighed" value={duration(detail.file?.durationMs)} /><Metric label="Kilde" value={sourceLabel(detail.file)} /><Metric label="Frames" value={String(detail.asset?.frameCount ?? 0)} /><Metric label="Sprites" value={String(detail.asset?.sheetCount ?? 0)} /></div><section className={styles.preview}>{detail.previewDataUrl ? <img src={detail.previewDataUrl} alt="Repræsentativt billede fra mediet" /> : <div><Sparkles size={26} /><span>Intet seek-preview endnu</span></div>}<p>{detail.asset ? `Repræsentativt preview · ${detail.asset.columns} × ${detail.asset.rows} felter · ${detail.asset.intervalSeconds} sek. interval` : 'Kør analysen for at oprette billeder på tidslinjen.'}</p></section><MarkerDiagnostics analysis={markerAnalysis(detail)} mediaType={detail.type} /><MarkerTimeline markers={detail.markers} durationMs={detail.durationMs ?? detail.file?.durationMs ?? detail.asset?.durationMs ?? null} />{activePlaybackAnalysisError(detail) && <section className={styles.error}><AlertTriangle /><div><strong>Seneste fejl</strong><p>{activePlaybackAnalysisError(detail)}</p></div></section>}{detail.latestJob && <section className={styles.job}><Clock3 /><div><strong>{statusLabel(detail.latestJob.status)}</strong><span>Forsøg {detail.latestJob.attemptCount}/{detail.latestJob.maxAttempts} · {new Date(detail.latestJob.updatedAt).toLocaleString('da-DK')}</span></div></section>}<form className={styles.markers} onSubmit={saveMarkers}><header><div><span>TIDSLINJE</span><h3>Manuelle markører</h3></div><small>Præcise værdier har forrang for automatisk analyse.</small></header>{(['intro', 'recap', 'credits'] as const).map((kind) => <div className={styles.markerRow} key={kind}><label><input type="checkbox" checked={draft[kind].enabled} onChange={(event) => setDraft((current) => ({ ...current, [kind]: { ...current[kind], enabled: event.target.checked } }))} />{markerLabel(kind)}</label><label>Start<input disabled={!draft[kind].enabled} value={draft[kind].start} onChange={(event) => setDraft((current) => ({ ...current, [kind]: { ...current[kind], start: event.target.value } }))} /></label><label>Slut<input disabled={!draft[kind].enabled} value={draft[kind].end} onChange={(event) => setDraft((current) => ({ ...current, [kind]: { ...current[kind], end: event.target.value } }))} /></label></div>)}<div className={styles.actions}><button disabled={!canWrite || busy}><Check size={16} />Gem markører</button><button className={styles.secondary} type="button" disabled={!canWrite || busy} onClick={() => void rebuild()}><RefreshCw size={16} />Genopbyg analyse</button><button className={styles.secondary} type="button" disabled={!canWrite || busy} onClick={() => void resetMarkers()}><RotateCcw size={16} />Nulstil</button></div></form></>}</section>
    </div>
  </section>;
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) { return <article data-tone={tone}><span>{label}</span><strong>{value}</strong></article>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className={styles.empty}>{icon}<strong>{title}</strong><span>{text}</span></div>; }
function StatusIcon({ status }: { status: string }) { return status === 'ready' ? <Check size={17} /> : status === 'failed' ? <AlertTriangle size={17} /> : status === 'generating' || status === 'queued' ? <RefreshCw className={styles.spin} size={17} /> : <PlayCircle size={17} />; }
function StatusPill({ status }: { status: string }) { return <em className={styles.statusPill} data-status={status}>{statusLabel(status)}</em>; }
function MarkerDiagnostics({ analysis, mediaType }: { analysis: MarkerAnalysis; mediaType: string }) {
  if (mediaType !== 'episode') return null;
  const recap = analysis.recap;
  const intro = analysis.intro;
  return <section className={styles.analysisInsight} data-state={analysisState(analysis)}><Sparkles size={18} /><div><span>MARKØR-DETEKTION</span><strong>{analysisSummary({ introAnalysis: intro, markerAnalysis: analysis }) ?? 'Kør analysen for at opbygge seriebevis'}</strong><p>Recap: {recap ? markerReason('recap', recap) : 'ikke analyseret'} · Intro: {intro ? markerReason('intro', intro) : 'ikke analyseret'}</p></div></section>;
}
function MarkerTimeline({ markers, durationMs }: { markers: Marker[]; durationMs: number | null }) {
  if (!durationMs) return null;
  return <section className={styles.timelinePanel}><header><span>ANALYSE-TIDSLINJE</span><small>{duration(durationMs)}</small></header><div className={styles.timelineTrack}>{markers.map((marker) => <i key={`${marker.kind}-${marker.startMs}`} data-kind={marker.kind} style={{ left: `${marker.startMs / durationMs * 100}%`, width: `${Math.max(0.8, (marker.endMs - marker.startMs) / durationMs * 100)}%` }} title={`${markerLabel(marker.kind)} ${formatTime(marker.startMs)}–${formatTime(marker.endMs)}`} />)}</div><div className={styles.timelineLegend}>{markers.length ? markers.map((marker) => <span key={`${marker.kind}-legend`} data-kind={marker.kind}>{markerLabel(marker.kind)} · {formatTime(marker.startMs)}–{formatTime(marker.endMs)} · {marker.source === 'manual' ? 'manuel' : 'automatisk'}</span>) : <span>Ingen markører er fundet endnu.</span>}</div></section>;
}
function statusLabel(status: string) { return ({ all: 'Alle', missing: 'Mangler', queued: 'I kø', generating: 'Genererer', ready: 'Klar', failed: 'Fejlet', running: 'Kører', completed: 'Fuldført', retrying: 'Prøver igen' } as Record<string, string>)[status] ?? status; }
function episodeLabel(item: Pick<AnalysisRow, 'type' | 'seasonNumber' | 'episodeNumber'>) { return item.type === 'episode' ? `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')}` : item.type === 'movie' ? 'Film' : 'Serie'; }
function markerLabel(kind: Marker['kind']) { return kind === 'intro' ? 'Intro' : kind === 'recap' ? 'Recap' : 'Rulletekst'; }
function markerAnalysis(item: Pick<AnalysisRow, 'markerAnalysis' | 'introAnalysis'>): MarkerAnalysis { return { recap: item.markerAnalysis?.recap ?? null, intro: item.markerAnalysis?.intro ?? item.introAnalysis ?? null }; }
function analysisSummary(item: Pick<AnalysisRow, 'markerAnalysis' | 'introAnalysis'>) { const analysis = markerAnalysis(item); const parts = [analysis.recap?.state === 'detected' ? 'Recap fundet' : analysis.recap?.state === 'pending' ? 'Recap venter' : null, analysis.intro?.state === 'detected' ? 'Intro fundet' : analysis.intro?.state === 'pending' ? 'Intro venter' : null].filter(Boolean); return parts.length ? parts.join(' · ') : null; }
function activePlaybackAnalysisError(detail: AnalysisDetail) { if (detail.asset?.error) return detail.asset.error; if (detail.latestJob?.status === 'failed') return detail.latestJob.attempts.find((attempt) => attempt.error)?.error ?? null; return null; }
function analysisState(analysis: MarkerAnalysis) { return analysis.recap?.state === 'detected' || analysis.intro?.state === 'detected' ? 'detected' : analysis.recap?.state === 'pending' || analysis.intro?.state === 'pending' ? 'pending' : 'not-detected'; }
function markerReason(kind: 'intro' | 'recap', analysis: IntroAnalysis) { const label = kind === 'recap' ? 'Recap' : 'Intro'; return ({ detected: `${label} fundet med ${analysis.supportCount} referenceepisoder`, chapter_marker: `${label} fundet i filens kapitler`, insufficient_references: `Venter på flere episoder (${analysis.referenceCount}/2)`, low_information: 'Billedmaterialet er for mørkt eller ensartet', no_repeated_sequence: `Ingen sikker gentaget ${kind === 'recap' ? 'recap' : 'intro'} fundet` } as Record<IntroAnalysis['reason'], string>)[analysis.reason]; }
function duration(value: number | null | undefined) { if (!value) return 'Ukendt'; const total = Math.round(value / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; }
function sourceLabel(file: AnalysisDetail['file']) { return file ? `${file.height ?? '?'}p · ${(file.videoCodec ?? 'ukendt').toUpperCase()} · ${(file.audioCodec ?? 'ukendt').toUpperCase()}` : 'Ingen fil'; }
function formatTime(ms: number) { const total = Math.round(ms / 1000); return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }
function parseTime(value: string) { const match = /^(\d{1,3}):(\d{2})$/.exec(value.trim()); if (!match) throw new Error('Tider skal skrives som mm:ss'); return (Number(match[1]) * 60 + Number(match[2])) * 1000; }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message || (error instanceof Error ? error.message : 'Handlingen kunne ikke gennemføres.'); }
