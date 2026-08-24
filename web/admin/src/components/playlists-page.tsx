'use client';

import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, ListMusic, LoaderCircle, Pin, Plus, Save, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, type ApiFailure } from '@/lib/api';
import { AuthenticatedCustomerShell } from './authenticated-customer-shell';
import { MediaCard, MediaSkeleton, type MediaExperienceItem } from './media-experience';
import styles from './playlists-page.module.css';

type PlaylistMedia = MediaExperienceItem & { id: string };
type PlaylistItem = { id: string; position: number; targetType: string; targetKey: string; media: PlaylistMedia };
type Playlist = { id: string; name: string; description: string | null; pinned: boolean; itemCount: number; createdAt: string; updatedAt: string; items: PlaylistItem[] };
type PlaylistPage = { items: Playlist[]; nextCursor: string | null };

export function PlaylistsPage() {
  const params = useParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <AuthenticatedCustomerShell>{id ? <PlaylistDetail id={id} /> : <PlaylistOverview />}</AuthenticatedCustomerShell>;
}

function PlaylistOverview() {
  const [page, setPage] = useState<PlaylistPage | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => api<PlaylistPage>('/playback/playlists?limit=50').then(setPage).catch((reason) => setError(message(reason)));
  useEffect(() => { void load(); }, []);
  async function create() {
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      await api('/playback/playlists', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }) });
      setName(''); setDescription(''); await load();
    } catch (reason) { setError(message(reason)); } finally { setBusy(false); }
  }
  return <main className={styles.page}><header className={styles.heading}><span>DIN SAMLING</span><h1>Playlister</h1><p>Byg dine egne samlinger med film, hele serier eller enkelte episoder. Hver playliste følger kun den aktive profil.</p></header>
    <section className={styles.creator}><div><strong>Ny playliste</strong><small>Op til 50 playlister med 500 titler i hver.</small></div><input maxLength={80} placeholder="Navn på playliste" value={name} onChange={(event) => setName(event.target.value)} /><input maxLength={500} placeholder="Kort beskrivelse, valgfri" value={description} onChange={(event) => setDescription(event.target.value)} /><button disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? <LoaderCircle className={styles.spin} /> : <Plus />}Opret</button></section>
    {error && <p className={styles.error}>{error}</p>}
    {!page ? <MediaSkeleton count={6} /> : page.items.length ? <div className={styles.playlistGrid}>{page.items.map((playlist) => <Link href={`/watch/playlists/${playlist.id}`} key={playlist.id}><i><ListMusic />{playlist.pinned && <Pin />}</i><span><strong>{playlist.name}</strong><small>{playlist.itemCount} titler · ændret {date(playlist.updatedAt)}</small><p>{playlist.description ?? 'Ingen beskrivelse'}</p></span></Link>)}</div> : <section className={styles.empty}><ListMusic /><h2>Ingen playlister endnu</h2><p>Opret en ovenfor, og brug derefter playlisteknappen på alle mediekort.</p></section>}
  </main>;
}

function PlaylistDetail({ id }: { id: string }) {
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [dragged, setDragged] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = () => api<Playlist>(`/playback/playlists/${id}`).then((result) => { setPlaylist(result); setDraft({ name: result.name, description: result.description ?? '' }); }).catch((reason) => setError(message(reason)));
  useEffect(() => { void load(); }, [id]);
  const dirty = useMemo(() => Boolean(playlist && (playlist.name !== draft.name.trim() || (playlist.description ?? '') !== draft.description.trim())), [draft, playlist]);
  async function save(pinned = playlist?.pinned) {
    if (!playlist) return; setBusy('save'); setError('');
    try {
      const result = await api<Playlist>(`/playback/playlists/${id}`, { method: 'PATCH', body: JSON.stringify({ name: draft.name.trim(), description: draft.description.trim(), pinned, expectedUpdatedAt: playlist.updatedAt }) });
      setPlaylist(result); setDraft({ name: result.name, description: result.description ?? '' });
    } catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }
  async function removePlaylist() {
    if (!playlist || !confirm(`Slet playlisten “${playlist.name}”?`)) return;
    setBusy('delete');
    try { await api(`/playback/playlists/${id}`, { method: 'DELETE' }); router.replace('/watch/playlists'); }
    catch (reason) { setError(message(reason)); setBusy(''); }
  }
  async function removeItem(itemId: string) {
    setBusy(itemId); setError('');
    try { await api(`/playback/playlists/${id}/items/${itemId}`, { method: 'DELETE' }); await load(); }
    catch (reason) { setError(message(reason)); } finally { setBusy(''); }
  }
  async function persistOrder(items: PlaylistItem[]) {
    if (!playlist) return;
    const previous = playlist;
    setPlaylist({ ...playlist, items }); setBusy('order'); setError('');
    try {
      const result = await api<{ updatedAt: string }>(`/playback/playlists/${id}/items/order`, { method: 'PATCH', body: JSON.stringify({ itemIds: items.map((item) => item.id), expectedUpdatedAt: playlist.updatedAt }) });
      setPlaylist((current) => current ? { ...current, updatedAt: result.updatedAt } : current);
    } catch (reason) { setPlaylist(previous); setError(message(reason)); } finally { setBusy(''); }
  }
  const move = (itemId: string, direction: -1 | 1) => {
    if (!playlist) return;
    const items = [...playlist.items]; const from = items.findIndex((item) => item.id === itemId); const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;
    [items[from], items[to]] = [items[to]!, items[from]!]; void persistOrder(items);
  };
  const drop = (targetId: string) => {
    if (!playlist || !dragged || dragged === targetId) return;
    const items = [...playlist.items]; const from = items.findIndex((item) => item.id === dragged); const to = items.findIndex((item) => item.id === targetId);
    const [entry] = items.splice(from, 1); if (entry) items.splice(to, 0, entry); setDragged(null); void persistOrder(items);
  };
  if (!playlist && !error) return <main className={styles.page}><MediaSkeleton count={8} /></main>;
  if (!playlist) return <main className={styles.page}><p className={styles.error}>{error}</p><Link href="/watch/playlists">Tilbage til playlister</Link></main>;
  return <main className={styles.page}><Link className={styles.back} href="/watch/playlists"><ArrowLeft />Alle playlister</Link>
    <header className={styles.detailHeader}><div><span>PROFILPLAYLISTE</span><input maxLength={80} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><textarea maxLength={500} rows={2} placeholder="Beskrivelse" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div><div><button className={playlist.pinned ? styles.pinned : ''} onClick={() => void save(!playlist.pinned)}><Pin />{playlist.pinned ? 'Fastgjort' : 'Fastgør på forsiden'}</button><button disabled={!dirty || busy === 'save'} onClick={() => void save()}><Save />Gem</button><button className={styles.danger} disabled={busy === 'delete'} onClick={() => void removePlaylist()}><Trash2 />Slet</button></div></header>
    {error && <p className={styles.error}>{error}</p>}
    <div className={styles.listMeta}><strong>{playlist.items.length} titler</strong><span>Træk i grebet, eller brug pilene. Ændringer gemmes straks.</span>{busy === 'order' && <LoaderCircle className={styles.spin} />}</div>
    {playlist.items.length ? <div className={styles.items}>{playlist.items.map((entry, index) => <article draggable onDragStart={() => setDragged(entry.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(entry.id)} key={entry.id}><span className={styles.order}><GripVertical /><b>{index + 1}</b></span><MediaCard item={toExperience(entry, playlist.id)} /><div className={styles.itemButtons}><button disabled={index === 0 || busy === 'order'} onClick={() => move(entry.id, -1)} aria-label={`Flyt ${entry.media.title} op`}><ArrowUp /></button><button disabled={index === playlist.items.length - 1 || busy === 'order'} onClick={() => move(entry.id, 1)} aria-label={`Flyt ${entry.media.title} ned`}><ArrowDown /></button><button disabled={busy === entry.id} onClick={() => void removeItem(entry.id)} aria-label={`Fjern ${entry.media.title}`}><X /></button></div></article>)}</div> : <section className={styles.empty}><ListMusic /><h2>Playlisten er tom</h2><p>Brug playlisteknappen på et mediekort for at tilføje film, serier eller episoder.</p></section>}
  </main>;
}

function toExperience(entry: PlaylistItem, playlistId: string): MediaExperienceItem { return { ...entry.media, mediaId: entry.media.id, targetType: entry.targetType, targetKey: entry.targetKey, viewerState: { inWatchlist: false, watched: false, playlistIds: [playlistId] }, playback: entry.media.type !== 'series' ? { ...entry.media, id: entry.media.id, file: { durationMs: entry.media.durationMs ?? null } } as never : entry.media.playback }; }
function date(value: string) { return new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium' }).format(new Date(value)); }
function message(reason: unknown) { return (reason as ApiFailure)?.message ?? 'Playlisten kunne ikke opdateres.'; }
