'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, type ApiFailure } from '../lib/api';
import styles from './customer-settings.module.css';

type ProfileState = {
  profile: {
    id: string;
    name: string;
    avatarKey: string | null;
    language: string;
    isChild: boolean;
    pinProtected: boolean;
  };
  preferences: {
    preferredAudioLanguages: string[];
    preferredSubtitleLanguages: string[];
    subtitleMode: 'auto' | 'always' | 'forced' | 'off';
    autoplayNext: boolean;
    recommendationsEnabled: boolean;
  };
};

type DeviceState = {
  deviceId: string;
  preferences: {
    qualityMode: 'auto' | 'fixed' | 'original';
    fixedQualityHeight: number | null;
    allowUpscale: boolean;
    dataSaver: boolean;
    playbackRate: number;
    hdrMode: 'auto' | 'prefer_hdr' | 'force_sdr';
  };
};

const failureMessage = (reason: unknown) =>
  (reason as ApiFailure)?.message || 'Indstillingerne kunne ikke gemmes.';
const languages = (value: string) =>
  value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);

export function CustomerSettings() {
  const [savedProfile, setSavedProfile] = useState<ProfileState | null>(null);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [savedDevice, setSavedDevice] = useState<DeviceState | null>(null);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [clearPin, setClearPin] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api<ProfileState>('/profiles/me/preferences'),
      api<DeviceState>('/devices/me/preferences'),
    ])
      .then(([profileResult, deviceResult]) => {
        setSavedProfile(profileResult);
        setProfile(structuredClone(profileResult));
        setSavedDevice(deviceResult);
        setDevice(structuredClone(deviceResult));
      })
      .catch((reason) => setError(failureMessage(reason)));
  }, []);

  const profileDirty = useMemo(
    () =>
      JSON.stringify(savedProfile) !== JSON.stringify(profile) ||
      Boolean(currentPin || newPin || clearPin),
    [savedProfile, profile, currentPin, newPin, clearPin],
  );
  const deviceDirty = useMemo(
    () => JSON.stringify(savedDevice) !== JSON.stringify(device),
    [savedDevice, device],
  );

  if (!profile || !device) {
    return (
      <main className={styles.page}>
        <h1>Indstillinger</h1>
        <p>{error || 'Henter dine indstillinger...'}</p>
      </main>
    );
  }

  const patchProfile = (patch: Partial<ProfileState['profile']>) =>
    setProfile({ ...profile, profile: { ...profile.profile, ...patch } });
  const patchProfilePrefs = (patch: Partial<ProfileState['preferences']>) =>
    setProfile({
      ...profile,
      preferences: { ...profile.preferences, ...patch },
    });
  const patchDevice = (patch: Partial<DeviceState['preferences']>) =>
    setDevice({ ...device, preferences: { ...device.preferences, ...patch } });

  async function saveProfile() {
    setBusy('profile');
    setError('');
    setMessage('');
    try {
      const result = await api<ProfileState>('/profiles/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          name: profile!.profile.name,
          avatarKey: profile!.profile.avatarKey || undefined,
          language: profile!.profile.language,
          ...profile!.preferences,
          ...(currentPin ? { currentPin } : {}),
          ...(newPin ? { newPin } : {}),
          ...(clearPin ? { clearPin: true } : {}),
        }),
      });
      setSavedProfile(result);
      setProfile(structuredClone(result));
      setCurrentPin('');
      setNewPin('');
      setClearPin(false);
      setMessage('Profilindstillingerne er gemt.');
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy('');
    }
  }

  async function saveDevice() {
    setBusy('device');
    setError('');
    setMessage('');
    try {
      const result = await api<DeviceState>('/devices/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(device!.preferences),
      });
      setSavedDevice(result);
      setDevice(structuredClone(result));
      setMessage('Afspilningsindstillingerne er gemt på denne enhed.');
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy('');
    }
  }

  async function resetRecommendations() {
    setBusy('reset');
    setError('');
    try {
      await api('/media/recommendations/reset', { method: 'POST' });
      setMessage('Anbefalingerne er nulstillet. Historikken er bevaret.');
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy('');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div><span>DIN PROFIL</span><h1>Indstillinger</h1><p>Profilvalg følger dig. Afspilningsvalg gælder kun denne enhed.</p></div>
        <a href="/watch">Tilbage til biblioteket</a>
      </header>
      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.notice}>{message}</div>}

      <SettingsCard title="Profil" description="Navn, avatar og sprog synkroniseres mellem enheder." action="Gem profil" dirty={profileDirty} busy={busy === 'profile'} save={saveProfile}>
        <label>Profilnavn<input value={profile.profile.name} onChange={(event) => patchProfile({ name: event.target.value })} /></label>
        <label>Avatar<select value={profile.profile.avatarKey ?? ''} onChange={(event) => patchProfile({ avatarKey: event.target.value || null })}><option value="">Standard</option><option value="orbit">Orbit</option><option value="nova">Nova</option><option value="ember">Ember</option><option value="fjord">Fjord</option></select></label>
        <label>Sprog<select value={profile.profile.language} onChange={(event) => patchProfile({ language: event.target.value })}><option value="da">Dansk</option><option value="en">English</option></select></label>
        <div className={styles.readOnly}>Børneprofil: <strong>{profile.profile.isChild ? 'Ja' : 'Nej'}</strong><small>Administreres af serverejeren.</small></div>
      </SettingsCard>

      <SettingsCard title="Lyd og undertekster" description="Sprog angives i prioriteret rækkefølge." action="Gem lyd og tekst" dirty={profileDirty} busy={busy === 'profile'} save={saveProfile}>
        <label>Foretrukne lydsprog<input value={profile.preferences.preferredAudioLanguages.join(', ')} onChange={(event) => patchProfilePrefs({ preferredAudioLanguages: languages(event.target.value) })} /></label>
        <label>Foretrukne undertekster<input value={profile.preferences.preferredSubtitleLanguages.join(', ')} onChange={(event) => patchProfilePrefs({ preferredSubtitleLanguages: languages(event.target.value) })} /></label>
        <label>Underteksttilstand<select value={profile.preferences.subtitleMode} onChange={(event) => patchProfilePrefs({ subtitleMode: event.target.value as ProfileState['preferences']['subtitleMode'] })}><option value="auto">Auto</option><option value="always">Altid</option><option value="forced">Kun forced</option><option value="off">Fra</option></select></label>
        <Toggle label="Afspil næste episode automatisk" checked={profile.preferences.autoplayNext} change={(checked) => patchProfilePrefs({ autoplayNext: checked })} />
      </SettingsCard>

      <SettingsCard title="Afspilning" description="Auto tilpasser kvaliteten til skærm, abonnement og netværk." action="Gem afspilning" dirty={deviceDirty} busy={busy === 'device'} save={saveDevice}>
        <label>Kvalitet<select value={device.preferences.qualityMode} onChange={(event) => patchDevice({ qualityMode: event.target.value as DeviceState['preferences']['qualityMode'] })}><option value="auto">Auto</option><option value="fixed">Fast maksimum</option><option value="original">Original</option></select></label>
        <label>Maksimal opløsning<select disabled={device.preferences.qualityMode !== 'fixed'} value={device.preferences.fixedQualityHeight ?? 1080} onChange={(event) => patchDevice({ fixedQualityHeight: Number(event.target.value) })}>{[360, 480, 720, 1080, 1440, 2160].map((height) => <option key={height} value={height}>{height === 2160 ? '4K' : `${height}p`}</option>)}</select></label>
        <label>Standardhastighed<select value={device.preferences.playbackRate} onChange={(event) => patchDevice({ playbackRate: Number(event.target.value) })}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select></label>
        <label>HDR<select value={device.preferences.hdrMode} onChange={(event) => patchDevice({ hdrMode: event.target.value as DeviceState['preferences']['hdrMode'] })}><option value="auto">Auto</option><option value="prefer_hdr">Foretræk HDR</option><option value="force_sdr">Tving SDR</option></select></label>
        <Toggle label="Tillad upscaling" checked={device.preferences.allowUpscale} change={(checked) => patchDevice({ allowUpscale: checked })} />
        <Toggle label="Databesparelse, maks. 720p / ca. 3 Mbps" checked={device.preferences.dataSaver} change={(checked) => patchDevice({ dataSaver: checked })} />
      </SettingsCard>

      <SettingsCard title="Anbefalinger" description="Historik og feedback bruges kun mod dit lokale bibliotek." action="Gem anbefalinger" dirty={profileDirty} busy={busy === 'profile'} save={saveProfile}>
        <Toggle label="Personlige anbefalinger" checked={profile.preferences.recommendationsEnabled} change={(checked) => patchProfilePrefs({ recommendationsEnabled: checked })} />
        <button className={styles.secondary} disabled={Boolean(busy)} onClick={resetRecommendations}>{busy === 'reset' ? 'Nulstiller...' : 'Nulstil anbefalinger'}</button>
      </SettingsCard>

      <SettingsCard title="Sikkerhed" description="En beskyttet profil kræver nuværende PIN ved ændringer." action="Gem sikkerhed" dirty={profileDirty} busy={busy === 'profile'} save={saveProfile}>
        {profile.profile.pinProtected && <label>Nuværende PIN<input type="password" inputMode="numeric" maxLength={8} value={currentPin} onChange={(event) => setCurrentPin(event.target.value)} /></label>}
        <label>Ny PIN, 4-8 cifre<input type="password" inputMode="numeric" maxLength={8} value={newPin} onChange={(event) => setNewPin(event.target.value)} /></label>
        {profile.profile.pinProtected && <Toggle label="Fjern profil-PIN" checked={clearPin} change={setClearPin} />}
      </SettingsCard>
    </main>
  );
}

function SettingsCard(props: { title: string; description: string; action: string; dirty: boolean; busy: boolean; save: () => void; children: React.ReactNode }) {
  return <section className={styles.card}><header><div><h2>{props.title}</h2><p>{props.description}</p></div><button disabled={!props.dirty || props.busy} onClick={props.save}>{props.busy ? 'Gemmer...' : props.action}</button></header><div className={styles.grid}>{props.children}</div></section>;
}

function Toggle(props: { label: string; checked: boolean; change: (checked: boolean) => void }) {
  return <label className={styles.toggle}><input type="checkbox" checked={props.checked} onChange={(event) => props.change(event.target.checked)} />{props.label}</label>;
}
