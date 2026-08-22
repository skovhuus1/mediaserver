'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, type SessionUser } from '@/lib/api';
import { CustomerShell } from './customer-shell';

export function AuthenticatedCustomerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let active = true;
    void api<SessionUser>('/auth/me').then((session) => {
      if (active) setUser(session);
    }).catch(() => {
      clearSession();
      router.replace('/login');
    });
    return () => { active = false; };
  }, [router]);

  if (!user) return <main className="watch-loading" aria-busy="true" aria-label="Åbner kundeportalen" />;
  return <CustomerShell user={user}>{children}</CustomerShell>;
}
