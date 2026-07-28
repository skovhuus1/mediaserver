'use client';

import Hls from 'hls.js';
import {
  ArrowLeft,
  Captions,
  Cast,
  Check,
  Gauge,
  Info,
  ListVideo,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { accessToken, api, type ApiFailure } from '@/lib/api';
import styles from './playback.module.css';

export type PlayableMedia = {
  id: string;
  title: string;
  type?: string;
  seriesTitle?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  releaseYear?: number | null;
  category?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  file?: { durationMs?: number | null } | null;
};

type PlaybackRequest = { media: PlayableMedia; resumePositionMs: number };
type PlaybackContext = { profileId: string | null; deviceId: string | null };
type Authorization = {
  sessionId: string;
  method: 'direct_play' | 'direct_stream' | 'transcode';
  streamUrl: string;
  contentType: string;
  transcodeStatusUrl?: string;
  leaseExpiresAt: string;
};
type TranscodeStatus = { state: 'queued' | 'running' | 'ready' | 'failed'; message: string };
type PlayerMenu = 'playlist' | 'speed' | 'subtitles' | 'audio' | 'quality' | 'info' | null;
type AudioTrack = { index: number; name: string; language: string };
type QualityLevel = { index: number; label: string };

type CastMediaInfo = {
  metadata?: { title?: string; subtitle?: string };
};
type CastLoadRequest = { currentTime?: number };
type CastSession = { loadMedia(request: CastLoadRequest): Promise<void> };
type CastContext = {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
};
type CastWindow = Window & {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: {
    framework?: {
      CastContext: { getInstance(): CastContext };
      AutoJoinPolicy: { ORIGIN_SCOPED: string };
    };
  };
  chrome?: {
    cast?: {
      media?: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (url: string, contentType: string) => CastMediaInfo;
        GenericMediaMetadata: new () => { title?: string; subtitle?: string };
        LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
      };
    };
  };
};

const requestEvent = 'bb:request-playback';
const historyEvent = 'bb:playback-history-changed';
const castScriptId = 'bb-google-cast-sdk';

export function requestPlayback(media: PlayableMedia, resumePositionMs = 0) {
  window.dispatchEvent(new CustomEvent<PlaybackRequest>(requestEvent, {
    detail: { media, resumePositionMs },
  }));
}

export function WebPlayer() {
  const overlayRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionRef = useRef<string | null>(null);
  const mediaRef = useRef<PlayableMedia | null>(null);
  const resumeRef = useRef(0);
  const castingRef = useRef(false);
  const lastProgressAt = useRef(0);
  const requestNumber = useRef(0);
  const [media, setMedia] = useState<PlayableMedia | null>(null);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [sourceReady, setSourceReady] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<PlayerMenu>(null);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState(0);
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [activeQuality, setActiveQuality] = useState(-1);
  const [castAvailable, setCastAvailable] = useState(false);
  const [casting, setCasting] = useState(false);

  const saveProgress = useCallback(async (completed = false) => {
    const sessionId = sessionRef.current;
    const video = videoRef.current;
    if (!sessionId || !video) return;
    const fallbackDuration = mediaRef.current?.file?.durationMs ?? undefined;
    const durationMs = Number.isFinite(video.duration) && video.duration > 0
      ? Math.round(video.duration * 1000)
      : fallbackDuration;
    await api(`/playback/sessions/${sessionId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({
        positionMs: Math.max(0, Math.round(video.currentTime * 1000)),
        ...(durationMs ? { durationMs } : {}),
        completed,
      }),
      keepalive: true,
    });
    window.dispatchEvent(new Event(historyEvent));
  }, []);

  const stop = useCallback(async () => {
    requestNumber.current += 1;
    const sessionId = sessionRef.current;
    if (sessionId) {
      await Promise.allSettled([
        saveProgress(false),
        api(`/playback/sessions/${sessionId}`, { method: 'DELETE', keepalive: true }),
      ]);
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    sessionRef.current = null;
    mediaRef.current = null;
    castingRef.current = false;
    setAuthorization(null);
    setSourceReady(false);
    setMedia(null);
    setMenu(null);
    setStatus('');
    setError('');
    setCasting(false);
  }, [saveProgress]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Number.MAX_SAFE_INTEGER, video.currentTime + seconds));
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<PlaybackRequest>).detail;
      void (async () => {
        if (sessionRef.current) await stop();
        const currentRequest = ++requestNumber.current;
        setMedia(request.media);
        mediaRef.current = request.media;
        resumeRef.current = request.resumePositionMs;
        setError('');
        setStatus('Autoriserer afspilning...');
        try {
          const context = await api<PlaybackContext>('/playback/context');
          if (!context.profileId || !context.deviceId) {
            throw { message: 'Den aktive profil eller enhed mangler. Log ind igen.' } satisfies Partial<ApiFailure>;
          }
          const next = await api<Authorization>('/playback/authorize', {
            method: 'POST',
            body: JSON.stringify({
              profileId: context.profileId,
              mediaId: request.media.id,
              deviceId: context.deviceId,
              capabilities: browserCapabilities(),
            }),
          });
          if (currentRequest !== requestNumber.current) {
            await api(`/playback/sessions/${next.sessionId}`, { method: 'DELETE' }).catch(() => undefined);
            return;
          }
          sessionRef.current = next.sessionId;
          setAuthorization(next);
          if (next.method === 'transcode') {
            if (!next.transcodeStatusUrl) throw new Error('Transcode-status mangler i serverens svar.');
            setStatus('FFmpeg forbereder streamen...');
            const ready = await waitForTranscode(next.transcodeStatusUrl, () => currentRequest === requestNumber.current);
            if (!ready) return;
            setStatus('Transcoding · HLS');
          } else {
            setStatus(next.method === 'direct_play' ? 'Direkte afspilning' : 'Direct Stream');
          }
          setSourceReady(true);
        } catch (caught) {
          const sessionId = sessionRef.current;
          sessionRef.current = null;
          if (sessionId) await api(`/playback/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined);
          setAuthorization(null);
          setSourceReady(false);
          setError((caught as ApiFailure)?.message ?? 'Afspilningen kunne ikke startes.');
          setStatus('');
        }
      })();
    };
    window.addEventListener(requestEvent, onRequest);
    return () => window.removeEventListener(requestEvent, onRequest);
  }, [stop]);

  useEffect(() => {
    if (!authorization || !sourceReady) return;
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    const start = () => {
      if (disposed) return;
      const target = resumeRef.current / 1000;
      if (target > 0 && target < video.duration) video.currentTime = target;
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      void video.play().catch(() => undefined);
    };

    if (authorization.method === 'transcode' && Hls.isSupported()) {
      const hls = new Hls({
        backBufferLength: 90,
        maxBufferLength: 45,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.loadSource(authorization.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setQualities(hls.levels.map((level, index) => ({
          index,
          label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} Kbps`,
        })));
        setAudioTracks(hls.audioTracks.map((track, index) => ({
          index,
          name: track.name || `Lydspor ${index + 1}`,
          language: track.lang || '',
        })));
        start();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setError(`HLS-afspilningen stoppede: ${data.details}`);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      });
    } else {
      video.src = authorization.streamUrl;
      video.addEventListener('loadedmetadata', start, { once: true });
    }

    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [authorization, sourceReady]);

  useEffect(() => {
    if (!authorization) return;
    const heartbeat = window.setInterval(() => {
      void api(`/playback/sessions/${authorization.sessionId}/heartbeat`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }).catch((caught: ApiFailure) => setError(caught.message ?? 'Playback-sessionen udløb.'));
    }, 30_000);
    return () => window.clearInterval(heartbeat);
  }, [authorization]);

  useEffect(() => {
    void loadCastFramework().then(setCastAvailable);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!media || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (document.fullscreenElement) void document.exitFullscreen();
        else void stop();
      } else if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowLeft') {
        seekBy(-10);
      } else if (event.key === 'ArrowRight') {
        seekBy(10);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [media, seekBy, stop, togglePlay]);

  useEffect(() => {
    const onPageHide = () => {
      const sessionId = sessionRef.current;
      const video = videoRef.current;
      const token = accessToken();
      if (!sessionId || !video || !token || castingRef.current) return;
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
      void fetch(`/api/v1/playback/sessions/${sessionId}/progress`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ positionMs: Math.max(0, Math.round(video.currentTime * 1000)) }),
        keepalive: true,
      });
      void fetch(`/api/v1/playback/sessions/${sessionId}`, { method: 'DELETE', headers, keepalive: true });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  const startCast = async () => {
    if (!authorization || !media) return;
    setCasting(true);
    setError('');
    try {
      const castWindow = window as CastWindow;
      const framework = castWindow.cast?.framework;
      const mediaApi = castWindow.chrome?.cast?.media;
      if (!framework || !mediaApi) throw new Error('Google Cast er ikke tilgængelig i denne browser.');
      const context = framework.CastContext.getInstance();
      await context.requestSession();
      await api(`/playback/sessions/${authorization.sessionId}/cast-handoff`, { method: 'POST' });
      const castSession = context.getCurrentSession();
      if (!castSession) throw new Error('Chromecast-sessionen kunne ikke oprettes.');
      const mediaInfo = new mediaApi.MediaInfo(
        new URL(authorization.streamUrl, window.location.href).href,
        authorization.contentType,
      );
      const metadata = new mediaApi.GenericMediaMetadata();
      metadata.title = media.seriesTitle ?? media.title;
      metadata.subtitle = media.seriesTitle ? episodeLabel(media) : status;
      mediaInfo.metadata = metadata;
      const request = new mediaApi.LoadRequest(mediaInfo);
      request.currentTime = videoRef.current?.currentTime ?? 0;
      await castSession.loadMedia(request);
      videoRef.current?.pause();
      castingRef.current = true;
      setStatus('Chromecast');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chromecast kunne ikke startes.');
    } finally {
      setCasting(false);
    }
  };

  const selectPlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    setPlaybackRate(rate);
    setMenu(null);
  };

  const selectAudioTrack = (index: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = index;
    setActiveAudioTrack(index);
    setMenu(null);
  };

  const selectQuality = (index: number) => {
    if (hlsRef.current) hlsRef.current.currentLevel = index;
    setActiveQuality(index);
    setMenu(null);
  };

  if (!media) return null;
  return (
    <section ref={overlayRef} className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Afspiller ${media.title}`}>
      <video
        className={styles.video}
        ref={videoRef}
        playsInline
        onPlay={() => setPaused(false)}
        onPause={() => {
          setPaused(true);
          void saveProgress(false).catch(() => undefined);
        }}
        onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onVolumeChange={(event) => setVolume(event.currentTarget.volume)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          const now = Date.now();
          if (now - lastProgressAt.current < 10_000) return;
          lastProgressAt.current = now;
          void saveProgress(false).catch(() => undefined);
        }}
        onEnded={() => void saveProgress(true).then(() => setStatus('Færdig')).catch(() => undefined)}
        onError={() => {
          if (sourceReady) setError('Browseren kunne ikke afspille den leverede stream.');
        }}
      />

      <div className={styles.topBar}>
        <button className={styles.iconButton} onClick={() => void stop()} aria-label="Tilbage"><ArrowLeft /></button>
        <div className={styles.title}>
          <strong>{media.seriesTitle ?? media.title}</strong>
          <small>
            {[media.releaseYear, media.category, episodeLabel(media)].filter(Boolean).join(' · ')}
          </small>
        </div>
        <div className={styles.topActions}>
          <button
            className={styles.iconButton}
            onClick={() => void startCast()}
            disabled={!castAvailable || !authorization || !sourceReady || casting}
            aria-label="Chromecast"
            title={castAvailable ? 'Afspil på Chromecast' : 'Google Cast er ikke tilgængelig'}
          >
            <Cast />
          </button>
          <button className={styles.iconButton} onClick={() => setMenu(menu === 'info' ? null : 'info')} aria-label="Information"><Info /></button>
          <button className={styles.iconButton} onClick={() => void stop()} aria-label="Luk"><X /></button>
        </div>
      </div>

      {!sourceReady && (
        <div className={styles.notice}>
          <Play size={34} />
          <h2>{error ? 'Afspilningen kunne ikke startes' : 'Forbereder stream'}</h2>
          <p>{error || status}</p>
        </div>
      )}

      {sourceReady && (
        <aside className={styles.playbackBadge}>
          <span>Afspilning</span>
          <strong>{status}</strong>
          <small>{authorization?.method === 'transcode' ? 'H.264 · AAC · HLS' : authorization?.contentType}</small>
        </aside>
      )}

      {menu && sourceReady && (
        <aside className={styles.settingsPanel}>
          <header>
            <strong>{menuTitle(menu)}</strong>
            <button onClick={() => setMenu(null)} aria-label="Luk menu"><X size={18} /></button>
          </header>
          {menu === 'playlist' && (
            <button className={styles.menuRow}>
              <ListVideo size={18} />
              <span><strong>{media.title}</strong><small>Aktuel afspilning</small></span>
              <Check size={17} />
            </button>
          )}
          {menu === 'speed' && [0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <button className={styles.menuRow} key={rate} onClick={() => selectPlaybackRate(rate)}>
              <span>{rate.toFixed(rate === 1 ? 1 : 2).replace(/0$/, '')}x</span>
              {playbackRate === rate && <Check size={17} />}
            </button>
          ))}
          {menu === 'subtitles' && (
            <div className={styles.emptyMenu}>Der blev ikke fundet undertekster til denne fil.</div>
          )}
          {menu === 'audio' && (audioTracks.length ? audioTracks.map((track) => (
            <button className={styles.menuRow} key={track.index} onClick={() => selectAudioTrack(track.index)}>
              <span><strong>{track.name}</strong><small>{track.language || 'Ukendt sprog'}</small></span>
              {activeAudioTrack === track.index && <Check size={17} />}
            </button>
          )) : <div className={styles.emptyMenu}>Browseren eksponerer ikke separate lydspor for denne stream.</div>)}
          {menu === 'quality' && (
            <>
              <button className={styles.menuRow} onClick={() => selectQuality(-1)}>
                <span>Automatisk</span>{activeQuality === -1 && <Check size={17} />}
              </button>
              {qualities.map((quality) => (
                <button className={styles.menuRow} key={quality.index} onClick={() => selectQuality(quality.index)}>
                  <span>{quality.label}</span>{activeQuality === quality.index && <Check size={17} />}
                </button>
              ))}
              {!qualities.length && <div className={styles.emptyMenu}>Original kvalitet · Direct Play</div>}
            </>
          )}
          {menu === 'info' && (
            <dl className={styles.infoGrid}>
              <dt>Titel</dt><dd>{media.title}</dd>
              <dt>År</dt><dd>{media.releaseYear ?? 'Ukendt'}</dd>
              <dt>Type</dt><dd>{media.type ?? 'Ukendt'}</dd>
              <dt>Kategori</dt><dd>{media.category ?? 'Ikke angivet'}</dd>
              <dt>Metode</dt><dd>{status || 'Forbereder'}</dd>
            </dl>
          )}
        </aside>
      )}

      {sourceReady && (
        <div className={styles.controls}>
          <div className={styles.timeline}>
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (videoRef.current) videoRef.current.currentTime = next;
                setCurrentTime(next);
              }}
              aria-label="Afspilningsposition"
            />
            <span>{formatTime(duration)}</span>
          </div>
          <div className={styles.controlRow}>
            <button className={styles.controlLabel} onClick={() => setMenu(menu === 'playlist' ? null : 'playlist')}>
              <ListVideo /><span>Afspilningsliste</span>
            </button>
            <div className={styles.transport}>
              <button disabled title="Forrige titel"><SkipBack /></button>
              <button onClick={() => seekBy(-10)} title="10 sekunder tilbage"><RotateCcw /><small>10</small></button>
              <button className={styles.primaryControl} onClick={togglePlay} title={paused ? 'Afspil' : 'Pause'}>
                {paused ? <Play fill="currentColor" /> : <Pause fill="currentColor" />}
              </button>
              <button onClick={() => seekBy(10)} title="10 sekunder frem"><RotateCw /><small>10</small></button>
              <button disabled title="Næste titel"><SkipForward /></button>
            </div>
            <div className={styles.optionControls}>
              <button onClick={() => setMenu(menu === 'speed' ? null : 'speed')}><Gauge /><small>{playbackRate}x</small><span>Hastighed</span></button>
              <button onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')}><Captions /><span>Undertekster</span></button>
              <button onClick={() => setMenu(menu === 'audio' ? null : 'audio')}><Volume2 /><span>Lydspor</span></button>
              <button onClick={() => setMenu(menu === 'quality' ? null : 'quality')}><Settings2 /><span>Kvalitet</span></button>
              <button onClick={() => void overlayRef.current?.requestFullscreen()}><Maximize /><span>Fuld skærm</span></button>
            </div>
          </div>
          <div className={styles.volume}>
            <Volume2 size={16} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (videoRef.current) videoRef.current.volume = next;
                setVolume(next);
              }}
              aria-label="Lydstyrke"
            />
          </div>
        </div>
      )}
    </section>
  );
}

function browserCapabilities() {
  return {
    supportedCodecs: ['h264', 'avc1', 'aac', 'mp3', 'vp8', 'vp9', 'opus'],
    supportedContainers: ['mov', 'mp4', 'webm', 'ogg'],
  };
}

async function waitForTranscode(statusUrl: string, isCurrent: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (!isCurrent()) return false;
    const response = await fetch(statusUrl, { cache: 'no-store' });
    const result = await response.json() as TranscodeStatus & ApiFailure;
    if (!response.ok) throw result;
    if (result.state === 'ready') return true;
    if (result.state === 'failed') throw new Error(result.message);
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error('Transcoding tog længere end fem minutter om at levere det første segment.');
}

async function loadCastFramework(): Promise<boolean> {
  const castWindow = window as CastWindow;
  if (castWindow.cast?.framework && castWindow.chrome?.cast?.media) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      if (available) {
        const framework = castWindow.cast?.framework;
        const media = castWindow.chrome?.cast?.media;
        if (framework && media) {
          framework.CastContext.getInstance().setOptions({
            receiverApplicationId: media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: framework.AutoJoinPolicy.ORIGIN_SCOPED,
          });
          resolve(true);
          return;
        }
      }
      resolve(false);
    };
    castWindow.__onGCastApiAvailable = finish;
    if (!document.getElementById(castScriptId)) {
      const script = document.createElement('script');
      script.id = castScriptId;
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      script.async = true;
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    }
    window.setTimeout(() => finish(Boolean(castWindow.cast?.framework)), 10_000);
  });
}

function menuTitle(menu: Exclude<PlayerMenu, null>) {
  return ({
    playlist: 'Afspilningsliste',
    speed: 'Hastighed',
    subtitles: 'Undertekster',
    audio: 'Lydspor',
    quality: 'Kvalitet',
    info: 'Information',
  } as const)[menu];
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function episodeLabel(media: PlayableMedia) {
  if (media.seasonNumber === null || media.seasonNumber === undefined) return media.type === 'movie' ? 'Film' : '';
  return `S${String(media.seasonNumber).padStart(2, '0')}E${String(media.episodeNumber ?? 0).padStart(2, '0')} · ${media.title}`;
}

export const playbackHistoryChangedEvent = historyEvent;
