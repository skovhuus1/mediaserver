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
import { Suspense, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
    <Suspense fallback={<div className="app-shell" aria-busy="true" />}>
      <AppShellContent rail={rail}>{children}</AppShellContent>
    </Suspense>
  );
}

function AppShellContent({ children, rail }: { children: ReactNode; rail: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const isActive = (href: string) => {
    const [targetPath, targetQuery = ''] = href.split('?');
    if (pathname !== targetPath) return false;
    if (!targetQuery) return !currentQuery;
    const targetParams = new URLSearchParams(targetQuery);
    return Array.from(targetParams.entries()).every(([key, value]) => searchParams.get(key) === value);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
          <span className="nav-label">{t.library}</span>
          {primary.map(({ label, icon: Icon, href }) => (
            <Link className={isActive(href) ? 'nav-item active' : 'nav-item'} href={href} key={label}>
              <Icon size={17} /> <span>{label}</span>
            </Link>
          ))}
          <span className="nav-label">{t.administration}</span>
          {admin.map(({ label, icon: Icon, href }) => (
            <Link className={isActive(href) ? 'nav-item active' : 'nav-item'} href={href} key={label}>
              <Icon size={17} /> <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="server-chip"><Gauge size={16} /><span>BoltBytes Server<small><b />v0.1.0</small></span></div>
      </aside>
      <header className="topbar">
        <form className="search-box" action="/">
          <Search size={17} /><input name="q" defaultValue={searchParams.get('q') ?? ''} placeholder={t.search} /><kbd>Enter</kbd>
        </form>
        <div className="top-actions">
          <Link className="settings-button" href="/?admin=settings"><Settings size={15} />{t.settings}</Link>
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
