'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import { accessToken, api, type ApiFailure } from '@/lib/api';
import styles from './playback.module.css';

export type PlayableMedia = {
  id: string;
  title: string;
  type?: string;
  seriesTitle?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  posterPath?: string | null;
  file?: { durationMs?: number | null } | null;
};

type PlaybackRequest = { media: PlayableMedia; resumePositionMs: number };
type PlaybackContext = { profileId: string | null; deviceId: string | null };
type Authorization = {
  sessionId: string;
  method: 'direct_play' | 'direct_stream' | 'transcode';
  streamUrl: string;
  leaseExpiresAt: string;
};

const requestEvent = 'bb:request-playback';
const historyEvent = 'bb:playback-history-changed';

export function requestPlayback(media: PlayableMedia, resumePositionMs = 0) {
  window.dispatchEvent(new CustomEvent<PlaybackRequest>(requestEvent, {
    detail: { media, resumePositionMs },
  }));
}

export function WebPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<string | null>(null);
  const mediaRef = useRef<PlayableMedia | null>(null);
  const lastProgressAt = useRef(0);
  const requestNumber = useRef(0);
  const [media, setMedia] = useState<PlayableMedia | null>(null);
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

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
    sessionRef.current = null;
    mediaRef.current = null;
    setAuthorization(null);
    setMedia(null);
    setStatus('');
    setError('');
  }, [saveProgress]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const request = (event as CustomEvent<PlaybackRequest>).detail;
      void (async () => {
        if (sessionRef.current) await stop();
        const currentRequest = ++requestNumber.current;
        setMedia(request.media);
        mediaRef.current = request.media;
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
          if (next.method === 'transcode') {
            await api(`/playback/sessions/${next.sessionId}`, { method: 'DELETE' });
            throw { message: 'Filen kræver transcoding, som endnu ikke er implementeret.' } satisfies Partial<ApiFailure>;
          }
          sessionRef.current = next.sessionId;
          setAuthorization(next);
          setStatus(next.method === 'direct_play' ? 'Direct Play' : 'Direct Stream');
          requestAnimationFrame(() => {
            const video = videoRef.current;
            if (!video) return;
            video.addEventListener('loadedmetadata', () => {
              const target = request.resumePositionMs / 1000;
              if (target > 0 && target < video.duration) video.currentTime = target;
              void video.play().catch(() => undefined);
            }, { once: true });
          });
        } catch (caught) {
          setError((caught as ApiFailure)?.message ?? 'Afspilningen kunne ikke startes.');
          setStatus('');
        }
      })();
    };
    window.addEventListener(requestEvent, onRequest);
    return () => window.removeEventListener(requestEvent, onRequest);
  }, [stop]);

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
    const onPageHide = () => {
      const sessionId = sessionRef.current;
      const video = videoRef.current;
      const token = accessToken();
      if (!sessionId || !video || !token) return;
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

  if (!media) return null;
  return (
    <section className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Afspiller ${media.title}`}>
      <header className={styles.header}>
        <div className={styles.title}>
          <strong>{media.seriesTitle ?? media.title}</strong>
          <small>{media.seriesTitle ? episodeLabel(media) : media.title} {status ? `· ${status}` : ''}</small>
        </div>
        <button className={styles.close} onClick={() => void stop()} aria-label="Luk afspiller"><X size={19} /></button>
      </header>
      <div className={styles.stage}>
        {authorization ? (
          <video
            className={styles.video}
            ref={videoRef}
            src={authorization.streamUrl}
            controls
            autoPlay
            playsInline
            onTimeUpdate={() => {
              const now = Date.now();
              if (now - lastProgressAt.current < 10_000) return;
              lastProgressAt.current = now;
              void saveProgress(false).catch(() => undefined);
            }}
            onPause={() => void saveProgress(false).catch(() => undefined)}
            onEnded={() => void saveProgress(true).then(() => setStatus('Færdig')).catch(() => undefined)}
            onError={() => setError('Browseren kunne ikke afkode denne fil. Transcoding/remux er endnu ikke tilgængelig.')}
          />
        ) : (
          <div className={styles.notice}>
            <Play size={34} />
            <h2>{error ? 'Afspilningen kunne ikke startes' : 'Forbereder stream'}</h2>
            <p>{error || status}</p>
          </div>
        )}
      </div>
      <footer className={styles.footer}>{error || 'Fremdrift gemmes automatisk, og stream-pladsen frigives ved stop.'}</footer>
    </section>
  );
}

function browserCapabilities() {
  return {
    supportedCodecs: ['h264', 'avc1', 'aac', 'mp3', 'vp8', 'vp9', 'opus'],
    supportedContainers: ['mov', 'mp4', 'webm', 'ogg'],
  };
}

function episodeLabel(media: PlayableMedia) {
  if (media.seasonNumber === null || media.seasonNumber === undefined) return media.title;
  return `S${String(media.seasonNumber).padStart(2, '0')}E${String(media.episodeNumber ?? 0).padStart(2, '0')} · ${media.title}`;
}

export const playbackHistoryChangedEvent = historyEvent;
