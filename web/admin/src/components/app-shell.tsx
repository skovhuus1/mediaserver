'use client';

import {
  Activity,
  Bell,
  ChevronDown,
  Clapperboard,
  Film,
  FolderOpen,
  Gauge,
  Home,
  Library,
  MonitorPlay,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tv,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Brand } from './brand';
import { t } from '@/lib/messages';

const primary = [
  { label: t.home, icon: Home, href: '/' },
  { label: t.movies, icon: Film, href: '/?type=movie' },
  { label: t.series, icon: Tv, href: '/?type=series' },
  { label: t.continueWatching, icon: MonitorPlay, href: '/?view=continue' },
];
const admin = [
  { label: t.users, icon: Users, href: '/?admin=users' },
  { label: t.libraries, icon: FolderOpen, href: '/?admin=libraries' },
  { label: t.plans, icon: ShieldCheck, href: '/?admin=plans' },
  { label: t.updates, icon: Sparkles, href: '/update' },
  { label: t.settings, icon: Settings, href: '/?admin=settings' },
];

export function AppShell({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          <span className="nav-label">{t.library}</span>
          {primary.map(({ label, icon: Icon, href }, index) => (
            <Link className={index === 0 ? 'nav-item active' : 'nav-item'} href={href} key={label}>
              <Icon size={17} /> <span>{label}</span>
            </Link>
          ))}
          <span className="nav-label">{t.administration}</span>
          {admin.map(({ label, icon: Icon, href }) => (
            <Link className="nav-item" href={href} key={label}>
              <Icon size={17} /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="server-chip"><Gauge size={16} /><span>BoltBytes Server<small><b />v0.1.0</small></span></div>
      </aside>
      <header className="topbar">
        <label className="search-box"><Search size={17} /><input placeholder={t.search} /><kbd>Ctrl K</kbd></label>
        <div className="top-actions">
          <Link className="settings-button" href="/update"><Settings size={15} />{t.settings}</Link>
          <MonitorPlay size={18} /><Bell size={18} />
          <span className="avatar">A</span><span>Admin</span><ChevronDown size={14} />
        </div>
      </header>
      <main className="main-content">{children}</main>
      <aside className="status-rail">{rail}</aside>
      <footer className="player-bar">
        <div className="player-empty"><Clapperboard size={22} /><span>Ingen aktiv afspilning<small>Vælg et medie for at starte</small></span></div>
        <div className="player-controls"><Activity size={17} /><button aria-label="Afspil">▶</button><Library size={17} /></div>
        <div className="player-track"><span /></div>
      </footer>
    </div>
  );
}
