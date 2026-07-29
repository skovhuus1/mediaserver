'use client';

import { Baby, ChevronLeft, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { api, clearSession, selectProfile, type SessionUser } from '@/lib/api';

export function ProfilePicker() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api<SessionUser>('/auth/me').then(setUser).catch(() => {
      clearSession();
      router.replace('/login');
    });
  }, [router]);
  async function choose(profileId: string) {
    setBusy(profileId);
    setError('');
    try {
      await selectProfile(profileId);
      router.replace('/watch');
    } catch (failure) {
      setError((failure as { message?: string }).message ?? 'Profilen kunne ikke vælges.');
      setBusy('');
    }
  }
  if (!user) return <main className="profile-page" aria-busy="true" />;
  const isAdmin = user.roles.some((role) => role === 'admin' || role === 'operator');
  return (
    <main className="profile-page">
      <header><Brand />{isAdmin && <Link href="/"><ChevronLeft size={15} />Tilbage til admin</Link>}</header>
      <section className="profile-picker">
        <span className="eyebrow">VÆLG PROFIL</span>
        <h1>Hvem ser med?</h1>
        <p>Historik, fortsæt-position og anbefalinger følger den valgte profil.</p>
        <div className="profile-grid">
          {user.profiles.map((profile, index) => (
            <button disabled={Boolean(busy)} onClick={() => void choose(profile.id)} key={profile.id}>
              <span className={`profile-orb profile-orb-${index % 5}`}>{profile.isChildProfile ? <Baby /> : <UserRound />}</span>
              <strong>{profile.name}</strong>
              <small>{profile.isChildProfile ? 'Børneprofil' : profile.id === user.activeProfileId ? 'Aktiv profil' : 'Profil'}</small>
            </button>
          ))}
        </div>
        {!user.profiles.length && <div className="profile-empty"><ShieldCheck /><p>Der er ikke oprettet en profil til denne konto endnu.</p></div>}
        {error && <div className="form-error">{error}</div>}
      </section>
    </main>
  );
}
