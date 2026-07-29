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
  const [pinProfile, setPinProfile] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  useEffect(() => {
    void api<SessionUser>('/auth/me').then(setUser).catch(() => {
      clearSession();
      router.replace('/login');
    });
  }, [router]);
  async function choose(profileId: string, profilePin?: string) {
    setBusy(profileId);
    setError('');
    try {
      await selectProfile(profileId, profilePin);
      router.replace('/watch');
    } catch (failure) {
      setError((failure as { message?: string }).message ?? 'Profilen kunne ikke vælges.');
      setBusy('');
    }
  }
  if (!user) return <main className="profile-page" aria-busy="true" />;
  const isAdmin = user.roles.some((role) => role === 'admin' || role === 'operator');
  const selectedPinProfile = user.profiles.find((profile) => profile.id === pinProfile);
  return (
    <main className="profile-page">
      <header><Brand />{isAdmin && <Link href="/"><ChevronLeft size={15} />Tilbage til admin</Link>}</header>
      <section className="profile-picker">
        <span className="eyebrow">VÆLG PROFIL</span>
        <h1>Hvem ser med?</h1>
        <p>Historik, fortsæt-position og anbefalinger følger den valgte profil.</p>
        <div className="profile-grid">
          {user.profiles.map((profile, index) => (
            <button
              disabled={Boolean(busy)}
              onClick={() => {
                if (profile.hasPin) {
                  setPinProfile(profile.id);
                  setPin('');
                  setError('');
                } else {
                  void choose(profile.id);
                }
              }}
              key={profile.id}
            >
              <span className={`profile-orb profile-orb-${index % 5}`}>{profile.isChildProfile ? <Baby /> : <UserRound />}</span>
              <strong>{profile.name}</strong>
              <small>{profile.hasPin ? 'PIN-beskyttet' : profile.isChildProfile ? 'Børneprofil' : profile.id === user.activeProfileId ? 'Aktiv profil' : 'Profil'}</small>
            </button>
          ))}
        </div>
        {!user.profiles.length && <div className="profile-empty"><ShieldCheck /><p>Der er ikke oprettet en profil til denne konto endnu.</p></div>}
        {selectedPinProfile && (
          <form
            className="profile-pin-form"
            onSubmit={(event) => {
              event.preventDefault();
              void choose(selectedPinProfile.id, pin);
            }}
          >
            <strong>PIN til {selectedPinProfile.name}</strong>
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="off"
              pattern="\d{4,8}"
              minLength={4}
              maxLength={8}
              autoFocus
              required
            />
            <div><button disabled={Boolean(busy)}>Lås op</button><button type="button" onClick={() => setPinProfile(null)}>Annuller</button></div>
          </form>
        )}
        {error && <div className="form-error">{error}</div>}
      </section>
    </main>
  );
}
