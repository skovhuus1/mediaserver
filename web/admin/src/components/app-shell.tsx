'use client';

import {
  Activity,
  Bell,
  ChevronDown,
  Clapperboard,
  FolderOpen,
  Gauge,
  Home,
  Library,
  LogOut,
  MonitorPlay,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, type ReactNode, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Brand } from './brand';
import { api, logoutSession, type SessionUser } from '@/lib/api';
import { t } from '@/lib/messages';
import { WebPlayer } from './web-player';

type Notification = {
  id: string;
  severity: string;
  source: string;
  code: string;
  message: string;
  timestamp: string;
};

const admin = [
  { label: 'Dashboard', icon: Home, href: '/' },
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [clearingNotifications, setClearingNotifications] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const currentQuery = searchParams.toString();
  const isActive = (href: string) => {
    const [targetPath, targetQuery = ''] = href.split('?');
    if (pathname !== targetPath) return false;
    if (!targetQuery) return !currentQuery;
    const targetParams = new URLSearchParams(targetQuery);
    return Array.from(targetParams.entries()).every(([key, value]) => searchParams.get(key) === value);
  };
  const loadNotifications = useCallback(async () => {
    setNotifications(await api<Notification[]>('/system/errors'));
  }, []);
  const clearNotifications = useCallback(async () => {
    setClearingNotifications(true);
    try {
      await api('/system/errors', { method: 'DELETE' });
      setNotifications([]);
    } finally {
      setClearingNotifications(false);
    }
  }, []);

  useEffect(() => {
    void api<SessionUser>('/auth/me').then(setUser).catch(() => undefined);
    void loadNotifications().catch(() => undefined);
  }, [loadNotifications]);

  useEffect(() => {
    const closeMenus = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNotificationsOpen(false);
      setAccountOpen(false);
    };
    window.addEventListener('keydown', closeMenus);
    return () => window.removeEventListener('keydown', closeMenus);
  }, []);

  const activeProfile = user?.profiles.find((profile) => profile.id === user.activeProfileId) ?? user?.profiles[0];
  const displayName = user?.displayName ?? 'Admin';
  const avatarLetter = (activeProfile?.name ?? displayName).slice(0, 1).toUpperCase();

  async function logout() {
    await logoutSession().catch(() => undefined);
    router.replace('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav>
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
        <div className="admin-context"><ShieldCheck size={17} /><span>Serveradministration</span></div>
        <div className="top-actions">
          <Link className="settings-button" href="/?admin=settings" aria-label="Åbn indstillinger">
            <Settings size={15} />{t.settings}
          </Link>
          <Link className="top-icon-button" href="/watch" aria-label="Skift til kundevisning" title="Kundevisning">
            <MonitorPlay size={18} />
          </Link>
          <div className="top-action-menu">
            <button
              className="top-icon-button"
              type="button"
              aria-label="Vis notifikationer"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((open) => !open);
                setAccountOpen(false);
                void loadNotifications().catch(() => undefined);
              }}
            >
              <Bell size={18} />
              {notifications.length > 0 && <span className="notification-count">{Math.min(notifications.length, 99)}</span>}
            </button>
            {notificationsOpen && (
              <section className="top-popover notification-popover" aria-label="Notifikationer">
                <header><strong>Notifikationer</strong><span><button disabled={!notifications.length || clearingNotifications} onClick={() => void clearNotifications()}>{clearingNotifications ? 'Rydder...' : 'Ryd alle'}</button><Link href="/?admin=settings" onClick={() => setNotificationsOpen(false)}>Se fejllog</Link></span></header>
                {!notifications.length && <p>Ingen registrerede serverfejl.</p>}
                {notifications.slice(0, 6).map((notification) => (
                  <article key={notification.id}>
                    <span className={`notification-dot ${notification.severity}`} />
                    <div><strong>{notification.source}</strong><p>{notification.message}</p><time>{new Date(notification.timestamp).toLocaleString('da-DK')}</time></div>
                  </article>
                ))}
              </section>
            )}
          </div>
          <div className="top-action-menu">
            <button
              className="account-button"
              type="button"
              aria-label="Åbn Admin-menu"
              aria-expanded={accountOpen}
              onClick={() => {
                setAccountOpen((open) => !open);
                setNotificationsOpen(false);
              }}
            >
              <span className="avatar">{avatarLetter || 'A'}</span>
              <span>{displayName}</span>
              <ChevronDown size={14} />
            </button>
            {accountOpen && (
              <nav className="top-popover account-popover" aria-label="Admin-menu">
                <div className="account-summary"><span className="avatar">{avatarLetter || 'A'}</span><div><strong>{displayName}</strong><small>{activeProfile?.name ?? user?.email}</small></div></div>
                <Link href="/watch" onClick={() => setAccountOpen(false)}><MonitorPlay size={16} />Kundevisning</Link>
                <Link href="/profiles" onClick={() => setAccountOpen(false)}><UserRound size={16} />Skift profil</Link>
                <Link href="/?admin=settings" onClick={() => setAccountOpen(false)}><Settings size={16} />Indstillinger</Link>
                <button type="button" onClick={() => void logout()}><LogOut size={16} />Log ud</button>
              </nav>
            )}
          </div>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <aside className="status-rail">{rail}</aside>
      <footer className="player-bar">
        <div className="player-empty"><Clapperboard size={22} /><span>Ingen aktiv afspilning<small>Vælg et medie for at starte</small></span></div>
        <div className="player-controls"><Activity size={17} /><button aria-label="Afspil">▶</button><Library size={17} /></div>
        <div className="player-track"><span /></div>
      </footer>
      <WebPlayer />
    </div>
  );
}
