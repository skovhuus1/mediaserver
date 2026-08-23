'use client';

import { CalendarDays, CircleStop, Clock3, Play, Radio, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import styles from './live-tv-recordings.module.css';

type Channel = { id: string; name: string; number: number | null; logoUrl: string | null };
type ScheduleOption = { id: string; title: string; subtitle: string | null; category: string | null; startsAt: string; endsAt: string; channel: Channel; recording: { id: string; status: string } | null };
type Recording = { id: string; title: string; status: string; progress: number; startsAt: string; endsAt: string; sizeBytes: string | null; durationMs: number | null; error: string | null; ready: boolean; channel: Channel; program: { subtitle: string | null; category: string | null; episode: string | null } | null };
type Playback = { streamUrl: string; expiresAt: string };

export function LiveTvRecordings() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [programs, setPrograms] = useState<ScheduleOption[]>([]);
  const [view, setView] = useState<'guide' | 'recordings'>('guide');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<{ title: string; url: string } | null>(null);
  const [manual, setManual] = useState({ channelId: '', title: '', startsAt: '', endsAt: '' });
  const load = useCallback(async () => {
    try {
      const [nextRecordings, nextPrograms] = await Promise.all([api<Recording[]>('/live-tv/recordings'), api<ScheduleOption[]>('/live-tv/recordings/schedule-options')]);
      setRecordings(nextRecordings); setPrograms(nextPrograms);
      setManual((value) => value.channelId || !nextPrograms[0] ? value : { ...value, channelId: nextPrograms[0].channel.id });
      setError(null);
    } catch (failure) { setError(message(failure)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!recordings.some((recording) => ['queued', 'recording'].includes(recording.status))) return; const timer = window.setInterval(() => void load(), 5_000); return () => window.clearInterval(timer); }, [load, recordings]);
  const channels = useMemo(() => Array.from(new Map(programs.map((program) => [program.channel.id, program.channel])).values()).sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999)), [programs]);
  const days = useMemo(() => Array.from(new Map(programs.map((program) => [dayKey(program.startsAt), dayLabel(program.startsAt)])).entries()), [programs]);
  async function mutate(key: string, action: () => Promise<unknown>) { setBusy(key); setError(null); try { await action(); await load(); } catch (failure) { setError(message(failure)); } finally { setBusy(null); } }
  async function play(recording: Recording) { setBusy(recording.id); setError(null); try { const result = await api<Playback>(`/live-tv/recordings/${recording.id}/playback`, { method: 'POST' }); setPlayback({ title: recording.title, url: result.streamUrl }); } catch (failure) { setError(message(failure)); } finally { setBusy(null); } }
  async function submitManual(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await mutate('manual', () => api('/live-tv/recordings', { method: 'POST', body: JSON.stringify({ ...manual, startsAt: new Date(manual.startsAt).toISOString(), endsAt: new Date(manual.endsAt).toISOString(), prePaddingSeconds: 60, postPaddingSeconds: 180 }) })); }

  return <main className={styles.page}><header className={styles.hero}><div><span>LIVE TV · PVR</span><h1>Dine optagelser</h1><p>Planlæg fra guiden eller manuelt. BoltBytes vælger automatisk næste ledige M3U-forbindelse.</p></div><Video /></header>{error && <div className={styles.error} role="alert">{error}<button onClick={() => setError(null)}>Luk</button></div>}<nav className={styles.tabs}><button aria-pressed={view === 'guide'} onClick={() => setView('guide')}><CalendarDays />Programguide</button><button aria-pressed={view === 'recordings'} onClick={() => setView('recordings')}><Video />Optagelser <b>{recordings.length}</b></button></nav>
    {view === 'guide' ? <section className={styles.guide}>{days.map(([key, label]) => <div className={styles.day} key={key}><h2>{label}</h2><div>{programs.filter((program) => dayKey(program.startsAt) === key).map((program) => <article className={styles.program} key={program.id}><ChannelLogo channel={program.channel} /><div><time>{time(program.startsAt)}–{time(program.endsAt)}</time><strong>{program.title}</strong><small>{program.subtitle ?? program.category ?? program.channel.name}</small></div>{program.recording ? <span className={styles.scheduled}>Planlagt</span> : <button disabled={busy === program.id} onClick={() => void mutate(program.id, () => api('/live-tv/recordings', { method: 'POST', body: JSON.stringify({ programId: program.id, prePaddingSeconds: 60, postPaddingSeconds: 180 }) }))}><CircleStop />Optag</button>}</article>)}</div></div>)}{!programs.length && <Empty text="Der er ingen kommende XMLTV-programmer at planlægge endnu." />}<details className={styles.manual}><summary>Planlæg manuel optagelse</summary><form onSubmit={(event) => void submitManual(event)}><label>Kanal<select required value={manual.channelId} onChange={(event) => setManual({ ...manual, channelId: event.target.value })}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.number ? `${channel.number} · ` : ''}{channel.name}</option>)}</select></label><label>Titel<input required maxLength={240} value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} /></label><label>Starter<input required type="datetime-local" value={manual.startsAt} onChange={(event) => setManual({ ...manual, startsAt: event.target.value })} /></label><label>Slutter<input required type="datetime-local" value={manual.endsAt} onChange={(event) => setManual({ ...manual, endsAt: event.target.value })} /></label><button disabled={busy === 'manual'}>Planlæg optagelse</button></form></details></section>
    : <section className={styles.library}>{recordings.map((recording) => <article className={styles.recording} key={recording.id}><ChannelLogo channel={recording.channel} /><div className={styles.recordingBody}><span>{status(recording.status)}</span><h2>{recording.title}</h2><p>{recording.program?.episode ?? recording.program?.subtitle ?? recording.channel.name} · {dateTime(recording.startsAt)}</p>{['queued', 'recording'].includes(recording.status) && <i><b style={{ width: `${recording.progress}%` }} /></i>}{recording.error && <small>{recording.error}</small>}</div><div className={styles.actions}>{recording.ready && <button disabled={busy === recording.id} onClick={() => void play(recording)}><Play fill="currentColor" />Afspil</button>}{['scheduled', 'queued', 'recording'].includes(recording.status) && <button disabled={busy === recording.id} onClick={() => void mutate(recording.id, () => api(`/live-tv/recordings/${recording.id}/cancel`, { method: 'POST' }))}><CircleStop />Annuller</button>}{['completed', 'failed', 'cancelled', 'missed'].includes(recording.status) && <button aria-label={`Slet ${recording.title}`} disabled={busy === recording.id} onClick={() => void mutate(recording.id, () => api(`/live-tv/recordings/${recording.id}`, { method: 'DELETE' }))}><Trash2 /></button>}</div></article>)}{!recordings.length && <Empty text="Du har ingen planlagte eller færdige optagelser endnu." />}</section>}
    {playback && <section className={styles.player} role="dialog" aria-modal="true" aria-label={playback.title}><header><div><small>OPTAGELSE</small><h2>{playback.title}</h2></div><button onClick={() => setPlayback(null)}>Luk</button></header><video autoPlay controls playsInline src={playback.url} /></section>}</main>;
}

function ChannelLogo({ channel }: { channel: Channel }) { return <i className={styles.logo}>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Radio />}</i>; }
function Empty({ text }: { text: string }) { return <div className={styles.empty}><Clock3 /><h2>Ikke noget her endnu</h2><p>{text}</p></div>; }
function message(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Handlingen fejlede.'); }
function dayKey(value: string) { return new Date(value).toISOString().slice(0, 10); }
function dayLabel(value: string) { return new Date(value).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }); }
function time(value: string) { return new Date(value).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }); }
function dateTime(value: string) { return new Date(value).toLocaleString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function status(value: string) { return ({ scheduled: 'Planlagt', queued: 'Venter på forbindelse', recording: 'Optager nu', completed: 'Klar til afspilning', cancelled: 'Annulleret', failed: 'Fejlet', missed: 'Mistet' } as Record<string, string>)[value] ?? value; }
