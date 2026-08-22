'use client';

import Hls from 'hls.js';
import {
  normalizePlaybackQualitySelection,
  chooseDefaultWebVttSubtitle,
  deferredUpscaleLevelCap,
  parseWebVttCues,
  playbackResumeTargetSeconds,
  presentPlaybackQualityLevel,
  resolveInitialPlaybackQualitySelection,
  sanitizeMediaTitle,
  webVttCueTextAt,
  type ParsedWebVttCue,
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
import { accessToken, api, apiBlob, type ApiFailure } from '@/lib/api';
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
  subtitlePreparationStatusUrl?: string;
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
type TranscodeStatus = {
  state: 'queued' | 'running' | 'ready' | 'failed';
  message: string;
  unavailableTrackIds?: string[];
};
type StreamConfiguration = {
  method: 'direct_stream' | 'transcode';
  streamUrl: string;
  transcodeStatusUrl: string;
  adaptiveQuality: Authorization['adaptiveQuality'];
};
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
type TimelineMarker = { id: string; kind: 'intro' | 'recap' | 'credits'; startMs: number; endMs: number; source: string; confidence: number | null };
type TrickplayCue = { startMs: number; endMs: number; sheet: number; column: number; row: number };
type PlaybackAssets = {
  status: 'queued' | 'generating' | 'ready' | 'failed';
  error: string | null;
  generatedAt: string | null;
  markers: TimelineMarker[];
  trickplay: null | {
    intervalSeconds: number;
    tileWidth: number;
    tileHeight: number;
    columns: number;
    rows: number;
    frameCount: number;
    sheetCount: number;
    durationMs: number;
    cues: TrickplayCue[];
  };
};
type CastHandoff = {
  accepted: true;
  sessionId: string;
  logicalSessionId: string;
  method: Authorization['method'];
  streamUrl: string;
  contentType: string;
  subtitleTracks: SubtitleTrack[];
  tokenExpiresAt: string;
  heartbeatUrl: string;
};

type CastMediaInfo = {
  metadata?: { title?: string; subtitle?: string };
  tracks?: CastTrack[];
  streamType?: string;
  duration?: number;
  customData?: {
    heartbeatUrl: string;
    timelineOffsetMs: number;
    fullDurationMs: number | null;
    currentBitrate: number | null;
    currentHeight: number | null;
    subtitleTrack: string | null;
  };
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
  const stallCountRef = useRef(0);
  const activeAudioTrackRef = useRef<string | null>(null);
  const castRemotePlayerRef = useRef<CastRemotePlayer | null>(null);
  const castRemoteControllerRef = useRef<CastRemotePlayerController | null>(null);
  const clearCastListenerRef = useRef<(() => void) | null>(null);
  const activeSubtitleRef = useRef<string | null>(null);
  const subtitleCuesRef = useRef<ParsedWebVttCue[]>([]);
  const subtitleOffsetRef = useRef(0);
  const lastProgressAt = useRef(0);
  const requestNumber = useRef(0);
  const qualitySelectionRef = useRef(-1);
  const timelineOffsetRef = useRef(0);
  const upscaleUnlockedRef = useRef(false);
  const completedTransitionRef = useRef(false);
  const hlsNetworkRecoveriesRef = useRef(0);
  const hlsMediaRecoveriesRef = useRef(0);
  const streamRestartingRef = useRef(false);
  const fallbackAttemptedRef = useRef(false);
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
  const [subtitleError, setSubtitleError] = useState('');
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
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [playbackAssets, setPlaybackAssets] = useState<PlaybackAssets | null>(null);
  const [trickplaySheets, setTrickplaySheets] = useState<Record<number, string>>({});
  const trickplaySheetsRef = useRef<Record<number, string>>({});
  const trickplayLoadsRef = useRef(new Set<number>());
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<number | null>(null);
  const creditsAutoplaySuppressedRef = useRef(false);

  useEffect(() => {
    const mediaId = media?.id;
    Object.values(trickplaySheetsRef.current).forEach((url) => URL.revokeObjectURL(url));
    trickplaySheetsRef.current = {};
    trickplayLoadsRef.current.clear();
    setTrickplaySheets({});
    setPlaybackAssets(null);
    setHoverPosition(null);
    setNextEpisodeCountdown(null);
    creditsAutoplaySuppressedRef.current = false;
    if (!mediaId) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const assets = await api<PlaybackAssets>(`/media/${encodeURIComponent(mediaId)}/playback-assets`);
        if (cancelled) return;
        setPlaybackAssets(assets);
        if (assets.status === 'queued' || assets.status === 'generating') timer = setTimeout(() => void load(), 3_000);
      } catch {
        if (!cancelled) timer = setTimeout(() => void load(), 10_000);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      Object.values(trickplaySheetsRef.current).forEach((url) => URL.revokeObjectURL(url));
      trickplaySheetsRef.current = {};
    };
  }, [media?.id]);

  const ensureTrickplaySheet = useCallback(async (sheet: number) => {
    const mediaId = mediaRef.current?.id;
    if (!mediaId || trickplaySheetsRef.current[sheet] || trickplayLoadsRef.current.has(sheet)) return;
    trickplayLoadsRef.current.add(sheet);
    try {
      const blob = await apiBlob(`/media/${encodeURIComponent(mediaId)}/trickplay/${sheet}`);
      if (mediaRef.current?.id !== mediaId) return;
      const url = URL.createObjectURL(blob);
      trickplaySheetsRef.current = { ...trickplaySheetsRef.current, [sheet]: url };
      setTrickplaySheets(trickplaySheetsRef.current);
    } catch {
      // A missing preview must never interrupt playback.
    } finally {
      trickplayLoadsRef.current.delete(sheet);
    }
  }, []);

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

  const stop = useCallback(async (skipProgress = false) => {
    requestNumber.current += 1;
    const wasCasting = castingRef.current;
    if (wasCasting && !skipProgress) await saveProgress(false).catch(() => undefined);
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
        ...(wasCasting || skipProgress ? [] : [saveProgress(false)]),
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
    subtitleCuesRef.current = [];
    setActiveSubtitle(null);
    setSubtitleCue('');
    setSubtitleError('');
    setQualities([]);
    setQualitySelection(-1);
    setCurrentQuality(-1);
    setQualitySwitching(null);
    setScrubPosition(null);
    setHoverPosition(null);
    setPlaybackAssets(null);
    Object.values(trickplaySheetsRef.current).forEach((url) => URL.revokeObjectURL(url));
    trickplaySheetsRef.current = {};
    setTrickplaySheets({});
    setNextEpisodeCountdown(null);
    creditsAutoplaySuppressedRef.current = false;
    timelineOffsetRef.current = 0;
    upscaleUnlockedRef.current = false;
    setUpscaleUnlocked(false);
    streamRestartingRef.current = false;
    fallbackAttemptedRef.current = false;
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
    if (
      !currentAuthorization
      || !video
      || currentAuthorization.method === 'direct_play'
      || streamRestartingRef.current
    ) return;
    streamRestartingRef.current = true;
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
      const configuration = await api<StreamConfiguration>(`/playback/sessions/${currentAuthorization.sessionId}/configuration`, {
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
    } finally {
      streamRestartingRef.current = false;
    }
  }, [authorization, duration, saveProgress]);

  const recoverWithTranscode = useCallback(async (
    currentAuthorization: Authorization,
    reason: string,
  ) => {
    if (currentAuthorization.method === 'transcode' || fallbackAttemptedRef.current) {
      setError(reason);
      return;
    }
    fallbackAttemptedRef.current = true;
    const video = videoRef.current;
    const target = Math.max(
      0,
      timelineOffsetRef.current + (video?.currentTime ?? 0),
      resumeRef.current / 1_000,
    );
    setControlsVisible(true);
    setError('');
    setStatus('Original stream fejlede · skifter sikkert til transcoding...');
    setSourceReady(false);
    await saveProgress(false).catch(() => undefined);
    try {
      const recovered = await requestForcedTranscode(
        currentAuthorization,
        target,
        () => sessionRef.current === currentAuthorization.sessionId,
      );
      if (!recovered) return;
      timelineOffsetRef.current = target;
      resumeRef.current = 0;
      resumeAppliedRef.current = true;
      setCurrentTime(target);
      setAuthorization(recovered);
      setStatus(`Transcoding fallback · HLS · fra ${formatTime(target)}`);
      setSourceReady(true);
    } catch (fallbackError) {
      setError(`${reason} Transcoding fallback fejlede: ${errorMessage(fallbackError)}`);
      setStatus('');
    }
  }, [saveProgress]);

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

  const markBuffering = useCallback((buffering: boolean) => {
    if (buffering && !bufferingRef.current) stallCountRef.current += 1;
    bufferingRef.current = buffering;
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<PlaybackRequest>).detail;
      void (async () => {
        if (sessionRef.current) await stop(completedTransitionRef.current);
        completedTransitionRef.current = false;
        stallCountRef.current = 0;
        activeAudioTrackRef.current = null;
        const currentRequest = ++requestNumber.current;
        setMedia(request.media);
        mediaRef.current = request.media;
        resumeRef.current = request.resumePositionMs;
        resumeAppliedRef.current = false;
        fallbackAttemptedRef.current = false;
        streamRestartingRef.current = false;
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
          setPlaybackRate(next.playbackPreferences?.playbackRate ?? 1);
          let preparedAuthorization = next;
          setAuthorization(preparedAuthorization);
          if (next.method !== 'direct_play') {
            if (!next.transcodeStatusUrl) throw new Error('HLS-status mangler i serverens svar.');
            setStatus(next.method === 'direct_stream' ? 'FFmpeg remuxer streamen...' : 'FFmpeg forbereder streamen...');
            try {
              const ready = await waitForTranscode(next.transcodeStatusUrl, () => currentRequest === requestNumber.current);
              if (!ready) return;
            } catch (primaryError) {
              if (next.method !== 'direct_stream') throw primaryError;
              fallbackAttemptedRef.current = true;
              setStatus('Direct Stream kunne ikke klargøres · prøver transcoding...');
              try {
                const recovered = await requestForcedTranscode(
                  next,
                  request.resumePositionMs / 1_000,
                  () => currentRequest === requestNumber.current,
                );
                if (!recovered) return;
                preparedAuthorization = recovered;
                setAuthorization(recovered);
              } catch (fallbackError) {
                throw new Error(
                  `Direct Stream fejlede: ${errorMessage(primaryError)} Transcoding fallback fejlede: ${errorMessage(fallbackError)}`,
                );
              }
            }
          }
          if (preparedAuthorization.subtitlePreparationStatusUrl) {
            setStatus('Forbereder indbyggede undertekster...');
            const unavailableTrackIds = await waitForSubtitlePreparation(
              preparedAuthorization.subtitlePreparationStatusUrl,
              () => currentRequest === requestNumber.current,
            );
            if (unavailableTrackIds === null) return;
            if (unavailableTrackIds.length) {
              const unavailable = new Set(unavailableTrackIds);
              preparedAuthorization = {
                ...preparedAuthorization,
                subtitleTracks: preparedAuthorization.subtitleTracks.filter((track) => !unavailable.has(track.id)),
              };
              setAuthorization(preparedAuthorization);
            }
          }
          const defaultSubtitle = chooseDefaultWebVttSubtitle(
            preparedAuthorization.subtitleTracks,
            preparedAuthorization.playbackPreferences.preferredSubtitleLanguages,
            preparedAuthorization.playbackPreferences.subtitleMode,
          );
          activeSubtitleRef.current = defaultSubtitle;
          setActiveSubtitle(defaultSubtitle);
          setStatus(`${preparedAuthorization.method === 'direct_play' ? 'Direkte afspilning' : preparedAuthorization.method === 'direct_stream' ? 'Direct Stream · HLS' : 'Transcoding · HLS'}${formatVideoProfile(preparedAuthorization) ? ` · ${formatVideoProfile(preparedAuthorization)}` : ''}`);
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
        startLevel: -1,
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
        hlsNetworkRecoveriesRef.current = 0;
        hlsMediaRecoveriesRef.current = 0;
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
        const preferredSelection = normalizePlaybackQualitySelection(qualitySelectionRef.current, hls.levels.length);
        const initialSelection = preferredSelection >= 0
          ? preferredSelection
          : authorization.method === 'direct_stream'
            ? -1
            : resolveInitialPlaybackQualitySelection(
              authorization.playbackPreferences.qualityMode,
              authorization.playbackPreferences.fixedQualityHeight,
              hls.levels,
            );
        applyQualitySelection(hls, initialSelection);
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
          activeAudioTrackRef.current = hls.audioTracks[preferredAudioTrack]?.name || `Lydspor ${preferredAudioTrack + 1}`;
        }
        start();
      });
      hls.on(Hls.Events.BUFFER_APPENDED, start);
      hls.on(Hls.Events.LEVEL_SWITCHING, (_event, data) => {
        const selected = qualitySelectionRef.current;
        if (selected >= 0) {
          setQualitySwitching(data.level === selected ? null : data.level);
        } else {
          setQualitySwitching(null);
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
        const selected = qualitySelectionRef.current;
        setQualitySwitching(selected >= 0 && data.level !== selected ? selected : null);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsNetworkRecoveriesRef.current < 3) {
          hlsNetworkRecoveriesRef.current += 1;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsMediaRecoveriesRef.current < 2) {
          hlsMediaRecoveriesRef.current += 1;
          hls.recoverMediaError();
          return;
        }
        const reason = `HLS-afspilningen stoppede: ${data.details}.`;
        if (authorization.method !== 'transcode' && !fallbackAttemptedRef.current) {
          void recoverWithTranscode(authorization, reason);
          return;
        }
        setError(reason);
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
  }, [authorization, recoverWithTranscode, sourceReady]);

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
      const frameTelemetry = remote || !video ? { droppedFrames: 0, totalFrames: 0 } : readVideoFrameTelemetry(video);
      const bandwidthEstimate = remote ? null : estimatedPlaybackBandwidth(hls);
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
          bandwidthEstimate,
          droppedFrames: frameTelemetry.droppedFrames,
          totalFrames: frameTelemetry.totalFrames,
          stallCount: stallCountRef.current,
          playbackRate: remote ? 1 : video?.playbackRate ?? 1,
          audioTrack: remote ? null : activeAudioTrackRef.current,
          subtitleTrack: authorization.subtitleTracks.find((track) => track.id === activeSubtitleRef.current)?.label ?? null,
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
      mediaInfo.customData = {
        heartbeatUrl: handoff.heartbeatUrl,
        timelineOffsetMs: Math.max(0, Math.round(timelineOffsetRef.current * 1000)),
        fullDurationMs: media.file?.durationMs ?? null,
        currentBitrate: authorization.videoProfile.source.bitrate,
        currentHeight: authorization.videoProfile.output.height ?? authorization.videoProfile.source.height,
        subtitleTrack: authorization.subtitleTracks.find((track) => track.id === activeSubtitleRef.current)?.label ?? null,
      };
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
    activeAudioTrackRef.current = audioTracks.find((track) => track.index === index)?.name ?? `Lydspor ${index + 1}`;
    setActiveAudioTrack(index);
    setMenu(null);
  };

  const applyQualitySelection = useCallback((
    hls: Hls,
    requestedLevel: number,
  ) => {
    const selected = normalizePlaybackQualitySelection(requestedLevel, hls.levels.length);
    qualitySelectionRef.current = selected;
    setQualitySelection(selected);
    setQualitySwitching(selected >= 0 && selected === hls.currentLevel ? null : selected >= 0 ? selected : null);
    hls.autoLevelEnabled = selected === -1;
    hls.currentLevel = selected;
    hls.nextLevel = selected;
    hls.loadLevel = selected;
  }, []);

  const selectQuality = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    const selected = normalizePlaybackQualitySelection(index, hls.levels.length);
    if (selected >= 0 && !upscaleUnlocked) {
      const nextCandidate = qualities.find((quality) => quality.index === selected);
      if (nextCandidate?.upscaled) return;
    }
    applyQualitySelection(hls, selected);
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
    activeSubtitleRef.current = activeSubtitle;
    setSubtitleError('');
    if (!video || !authorization || !sourceReady || !activeSubtitle) {
      subtitleCuesRef.current = [];
      setSubtitleCue('');
      return;
    }

    const selectedTrack = authorization.subtitleTracks.find(
      (track) => track.id === activeSubtitle && track.delivery === 'webvtt' && Boolean(track.src),
    );
    if (!selectedTrack?.src) {
      subtitleCuesRef.current = [];
      setSubtitleCue('');
      return;
    }

    const controller = new AbortController();
    void fetch(selectedTrack.src, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((body) => {
        if (controller.signal.aborted || activeSubtitleRef.current !== selectedTrack.id) return;
        const cues = parseWebVttCues(body);
        if (!cues.length) throw new Error('Undertekstfilen indeholder ingen gyldige WebVTT-cues.');
        subtitleCuesRef.current = cues;
        setSubtitleCue(webVttCueTextAt(
          cues,
          timelineOffsetRef.current + video.currentTime,
          subtitleOffsetRef.current,
        ));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        subtitleCuesRef.current = [];
        setSubtitleCue('');
        setSubtitleError(`Underteksten kunne ikke indlæses: ${errorMessage(reason)}`);
      });

    return () => controller.abort();
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
    subtitleCuesRef.current = [];
    setSubtitleCue('');
    setSubtitleError('');
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
    setSubtitleCue(video
      ? webVttCueTextAt(subtitleCuesRef.current, timelineOffsetRef.current + video.currentTime, offsetMs)
      : '');
  };

  const playNextEpisode = useCallback(async (automatic = true) => {
    await saveProgress(true).catch(() => undefined);
    const current = mediaRef.current;
    if ((automatic && !authorization?.playbackPreferences.autoplayNext) || current?.type !== 'episode') {
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
      completedTransitionRef.current = true;
      requestPlayback(next.media, next.resumePositionMs);
    } catch {
      setStatus('Næste episode kunne ikke startes automatisk');
    }
  }, [authorization?.playbackPreferences.autoplayNext, saveProgress]);

  const activeTimelineMarker = playbackAssets?.markers.find((marker) => (
    currentTime * 1_000 >= marker.startMs - 750 && currentTime * 1_000 < marker.endMs
  )) ?? null;
  const creditsMarker = playbackAssets?.markers.find((marker) => marker.kind === 'credits') ?? null;
  useEffect(() => {
    const inCredits = Boolean(
      creditsMarker
      && media?.type === 'episode'
      && authorization?.playbackPreferences.autoplayNext
      && currentTime * 1_000 >= creditsMarker.startMs
      && currentTime * 1_000 < creditsMarker.endMs,
    );
    if (inCredits && !creditsAutoplaySuppressedRef.current && nextEpisodeCountdown === null) setNextEpisodeCountdown(10);
    if (!inCredits && nextEpisodeCountdown !== null) setNextEpisodeCountdown(null);
  }, [authorization?.playbackPreferences.autoplayNext, creditsMarker, currentTime, media?.type, nextEpisodeCountdown]);

  useEffect(() => {
    if (nextEpisodeCountdown === null) return undefined;
    if (nextEpisodeCountdown <= 0) {
      creditsAutoplaySuppressedRef.current = true;
      setNextEpisodeCountdown(null);
      void playNextEpisode(true);
      return undefined;
    }
    const timer = setTimeout(() => setNextEpisodeCountdown((value) => value === null ? null : value - 1), 1_000);
    return () => clearTimeout(timer);
  }, [nextEpisodeCountdown, playNextEpisode]);

  const previewPosition = hoverPosition ?? scrubPosition;
  const previewCue = previewPosition === null ? null : playbackAssets?.trickplay?.cues.find(
    (cue) => previewPosition * 1_000 >= cue.startMs && previewPosition * 1_000 < cue.endMs,
  ) ?? null;

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
          markBuffering(false);
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
        onWaiting={() => markBuffering(true)}
        onStalled={() => markBuffering(true)}
        onPlaying={() => markBuffering(false)}
        onCanPlay={() => markBuffering(false)}
        onVolumeChange={(event) => setVolume(event.currentTarget.volume)}
        onTimeUpdate={(event) => {
          setCurrentTime(timelineOffsetRef.current + event.currentTarget.currentTime);
          setSubtitleCue(webVttCueTextAt(
            subtitleCuesRef.current,
            timelineOffsetRef.current + event.currentTarget.currentTime,
            subtitleOffsetRef.current,
          ));
          const now = Date.now();
          if (now - lastProgressAt.current < 10_000) return;
          lastProgressAt.current = now;
          void saveProgress(false).catch(() => undefined);
        }}
        onEnded={() => void playNextEpisode(true)}
        onError={(event) => {
          if (!sourceReady || !authorization) return;
          const reason = mediaPlaybackError(event.currentTarget.error);
          if (authorization.method !== 'transcode' && !fallbackAttemptedRef.current) {
            void recoverWithTranscode(authorization, reason);
            return;
          }
          setError(reason);
        }}
      />

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

      {sourceReady && activeTimelineMarker && (
        <div className={styles.markerActions}>
          <button onClick={() => seekTo(activeTimelineMarker.endMs / 1_000)}>
            {activeTimelineMarker.kind === 'intro'
              ? 'Spring intro over'
              : activeTimelineMarker.kind === 'recap'
                ? 'Spring recap over'
                : 'Spring rulletekster over'}
          </button>
          {activeTimelineMarker.kind === 'credits' && media.type === 'episode' && nextEpisodeCountdown !== null && (
            <div>
              <button onClick={() => void playNextEpisode(false)}>Næste episode om {nextEpisodeCountdown} sek.</button>
              <button className={styles.markerCancel} onClick={() => {
                creditsAutoplaySuppressedRef.current = true;
                setNextEpisodeCountdown(null);
              }}>Bliv her</button>
            </div>
          )}
        </div>
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
              {subtitleError && <div className={styles.emptyMenu}>{subtitleError}</div>}
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
            <div
              className={styles.timelineTrack}
              onPointerMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const target = Math.max(0, Math.min(duration, (event.clientX - bounds.left) / Math.max(1, bounds.width) * duration));
                setHoverPosition(target);
                const cue = playbackAssets?.trickplay?.cues.find((entry) => target * 1_000 >= entry.startMs && target * 1_000 < entry.endMs);
                if (cue) void ensureTrickplaySheet(cue.sheet);
              }}
              onPointerLeave={() => setHoverPosition(null)}
            >
              {playbackAssets?.markers.map((marker) => <i
                className={styles.timelineMarker}
                data-kind={marker.kind}
                key={marker.id}
                style={{ left: `${Math.min(100, marker.startMs / Math.max(1, duration * 1_000) * 100)}%` }}
              />)}
              {previewCue && trickplaySheets[previewCue.sheet] && playbackAssets?.trickplay && (
                <div
                  className={styles.trickplayPreview}
                  style={{ left: `${Math.max(8, Math.min(92, (previewPosition ?? 0) / Math.max(1, duration) * 100))}%` }}
                >
                  <i style={{
                    backgroundImage: `url("${trickplaySheets[previewCue.sheet]}")`,
                    backgroundPosition: `-${previewCue.column * 240}px -${previewCue.row * 135}px`,
                    backgroundSize: `${playbackAssets.trickplay.columns * 240}px ${playbackAssets.trickplay.rows * 135}px`,
                  }} />
                  <b>{formatTime(previewPosition ?? 0)}</b>
                </div>
              )}
              <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={scrubPosition ?? Math.min(currentTime, Math.max(duration, 1))}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setScrubPosition(Number(event.currentTarget.value));
              }}
              onChange={(event) => {
                setScrubPosition(Number(event.currentTarget.value));
              }}
              onPointerUp={(event) => {
                const target = Number(event.currentTarget.value);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                setScrubPosition(null);
                setCurrentTime(target);
                seekTo(target);
              }}
              onPointerCancel={() => setScrubPosition(null)}
              onKeyUp={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
                const target = Number(event.currentTarget.value);
                setScrubPosition(null);
                setCurrentTime(target);
                seekTo(target);
              }}
              aria-label="Afspilningsposition"
              />
            </div>
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
              <button disabled={media.type !== 'episode'} onClick={() => void playNextEpisode(false)} title="Næste titel"><SkipForward /></button>
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
    return configureCastFramework(castWindow);
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

async function waitForSubtitlePreparation(
  statusUrl: string,
  isCurrent: () => boolean,
): Promise<string[] | null> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (!isCurrent()) return null;
    const response = await fetch(statusUrl, { cache: 'no-store' });
    const result = await response.json() as TranscodeStatus & ApiFailure;
    if (!response.ok) throw result;
    if (result.state === 'ready') return result.unavailableTrackIds ?? [];
    if (result.state === 'failed') throw new Error(result.message);
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error('Underteksterne tog længere end fem minutter om at blive klargjort.');
}

async function requestForcedTranscode(
  authorization: Authorization,
  targetSeconds: number,
  isCurrent: () => boolean,
): Promise<Authorization | null> {
  const configuration = await api<StreamConfiguration>(
    `/playback/sessions/${authorization.sessionId}/configuration`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        streamToken: authorization.streamToken,
        burnIn: false,
        forceTranscode: true,
        startPositionMs: Math.max(0, Math.round(targetSeconds * 1_000)),
      }),
    },
  );
  const ready = await waitForTranscode(configuration.transcodeStatusUrl, isCurrent);
  if (!ready) return null;
  return {
    ...authorization,
    method: 'transcode',
    streamUrl: configuration.streamUrl,
    contentType: 'application/x-mpegURL',
    transcodeStatusUrl: configuration.transcodeStatusUrl,
    adaptiveQuality: configuration.adaptiveQuality,
    decision: {
      playback: {
        method: 'transcode',
        code: 'runtime_transcode_fallback',
        reason: 'The original stream failed and the server authorized a transcoding fallback',
        directPlayBlockers: authorization.decision?.playback.directPlayBlockers ?? [],
      },
    },
  };
}

function mediaPlaybackError(error: MediaError | null): string {
  if (!error) return 'Browseren kunne ikke afspille den leverede stream.';
  const reason = ({
    [MediaError.MEDIA_ERR_ABORTED]: 'Afspilningen blev afbrudt af browseren.',
    [MediaError.MEDIA_ERR_NETWORK]: 'Browseren mistede forbindelsen til mediestrømmen.',
    [MediaError.MEDIA_ERR_DECODE]: 'Browseren kunne ikke dekode originalfilens video eller lyd.',
    [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: 'Browseren understøtter ikke originalfilens medieprofil.',
  } as Record<number, string>)[error.code] ?? 'Browseren kunne ikke afspille den leverede stream.';
  return error.message ? `${reason} ${error.message}` : reason;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return 'Ukendt afspilningsfejl.';
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

function configureCastFramework(castWindow: CastWindow): { available: boolean; reason: string } {
  const framework = castWindow.cast?.framework;
  const media = castWindow.chrome?.cast?.media;
  if (!framework || !media) return { available: false, reason: 'Google Cast Framework mangler efter indlæsning af SDK.' };
  try {
    const configuredReceiver = process.env.NEXT_PUBLIC_CAST_RECEIVER_APP_ID?.trim();
    framework.CastContext.getInstance().setOptions({
      receiverApplicationId: configuredReceiver || media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: castWindow.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED
        ?? framework.AutoJoinPolicy?.ORIGIN_SCOPED
        ?? 'origin_scoped',
    });
    return {
      available: true,
      reason: configuredReceiver ? 'Afspil på BoltBytes Chromecast receiver' : 'Afspil på Google Cast Default Media Receiver',
    };
  } catch (error) {
    return { available: false, reason: `Google Cast Framework kunne ikke initialiseres: ${errorMessage(error)}` };
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

function readVideoFrameTelemetry(video: HTMLVideoElement): { droppedFrames: number; totalFrames: number } {
  const legacy = video as HTMLVideoElement & {
    webkitDroppedFrameCount?: number;
    webkitDecodedFrameCount?: number;
  };
  const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
  return {
    droppedFrames: Math.max(0, Math.round(quality?.droppedVideoFrames ?? legacy.webkitDroppedFrameCount ?? 0)),
    totalFrames: Math.max(0, Math.round(quality?.totalVideoFrames ?? legacy.webkitDecodedFrameCount ?? 0)),
  };
}

function estimatedPlaybackBandwidth(hls: Hls | null): number | null {
  const estimate = Number((hls as (Hls & { bandwidthEstimate?: number }) | null)?.bandwidthEstimate ?? 0);
  if (Number.isFinite(estimate) && estimate > 0) return Math.round(estimate);
  const downlink = (navigator as Navigator & { connection?: { downlink?: number } }).connection?.downlink;
  return typeof downlink === 'number' && Number.isFinite(downlink) && downlink > 0
    ? Math.round(downlink * 1_000_000)
    : null;
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
