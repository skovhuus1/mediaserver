'use client';

import { Bookmark, Check, ListPlus, LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import styles from './player-library-actions.module.css';

type Status = { inWatchlist: boolean; targetKey: string; playlistIds: string[] };
type Playlist = { id: string; name: string };

export function PlayerLibraryActions({ mediaId, targetType }: { mediaId: string; targetType: string }) {
  const [status, setStatus] = useState<Status>({ inWatchlist: false, targetKey: `media:${mediaId}`, playlistIds: [] });
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  useEffect(() => { void api<Status>(`/playback/history/${mediaId}/status`).then(setStatus).catch(() => undefined); }, [mediaId]);
  async function watchlist() {
    setBusy('watchlist');
    try {
      await api(`/playback/watchlist/${mediaId}`, { method: status.inWatchlist ? 'DELETE' : 'PUT', ...(!status.inWatchlist ? { body: JSON.stringify({ targetType }) } : {}) });
      setStatus({ ...status, inWatchlist: !status.inWatchlist });
    } finally { setBusy(''); }
  }
  async function picker() {
    setOpen(!open);
    if (!playlists.length) setPlaylists((await api<{ items: Playlist[] }>('/playback/playlists?limit=50')).items);
  }
  async function add(playlistId: string) {
    setBusy(playlistId);
    try {
      if (!status.playlistIds.includes(playlistId)) {
        await api(`/playback/playlists/${playlistId}/items/${mediaId}`, { method: 'PUT', body: JSON.stringify({ targetType }) });
        setStatus({ ...status, playlistIds: [...status.playlistIds, playlistId] });
      }
    } finally { setBusy(''); }
  }
  return <div className={styles.actions}><button onClick={() => void watchlist()}>{busy === 'watchlist' ? <LoaderCircle className={styles.spin} /> : <Bookmark fill={status.inWatchlist ? 'currentColor' : 'none'} />}{status.inWatchlist ? 'På Min liste' : 'Min liste'}</button><button onClick={() => void picker()}><ListPlus />Playliste</button>{open && <div className={styles.picker}>{playlists.map((playlist) => <button key={playlist.id} onClick={() => void add(playlist.id)}><span>{playlist.name}</span>{busy === playlist.id ? <LoaderCircle className={styles.spin} /> : status.playlistIds.includes(playlist.id) ? <Check /> : <Plus />}</button>)}{!playlists.length && <small>Ingen playlister endnu.</small>}</div>}</div>;
}
