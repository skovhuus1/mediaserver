# Klienter

## Web

**web/admin** indeholder både adminportal og kundeportal.

Adminportal:

- setup og serverindstillinger
- brugere, profiler, planer og devices
- biblioteker, scans og metadata
- operationscenter og diagnostics
- playback telemetry og systemlog
- updater, backup og integrationer

Kundeportal:

- personlig home
- continue watching
- recommendations og feedback
- global search
- film-, serie-, sæson-, person- og collectionvisning
- webplayer
- profil- og device preferences
- offline/download status

Admin kan skifte til kundevisning uden at få et separat brugerlogin.

## Flutter mobile og TV

**clients/mobile-tv** deler domæne- og netværkskode, men UI'et tilpasser sig inputmetoden.

Mobil:

- touchnavigation
- playback
- offline downloads
- Cast discovery og handoff
- push registration
- secure credential storage

TV:

- D-pad fokus
- store hit areas
- hero, rails og detailvisning til afstand
- fjernbetjeningsvenligt login
- playback controls uden touchkrav

Server-URL skal normalt komme fra build/deployment eller discovery. Slutbrugere skal ikke indtaste teknisk URL i den almindelige produktionloginoplevelse.

## Login

Klientflowet håndterer:

- credentials
- tvunget passwordskift
- profilvalg
- profil-PIN
- token refresh
- device registration
- suspend/revoke

Secure storage bruges til tokens og krypterede offlinekontrakter. Secrets må ikke ligge i plain preferences.

## Offline

Offline er en serverautoriseret kontrakt, ikke blot download af stream-URL.

Flow:

1. Klienten anmoder om offline prepare.
2. Worker klargør artifact.
3. Klienten downloader med resume og integritetskontrol.
4. License/entitlement valideres efter serverpolicy.
5. Device revoke kan gøre offlineadgang ugyldig.

## Android artifacts

Android bruger separate `mobile`- og `tv`-product flavors. Mobilmanifestet har almindelig launcher, mens TV-manifestet har Leanback launcher og kræver `android.software.leanback`.

PR-workflowet bygger og inspicerer begge debug-APK'er. Produktionsworkflowet kræver et commit fra `main`, produktionssignering og publicerer mobil-APK, TV-APK, mobil-AAB, checksums, release-evidence, et maskinlæsbart manifest og GitHub artifact attestations.

Release-manifestet binder package ID, version, buildnummer, commit, certifikatfingeraftryk og SHA-256 til filerne. Mobile og TV skal have forskellige hashes og samme releasecertifikat. En publiceret GitHub release er immutable i workflowet.

Et downloadlink er kun gyldigt, når artifact faktisk er publiceret. README må ikke hævde et direkte APK-link, som ikke findes.

## Chromecast

Mobil og web kan starte Cast, men receiverregistrering hos Google og fysisk device-test er eksterne gates. Cast App ID konfigureres med **BB_MEDIA_CAST_RECEIVER_APP_ID**.

## Release-gates

Før offentlig mobil/TV-release:

- Flutter analyze og tests grønne
- separate mobile/TV-flavors bygget
- signed APK/AAB uden debug-certifikat
- merged manifest, version, checksum og provenance verificeret
- login på fysisk mobil
- D-pad på fysisk Android TV
- playback, seek, subtitles og Cast fysisk testet
- privacy policy og storemetadata
- crash reporting og rolloutplan
