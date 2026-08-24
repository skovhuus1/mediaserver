'use client';

import Hls from 'hls.js';
import { Antenna, Cast, ChevronLeft, ChevronRight, CircleStop, Heart, LoaderCircle, Pause, Play, Radio, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import { CustomerShell } from './customer-shell';
import styles from './live-tv-experience.module.css';

type Program = { id: string; startsAt: string; endsAt: string; title: string; subtitle: string | null; description: string | null; category: string | null; iconUrl: string | null; episode: string | null; source?: 'xmltv' | 'm3u'; recordable?: boolean };
type Channel = { id: string; name: string; number: number | null; logoUrl: string | null; groupName: string | null; favorite: boolean; programs: Program[] };
type Guide = { from: string; to: string; availableTotal: number; total: number; page: number; pageSize: number; totalPages: number; groups: Array<{ name: string; count: number }>; channels: Channel[] };
type LiveSession = { accepted: true; leaseId: string; method: string; status: string; channel: { id: string; name: string; number: number | null; logoUrl: string | null }; streamToken: string; streamUrl: string; statusUrl: string; heartbeatUrl: string; releaseUrl: string; contentType: string };
type StreamStatus = { status: string; method: string; error: string | null };

export function LiveTvExperience() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [group, setGroup] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingChannel, setStartingChannel] = useState<string | null>(null);
  const guideRequestRef = useRef(0);

  const loadGuide = useCallback(async () => {
    const requestId = ++guideRequestRef.current;
    const from = new Date(Date.now() - 30 * 60_000).toISOString();
    const to = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
    const query = new URLSearchParams({ from, to, page: String(page), pageSize: '75' });
    if (group) query.set('group', group);
    if (favoritesOnly) query.set('favorites', 'true');
    if (appliedSearch) query.set('search', appliedSearch);
    try {
      const result = await api<Guide>(`/live-tv/guide?${query.toString()}`);
      if (requestId === guideRequestRef.current) setGuide(result);
    } catch (failure) {
      if (requestId === guideRequestRef.current) throw failure;
    }
  }, [appliedSearch, favoritesOnly, group, page]);

  useEffect(() => { let active = true; void api<SessionUser>('/auth/me').then((me) => { if (active) setUser(me); }).catch((failure) => { if (active) setError(message(failure)); }); return () => { active = false; }; }, []);
  useEffect(() => { if (!user) return; void loadGuide().catch((failure) => setError(message(failure))); }, [loadGuide, user]);
  useEffect(() => { if (!user) return; const timer = window.setInterval(() => void loadGuide().catch((failure) => setError(message(failure))), 60_000); return () => window.clearInterval(timer); }, [loadGuide, user]);

  const channels = guide?.channels ?? [];
  const groups = [{ name: '', count: guide?.availableTotal ?? 0 }, ...(guide?.groups ?? [])];

  const switchChannel = async (channel: Channel) => {
    if (!session) return;
    const next = await api<LiveSession>(`/live-tv/playback/leases/${session.leaseId}/switch`, { method: 'POST', body: JSON.stringify({ channelId: channel.id, streamToken: session.streamToken, preferredMethod: 'auto' }) });
    setSession(next);
  };

  const start = async (channel: Channel) => {
    setStartingChannel(channel.id); setError(null);
    try {
      if (session) { await switchChannel(channel); return; }
      setSession(await api<LiveSession>('/live-tv/playback/authorize', { method: 'POST', body: JSON.stringify({ channelId: channel.id, preferredMethod: 'auto' }) }));
    } catch (failure) { setError(message(failure)); } finally { setStartingChannel(null); }
  };

  const favorite = async (channel: Channel) => { try { await api(`/live-tv/favorites/${channel.id}`, { method: channel.favorite ? 'DELETE' : 'PUT' }); await loadGuide(); } catch (failure) { setError(message(failure)); } };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); };

  if (!user) return <main className="watch-loading" aria-busy={!error}>{error && <section className={styles.authError} role="alert"><Antenna /><h1>Live TV kunne ikke åbnes</h1><p>{error}</p><button onClick={() => window.location.reload()}>Prøv igen</button></section>}</main>;
  return <CustomerShell user={user}><section className={styles.page}>
    <header className={styles.hero}><div><span>LIVE FRA DIN SERVER</span><h1>TV lige nu</h1><p>Én samlet kanalguide med automatisk kvalitetsvalg og næste raske M3U-kilde.</p></div><span className={styles.signal}><i /><b>{guide?.availableTotal ?? 0}</b><small>kanaler online</small></span></header>
    {error && <div className={styles.error} role="alert">{error}<button onClick={() => setError(null)}><X /></button></div>}
    <form className={styles.searchBar} onSubmit={submitSearch}><label>Søg i guiden<input aria-label="Søg Live TV-kanaler" onChange={(event) => setSearch(event.target.value)} placeholder="Kanalnavn..." value={search} /></label><button>Søg</button>{appliedSearch && <button type="button" onClick={() => { setSearch(''); setAppliedSearch(''); setPage(1); }}>Ryd</button>}<small>{guide?.total ?? 0} kanal(er) matcher</small></form>
    <nav className={styles.filters} aria-label="Live TV-kategorier"><button aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setPage(1); }}><Heart fill={favoritesOnly ? 'currentColor' : 'none'} />Favoritter</button>{groups.map((item) => <button aria-pressed={!favoritesOnly && group === item.name} key={item.name || 'all'} onClick={() => { setFavoritesOnly(false); setGroup(item.name); setPage(1); }}>{item.name || 'Alle'} <small>{item.count}</small></button>)}</nav>
    <section className={styles.guide}><header><span>KANAL</span><span>NU OG SENERE</span><time>{new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}</time></header><div>{channels.map((channel) => <article className={styles.channel} key={channel.id}><button className={styles.identity} onClick={() => void start(channel)}><i>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</i><span><b>{channel.number ?? '•'}</b><strong>{channel.name}</strong><small>{channel.groupName ?? 'Live TV'}</small></span>{startingChannel === channel.id ? <LoaderCircle className={styles.spin} /> : <Play fill="currentColor" />}</button><button aria-label={`${channel.favorite ? 'Fjern' : 'Tilføj'} ${channel.name} som favorit`} className={styles.favorite} onClick={() => void favorite(channel)}><Heart fill={channel.favorite ? 'currentColor' : 'none'} /></button><div className={styles.programs}>{channel.programs.length ? channel.programs.slice(0, 6).map((program) => <ProgramCard key={program.id} onError={setError} program={program} />) : <span className={styles.noEpg}>Ingen programdata</span>}</div></article>)}</div>{!channels.length && <div className={styles.empty}><Radio /><h2>Ingen kanaler i denne visning</h2><p>Vælg en anden gruppe, ryd søgningen eller bed administratoren importere en M3U-kilde.</p></div>}{(guide?.totalPages ?? 1) > 1 && <nav className={styles.pagination} aria-label="Guide-sider"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Forrige</button><span>Side {guide?.page ?? page} af {guide?.totalPages ?? 1}</span><button disabled={page >= (guide?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Næste</button></nav>}</section>
  </section>{session && <LivePlayer channels={guide?.channels ?? []} session={session} onClose={() => setSession(null)} onError={setError} onSession={setSession} />}</CustomerShell>;
}

function ProgramCard({ program, onError }: { program: Program; onError: (value: string | null) => void }) {
  const [recording, setRecording] = useState<{ id: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const recordable = program.recordable !== false;
  const now = Date.now(); const active = Date.parse(program.startsAt) <= now && Date.parse(program.endsAt) > now; const programDuration = Date.parse(program.endsAt) - Date.parse(program.startsAt); const progress = active ? Math.max(0, Math.min(100, ((now - Date.parse(program.startsAt)) / programDuration) * 100)) : 0;
  useEffect(() => { if (!recordable) { setRecording(null); return; } let mounted = true; void scheduledPrograms().then((items) => { if (mounted) setRecording(items.get(program.id) ?? null); }).catch(() => undefined); return () => { mounted = false; }; }, [program.id, recordable]);
  const toggleRecording = async () => {
    if (!recordable) return;
    setBusy(true); onError(null);
    try {
      if (recording) { await api(`/live-tv/recordings/${recording.id}/cancel`, { method: 'POST' }); setRecording(null); }
      else { const created = await api<{ id: string; status: string }>('/live-tv/recordings', { method: 'POST', body: JSON.stringify({ programId: program.id, prePaddingSeconds: 60, postPaddingSeconds: 180 }) }); setRecording({ id: created.id, status: created.status }); }
      recordingScheduleCache = null;
    } catch (failure) { onError(message(failure)); }
    finally { setBusy(false); }
  };
  const recordingLabel = recording?.status === 'recording' ? 'Optager' : recording ? 'Planlagt' : 'Optag';
  return <article className={styles.program} data-active={active} data-recording={Boolean(recording)}><time>{clock(program.startsAt)}–{clock(program.endsAt)}</time><strong>{program.title}</strong><small>{program.subtitle ?? program.category ?? 'Programinformation'}</small>{recordable && <button aria-label={`${recording ? 'Annuller optagelse af' : 'Optag'} ${program.title}`} className={styles.recordButton} disabled={busy} onClick={() => void toggleRecording()}>{busy ? <LoaderCircle className={styles.spin} /> : <CircleStop fill={recording ? 'currentColor' : 'none'} />}{recordingLabel}</button>}{active && <i><b style={{ width: `${progress}%` }} /></i>}</article>;
}

let recordingScheduleCache: { expiresAt: number; promise: Promise<Map<string, { id: string; status: string }>> } | null = null;
function scheduledPrograms() {
  if (recordingScheduleCache && recordingScheduleCache.expiresAt > Date.now()) return recordingScheduleCache.promise;
  const promise = api<Array<{ id: string; recording: { id: string; status: string } | null }>>('/live-tv/recordings/schedule-options').then((items) => new Map(items.flatMap((item) => item.recording ? [[item.id, item.recording] as const] : [])));
  recordingScheduleCache = { expiresAt: Date.now() + 15_000, promise };
  return promise;
}

function LiveTvPreparing({ channel, method, onCancel }: { channel: Channel; method: string; onCancel: () => Promise<void> }) {
  const delivery = method.replaceAll('_', ' ');
  return <div aria-busy="true" aria-live="polite" className={styles.preparing} role="status">
    <div aria-hidden="true" className={styles.preparingBackdrop}><i /><i /></div>
    <button aria-label="Luk Live TV" className={styles.preparingClose} onClick={() => void onCancel()}><X /></button>
    <div className={styles.preparingPanel}>
      <div className={styles.preparingEyebrow}><i />LIVE TV<span>{channel.number ? `KANAL ${channel.number}` : 'DIREKTE'}</span></div>
      <div aria-hidden="true" className={styles.preparingVisual}>
        <i className={styles.preparingOrbit} />
        <i className={styles.preparingOrbitAlt} />
        <span className={styles.preparingLogo}>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</span>
      </div>
      <h2>Gør {channel.name} klar</h2>
      <p className={styles.preparingCopy}>Vi finder den bedste ledige forbindelse og gør streamen klar til stabil afspilning.</p>
      <div className={styles.preparingFacts}>
        <span><i />Sikker forbindelse</span>
        <span><Radio />{delivery}</span>
      </div>
      <div aria-hidden="true" className={styles.preparingProgress}><i /></div>
      <small className={styles.preparingHint}>Dette tager normalt kun et øjeblik</small>
    </div>
  </div>;
}

function LivePlayer({ channels, session, onClose, onError, onSession }: { channels: Channel[]; session: LiveSession; onClose: () => void; onError: (value: string | null) => void; onSession: (value: LiveSession) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const [timeline, setTimeline] = useState({ start: 0, end: 0, current: 0, programBounded: false });
  const timelineAnchorRef = useRef<{ wallClock: number; mediaTime: number } | null>(null);
  const [casting, setCasting] = useState(false);
  const [channel, setChannel] = useState<Channel>(() => channels.find((item) => item.id === session.channel.id) ?? { ...session.channel, favorite: false, groupName: null, programs: [] } as Channel);
  const current = channel.programs.find((program) => Date.parse(program.startsAt) <= Date.now() && Date.parse(program.endsAt) > Date.now());
  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.seekable.length) video.currentTime = Math.max(0, video.seekable.end(video.seekable.length - 1) - 1);
    void video.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const available = channels.find((item) => item.id === session.channel.id);
    if (available) setChannel(available);
    else setChannel((currentChannel) => currentChannel.id === session.channel.id ? currentChannel : { ...session.channel, favorite: false, groupName: null, programs: [] } as Channel);
  }, [channels, session.channel]);

  useEffect(() => {
    if (pausedAt === null) return;
    const update = () => {
      const now = Date.now();
      setClockTick(now);
      if (now - pausedAt >= 7_200_000) goLive();
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [goLive, pausedAt]);

  useEffect(() => {
    timelineAnchorRef.current = { wallClock: Date.now(), mediaTime: Number.NaN };
    setTimeline({ start: 0, end: 0, current: 0, programBounded: false });
  }, [session.channel.id, session.streamUrl]);

  useEffect(() => {
    const update = () => {
      const video = videoRef.current;
      if (!video?.seekable.length) return;
      const windowStart = video.seekable.start(0);
      const liveEdge = video.seekable.end(video.seekable.length - 1);
      const storedAnchor = timelineAnchorRef.current;
      const anchor = storedAnchor && Number.isFinite(storedAnchor.mediaTime)
        ? storedAnchor
        : { wallClock: storedAnchor?.wallClock ?? Date.now(), mediaTime: windowStart };
      timelineAnchorRef.current = anchor;
      const programStart = current ? Date.parse(current.startsAt) : anchor.wallClock;
      const programMediaTime = anchor.mediaTime + Math.max(0, (programStart - anchor.wallClock) / 1_000);
      const programBounded = programStart > anchor.wallClock && programMediaTime <= liveEdge;
      setTimeline({ start: Math.min(liveEdge, Math.max(windowStart, programMediaTime)), end: liveEdge, current: Math.max(windowStart, Math.min(liveEdge, video.currentTime)), programBounded });
    };
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [current, session.channel.id, session.streamUrl]);

  useEffect(() => {
    if (!['ready', 'active'].includes(session.status)) return;
    const video = videoRef.current; if (!video) return;
    hlsRef.current?.destroy();
    if (Hls.isSupported()) { const hls = new Hls({ liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 8, enableWorker: true }); let recoveryAttempts = 0; hlsRef.current = hls; hls.loadSource(session.streamUrl); hls.attachMedia(video); hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined)); hls.on(Hls.Events.ERROR, (_event, data) => { if (!data.fatal) return; if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttempts++ < 1) { hls.recoverMediaError(); return; } if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttempts++ < 2) { hls.startLoad(); return; } void fetch(session.statusUrl, { cache: 'no-store' }).then((response) => response.json() as Promise<StreamStatus>).then((status) => { if (status.status === 'failed') onError(status.error ?? `Live TV-streamfejl: ${data.details}`); else onSession({ ...session, status: 'preparing', method: status.method }); }).catch(() => onError(`Live TV-streamfejl: ${data.details}`)); }); }
    else { video.src = session.streamUrl; void video.play().catch(() => undefined); }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; video.removeAttribute('src'); video.load(); };
  }, [onError, session.status, session.streamUrl]);

  useEffect(() => {
    if (session.status !== 'preparing') return;
    const poll = async () => { const response = await fetch(session.statusUrl, { cache: 'no-store' }); const status = await response.json() as StreamStatus; if (status.status === 'failed') onError(status.error ?? 'Live TV-streamen kunne ikke startes'); else if (['ready', 'active'].includes(status.status)) onSession({ ...session, status: status.status, method: status.method }); };
    void poll(); const timer = window.setInterval(() => void poll().catch(() => undefined), 1_500); return () => window.clearInterval(timer);
  }, [onError, onSession, session]);

  useEffect(() => { const heartbeat = () => void fetch(session.heartbeatUrl, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runtimeState: videoRef.current?.paused ? 'paused' : 'playing', bufferAheadMs: bufferAhead(videoRef.current), stallCount: 0 }), keepalive: true }); heartbeat(); const timer = window.setInterval(heartbeat, 5_000); return () => window.clearInterval(timer); }, [session.heartbeatUrl]);

  const close = async () => { hlsRef.current?.destroy(); await fetch(session.releaseUrl, { method: 'DELETE', keepalive: true }).catch(() => undefined); onClose(); };
  const switchDirection = async (direction: 'next' | 'previous') => { try { const nextChannel = await api<Channel>(`/live-tv/guide/channels/${session.channel.id}/neighbor?direction=${direction}`); const next = await api<LiveSession>(`/live-tv/playback/leases/${session.leaseId}/switch`, { method: 'POST', body: JSON.stringify({ channelId: nextChannel.id, streamToken: session.streamToken, preferredMethod: 'auto' }) }); setChannel(nextChannel); onSession(next); if (casting) await loadCast(next, nextChannel); } catch (failure) { onError(message(failure)); } };
  const cast = async () => { try { const handoff = await api<LiveSession>(`/live-tv/playback/leases/${session.leaseId}/cast-handoff`, { method: 'POST', body: JSON.stringify({ streamToken: session.streamToken }) }); await loadCast(handoff, channel); videoRef.current?.pause(); setCasting(true); onSession(handoff); } catch (failure) { onError(message(failure)); } };

  const pauseRemaining = Math.max(0, 7_200_000 - (pausedAt === null ? 0 : clockTick - pausedAt));
  const behindLiveSeconds = Math.max(0, timeline.end - timeline.current);
  const seek = (value: number) => { const video = videoRef.current; if (video) video.currentTime = Math.max(timeline.start, Math.min(timeline.end, value)); };
  return <section className={styles.player} aria-label={`Afspiller ${channel.name}`}><video autoPlay playsInline ref={videoRef} onPause={() => { setPaused(true); setPausedAt((value) => value ?? Date.now()); }} onPlay={() => { setPaused(false); setPausedAt(null); }} /><div className={styles.playerShade} /><header><span>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</span><div><small>LIVE · {session.method.replaceAll('_', ' ')}</small><h2>{channel.name}</h2><p>{current?.title ?? 'Programinformation afventer'}</p></div><button aria-label="Luk Live TV" onClick={() => void close()}><X /></button></header>{session.status === 'preparing' && <LiveTvPreparing channel={channel} method={session.method} onCancel={close} />}<footer><div className={styles.timeline}><button disabled={timeline.end <= timeline.start} onClick={() => seek(timeline.start)}>{timeline.programBounded ? 'Programstart' : 'Streamstart'}</button><input aria-label="Live TV-tidslinje" disabled={timeline.end <= timeline.start} max={timeline.end || 1} min={timeline.start} onChange={(event) => seek(Number(event.target.value))} step="1" type="range" value={timeline.current} /><span>{behindLiveSeconds <= 3 ? 'LIVE' : `${shortDuration(behindLiveSeconds)} bag live`}</span></div><button aria-label="Forrige kanal" onClick={() => void switchDirection('previous')}><ChevronLeft /></button><button aria-label={paused ? 'Fortsæt' : 'Pause'} className={styles.primary} onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play(); else video.pause(); }}>{paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}</button><button aria-label="Næste kanal" onClick={() => void switchDirection('next')}><ChevronRight /></button><span><b>{channel.number ?? '•'} · {channel.name}</b><small>{paused ? `Sat på pause · ${duration(pauseRemaining)} tilbage` : current ? `${clock(current.startsAt)}–${clock(current.endsAt)} · ${current.title}` : 'Live TV'}</small></span>{(paused || behindLiveSeconds > 3) && <button className={styles.liveButton} onClick={goLive}><Radio />Gå til live</button>}<button aria-label="Afspil på Chromecast" className={styles.cast} onClick={() => void cast()}><Cast />{casting ? 'Caster' : 'Cast'}</button></footer></section>;
}

type CastWindow = Window & { cast?: { framework?: { CastContext: { getInstance(): { setOptions(options: object): void; requestSession(): Promise<void>; getCurrentSession(): { loadMedia(request: object): Promise<void> } | null } }; AutoJoinPolicy?: { ORIGIN_SCOPED: string } } }; chrome?: { cast?: { AutoJoinPolicy?: { ORIGIN_SCOPED: string }; media?: { DEFAULT_MEDIA_RECEIVER_APP_ID: string; MediaInfo: new (url: string, type: string) => { metadata?: object; streamType?: string; customData?: object }; GenericMediaMetadata: new () => { title?: string; subtitle?: string }; LoadRequest: new (media: object) => object; StreamType: { LIVE: string } } } } };
async function loadCast(session: LiveSession, channel: Channel) { if (!window.isSecureContext) throw new Error('Chromecast kræver HTTPS.'); const castWindow = window as CastWindow; const framework = castWindow.cast?.framework; const media = castWindow.chrome?.cast?.media; if (!framework || !media) throw new Error('Google Cast Framework er ikke klar. Prøv igen om et øjeblik.'); const context = framework.CastContext.getInstance(); context.setOptions({ receiverApplicationId: process.env.NEXT_PUBLIC_CAST_RECEIVER_APP_ID?.trim() || media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: castWindow.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED ?? framework.AutoJoinPolicy?.ORIGIN_SCOPED ?? 'origin_scoped' }); if (!context.getCurrentSession()) await context.requestSession(); const castSession = context.getCurrentSession(); if (!castSession) throw new Error('Chromecast-sessionen kunne ikke oprettes.'); const info = new media.MediaInfo(session.streamUrl, session.contentType); const metadata = new media.GenericMediaMetadata(); metadata.title = channel.name; metadata.subtitle = channel.programs.find((program) => Date.parse(program.startsAt) <= Date.now() && Date.parse(program.endsAt) > Date.now())?.title ?? 'Live TV'; info.metadata = metadata; info.streamType = media.StreamType.LIVE; info.customData = { heartbeatUrl: session.heartbeatUrl, releaseUrl: session.releaseUrl, title: channel.name, subtitle: metadata.subtitle, posterUrl: channel.logoUrl, methodLabel: 'Live TV', currentBitrate: null, currentHeight: null, subtitleTrack: null, timelineOffsetMs: 0, fullDurationMs: null }; await castSession.loadMedia(new media.LoadRequest(info)); }
function clock(value: string) { return new Date(value).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }); }
function duration(value: number) { const minutes = Math.ceil(value / 60_000); return `${Math.floor(minutes / 60)} t ${String(minutes % 60).padStart(2, '0')} min`; }
function shortDuration(value: number) { const seconds = Math.max(0, Math.round(value)); return seconds < 60 ? `${seconds} sek.` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function bufferAhead(video: HTMLVideoElement | null) { if (!video) return 0; for (let index = 0; index < video.buffered.length; index += 1) if (video.currentTime >= video.buffered.start(index) && video.currentTime <= video.buffered.end(index)) return Math.round((video.buffered.end(index) - video.currentTime) * 1000); return 0; }
function message(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Live TV-handlingen fejlede.'); }
