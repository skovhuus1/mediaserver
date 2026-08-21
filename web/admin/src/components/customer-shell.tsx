'use client';

import { ChevronLeft, Film, Home, LogOut, MonitorPlay, Search, Tv, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Brand } from './brand';
import { WebPlayer } from './web-player';
import { CastSdkLoader } from './cast-sdk-loader';
import { logoutSession, type SessionUser } from '@/lib/api';
import styles from './customer-shell.module.css';

export function CustomerShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = user.roles.some((role) => role === 'admin' || role === 'operator');
  const activeProfile = user.profiles.find((profile) => profile.id === user.activeProfileId) ?? user.profiles[0];
  const links = [
    { href: '/watch', label: 'Hjem', icon: Home },
    { href: '/watch?type=movie', label: 'Film', icon: Film },
    { href: '/watch?type=series', label: 'Serier', icon: Tv },
    { href: '/watch?view=continue', label: 'Fortsæt', icon: MonitorPlay },
  ];
  const active = (href: string) => {
    const [path, query = ''] = href.split('?');
    if (pathname !== path) return false;
    if (!query) return !searchParams.toString();
    const target = new URLSearchParams(query);
    return Array.from(target.entries()).every(([key, value]) => searchParams.get(key) === value);
  };
  async function logout() {
    await logoutSession().catch(() => undefined);
    router.replace('/login');
  }
  return (
    <div className={`watch-shell ${styles.shell}`}>
      <header className={`watch-header ${styles.header}`}>
        <Link aria-label="BoltBytes hjem" href="/watch"><Brand /></Link>
        <nav className={styles.nav}>{links.map(({ href, label, icon: Icon }) => <Link className={active(href) ? 'active' : ''} href={href} key={href}><Icon size={16} />{label}</Link>)}</nav>
        <form className={`watch-search ${styles.search}`} action="/watch"><Search size={16} /><input name="q" defaultValue={searchParams.get('q') ?? ''} placeholder="Søg i dit bibliotek" /></form>
        <div className={`watch-account ${styles.account}`}>
          {isAdmin && <Link className={`admin-return ${styles.accountLink}`} href="/"><ChevronLeft size={15} />Admin</Link>}
          <Link className={`admin-return ${styles.accountLink}`} href="/watch/settings">Indstillinger</Link>
          <Link className={`profile-button ${styles.profile}`} href="/profiles"><span>{activeProfile?.name.slice(0, 1).toUpperCase() ?? <UserRound size={15} />}</span>{activeProfile?.name ?? user.displayName}</Link>
          <button onClick={() => void logout()} aria-label="Log ud"><LogOut size={16} /></button>
        </div>
      </header>
      <main className={`watch-main ${styles.main}`}>{children}</main>
      <CastSdkLoader />
      <WebPlayer />
    </div>
  );
}
