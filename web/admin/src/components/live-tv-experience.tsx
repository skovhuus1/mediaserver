'use client';

import Hls from 'hls.js';
import { Antenna, Cast, ChevronLeft, ChevronRight, Heart, LoaderCircle, Pause, Play, Radio, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type ApiFailure, type SessionUser } from '@/lib/api';
import { CustomerShell } from './customer-shell';
import styles from './live-tv-experience.module.css';

type Program = { id: string; startsAt: string; endsAt: string; title: string; subtitle: string | null; description: string | null; category: string | null; iconUrl: string | null; episode: string | null };
type Channel = { id: string; name: string; number: number | null; logoUrl: string | null; groupName: string | null; favorite: boolean; programs: Program[] };
type Guide = { from: string; to: string; channels: Channel[] };
type LiveSession = { accepted: true; leaseId: string; method: string; status: string; channel: { id: string; name: string; number: number | null; logoUrl: string | null }; streamToken: string; streamUrl: string; statusUrl: string; heartbeatUrl: string; releaseUrl: string; contentType: string };
type StreamStatus = { status: string; method: string; error: string | null };

export function LiveTvExperience() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [group, setGroup] = useState('Alle');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingChannel, setStartingChannel] = useState<string | null>(null);

  const loadGuide = useCallback(async () => {
    const from = new Date(Date.now() - 30 * 60_000).toISOString();
    const to = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
    setGuide(await api<Guide>(`/live-tv/guide?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
  }, []);

  useEffect(() => { void Promise.all([api<SessionUser>('/auth/me'), loadGuide()]).then(([me]) => setUser(me)).catch(() => router.replace('/login?session=expired')); }, [loadGuide, router]);
  useEffect(() => { const timer = window.setInterval(() => void loadGuide().catch(() => undefined), 60_000); return () => window.clearInterval(timer); }, [loadGuide]);

  const channels = useMemo(() => (guide?.channels ?? []).filter((channel) => (!favoritesOnly || channel.favorite) && (group === 'Alle' || channel.groupName === group)), [favoritesOnly, group, guide]);
  const groups = useMemo(() => ['Alle', ...new Set((guide?.channels ?? []).flatMap((channel) => channel.groupName ? [channel.groupName] : []))], [guide]);

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

  const favorite = async (channel: Channel) => { await api(`/live-tv/favorites/${channel.id}`, { method: channel.favorite ? 'DELETE' : 'PUT' }); await loadGuide(); };

  if (!user) return <main className="watch-loading" aria-busy="true" />;
  return <CustomerShell user={user}><section className={styles.page}>
    <header className={styles.hero}><div><span>LIVE FRA DIN SERVER</span><h1>TV lige nu</h1><p>Én samlet kanalguide med automatisk valg af næste ledige M3U-forbindelse.</p></div><span className={styles.signal}><i /><b>{guide?.channels.length ?? 0}</b><small>kanaler online</small></span></header>
    {error && <div className={styles.error} role="alert">{error}<button onClick={() => setError(null)}><X /></button></div>}
    <nav className={styles.filters} aria-label="Live TV-kategorier"><button aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}><Heart fill={favoritesOnly ? 'currentColor' : 'none'} />Favoritter</button>{groups.map((name) => <button aria-pressed={!favoritesOnly && group === name} key={name} onClick={() => { setFavoritesOnly(false); setGroup(name); }}>{name}</button>)}</nav>
    <section className={styles.guide}><header><span>KANAL</span><span>NU OG SENERE</span><time>{new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}</time></header><div>{channels.map((channel) => <article className={styles.channel} key={channel.id}><button className={styles.identity} onClick={() => void start(channel)}><i>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</i><span><b>{channel.number ?? '•'}</b><strong>{channel.name}</strong><small>{channel.groupName ?? 'Live TV'}</small></span>{startingChannel === channel.id ? <LoaderCircle className={styles.spin} /> : <Play fill="currentColor" />}</button><button aria-label={`${channel.favorite ? 'Fjern' : 'Tilføj'} ${channel.name} som favorit`} className={styles.favorite} onClick={() => void favorite(channel)}><Heart fill={channel.favorite ? 'currentColor' : 'none'} /></button><div className={styles.programs}>{channel.programs.length ? channel.programs.slice(0, 6).map((program) => <ProgramCard key={program.id} program={program} />) : <span className={styles.noEpg}>Ingen programdata</span>}</div></article>)}</div>{!channels.length && <div className={styles.empty}><Radio /><h2>Ingen kanaler i denne visning</h2><p>Vælg en anden gruppe eller bed administratoren importere en M3U-kilde.</p></div>}</section>
  </section>{session && <LivePlayer channels={guide?.channels ?? []} session={session} onClose={() => setSession(null)} onError={setError} onSession={setSession} />}</CustomerShell>;
}

function ProgramCard({ program }: { program: Program }) { const now = Date.now(); const active = Date.parse(program.startsAt) <= now && Date.parse(program.endsAt) > now; const duration = Date.parse(program.endsAt) - Date.parse(program.startsAt); const progress = active ? Math.max(0, Math.min(100, ((now - Date.parse(program.startsAt)) / duration) * 100)) : 0; return <article className={styles.program} data-active={active}><time>{clock(program.startsAt)}–{clock(program.endsAt)}</time><strong>{program.title}</strong><small>{program.subtitle ?? program.category ?? 'Programinformation'}</small>{active && <i><b style={{ width: `${progress}%` }} /></i>}</article>; }

function LivePlayer({ channels, session, onClose, onError, onSession }: { channels: Channel[]; session: LiveSession; onClose: () => void; onError: (value: string | null) => void; onSession: (value: LiveSession) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const [casting, setCasting] = useState(false);
  const activeIndex = channels.findIndex((channel) => channel.id === session.channel.id);
  const channel = channels[activeIndex] ?? { ...session.channel, favorite: false, groupName: null, programs: [] } as Channel;
  const current = channel.programs.find((program) => Date.parse(program.startsAt) <= Date.now() && Date.parse(program.endsAt) > Date.now());
  const goLive = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.seekable.length) video.currentTime = Math.max(0, video.seekable.end(video.seekable.length - 1) - 1);
    void video.play().catch(() => undefined);
  }, []);

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
    if (!['ready', 'active'].includes(session.status)) return;
    const video = videoRef.current; if (!video) return;
    hlsRef.current?.destroy();
    if (Hls.isSupported()) { const hls = new Hls({ liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 8, enableWorker: true }); hlsRef.current = hls; hls.loadSource(session.streamUrl); hls.attachMedia(video); hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined)); hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) onError(`Live TV-streamfejl: ${data.details}`); }); }
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
  const switchTo = async (nextIndex: number) => { const nextChannel = channels[(nextIndex + channels.length) % channels.length]; if (!nextChannel) return; try { const next = await api<LiveSession>(`/live-tv/playback/leases/${session.leaseId}/switch`, { method: 'POST', body: JSON.stringify({ channelId: nextChannel.id, streamToken: session.streamToken, preferredMethod: 'auto' }) }); onSession(next); if (casting) await loadCast(next, nextChannel); } catch (failure) { onError(message(failure)); } };
  const cast = async () => { try { const handoff = await api<LiveSession>(`/live-tv/playback/leases/${session.leaseId}/cast-handoff`, { method: 'POST', body: JSON.stringify({ streamToken: session.streamToken }) }); await loadCast(handoff, channel); videoRef.current?.pause(); setCasting(true); onSession(handoff); } catch (failure) { onError(message(failure)); } };

  const pauseRemaining = Math.max(0, 7_200_000 - (pausedAt === null ? 0 : clockTick - pausedAt));
  return <section className={styles.player} aria-label={`Afspiller ${channel.name}`}><video autoPlay playsInline ref={videoRef} onPause={() => { setPaused(true); setPausedAt((value) => value ?? Date.now()); }} onPlay={() => { setPaused(false); setPausedAt(null); }} /><div className={styles.playerShade} /><header><span>{channel.logoUrl ? <img alt="" src={channel.logoUrl} /> : <Antenna />}</span><div><small>LIVE · {session.method.replaceAll('_', ' ')}</small><h2>{channel.name}</h2><p>{current?.title ?? 'Programinformation afventer'}</p></div><button aria-label="Luk Live TV" onClick={() => void close()}><X /></button></header>{session.status === 'preparing' && <div className={styles.preparing}><span><Antenna /><i /></span><h2>Forbereder Live TV</h2><p>Finder en ledig M3U-forbindelse og klargør streamen...</p></div>}<footer><button aria-label="Forrige kanal" onClick={() => void switchTo(activeIndex - 1)}><ChevronLeft /></button><button aria-label={paused ? 'Fortsæt' : 'Pause'} className={styles.primary} onClick={() => { const video = videoRef.current; if (!video) return; if (video.paused) void video.play(); else video.pause(); }}>{paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}</button><button aria-label="Næste kanal" onClick={() => void switchTo(activeIndex + 1)}><ChevronRight /></button><span><b>{channel.number ?? '•'} · {channel.name}</b><small>{paused ? `Sat på pause · ${duration(pauseRemaining)} tilbage` : current ? `${clock(current.startsAt)}–${clock(current.endsAt)} · ${current.title}` : 'Live TV'}</small></span>{paused && <button className={styles.liveButton} onClick={goLive}><Radio />Gå til live</button>}<button aria-label="Afspil på Chromecast" className={styles.cast} onClick={() => void cast()}><Cast />{casting ? 'Caster' : 'Cast'}</button></footer></section>;
}

type CastWindow = Window & { cast?: { framework?: { CastContext: { getInstance(): { setOptions(options: object): void; requestSession(): Promise<void>; getCurrentSession(): { loadMedia(request: object): Promise<void> } | null } }; AutoJoinPolicy?: { ORIGIN_SCOPED: string } } }; chrome?: { cast?: { AutoJoinPolicy?: { ORIGIN_SCOPED: string }; media?: { DEFAULT_MEDIA_RECEIVER_APP_ID: string; MediaInfo: new (url: string, type: string) => { metadata?: object; streamType?: string; customData?: object }; GenericMediaMetadata: new () => { title?: string; subtitle?: string }; LoadRequest: new (media: object) => object; StreamType: { LIVE: string } } } } };
async function loadCast(session: LiveSession, channel: Channel) { if (!window.isSecureContext) throw new Error('Chromecast kræver HTTPS.'); const castWindow = window as CastWindow; const framework = castWindow.cast?.framework; const media = castWindow.chrome?.cast?.media; if (!framework || !media) throw new Error('Google Cast Framework er ikke klar. Prøv igen om et øjeblik.'); const context = framework.CastContext.getInstance(); context.setOptions({ receiverApplicationId: process.env.NEXT_PUBLIC_CAST_RECEIVER_APP_ID?.trim() || media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: castWindow.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED ?? framework.AutoJoinPolicy?.ORIGIN_SCOPED ?? 'origin_scoped' }); if (!context.getCurrentSession()) await context.requestSession(); const castSession = context.getCurrentSession(); if (!castSession) throw new Error('Chromecast-sessionen kunne ikke oprettes.'); const info = new media.MediaInfo(session.streamUrl, session.contentType); const metadata = new media.GenericMediaMetadata(); metadata.title = channel.name; metadata.subtitle = channel.programs.find((program) => Date.parse(program.startsAt) <= Date.now() && Date.parse(program.endsAt) > Date.now())?.title ?? 'Live TV'; info.metadata = metadata; info.streamType = media.StreamType.LIVE; info.customData = { heartbeatUrl: session.heartbeatUrl, releaseUrl: session.releaseUrl, title: channel.name, subtitle: metadata.subtitle, posterUrl: channel.logoUrl, methodLabel: 'Live TV', currentBitrate: null, currentHeight: null, subtitleTrack: null, timelineOffsetMs: 0, fullDurationMs: null }; await castSession.loadMedia(new media.LoadRequest(info)); }
function clock(value: string) { return new Date(value).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }); }
function duration(value: number) { const minutes = Math.ceil(value / 60_000); return `${Math.floor(minutes / 60)} t ${String(minutes % 60).padStart(2, '0')} min`; }
function bufferAhead(video: HTMLVideoElement | null) { if (!video) return 0; for (let index = 0; index < video.buffered.length; index += 1) if (video.currentTime >= video.buffered.start(index) && video.currentTime <= video.buffered.end(index)) return Math.round((video.buffered.end(index) - video.currentTime) * 1000); return 0; }
function message(error: unknown) { return (error as ApiFailure)?.message ?? (error instanceof Error ? error.message : 'Live TV-handlingen fejlede.'); }
