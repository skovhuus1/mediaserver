'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, clearSession, type SessionUser } from '@/lib/api';
import { CatalogView } from './catalog-view';
import { ContinueWatching } from './continue-watching';
import { CustomerShell } from './customer-shell';
import { CustomerHome } from './customer-home';
import styles from './watch-portal.module.css';

export function WatchPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<SessionUser | null>(null);
  const browse = Boolean(Array.from(searchParams.keys()).some((key) => key !== 'view'));
  const continueOnly = searchParams.get('view') === 'continue';
  useEffect(() => {
    let active = true;
    void api<SessionUser>('/auth/me').then((session) => {
      if (!active) return;
      setUser(session);
    }).catch(() => {
      clearSession();
      router.replace('/login');
    });
    return () => { active = false; };
  }, [router]);
  if (!user) return <main className="watch-loading" aria-busy="true" />;
  return <CustomerShell user={user}><div className={styles.portal}>{continueOnly ? <section className="watch-page-heading"><span className="eyebrow">DIN HISTORIK</span><h1>Fortsæt med at se</h1><ContinueWatching /></section> : browse ? <CatalogView basePath="/watch" /> : <CustomerHome />}</div></CustomerShell>;
}
