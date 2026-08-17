'use client';

import { AlertTriangle, Check, Clock3, Eye, Film, RefreshCw, RotateCcw, Search, Sparkles } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import styles from './playback-analysis.module.css';

type Marker = { kind: 'intro' | 'recap' | 'credits'; startMs: number; endMs: number; source: string; confidence: number | null };
type AnalysisRow = {
  id: string; title: string; episodeTitle: string | null; type: string; seasonNumber: number | null; episodeNumber: number | null;
  libraryName: string; fileStatus: string; durationMs: number | null; status: string; markers: Marker[]; updatedAt: string;
  asset: { status: string; frameCount: number; sheetCount: number; generatedAt: string | null; error: string | null } | null;
};
type AnalysisPage = { items: AnalysisRow[]; total: number; page: number; take: number };
type AnalysisDetail = AnalysisRow & {
  file: { status: string; durationMs: number | null; width: number | null; height: number | null; videoCodec: string | null; audioCodec: string | null; container: string | null; bitrate: number | null } | null;
  asset: (AnalysisRow['asset'] & { intervalSeconds: number; tileWidth: number; tileHeight: number; columns: number; rows: number; manifest: unknown; updatedAt: string }) | null;
  latestJob: { id: string; status: string; attemptCount: number; maxAttempts: number; updatedAt: string; attempts: Array<{ number: number; status: string; error: string | null }> } | null;
  previewDataUrl: string | null;
};
type MarkerDraft = Record<Marker['kind'], { enabled: boolean; start: string; end: string }>;

const emptyDraft = (): MarkerDraft => ({
  intro: { enabled: false, start: '00:00', end: '00:00' },
  recap: { enabled: false, start: '00:00', end: '00:00' },
  credits: { enabled: false, start: '00:00', end: '00:00' },
});

export function PlaybackAnalysis() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState<AnalysisPage>({ items: [], total: 0, page: 1, take: 40 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnalysisDetail | null>(null);
  const [draft, setDraft] = useState<MarkerDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [canWrite, setCanWrite] = useState(false);

  const loadRows = useCallback(async () => {
    const params = new URLSearchParams({ status, page: '1', take: '100' });
    if (query.trim()) params.set('q', query.trim());
    const result = await api<AnalysisPage>(`/playback-analysis?${params}`);
    setPage(result);
    setSelectedId((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? null);
  }, [query, status]);

  const loadDetail = useCallback(async (id: string) => {
    const result = await api<AnalysisDetail>(`/playback-analysis/${id}`);
    setDetail(result);
    const next = emptyDraft();
    result.markers.forEach((marker) => {
      if (marker.kind in next) next[marker.kind] = { enabled: true, start: formatTime(marker.startMs), end: formatTime(marker.endMs) };
    });
    setDraft(next);
  }, []);

  useEffect(() => {
    void api<SessionUser>('/auth/me').then((user) => setCanWrite(user.roles.includes('admin'))).catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => {
      void loadRows().catch((error) => setMessage(errorMessage(error))).finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadRows]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId).catch((error) => setMessage(errorMessage(error)));
  }, [selectedId, loadDetail]);

  const hasActiveWork = useMemo(() => page.items.some((item) => ['queued', 'generating'].includes(item.status)) || ['queued', 'running', 'processing', 'retrying'].includes(detail?.latestJob?.status ?? ''), [page.items, detail]);
  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      void loadRows().catch(() => undefined);
      if (selectedId) void loadDetail(selectedId).catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, loadRows, loadDetail, selectedId]);

  async function rebuild() {
    if (!selectedId) return;
    setBusy(true); setMessage('');
    try {
      await api(`/playback-analysis/${selectedId}/rebuild`, { method: 'POST' });
      setMessage('Playback-analyse er sat i kø.');
      await Promise.all([loadRows(), loadDetail(selectedId)]);
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function saveMarkers(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    const markers = (Object.entries(draft) as Array<[Marker['kind'], MarkerDraft[Marker['kind']]]>).flatMap(([kind, value]) => value.enabled ? [{ kind, startMs: parseTime(value.start), endMs: parseTime(value.end) }] : []);
    setBusy(true); setMessage('');
    try {
      const result = await api<AnalysisDetail>(`/playback-analysis/${selectedId}/markers`, { method: 'PUT', body: JSON.stringify({ markers }) });
      setDetail(result); setMessage('De manuelle markører er gemt.'); await loadRows();
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  async function resetMarkers() {
    if (!selectedId || !window.confirm('Fjern manuelle markører og kør automatisk analyse igen?')) return;
    setBusy(true); setMessage('');
    try {
      await api(`/playback-analysis/${selectedId}/markers`, { method: 'DELETE' });
      setMessage('Markørerne er nulstillet, og analysen er sat i kø.');
      await Promise.all([loadRows(), loadDetail(selectedId)]);
    } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
  }

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div><span>PLAYBACK LAB</span><h1>Playback-analyse</h1><p>Trickplay, intro, recap og rulletekster for serverens lokale medier.</p></div>
        <div className={styles.summary}><strong>{page.total}</strong><span>matchende titler</span></div>
      </header>
      <div className={styles.filters}>
        <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg efter titel eller serie" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrér analysestatus">
          <option value="all">Alle statusser</option><option value="missing">Ikke analyseret</option><option value="queued">I kø</option><option value="generating">Genererer</option><option value="ready">Klar</option><option value="failed">Fejlet</option>
        </select>
      </div>
      {message && <p className={styles.message}>{message}</p>}
      <div className={styles.workspace}>
        <div className={styles.master} aria-busy={loading}>
          {!page.items.length && <div className={styles.empty}><Film size={28} /><strong>Ingen titler matcher</strong><span>Skift søgning eller statusfilter.</span></div>}
          {page.items.map((item) => (
            <button className={selectedId === item.id ? styles.selectedRow : styles.row} key={item.id} onClick={() => setSelectedId(item.id)}>
              <StatusIcon status={item.status} />
              <span><strong>{item.title}</strong><small>{episodeLabel(item)} · {item.libraryName}</small></span>
              <em data-status={item.status}>{statusLabel(item.status)}</em>
            </button>
          ))}
        </div>
        <div className={styles.detail}>
          {!detail && <div className={styles.empty}><Eye size={30} /><strong>Vælg en titel</strong><span>Detaljer og værktøjer vises her.</span></div>}
          {detail && <>
            <header className={styles.detailHeader}><div><span>{episodeLabel(detail)}</span><h2>{detail.title}</h2>{detail.episodeTitle && <p>{detail.episodeTitle}</p>}</div><StatusPill status={detail.asset?.status ?? 'missing'} /></header>
            <div className={styles.metrics}>
              <Metric label="Varighed" value={duration(detail.file?.durationMs)} />
              <Metric label="Kilde" value={sourceLabel(detail.file)} />
              <Metric label="Frames" value={String(detail.asset?.frameCount ?? 0)} />
              <Metric label="Sprites" value={String(detail.asset?.sheetCount ?? 0)} />
            </div>
            <section className={styles.preview}>
              {detail.previewDataUrl ? <img src={detail.previewDataUrl} alt="Første trickplay-sprite" /> : <div><Sparkles size={26} /><span>Ingen sprite-preview endnu</span></div>}
              <p>{detail.asset ? `${detail.asset.columns} × ${detail.asset.rows} felter · ${detail.asset.intervalSeconds} sek. interval · ${detail.asset.tileWidth} × ${detail.asset.tileHeight}px` : 'Kør analysen for at oprette seek-preview.'}</p>
            </section>
            {(detail.asset?.error || detail.latestJob?.attempts.some((attempt) => attempt.error)) && <section className={styles.error}><AlertTriangle size={18} /><div><strong>Seneste fejl</strong><p>{detail.asset?.error ?? detail.latestJob?.attempts.find((attempt) => attempt.error)?.error}</p></div></section>}
            {detail.latestJob && <section className={styles.job}><Clock3 size={17} /><div><strong>Worker-job: {statusLabel(detail.latestJob.status)}</strong><span>Forsøg {detail.latestJob.attemptCount}/{detail.latestJob.maxAttempts} · {new Date(detail.latestJob.updatedAt).toLocaleString('da-DK')}</span></div></section>}
            <form className={styles.markers} onSubmit={saveMarkers}>
              <header><div><span>TIDSLINJE</span><h3>Manuelle markører</h3></div><small>Manuelle værdier har forrang for automatisk analyse.</small></header>
              {(Object.keys(draft) as Marker['kind'][]).map((kind) => <MarkerEditor key={kind} kind={kind} value={draft[kind]} onChange={(value) => setDraft((current) => ({ ...current, [kind]: value }))} />)}
              <div className={styles.actions}>
                <button type="submit" disabled={!canWrite || busy}><Check size={16} />Gem markører</button>
                <button type="button" className={styles.secondary} disabled={!canWrite || busy} onClick={() => void resetMarkers()}><RotateCcw size={16} />Nulstil automatisk</button>
                <button type="button" className={styles.secondary} disabled={!canWrite || busy || ['queued', 'generating'].includes(detail.asset?.status ?? '')} onClick={() => void rebuild()}><RefreshCw size={16} />Byg igen</button>
              </div>
              {!canWrite && <small>Operators har læseadgang. En administrator skal gemme eller genopbygge.</small>}
            </form>
          </>}
        </div>
      </div>
    </section>
  );
}

function MarkerEditor({ kind, value, onChange }: { kind: Marker['kind']; value: MarkerDraft[Marker['kind']]; onChange: (value: MarkerDraft[Marker['kind']]) => void }) {
  return <div className={styles.markerRow}><label><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /><span>{({ intro: 'Intro', recap: 'Recap', credits: 'Rulletekster' } as const)[kind]}</span></label><label>Fra<input disabled={!value.enabled} value={value.start} onChange={(event) => onChange({ ...value, start: event.target.value })} placeholder="00:00" /></label><label>Til<input disabled={!value.enabled} value={value.end} onChange={(event) => onChange({ ...value, end: event.target.value })} placeholder="00:00" /></label></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function StatusPill({ status }: { status: string }) { return <span className={styles.statusPill} data-status={status}>{statusLabel(status)}</span>; }
function StatusIcon({ status }: { status: string }) { return ['ready'].includes(status) ? <Check size={17} /> : ['failed'].includes(status) ? <AlertTriangle size={17} /> : <Clock3 size={17} />; }
function statusLabel(value: string) { return ({ missing: 'Ikke analyseret', queued: 'I kø', generating: 'Genererer', ready: 'Klar', failed: 'Fejlet', running: 'Kører', processing: 'Behandler', retrying: 'Prøver igen', completed: 'Færdig' } as Record<string, string>)[value] ?? value; }
function episodeLabel(item: Pick<AnalysisRow, 'type' | 'seasonNumber' | 'episodeNumber'>) { return item.type === 'episode' ? `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')}` : item.type === 'movie' ? 'Film' : 'Serie'; }
function duration(value: number | null | undefined) { if (!value) return 'Ukendt'; const total = Math.round(value / 60_000); return `${Math.floor(total / 60)} t ${total % 60} min`; }
function sourceLabel(file: AnalysisDetail['file']) { if (!file) return 'Mangler'; return `${file.height ? `${file.height}p` : 'Video'} · ${(file.videoCodec ?? 'ukendt').toUpperCase()}`; }
function formatTime(ms: number) { const total = Math.max(0, Math.round(ms / 1_000)); const hours = Math.floor(total / 3_600); const minutes = Math.floor((total % 3_600) / 60); const seconds = total % 60; return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`; }
function parseTime(value: string) { const parts = value.trim().split(':').map(Number); if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return -1; const [first = 0, second = 0, third = 0] = parts; const seconds = parts.length === 3 ? first * 3_600 + second * 60 + third : parts.length === 2 ? first * 60 + second : first; return Math.round(seconds * 1_000); }
function errorMessage(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Handlingen kunne ikke gennemføres.'); }
