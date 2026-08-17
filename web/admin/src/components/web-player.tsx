'use client';

import Hls from 'hls.js';
import {
  normalizePlaybackQualitySelection,
  chooseDefaultWebVttSubtitle,
  deferredUpscaleLevelCap,
  playbackResumeTargetSeconds,
  presentPlaybackQualityLevel,
  sanitizeMediaTitle,
} from '@boltbytes/contracts';
import {
  ArrowLeft,
  Captions,
  Cast,
  Check,
  Gauge,
  Info,
  ListVideo,
  Maximize,
  Minimize,
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
import { Brand } from './brand';
import { ensureCastSdk } from './cast-sdk-loader';
import styles from './playback.module.css';

export type PlayableMedia = {
  id: string;
  title: string;
  type?: string;
  seriesTitle?: string | null;
  seriesDisplayTitle?: string | null;
  seriesMetadataProviderId?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  releaseYear?: number | null;
  category?: string | null;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  width?: number | null;
  height?: number | null;
  hdr?: 'hdr10' | 'hlg' | 'dolby_vision' | null;
  file?: { durationMs?: number | null } | null;
};

type PlaybackRequest = { media: PlayableMedia; resumePositionMs: number };
type PlaybackContext = { profileId: string | null; deviceId: string | null };
type Authorization = {
  sessionId: string;
  streamToken: string;
  method: 'direct_play' | 'direct_stream' | 'transcode';
  streamUrl: string;
  contentType: string;
  transcodeStatusUrl?: string;
  subtitleTracks: SubtitleTrack[];
  videoProfile: {
    source: {
      width: number | null;
      height: number | null;
      bitrate: number | null;
      codec: string | null;
      hdr: 'hdr10' | 'hlg' | 'dolby_vision' | null;
      bitDepth: number | null;
    };
    output: { height: number | null; hdr: 'hdr10' | 'hlg' | 'dolby_vision' | null };
  };
  playbackPreferences: {
    qualityMode: 'auto' | 'fixed' | 'original';
    fixedQualityHeight: number | null;
    allowUpscale: boolean;
    dataSaver: boolean;
    playbackRate: number;
    hdrMode: 'auto' | 'prefer_hdr' | 'force_sdr';
    preferredAudioLanguages: string[];
    preferredSubtitleLanguages: string[];
    subtitleMode: 'auto' | 'always' | 'forced' | 'off';
    autoplayNext: boolean;
  };
  adaptiveQuality: {
    renditions: Array<{ height: number; bitrate: number; upscaled: boolean; hdr: boolean }>;
  };
  leaseExpiresAt: string;
  decision?: {
    playback: {
      method: 'direct_play' | 'direct_stream' | 'transcode';
      code: string;
      reason: string;
      directPlayBlockers: string[];
    };
  };
};
type TranscodeStatus = { state: 'queued' | 'running' | 'ready' | 'failed'; message: string };
type PlayerMenu = 'playlist' | 'speed' | 'subtitles' | 'audio' | 'quality' | 'info' | null;
type AudioTrack = { index: number; name: string; language: string };
type QualityLevel = ReturnType<typeof presentPlaybackQualityLevel> & { index: number };
type SubtitleTrack = {
  id: string;
  label: string;
  language: string;
  src: string | null;
  contentType: 'text/vtt' | null;
  delivery: 'webvtt' | 'burn_in';
};
type SubtitlePosition = 'top' | 'middle' | 'bottom';
type SubtitleColor = 'white' | 'yellow' | 'cyan' | 'green';
type SubtitleAppearance = { position: SubtitlePosition; color: SubtitleColor };
type CastHandoff = {
  accepted: true;
  sessionId: string;
  logicalSessionId: string;
  method: Authorization['method'];
  streamUrl: string;
  contentType: string;
  subtitleTracks: SubtitleTrack[];
  tokenExpiresAt: string;
};

type CastMediaInfo = {
  metadata?: { title?: string; subtitle?: string };
  tracks?: CastTrack[];
  streamType?: string;
  duration?: number;
};
type CastTrack = {
  trackContentId?: string;
  trackContentType?: string;
  subtype?: string;
  name?: string;
  language?: string;
};
type CastLoadRequest = { currentTime?: number; activeTrackIds?: number[] };
type CastMediaSession = {
  editTracksInfo(
    request: object,
    success: () => void,
    failure: (error: unknown) => void,
  ): void;
};
type CastSession = {
  loadMedia(request: CastLoadRequest): Promise<void>;
  endSession(stopCastingMedia: boolean): void;
  getMediaSession(): CastMediaSession | null;
};
type CastContext = {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  requestSession(): Promise<void>;
  getCurrentSession(): CastSession | null;
};
type CastRemotePlayer = {
  currentTime: number;
  duration: number;
  isConnected: boolean;
  isPaused: boolean;
  playerState: string;
  volumeLevel: number;
};
type CastRemotePlayerController = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  playOrPause(): void;
  seek(): void;
  setVolumeLevel(): void;
  stop(): void;
};
type CastWindow = Window & {
  __onGCastApiAvailable?: (available: boolean, errorInfo?: unknown) => void;
  cast?: {
    framework?: {
      CastContext: { getInstance(): CastContext };
      AutoJoinPolicy: { ORIGIN_SCOPED: string };
      RemotePlayer: new () => CastRemotePlayer;
      RemotePlayerController: new (player: CastRemotePlayer) => CastRemotePlayerController;
      RemotePlayerEventType: { ANY_CHANGE: string };
    };
  };
  chrome?: {
    cast?: {
      AutoJoinPolicy?: { ORIGIN_SCOPED: string };
      media?: {
        DEFAULT_MEDIA_RECEIVER_APP_ID: string;
        MediaInfo: new (url: string, contentType: string) => CastMediaInfo;
        GenericMediaMetadata: new () => { title?: string; subtitle?: string };
        LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
        EditTracksInfoRequest: new (activeTrackIds: number[]) => object;
        Track: new (trackId: number, trackType: string) => CastTrack;
        TrackType: { TEXT: string };
        TextTrackType: { SUBTITLES: string };
        StreamType: { BUFFERED: string };
      };
    };
  };
};

const requestEvent = 'bb:request-playback';
const historyEvent = 'bb:playback-history-changed';
const subtitleAppearanceStorageKey = 'bb-media-subtitle-appearance-v1';
const subtitlePositions: Array<{ value: SubtitlePosition; label: string }> = [
  { value: 'top', label: 'Øverst' },
  { value: 'middle', label: 'Midt' },
  { value: 'bottom', label: 'Nederst' },
];
const subtitleColors: Array<{ value: SubtitleColor; label: string; hex: string }> = [
  { value: 'white', label: 'Hvid', hex: '#ffffff' },
  { value: 'yellow', label: 'Gul', hex: '#ffe66d' },
  { value: 'cyan', label: 'Cyan', hex: '#72e7ff' },
  { value: 'green', label: 'Grøn', hex: '#91f2a7' },
];

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
  const resumeAppliedRef = useRef(false);
  const castingRef = useRef(false);
  const bufferingRef = useRef(false);
  const castRemotePlayerRef = useRef<CastRemotePlayer | null>(null);
  const castRemoteControllerRef = useRef<CastRemotePlayerController | null>(null);
  const clearCastListenerRef = useRef<(() => void) | null>(null);
  const activeSubtitleRef = useRef<string | null>(null);
  const subtitleOffsetRef = useRef(0);
  const lastProgressAt = useRef(0);
  const requestNumber = useRef(0);
  const qualitySelectionRef = useRef(-1);
  const timelineOffsetRef = useRef(0);
  const upscaleUnlockedRef = useRef(false);
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
  const [qualitySelection, setQualitySelection] = useState(-1);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [qualitySwitching, setQualitySwitching] = useState<number | null>(null);
  const [upscaleUnlocked, setUpscaleUnlocked] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState<string | null>(null);
  const [subtitleCue, setSubtitleCue] = useState('');
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>('bottom');
  const [subtitleColor, setSubtitleColor] = useState<SubtitleColor>('white');
  const [subtitleOffsetMs, setSubtitleOffsetMs] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [castAvailable, setCastAvailable] = useState(false);
  const [castReason, setCastReason] = useState('Google Cast Framework indlæses...');
  const [castNotice, setCastNotice] = useState('');
  const [casting, setCasting] = useState(false);

  const saveProgress = useCallback(async (completed = false) => {
    const sessionId = sessionRef.current;
    const video = videoRef.current;
    const remote = castingRef.current ? castRemotePlayerRef.current : null;
    const positionSeconds = remote
      ? timelineOffsetRef.current + remote.currentTime
      : video ? timelineOffsetRef.current + video.currentTime : undefined;
    if (!sessionId || positionSeconds === undefined) return;
    const fallbackDuration = mediaRef.current?.file?.durationMs ?? undefined;
    const playbackDuration = remote?.duration
      ?? (fallbackDuration ? fallbackDuration / 1000 : video ? timelineOffsetRef.current + video.duration : undefined);
    const durationMs = typeof playbackDuration === 'number' && Number.isFinite(playbackDuration) && playbackDuration > 0
      ? Math.round(playbackDuration * 1000)
      : fallbackDuration;
    await api(`/playback/sessions/${sessionId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({
        positionMs: Math.max(0, Math.round(positionSeconds * 1000)),
        ...(durationMs ? { durationMs } : {}),
        completed,
      }),
      keepalive: true,
    });
    window.dispatchEvent(new Event(historyEvent));
  }, []);

  const stop = useCallback(async () => {
    requestNumber.current += 1;
    const wasCasting = castingRef.current;
    if (wasCasting) await saveProgress(false).catch(() => undefined);
    castingRef.current = false;
    clearCastListenerRef.current?.();
    clearCastListenerRef.current = null;
    const castWindow = window as CastWindow;
    if (wasCasting) {
      castRemoteControllerRef.current?.stop();
      castWindow.cast?.framework?.CastContext.getInstance().getCurrentSession()?.endSession(true);
    }
    const sessionId = sessionRef.current;
    if (sessionId) {
      await Promise.allSettled([
        ...(wasCasting ? [] : [saveProgress(false)]),
        api(`/playback/sessions/${sessionId}`, { method: 'DELETE', keepalive: true }),
      ]);
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    sessionRef.current = null;
    mediaRef.current = null;
    castingRef.current = false;
    castRemotePlayerRef.current = null;
    castRemoteControllerRef.current = null;
    setAuthorization(null);
    setSourceReady(false);
    setMedia(null);
    setMenu(null);
    setStatus('');
    setError('');
    setCastNotice('');
    setCasting(false);
    activeSubtitleRef.current = null;
    setActiveSubtitle(null);
    setSubtitleCue('');
    setQualities([]);
    setQualitySelection(-1);
    setCurrentQuality(-1);
    setQualitySwitching(null);
    timelineOffsetRef.current = 0;
    upscaleUnlockedRef.current = false;
    setUpscaleUnlocked(false);
  }, [saveProgress]);

  const togglePlay = useCallback(() => {
    if (castingRef.current && castRemoteControllerRef.current) {
      castRemoteControllerRef.current.playOrPause();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const restartStreamAt = useCallback(async (targetSeconds: number) => {
    const currentAuthorization = authorization;
    const video = videoRef.current;
    if (!currentAuthorization || !video || currentAuthorization.method === 'direct_play') return;
    const fullDuration = mediaRef.current?.file?.durationMs
      ? mediaRef.current.file.durationMs / 1000
      : duration;
    const target = Math.max(0, Math.min(Math.max(0, fullDuration - 1), targetSeconds));
    const activeTrack = currentAuthorization.subtitleTracks.find(
      (track) => track.id === activeSubtitleRef.current,
    );
    setControlsVisible(true);
    setError('');
    setStatus(`Forbereder stream fra ${formatTime(target)}...`);
    await saveProgress(false).catch(() => undefined);
    setSourceReady(false);
    try {
      const configuration = await api<{
        method: 'direct_stream' | 'transcode';
        streamUrl: string;
        transcodeStatusUrl: string;
        adaptiveQuality: Authorization['adaptiveQuality'];
      }>(`/playback/sessions/${currentAuthorization.sessionId}/configuration`, {
        method: 'PATCH',
        body: JSON.stringify({
          streamToken: currentAuthorization.streamToken,
          burnIn: activeTrack?.delivery === 'burn_in',
          ...(activeTrack?.delivery === 'burn_in' ? { subtitleTrackId: activeTrack.id } : {}),
          startPositionMs: Math.round(target * 1_000),
        }),
      });
      const ready = await waitForTranscode(
        configuration.transcodeStatusUrl,
        () => sessionRef.current === currentAuthorization.sessionId,
      );
      if (!ready) return;
      timelineOffsetRef.current = target;
      resumeRef.current = 0;
      resumeAppliedRef.current = true;
      setCurrentTime(target);
      setAuthorization({
        ...currentAuthorization,
        method: configuration.method,
        streamUrl: configuration.streamUrl,
        transcodeStatusUrl: configuration.transcodeStatusUrl,
        adaptiveQuality: configuration.adaptiveQuality,
      });
      setStatus(`${configuration.method === 'direct_stream' ? 'Direct Stream' : 'Transcoding'} · HLS · fra ${formatTime(target)}`);
      setSourceReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Den valgte position kunne ikke forberedes.');
      setStatus('');
    }
  }, [authorization, duration, saveProgress]);

  const seekTo = useCallback((targetSeconds: number) => {
    const remote = castRemotePlayerRef.current;
    const controller = castRemoteControllerRef.current;
    if (castingRef.current && remote && controller) {
      remote.currentTime = Math.max(0, Math.min(remote.duration || Number.MAX_SAFE_INTEGER, targetSeconds));
      controller.seek();
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const fullDuration = mediaRef.current?.file?.durationMs
      ? mediaRef.current.file.durationMs / 1000
      : timelineOffsetRef.current + (video.duration || Number.MAX_SAFE_INTEGER);
    const target = Math.max(0, Math.min(fullDuration, targetSeconds));
    const localTarget = target - timelineOffsetRef.current;
    if (
      authorization?.method === 'direct_play'
      || (localTarget >= 0 && mediaTimeIsBuffered(video, localTarget))
    ) {
      video.currentTime = localTarget;
      setCurrentTime(target);
      return;
    }
    void restartStreamAt(target);
  }, [authorization?.method, restartStreamAt]);

  const seekBy = useCallback((seconds: number) => {
    const remote = castRemotePlayerRef.current;
    const position = castingRef.current && remote
      ? remote.currentTime
      : timelineOffsetRef.current + (videoRef.current?.currentTime ?? 0);
    seekTo(position + seconds);
  }, [seekTo]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<PlaybackRequest>).detail;
      void (async () => {
        if (sessionRef.current) await stop();
        const currentRequest = ++requestNumber.current;
        setMedia(request.media);
        mediaRef.current = request.media;
        resumeRef.current = request.resumePositionMs;
        resumeAppliedRef.current = false;
        setQualities([]);
        setQualitySelection(-1);
        setCurrentQuality(-1);
        setQualitySwitching(null);
        setError('');
        setCastNotice('');
        setSubtitleCue('');
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
              startPositionMs: request.resumePositionMs,
              capabilities: browserCapabilities(),
            }),
          });
          if (currentRequest !== requestNumber.current) {
            await api(`/playback/sessions/${next.sessionId}`, { method: 'DELETE' }).catch(() => undefined);
            return;
          }
          sessionRef.current = next.sessionId;
          if (next.method !== 'direct_play' && request.resumePositionMs > 0) {
            timelineOffsetRef.current = request.resumePositionMs / 1_000;
            resumeRef.current = 0;
          } else {
            timelineOffsetRef.current = 0;
          }
          const defaultSubtitle = chooseDefaultWebVttSubtitle(
            next.subtitleTracks,
            next.playbackPreferences.preferredSubtitleLanguages,
            next.playbackPreferences.subtitleMode,
          );
          activeSubtitleRef.current = defaultSubtitle;
          setActiveSubtitle(defaultSubtitle);
          setAuthorization(next);
          setPlaybackRate(next.playbackPreferences?.playbackRate ?? 1);
          if (next.method !== 'direct_play') {
            if (!next.transcodeStatusUrl) throw new Error('HLS-status mangler i serverens svar.');
            setStatus(next.method === 'direct_stream' ? 'FFmpeg remuxer streamen...' : 'FFmpeg forbereder streamen...');
            const ready = await waitForTranscode(next.transcodeStatusUrl, () => currentRequest === requestNumber.current);
            if (!ready) return;
            setStatus(`${next.method === 'direct_stream' ? 'Direct Stream' : 'Transcoding'} · HLS${formatVideoProfile(next) ? ` · ${formatVideoProfile(next)}` : ''}`);
          } else {
            setStatus(`${next.method === 'direct_play' ? 'Direkte afspilning' : 'Direct Stream'}${formatVideoProfile(next) ? ` · ${formatVideoProfile(next)}` : ''}`);
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
    let started = false;
    const applyResume = () => {
      if (resumeAppliedRef.current) return true;
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return false;
      const target = playbackResumeTargetSeconds(resumeRef.current, video.duration);
      if (target !== null) {
        video.currentTime = target;
        setCurrentTime(target);
      }
      resumeAppliedRef.current = true;
      return true;
    };
    const start = () => {
      if (disposed || started || !applyResume()) return;
      if (authorization.method !== 'direct_play') {
        const remainingDurationMs = Number.isFinite(video.duration)
          ? Math.max(0, (video.duration - video.currentTime) * 1000)
          : 8_000;
        const requiredBufferMs = Math.min(8_000, remainingDurationMs);
        if (bufferedAheadMs(video) + 250 < requiredBufferMs) return;
      }
      started = true;
        setDuration(mediaRef.current?.file?.durationMs
          ? mediaRef.current.file.durationMs / 1000
          : Number.isFinite(video.duration) ? timelineOffsetRef.current + video.duration : 0);
      void video.play().catch(() => undefined);
    };
    video.addEventListener('loadedmetadata', start);
    video.addEventListener('durationchange', start);
    video.addEventListener('canplay', start);
    video.addEventListener('progress', start);

    if (authorization.method !== 'direct_play' && Hls.isSupported()) {
      const hls = new Hls({
        backBufferLength: 90,
        maxBufferLength: authorization.playbackPreferences.allowUpscale ? 240 : 60,
        maxMaxBufferLength: authorization.playbackPreferences.allowUpscale ? 300 : 120,
        enableWorker: true,
        startLevel: 0,
        startPosition: 0,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.55,
        maxStarvationDelay: 8,
        maxLoadingDelay: 8,
        capLevelToPlayerSize: true,
        capLevelOnFPSDrop: true,
      });
      hlsRef.current = hls;
      hls.loadSource(authorization.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const presentedQualities = hls.levels.map((level, index) => {
          const rendition = authorization.adaptiveQuality.renditions.find(
            (candidate) => candidate.height === level.height,
          ) ?? authorization.adaptiveQuality.renditions[index];

          return {
            index,
            ...presentPlaybackQualityLevel(
              level.height || rendition?.height || 0,
              rendition?.bitrate ?? level.bitrate,
              rendition,
            ),
          };
        });
        setQualities(presentedQualities);
        const lastSourceLevel = deferredUpscaleLevelCap(
          presentedQualities.map((quality) => ({
            height: hls.levels[quality.index]?.height ?? 0,
            upscaled: quality.upscaled,
          })),
          authorization.videoProfile.source.height,
          authorization.playbackPreferences.allowUpscale,
        );
        const hasDeferredUpscale = lastSourceLevel >= 0;
        upscaleUnlockedRef.current = !hasDeferredUpscale;
        setUpscaleUnlocked(!hasDeferredUpscale);
        hls.autoLevelCapping = hasDeferredUpscale ? Math.max(0, lastSourceLevel) : -1;
        if (authorization.method === 'direct_stream') hls.loadLevel = 0;
        qualitySelectionRef.current = authorization.method === 'direct_stream'
          ? 0
          : hls.autoLevelEnabled ? -1 : hls.manualLevel;
        setQualitySelection(qualitySelectionRef.current);
        setCurrentQuality(hls.currentLevel);
        setAudioTracks(hls.audioTracks.map((track, index) => ({
          index,
          name: track.name || `Lydspor ${index + 1}`,
          language: track.lang || '',
        })));
        const preferredAudioTrack = authorization.playbackPreferences.preferredAudioLanguages
          .map((language) =>
            hls.audioTracks.findIndex(
              (track) => subtitleLanguageCode(track.lang || '') === subtitleLanguageCode(language),
            ),
          )
          .find((index) => index !== undefined && index >= 0);
        if (preferredAudioTrack !== undefined) {
          hls.audioTrack = preferredAudioTrack;
          setActiveAudioTrack(preferredAudioTrack);
        }
        start();
      });
      hls.on(Hls.Events.BUFFER_APPENDED, start);
      hls.on(Hls.Events.LEVEL_SWITCHING, (_event, data) => {
        const selected = qualitySelectionRef.current;
        if (selected >= 0 && data.level !== selected) {
          hls.loadLevel = selected;
          setQualitySwitching(selected);
          return;
        }
        setQualitySwitching(selected >= 0 && data.level === selected ? null : data.level);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
        const selected = qualitySelectionRef.current;
        if (selected >= 0 && data.level !== selected) {
          hls.loadLevel = selected;
          setQualitySwitching(selected);
        } else {
          setQualitySwitching(null);
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setError(`HLS-afspilningen stoppede: ${data.details}`);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      });
    } else {
      video.src = authorization.streamUrl;
    }

    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeEventListener('loadedmetadata', start);
      video.removeEventListener('durationchange', start);
      video.removeEventListener('canplay', start);
      video.removeEventListener('progress', start);
      video.removeAttribute('src');
      video.load();
    };
  }, [authorization, sourceReady]);

  useEffect(() => {
    if (!authorization) return;
    const sendHeartbeat = () => {
      const video = videoRef.current;
      const remote = castingRef.current ? castRemotePlayerRef.current : null;
      const hls = hlsRef.current;
      const level = hls && hls.currentLevel >= 0 ? hls.levels[hls.currentLevel] : null;
      const position = remote
        ? timelineOffsetRef.current + remote.currentTime
        : video ? timelineOffsetRef.current + video.currentTime : 0;
      const mediaDuration = remote?.duration
        ?? (mediaRef.current?.file?.durationMs
          ? mediaRef.current.file.durationMs / 1000
          : video ? timelineOffsetRef.current + video.duration : undefined);
      const bufferAhead = remote || !video ? null : bufferedAheadMs(video);
      if (
        hls
        && !upscaleUnlockedRef.current
        && bufferAhead !== null
        && bufferAhead >= 210_000
      ) {
        upscaleUnlockedRef.current = true;
        setUpscaleUnlocked(true);
        hls.autoLevelCapping = -1;
      }
      const remoteState = remote?.playerState?.toLowerCase();
      void api(`/playback/sessions/${authorization.sessionId}/heartbeat`, {
        method: 'PATCH',
        body: JSON.stringify({
          runtimeState: remote
            ? remoteState === 'buffering' ? 'buffering' : remote.isPaused ? 'paused' : 'playing'
            : bufferingRef.current ? 'buffering' : video?.paused ? 'paused' : 'playing',
          positionMs: Math.max(0, Math.round(position * 1000)),
          durationMs: Number.isFinite(mediaDuration) ? Math.max(0, Math.round((mediaDuration ?? 0) * 1000)) : null,
          currentBitrate: remote ? null : Math.max(0, Math.round(level?.bitrate ?? authorization.videoProfile.source.bitrate ?? 0)),
          currentHeight: Math.round(level?.height ?? authorization.videoProfile.output.height ?? authorization.videoProfile.source.height ?? 0) || null,
          bufferAheadMs: bufferAhead,
        }),
      }).catch((caught: ApiFailure) => setError(caught.message ?? 'Playback-sessionen udløb.'));
    };
    void sendHeartbeat();
    const heartbeat = window.setInterval(sendHeartbeat, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [authorization]);

  useEffect(() => {
    void loadCastFramework().then((result) => {
      setCastAvailable(result.available);
      setCastReason(result.reason);
    });
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
        body: JSON.stringify({ positionMs: Math.max(0, Math.round((timelineOffsetRef.current + video.currentTime) * 1000)) }),
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
    setCastNotice('');
    let handoffAccepted = false;
    try {
      if (!window.isSecureContext) {
        throw new Error('Chromecast fra webpanelet kræver HTTPS. Åbn serveren via en HTTPS-adresse og prøv igen.');
      }
      const castState = await loadCastFramework(!castAvailable);
      setCastAvailable(castState.available);
      setCastReason(castState.reason);
      if (!castState.available) throw new Error(castState.reason);
      const castWindow = window as CastWindow;
      const framework = castWindow.cast?.framework;
      const mediaApi = castWindow.chrome?.cast?.media;
      if (!framework || !mediaApi) throw new Error('Google Cast er ikke tilgængelig i denne browser.');
      const context = framework.CastContext.getInstance();
      await context.requestSession();
      const handoff = await api<CastHandoff>(`/playback/sessions/${authorization.sessionId}/cast-handoff`, {
        method: 'POST',
        body: JSON.stringify({ streamToken: authorization.streamToken }),
      });
      handoffAccepted = true;
      const castSession = context.getCurrentSession();
      if (!castSession) throw new Error('Chromecast-sessionen kunne ikke oprettes.');
      const mediaInfo = new mediaApi.MediaInfo(
        handoff.streamUrl,
        handoff.contentType,
      );
      const metadata = new mediaApi.GenericMediaMetadata();
      metadata.title = media.seriesTitle ?? media.title;
      metadata.subtitle = media.seriesTitle ? episodeLabel(media) : status;
      mediaInfo.metadata = metadata;
      mediaInfo.streamType = mediaApi.StreamType.BUFFERED;
      if (media.file?.durationMs) {
        mediaInfo.duration = Math.max(0, media.file.durationMs / 1000 - timelineOffsetRef.current);
      }
      const castSubtitles = castTextTracks(handoff.subtitleTracks);
      mediaInfo.tracks = castSubtitles
        .map((subtitle, index) => {
        const track = new mediaApi.Track(index + 1, mediaApi.TrackType.TEXT);
        track.trackContentId = subtitle.src!;
        track.trackContentType = subtitle.contentType!;
        track.subtype = mediaApi.TextTrackType.SUBTITLES;
        track.name = subtitle.label;
        if (subtitle.language !== 'und') track.language = subtitle.language;
        return track;
      });
      const request = new mediaApi.LoadRequest(mediaInfo);
      request.currentTime = videoRef.current?.currentTime ?? 0;
      const selectedTrackId = castTextTrackId(handoff.subtitleTracks, activeSubtitleRef.current);
      if (selectedTrackId !== null) request.activeTrackIds = [selectedTrackId];
      await castSession.loadMedia(request);
      videoRef.current?.pause();
      castingRef.current = true;
      const remotePlayer = new framework.RemotePlayer();
      const remoteController = new framework.RemotePlayerController(remotePlayer);
      let connectedOnce = remotePlayer.isConnected;
      const onRemoteChange = () => {
        if (!castingRef.current) return;
        if (remotePlayer.isConnected) connectedOnce = true;
        setCurrentTime(Number.isFinite(remotePlayer.currentTime)
          ? timelineOffsetRef.current + remotePlayer.currentTime
          : timelineOffsetRef.current);
        setDuration(Number.isFinite(remotePlayer.duration) ? remotePlayer.duration : 0);
        setPaused(remotePlayer.isPaused);
        setVolume(Number.isFinite(remotePlayer.volumeLevel) ? remotePlayer.volumeLevel : 1);
        if (!remotePlayer.isConnected && connectedOnce) {
          const resumeAt = remotePlayer.currentTime;
          void saveProgress(false).catch(() => undefined);
          castingRef.current = false;
          clearCastListenerRef.current?.();
          clearCastListenerRef.current = null;
          castRemotePlayerRef.current = null;
          castRemoteControllerRef.current = null;
          setStatus('Chromecast afbrudt · fortsætter lokalt');
          void api(`/playback/sessions/${authorization.sessionId}/cast-handoff`, { method: 'DELETE' })
            .catch(() => undefined)
            .finally(() => {
              const video = videoRef.current;
              if (!video) return;
              if (Number.isFinite(resumeAt)) video.currentTime = resumeAt;
              void video.play().catch(() => undefined);
            });
          return;
        }
        const now = Date.now();
        if (now - lastProgressAt.current >= 10_000) {
          lastProgressAt.current = now;
          const completed = remotePlayer.duration > 0
            && remotePlayer.currentTime >= remotePlayer.duration - 15;
          void saveProgress(completed).catch(() => undefined);
        }
      };
      remoteController.addEventListener(framework.RemotePlayerEventType.ANY_CHANGE, onRemoteChange);
      clearCastListenerRef.current = () => {
        remoteController.removeEventListener(framework.RemotePlayerEventType.ANY_CHANGE, onRemoteChange);
      };
      castRemotePlayerRef.current = remotePlayer;
      castRemoteControllerRef.current = remoteController;
      setStatus('Chromecast');
      setCastNotice('Afspilningen er sendt til Chromecast.');
    } catch (caught) {
      if (handoffAccepted) {
        await api(`/playback/sessions/${authorization.sessionId}/cast-handoff`, { method: 'DELETE' })
          .catch(() => undefined);
      }
      setCastNotice(caught instanceof Error ? caught.message : 'Chromecast kunne ikke startes.');
      setControlsVisible(true);
    } finally {
      setCasting(false);
    }
  };

  const selectPlaybackRate = (rate: number) => {
    if (castingRef.current) {
      setError('Afspilningshastighed kan ikke ændres på Google Cast Default Media Receiver.');
      setMenu(null);
      return;
    }
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
    const hls = hlsRef.current;
    if (!hls) return;
    const selected = normalizePlaybackQualitySelection(index, hls.levels.length);
    qualitySelectionRef.current = selected;
    setQualitySelection(selected);
    setQualitySwitching(selected === -1 || selected === hls.currentLevel ? null : selected);
    hls.loadLevel = selected;
    setMenu(null);
  };

  const subtitleTracks = sortSubtitleTracks(
    authorization?.subtitleTracks ?? [],
    authorization?.playbackPreferences.preferredSubtitleLanguages ?? [],
  );
  const activeSubtitleTrack = subtitleTracks.find((track) => track.id === activeSubtitle);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    const video = videoRef.current;
    if (video && !video.paused && !menu && !error) {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3_000);
    }
  }, [error, menu]);

  useEffect(() => {
    revealControls();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [revealControls]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === overlayRef.current);
      setControlsVisible(true);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const saved = readSubtitleAppearance();
    if (!saved) return;
    setSubtitlePosition(saved.position);
    setSubtitleColor(saved.color);
  }, []);

  useEffect(() => {
    subtitleOffsetRef.current = 0;
    setSubtitleOffsetMs(0);
  }, [media?.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !authorization) return;
    activeSubtitleRef.current = activeSubtitle;
    const wiredElements = new Set<HTMLTrackElement>();
    const updateCue = () => {
      const selected = Array.from(video.querySelectorAll<HTMLTrackElement>('track[data-track-id]'))
        .find((element) => element.dataset.trackId === activeSubtitleRef.current);
      setSubtitleCue(selected
        ? cueTextAt(selected.track, timelineOffsetRef.current + video.currentTime, subtitleOffsetRef.current)
        : '');
    };
    const applyTrackSelection = () => {
      const trackElements = Array.from(video.querySelectorAll<HTMLTrackElement>('track[data-track-id]'));
      let selectedTrack: TextTrack | null = null;
      trackElements.forEach((element) => {
        if (!wiredElements.has(element)) {
          wiredElements.add(element);
          element.addEventListener('load', applyTrackSelection);
          element.track.addEventListener('cuechange', updateCue);
        }
        const selected = element.dataset.trackId === activeSubtitle;
        element.track.mode = selected ? 'showing' : 'disabled';
        if (selected) selectedTrack = element.track;
      });
      setSubtitleCue(selectedTrack
        ? cueTextAt(selectedTrack, timelineOffsetRef.current + video.currentTime, subtitleOffsetRef.current)
        : '');
    };
    video.addEventListener('loadedmetadata', applyTrackSelection);
    video.textTracks.addEventListener('addtrack', applyTrackSelection);
    applyTrackSelection();
    return () => {
      video.removeEventListener('loadedmetadata', applyTrackSelection);
      video.textTracks.removeEventListener('addtrack', applyTrackSelection);
      wiredElements.forEach((element) => {
        element.removeEventListener('load', applyTrackSelection);
        element.track.removeEventListener('cuechange', updateCue);
      });
    };
  }, [activeSubtitle, authorization, sourceReady]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === overlayRef.current) {
      await document.exitFullscreen();
    } else {
      await overlayRef.current?.requestFullscreen();
    }
  };

  const selectSubtitle = (id: string | null) => {
    const selectedTrack = authorization?.subtitleTracks.find((track) => track.id === id);
    const activeTrack = authorization?.subtitleTracks.find(
      (track) => track.id === activeSubtitleRef.current,
    );
    if (
      authorization
      && (
        selectedTrack?.delivery === 'burn_in'
        || (!selectedTrack && activeTrack?.delivery === 'burn_in')
      )
    ) {
      resumeRef.current = Math.round((timelineOffsetRef.current + (videoRef.current?.currentTime ?? currentTime)) * 1_000);
      resumeAppliedRef.current = false;
      setSubtitleCue('');
      setSourceReady(false);
      setStatus(selectedTrack ? 'Forbereder undertekster med burn-in...' : 'Fjerner burn-in...');
      void api<{
        method: 'transcode';
        streamUrl: string;
        transcodeStatusUrl: string;
        adaptiveQuality: Authorization['adaptiveQuality'];
      }>(`/playback/sessions/${authorization.sessionId}/configuration`, {
        method: 'PATCH',
        body: JSON.stringify({
          streamToken: authorization.streamToken,
          burnIn: Boolean(selectedTrack),
          ...(selectedTrack ? { subtitleTrackId: selectedTrack.id } : {}),
          startPositionMs: resumeRef.current,
        }),
      }).then(async (configuration) => {
        for (let attempt = 0; attempt < 180; attempt += 1) {
          const response = await fetch(configuration.transcodeStatusUrl, {
            cache: 'no-store',
          });
          const transcode = await response.json() as TranscodeStatus;
          if (transcode.state === 'failed') throw new Error(transcode.message);
          if (transcode.state === 'ready') break;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          if (attempt === 179) throw new Error('Transcode timed out');
        }
          timelineOffsetRef.current = resumeRef.current / 1_000;
          resumeRef.current = 0;
          setAuthorization({
          ...authorization,
          method: 'transcode',
          streamUrl: configuration.streamUrl,
          transcodeStatusUrl: configuration.transcodeStatusUrl,
          adaptiveQuality: configuration.adaptiveQuality,
        });
        activeSubtitleRef.current = selectedTrack?.id ?? null;
        setActiveSubtitle(selectedTrack?.id ?? null);
        setSourceReady(true);
        setStatus(selectedTrack ? 'Burn-in undertekster aktive' : 'Burn-in fjernet');
      }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Burn-in kunne ikke aktiveres.');
        setControlsVisible(true);
      });
      setMenu(null);
      return;
    }
    if (castingRef.current) {
      const castWindow = window as CastWindow;
      const mediaApi = castWindow.chrome?.cast?.media;
      const castMedia = castWindow.cast?.framework?.CastContext.getInstance().getCurrentSession()?.getMediaSession();
      if (mediaApi && castMedia) {
        const selectedTrackId = castTextTrackId(authorization?.subtitleTracks ?? [], id);
        const request = new mediaApi.EditTracksInfoRequest(selectedTrackId === null ? [] : [selectedTrackId]);
        void new Promise<void>((resolve, reject) => castMedia.editTracksInfo(request, resolve, reject))
          .catch(() => setCastNotice('Chromecast kunne ikke skifte undertekstspor.'));
      }
    }
    const trackElements = Array.from(
      videoRef.current?.querySelectorAll<HTMLTrackElement>('track[data-track-id]') ?? [],
    );
    let selectedTextTrack: TextTrack | null = null;
    trackElements.forEach((element) => {
      const selected = element.dataset.trackId === id;
      element.track.mode = selected ? 'showing' : 'disabled';
      if (selected) selectedTextTrack = element.track;
    });
    setSubtitleCue(selectedTextTrack
      ? cueTextAt(selectedTextTrack, timelineOffsetRef.current + (videoRef.current?.currentTime ?? 0), subtitleOffsetRef.current)
      : '');
    activeSubtitleRef.current = id;
    setActiveSubtitle(id);
    setMenu(null);
  };

  const selectSubtitlePosition = (position: SubtitlePosition) => {
    setSubtitlePosition(position);
    writeSubtitleAppearance({ position, color: subtitleColor });
  };

  const selectSubtitleColor = (color: SubtitleColor) => {
    setSubtitleColor(color);
    writeSubtitleAppearance({ position: subtitlePosition, color });
  };

  const selectSubtitleOffset = (requestedOffsetMs: number) => {
    const offsetMs = Math.max(-10_000, Math.min(10_000, Math.round(requestedOffsetMs / 100) * 100));
    subtitleOffsetRef.current = offsetMs;
    setSubtitleOffsetMs(offsetMs);
    const video = videoRef.current;
    const activeTrack = Array.from(
      video?.querySelectorAll<HTMLTrackElement>('track[data-track-id]') ?? [],
    ).find((track) => track.dataset.trackId === activeSubtitleRef.current);
    setSubtitleCue(video && activeTrack ? cueTextAt(activeTrack.track, timelineOffsetRef.current + video.currentTime, offsetMs) : '');
  };

  const playNextEpisode = useCallback(async () => {
    await saveProgress(true).catch(() => undefined);
    const current = mediaRef.current;
    if (!authorization?.playbackPreferences.autoplayNext || current?.type !== 'episode') {
      setStatus('Færdig');
      return;
    }
    const query = new URLSearchParams({ afterMediaId: current.id });
    if (current.seriesMetadataProviderId) query.set('seriesMetadataProviderId', current.seriesMetadataProviderId);
    else if (current.seriesDisplayTitle) query.set('seriesDisplayTitle', current.seriesDisplayTitle);
    else if (current.seriesTitle) query.set('seriesTitle', current.seriesTitle);
    else {
      setStatus('Færdig');
      return;
    }
    setStatus('Starter næste episode...');
    try {
      const next = await api<{ media: PlayableMedia; resumePositionMs: number } | null>(
        `/playback/history/series-next?${query.toString()}`,
      );
      if (!next) {
        setStatus('Serien er færdig');
        return;
      }
      requestPlayback(next.media, next.resumePositionMs);
    } catch {
      setStatus('Næste episode kunne ikke startes automatisk');
    }
  }, [authorization?.playbackPreferences.autoplayNext, saveProgress]);

  if (!media) return null;
  return (
    <section
      ref={overlayRef}
      className={`${styles.overlay} ${controlsVisible ? '' : styles.overlayIdle}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Afspiller ${sanitizeMediaTitle(media.seriesTitle ?? media.title) || media.title}`}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
      onTouchStart={revealControls}
    >
      <video
        onSeeking={() => setControlsVisible(true)}
        className={styles.video}
        ref={videoRef}
        playsInline
        onPlay={() => {
          bufferingRef.current = false;
          setPaused(false);
          revealControls();
        }}
        onPause={() => {
          bufferingRef.current = false;
          setControlsVisible(true);
          setPaused(true);
          void saveProgress(false).catch(() => undefined);
        }}
        onDurationChange={(event) => setDuration(mediaRef.current?.file?.durationMs
          ? mediaRef.current.file.durationMs / 1000
          : Number.isFinite(event.currentTarget.duration)
            ? timelineOffsetRef.current + event.currentTarget.duration
            : 0)}
        onWaiting={() => { bufferingRef.current = true; }}
        onStalled={() => { bufferingRef.current = true; }}
        onPlaying={() => { bufferingRef.current = false; }}
        onCanPlay={() => { bufferingRef.current = false; }}
        onVolumeChange={(event) => setVolume(event.currentTarget.volume)}
        onTimeUpdate={(event) => {
          setCurrentTime(timelineOffsetRef.current + event.currentTarget.currentTime);
          const activeTrack = Array.from(
            event.currentTarget.querySelectorAll<HTMLTrackElement>('track[data-track-id]'),
          ).find((track) => track.dataset.trackId === activeSubtitleRef.current);
          setSubtitleCue(activeTrack
            ? cueTextAt(activeTrack.track, timelineOffsetRef.current + event.currentTarget.currentTime, subtitleOffsetRef.current)
            : '');
          const now = Date.now();
          if (now - lastProgressAt.current < 10_000) return;
          lastProgressAt.current = now;
          void saveProgress(false).catch(() => undefined);
        }}
        onEnded={() => void playNextEpisode()}
        onError={() => {
          if (sourceReady) setError('Browseren kunne ikke afspille den leverede stream.');
        }}
      >
        {authorization?.subtitleTracks.filter((track) => track.delivery === 'webvtt' && track.src).map((track) => (
          <track
            key={track.id}
            data-track-id={track.id}
            kind="subtitles"
            src={track.src ?? undefined}
            srcLang={track.language}
            label={track.label}
          />
        ))}
      </video>

      <div className={styles.topBar}>
        <button className={styles.iconButton} onClick={() => void stop()} aria-label="Tilbage"><ArrowLeft /></button>
        <div className={styles.title}>
          <strong>{sanitizeMediaTitle(media.seriesTitle ?? media.title) || media.title}</strong>
          <small>
            {[media.releaseYear, media.category, episodeLabel(media)].filter(Boolean).join(' · ')}
          </small>
        </div>
        <div className={styles.topActions}>
          <button
            className={styles.iconButton}
            onClick={() => void startCast()}
            disabled={!authorization || !sourceReady || casting}
            aria-label="Chromecast"
            title={castAvailable ? 'Afspil på Chromecast' : castReason}
          >
            <Cast />
          </button>
          <button className={styles.iconButton} onClick={() => setMenu(menu === 'info' ? null : 'info')} aria-label="Information"><Info /></button>
          <button className={styles.iconButton} onClick={() => void stop()} aria-label="Luk"><X /></button>
        </div>
      </div>

      {castNotice && (
        <div className={styles.castNotice} role="status" aria-live="polite">
          <Cast size={19} />
          <span><strong>Chromecast</strong><small>{castNotice}</small></span>
          <button type="button" onClick={() => setCastNotice('')} aria-label="Luk Chromecast-status"><X size={16} /></button>
        </div>
      )}

      {!sourceReady && (
        <div
          className={`${styles.notice} ${error ? styles.noticeError : styles.noticeLoading}`}
          role={error ? 'alert' : 'status'}
          aria-busy={!error}
          aria-live={error ? 'assertive' : 'polite'}
        >
          {error ? (
            <Play size={34} />
          ) : (
            <>
              <div className={styles.loadingBrand} aria-hidden="true"><Brand /></div>
              <span className={styles.loadingDots} aria-hidden="true"><i /><i /><i /></span>
            </>
          )}
          <h2>{error ? 'Afspilningen kunne ikke startes' : 'Loader...'}</h2>
          <p>{error || 'Vi gør din afspilning klar.'}</p>
        </div>
      )}

      {subtitleCue && !casting && (
        <div
          className={styles.subtitleCue}
          data-color={subtitleColor}
          data-position={subtitlePosition}
          aria-label="Undertekster"
        >
          <span>{subtitleCue}</span>
        </div>
      )}

      {sourceReady && (
        <aside className={styles.playbackBadge}>
          <span>Afspilning</span>
          <strong>{status}</strong>
          <small>{authorization?.method === 'transcode' ? 'H.264 · AAC · HLS' : authorization?.contentType}</small>
          {authorization && <small className={styles.playbackReason}>{playbackReason(authorization)}</small>}
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
            <div className={styles.subtitleMenu}>
              <div className={styles.subtitleNow}>
                <span>Aktive undertekster</span>
                <strong>{activeSubtitleTrack ? subtitleLanguageName(activeSubtitleTrack.language) : 'Fra'}</strong>
                <small>
                  {activeSubtitleTrack
                    ? subtitleDescription(activeSubtitleTrack)
                    : 'Videoen vises uden undertekster'}
                </small>
              </div>
              {authorization?.method !== 'direct_stream' && <button
                className={`${styles.menuRow} ${styles.subtitleRow} ${activeSubtitle === null ? styles.subtitleSelected : ''}`}
                aria-pressed={activeSubtitle === null}
                onClick={() => selectSubtitle(null)}
              >
                <span className={styles.subtitleChoice}>
                  <span className={styles.subtitleLanguageBadge}>OFF</span>
                  <span><strong>Fra</strong><small>Vis ingen undertekster</small></span>
                </span>
                {activeSubtitle === null && <Check size={18} />}
              </button>}
              {authorization?.method === 'direct_stream' && (
                <div className={styles.emptyMenu}>Original video remuxes uden videokodning. Lavere kvaliteter kræver en transcoding-session.</div>
              )}
              {subtitleTracks.map((track) => (
                <button
                  className={`${styles.menuRow} ${styles.subtitleRow} ${activeSubtitle === track.id ? styles.subtitleSelected : ''}`}
                  aria-pressed={activeSubtitle === track.id}
                  key={track.id}
                  onClick={() => selectSubtitle(track.id)}
                >
                  <span className={styles.subtitleChoice}>
                    <span className={styles.subtitleLanguageBadge}>{subtitleLanguageCode(track.language)}</span>
                    <span>
                      <strong>{subtitleLanguageName(track.language)}</strong>
                      <small>{subtitleDescription(track)}</small>
                    </span>
                  </span>
                  <span className={styles.subtitleTags}>
                    <i>{subtitleFormat(track)}</i>
                    {track.delivery === 'burn_in' && <em>Burn-in</em>}
                    {activeSubtitle === track.id && <Check size={18} />}
                  </span>
                </button>
              ))}
              {!subtitleTracks.length && (
                <div className={styles.emptyMenu}>Der blev ikke fundet undertekstspor til denne fil.</div>
              )}
              <section className={styles.subtitlePreferences} aria-label="Undertekstvisning">
                <div className={styles.subtitlePreferenceGroup}>
                  <span className={styles.subtitlePreferenceHeading}>Placering</span>
                  <div className={styles.subtitleSegmented}>
                    {subtitlePositions.map((position) => (
                      <button
                        type="button"
                        aria-pressed={subtitlePosition === position.value}
                        key={position.value}
                        onClick={() => selectSubtitlePosition(position.value)}
                      >
                        {position.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.subtitlePreferenceGroup}>
                  <span className={styles.subtitlePreferenceHeading}>Farve</span>
                  <div className={styles.subtitleColorChoices}>
                    {subtitleColors.map((color) => (
                      <button
                        type="button"
                        aria-label={`Brug ${color.label.toLocaleLowerCase('da-DK')} undertekst`}
                        aria-pressed={subtitleColor === color.value}
                        key={color.value}
                        onClick={() => selectSubtitleColor(color.value)}
                      >
                        <i style={{ backgroundColor: color.hex }} />
                        <span>{color.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.subtitlePreferenceGroup}>
                  <div className={styles.subtitleOffsetHeading}>
                    <span className={styles.subtitlePreferenceHeading}>Synkronisering</span>
                    <output>{formatSubtitleOffset(subtitleOffsetMs)}</output>
                  </div>
                  <input
                    className={styles.subtitleOffsetSlider}
                    type="range"
                    min={-10_000}
                    max={10_000}
                    step={100}
                    value={subtitleOffsetMs}
                    aria-label="Undertekst-offset i millisekunder"
                    onChange={(event) => selectSubtitleOffset(Number(event.currentTarget.value))}
                  />
                  <div className={styles.subtitleOffsetActions}>
                    <button type="button" onClick={() => selectSubtitleOffset(subtitleOffsetMs - 500)}>−0,5 s</button>
                    <button type="button" disabled={subtitleOffsetMs === 0} onClick={() => selectSubtitleOffset(0)}>Nulstil</button>
                    <button type="button" onClick={() => selectSubtitleOffset(subtitleOffsetMs + 500)}>+0,5 s</button>
                  </div>
                  <small>Minus viser teksten tidligere. Plus viser den senere.</small>
                </div>
              </section>
            </div>
          )}
          {menu === 'audio' && (audioTracks.length ? audioTracks.map((track) => (
            <button className={styles.menuRow} key={track.index} onClick={() => selectAudioTrack(track.index)}>
              <span><strong>{track.name}</strong><small>{track.language || 'Ukendt sprog'}</small></span>
              {activeAudioTrack === track.index && <Check size={17} />}
            </button>
          )) : <div className={styles.emptyMenu}>Browseren eksponerer ikke separate lydspor for denne stream.</div>)}
          {menu === 'quality' && (
            <div className={styles.qualityMenu}>
              <div className={styles.qualityNow}>
                <span>Afspiller nu</span>
                <strong>
                  {currentQuality >= 0
                    ? qualities.find((quality) => quality.index === currentQuality)?.resolution ?? 'Forbereder'
                    : 'Forbereder'}
                </strong>
                <small>
                  {currentQuality >= 0
                    ? qualitySummary(qualities.find((quality) => quality.index === currentQuality))
                    : 'Venter på første videosegment'}
                </small>
              </div>
              <button
                className={`${styles.menuRow} ${styles.qualityRow} ${qualitySelection === -1 ? styles.qualitySelected : ''}`}
                aria-pressed={qualitySelection === -1}
                onClick={() => selectQuality(-1)}
              >
                <span className={styles.qualityChoice}>
                  <Gauge size={19} />
                  <span>
                    <strong>Automatisk</strong>
                    <small>Tilpasser løbende kvaliteten til forbindelsen</small>
                  </span>
                </span>
                {qualitySelection === -1 && <Check size={18} />}
              </button>
              {qualities.map((quality) => (
                <button
                  className={`${styles.menuRow} ${styles.qualityRow} ${qualitySelection === quality.index ? styles.qualitySelected : ''}`}
                  aria-pressed={qualitySelection === quality.index}
                  disabled={quality.upscaled && !upscaleUnlocked}
                  key={quality.index}
                  onClick={() => selectQuality(quality.index)}
                >
                  <span className={styles.qualityChoice}>
                    <span className={styles.resolutionBadge}>{quality.resolution}</span>
                    <span>
                      <strong>{quality.resolution}</strong>
                      <small>{quality.upscaled && !upscaleUnlocked ? 'Låses op efter 3½ min. buffer' : quality.bitrate ?? 'Variabel bitrate'}</small>
                    </span>
                  </span>
                  <span className={styles.qualityTags}>
                    {quality.dynamicRange && <i>{quality.dynamicRange}</i>}
                    {quality.upscaled && <i className={styles.upscaledTag}>Opskaleret</i>}
                    {qualitySwitching === quality.index
                      ? <em>Skifter...</em>
                      : qualitySelection === quality.index && <Check size={18} />}
                  </span>
                </button>
              ))}
              {!qualities.length && (
                <div className={styles.emptyMenu}>
                  Original kvalitet · {authorization ? formatVideoProfile(authorization) || 'Direct Play' : 'Direct Play'}
                </div>
              )}
            </div>
          )}
          {menu === 'info' && (
            <dl className={styles.infoGrid}>
              <dt>Titel</dt><dd>{media.title}</dd>
              <dt>År</dt><dd>{media.releaseYear ?? 'Ukendt'}</dd>
              <dt>Type</dt><dd>{media.type ?? 'Ukendt'}</dd>
              <dt>Kategori</dt><dd>{media.category ?? 'Ikke angivet'}</dd>
              <dt>Metode</dt><dd>{status || 'Forbereder'}</dd>
              <dt>Videosignal</dt><dd>{authorization ? formatVideoProfile(authorization) || 'Standard dynamic range' : 'Ukendt'}</dd>
            </dl>
          )}
        </aside>
      )}

      {sourceReady && (
        <div className={`${styles.controls} ${controlsVisible ? '' : styles.controlsHidden}`}>
          <div className={styles.timeline}>
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={(event) => {
                setCurrentTime(Number(event.target.value));
              }}
              onPointerUp={(event) => seekTo(Number(event.currentTarget.value))}
              onKeyUp={(event) => seekTo(Number(event.currentTarget.value))}
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
              <button disabled={media.type !== 'episode'} onClick={() => void playNextEpisode()} title="Næste titel"><SkipForward /></button>
            </div>
            <div className={styles.optionControls}>
              <button onClick={() => setMenu(menu === 'speed' ? null : 'speed')}><Gauge /><small>{playbackRate}x</small><span>Hastighed</span></button>
              <button onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')}>
                <Captions />
                <small>{activeSubtitleTrack ? subtitleLanguageCode(activeSubtitleTrack.language) : 'Fra'}</small>
                <span>Undertekster</span>
              </button>
              <button onClick={() => setMenu(menu === 'audio' ? null : 'audio')}><Volume2 /><span>Lydspor</span></button>
              <button onClick={() => setMenu(menu === 'quality' ? null : 'quality')}>
                <Settings2 />
                <small>
                  {qualitySelection === -1
                    ? 'Auto'
                    : qualities.find((quality) => quality.index === qualitySelection)?.resolution ?? 'Original'}
                </small>
                <span>Kvalitet</span>
              </button>
              <button onClick={() => void toggleFullscreen()}>
                {isFullscreen ? <Minimize /> : <Maximize />}
                <span>{isFullscreen ? 'Afslut fuld skærm' : 'Fuld skærm'}</span>
              </button>
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
                const remote = castRemotePlayerRef.current;
                const controller = castRemoteControllerRef.current;
                if (castingRef.current && remote && controller) {
                  remote.volumeLevel = next;
                  controller.setVolumeLevel();
                } else if (videoRef.current) {
                  videoRef.current.volume = next;
                }
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
  const hevcTypes = [
    'video/mp4; codecs="hvc1.1.6.L153.B0"',
    'video/mp4; codecs="hev1.1.6.L153.B0"',
  ];
  const supportsHevc = typeof MediaSource !== 'undefined'
    && hevcTypes.some((contentType) => MediaSource.isTypeSupported(contentType));
  const supportsHdr = supportsHevc
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(dynamic-range: high)').matches;
  return {
    supportedCodecs: ['h264', 'avc1', 'aac', 'mp3', 'vp8', 'vp9', 'opus', ...(supportsHevc ? ['hevc', 'h265'] : [])],
    supportedAudioCodecs: ['aac', 'mp3', 'opus', 'vorbis'],
    supportedContainers: ['mov', 'mp4', 'webm', 'ogg'],
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    estimatedDownlinkMbps:
      'connection' in navigator
      && typeof (navigator as Navigator & { connection?: { downlink?: number } }).connection?.downlink === 'number'
        ? (navigator as Navigator & { connection: { downlink: number } }).connection.downlink
        : undefined,
    supportsHdr,
  };
}

function formatVideoProfile(authorization: Authorization): string {
  const height = authorization.videoProfile.output.height ?? authorization.videoProfile.source.height;
  const resolution = height && height >= 2160 ? '4K' : height ? `${height}p` : '';
  const hdr = ({
    hdr10: 'HDR10',
    hlg: 'HLG',
    dolby_vision: 'Dolby Vision',
  } as const)[authorization.videoProfile.output.hdr ?? authorization.videoProfile.source.hdr ?? 'hdr10'];
  const hasHdr = authorization.videoProfile.output.hdr ?? (
    authorization.method !== 'transcode' ? authorization.videoProfile.source.hdr : null
  );
  return [resolution, hasHdr ? hdr : '', authorization.videoProfile.source.bitDepth && hasHdr ? `${authorization.videoProfile.source.bitDepth}-bit` : '']
    .filter(Boolean)
    .join(' · ');
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
  throw new Error('Streamen tog længere end fem minutter om at levere det første segment.');
}

async function loadCastFramework(retry = false): Promise<{ available: boolean; reason: string }> {
  if (!window.isSecureContext) {
    return {
      available: false,
      reason: 'Chromecast kræver HTTPS, når webpanelet åbnes fra en anden maskine.',
    };
  }
  const castWindow = window as CastWindow;
  const sdkAvailable = await ensureCastSdk();
  if (!sdkAvailable) {
    return {
      available: false,
      reason: 'Google Cast SDK kunne ikke indlæses. Kontrollér HTTPS, netværk og browserens Cast-understøttelse.',
    };
  }
  if (castWindow.cast?.framework && castWindow.chrome?.cast?.media) {
    return configureCastFramework(castWindow)
      ? { available: true, reason: 'Afspil på Chromecast' }
      : { available: false, reason: 'Google Cast Framework kunne ikke initialiseres.' };
  }
  return {
    available: false,
    reason: retry
      ? 'Google Cast SDK blev genindlæst, men frameworket er fortsat utilgængeligt.'
      : castFrameworkFailureReason(undefined),
  };
}

function castFrameworkFailureReason(errorInfo: unknown): string {
  const detail = errorInfo && typeof errorInfo === 'object'
    ? ['description', 'code']
        .map((key) => key in errorInfo ? String((errorInfo as Record<string, unknown>)[key] ?? '').trim() : '')
        .find(Boolean)
    : '';
  return detail
    ? `Google Cast Framework kunne ikke indlæses (${detail}).`
    : 'Google Cast Framework kunne ikke indlæses. Brug Chrome via HTTPS og kontrollér, at browseren og Chromecast er på samme netværk.';
}

function castTextTracks(tracks: SubtitleTrack[]): SubtitleTrack[] {
  return tracks.filter((track) => track.delivery === 'webvtt' && Boolean(track.src));
}

function castTextTrackId(tracks: SubtitleTrack[], selectedId: string | null): number | null {
  if (!selectedId) return null;
  const index = castTextTracks(tracks).findIndex((track) => track.id === selectedId);
  return index >= 0 ? index + 1 : null;
}

function activeCueText(track: TextTrack): string {
  return cueListText(Array.from(track.activeCues ?? []));
}

function cueTextAt(track: TextTrack, currentTime: number, offsetMs: number): string {
  const cues = Array.from(track.cues ?? []);
  if (!cues.length) return activeCueText(track);
  const subtitleTime = currentTime - offsetMs / 1000;
  return cueListText(cues.filter((cue) => cue.startTime <= subtitleTime && cue.endTime > subtitleTime));
}

function cueListText(cues: TextTrackCue[]): string {
  return cues
    .map((cue) => 'text' in cue ? String((cue as VTTCue).text) : '')
    .map((text) => text.replace(/<[^>]*>/g, '').trim())
    .filter(Boolean)
    .join('\n');
}

function formatSubtitleOffset(offsetMs: number): string {
  if (offsetMs === 0) return '0,0 s';
  const value = (offsetMs / 1000).toLocaleString('da-DK', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${offsetMs > 0 ? '+' : ''}${value} s`;
}

function readSubtitleAppearance(): SubtitleAppearance | null {
  try {
    const raw = window.localStorage.getItem(subtitleAppearanceStorageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SubtitleAppearance>;
    if (!subtitlePositions.some((position) => position.value === value.position)) return null;
    if (!subtitleColors.some((color) => color.value === value.color)) return null;
    return value as SubtitleAppearance;
  } catch {
    return null;
  }
}

function writeSubtitleAppearance(appearance: SubtitleAppearance): void {
  try {
    window.localStorage.setItem(subtitleAppearanceStorageKey, JSON.stringify(appearance));
  } catch {
    // Private browsing or browser policy may disable local storage; playback remains functional.
  }
}

function playbackReason(authorization: Authorization): string {
  if (authorization.method === 'direct_play') return 'Originalfilen afspilles direkte uden video-transcoding.';
  if (authorization.method === 'direct_stream') return 'Videoen leveres i et browserkompatibelt format uden ny videokodning.';
  const blockers = authorization.decision?.playback.directPlayBlockers ?? [];
  const blocker = blockers.map((code) => ({
    codec_unsupported: 'videocodec understøttes ikke direkte af browseren',
    audio_codec_unsupported: 'lydsporet understøttes ikke direkte af browseren',
    container_unsupported: 'filcontaineren understøttes ikke direkte af browseren',
    hdr_unsupported: 'HDR-formatet understøttes ikke af skærmen eller browseren',
    resolution_limit: 'kildens opløsning overstiger abonnementets grænse',
    bitrate_limit: 'kildens bitrate overstiger abonnementets grænse',
  } as Record<string, string>)[code]).find(Boolean);
  if (blocker) return `HLS bruges, fordi ${blocker}.`;
  const decisionCode = authorization.decision?.playback.code;
  return ({
    adaptive_transcode: 'HLS bruges på grund af den valgte kvalitets- eller databesparelsesindstilling.',
    playback_method_selected: 'HLS bruges for at levere et browserkompatibelt videoformat.',
  } as Record<string, string>)[decisionCode ?? '']
    ?? 'HLS bruges, fordi originalfilen ikke kan afspilles direkte med de aktuelle krav.';
}

function configureCastFramework(castWindow: CastWindow): boolean {
  const framework = castWindow.cast?.framework;
  const media = castWindow.chrome?.cast?.media;
  if (!framework || !media) return false;
  try {
    framework.CastContext.getInstance().setOptions({
      receiverApplicationId: media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: castWindow.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED
        ?? framework.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    return true;
  } catch {
    return false;
  }
}

function bufferedAheadMs(video: HTMLVideoElement): number {
  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);
    if (video.currentTime >= start && video.currentTime <= end) {
      return Math.max(0, Math.round((end - video.currentTime) * 1000));
    }
  }
  return 0;
}

function mediaTimeIsBuffered(video: HTMLVideoElement, time: number): boolean {
  if (!Number.isFinite(time) || time < 0) return false;
  for (let index = 0; index < video.buffered.length; index += 1) {
    if (time >= video.buffered.start(index) - 0.25 && time <= video.buffered.end(index) - 0.25) return true;
  }
  return false;
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

function qualitySummary(quality?: QualityLevel) {
  if (!quality) return 'Ukendt kvalitet';
  return [
    quality.bitrate,
    quality.dynamicRange,
    quality.upscaled ? 'Opskaleret' : null,
  ].filter(Boolean).join(' · ');
}

const subtitleLanguages: Record<string, { code: string; name: string }> = {
  chi: { code: 'ZH', name: 'Kinesisk' },
  dan: { code: 'DA', name: 'Dansk' },
  da: { code: 'DA', name: 'Dansk' },
  deu: { code: 'DE', name: 'Tysk' },
  dut: { code: 'NL', name: 'Hollandsk' },
  eng: { code: 'EN', name: 'Engelsk' },
  en: { code: 'EN', name: 'Engelsk' },
  fin: { code: 'FI', name: 'Finsk' },
  fra: { code: 'FR', name: 'Fransk' },
  fre: { code: 'FR', name: 'Fransk' },
  ger: { code: 'DE', name: 'Tysk' },
  ita: { code: 'IT', name: 'Italiensk' },
  jpn: { code: 'JA', name: 'Japansk' },
  kor: { code: 'KO', name: 'Koreansk' },
  nld: { code: 'NL', name: 'Hollandsk' },
  nor: { code: 'NO', name: 'Norsk' },
  spa: { code: 'ES', name: 'Spansk' },
  swe: { code: 'SV', name: 'Svensk' },
  zho: { code: 'ZH', name: 'Kinesisk' },
};

function subtitleLanguage(language: string) {
  return subtitleLanguages[language.toLowerCase()] ?? {
    code: language === 'und' ? '?' : language.slice(0, 2).toUpperCase(),
    name: language === 'und' ? 'Ukendt sprog' : language.toUpperCase(),
  };
}

function subtitleLanguageCode(language: string) {
  return subtitleLanguage(language).code;
}

function subtitleLanguageName(language: string) {
  return subtitleLanguage(language).name;
}

function subtitleFormat(track: SubtitleTrack) {
  const codec = track.label.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
  if (codec === 'hdmv_pgs_subtitle') return 'PGS';
  if (codec === 'dvd_subtitle') return 'VobSub';
  if (codec === 'dvb_subtitle') return 'DVB';
  if (codec === 'subrip') return 'SRT';
  if (codec === 'ass') return 'ASS';
  return track.delivery === 'burn_in' ? 'Billede' : 'WebVTT';
}

function subtitleDescription(track: SubtitleTrack) {
  const attributes = [
    /forced|tvungen/i.test(track.label) ? 'Tvungen' : null,
    /sdh|hearing/i.test(track.label) ? 'SDH' : null,
    track.delivery === 'burn_in' ? 'Billedbaseret undertekst' : 'Tekstundertekst',
  ];
  return attributes.filter(Boolean).join(' · ');
}

function sortSubtitleTracks(tracks: SubtitleTrack[], preferredLanguages: string[]) {
  const preference = preferredLanguages.map((language) => subtitleLanguageCode(language));
  return [...tracks].sort((left, right) => {
    const leftPreference = preference.indexOf(subtitleLanguageCode(left.language));
    const rightPreference = preference.indexOf(subtitleLanguageCode(right.language));
    const leftRank = leftPreference === -1 ? Number.MAX_SAFE_INTEGER : leftPreference;
    const rightRank = rightPreference === -1 ? Number.MAX_SAFE_INTEGER : rightPreference;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.delivery !== right.delivery) return left.delivery === 'webvtt' ? -1 : 1;
    return subtitleLanguageName(left.language).localeCompare(subtitleLanguageName(right.language), 'da');
  });
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
  return `S${String(media.seasonNumber).padStart(2, '0')}E${String(media.episodeNumber ?? 0).padStart(2, '0')} · ${sanitizeMediaTitle(media.title) || media.title}`;
}

export const playbackHistoryChangedEvent = historyEvent;
