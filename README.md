# BoltBytes Media Server

TypeScript-first medieplatform i en monorepo med tre kerneenheder:

- `services/api` (NestJS)
- `web/admin` (Next.js)
- `shared/types` (kontrakter)

Derudover leveres Docker- og driftinfrastruktur under `infra/` og `docker-compose.yml`.

## Hurtig-start (lokalt)

```bash
npm install
cp .env.example .env
# Udfyld DATABASE_URL m.v. hvis nødvendigt
npm run dev
```

## Fase-1 endpoints

API er versioneret med `/api/v1`.

- `GET  /api/v1/accounts/bootstrap-state`
- `POST /api/v1/system/setup`
- `GET  /api/v1/system/health`
- `GET  /api/v1/system/ready`
- `GET  /api/v1/system/metrics`
- `POST /api/v1/system/webhook/billing`
- `POST /api/v1/auth/register-admin`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET  /api/v1/auth/me`
- `GET  /api/v1/users`
- `POST /api/v1/users`
- `GET  /api/v1/profiles`
- `POST /api/v1/profiles`
- `GET  /api/v1/devices`
- `POST /api/v1/devices`
- `DELETE /api/v1/devices/:id`
- `GET  /api/v1/plans`
- `POST /api/v1/plans`
- `GET  /api/v1/plan-versions`
- `POST /api/v1/plan-versions`
- `GET  /api/v1/subscriptions`
- `POST /api/v1/subscriptions`
- `PATCH /api/v1/subscriptions/:id/cancel`
- `POST /api/v1/entitlements/evaluate`
- `POST /api/v1/playback/authorize`
- `GET  /api/v1/playback/sessions`
- `PATCH /api/v1/playback/sessions/:id/heartbeat`
- `DELETE /api/v1/playback/sessions/:id`
- `GET  /api/v1/media`
- `POST /api/v1/media`
- `GET  /api/v1/libraries`
- `POST /api/v1/libraries`
- `PATCH /api/v1/libraries/:id/scan`
- `GET  /api/v1/system/health` (global)

## Implementeret i denne omgang (fase 1)

- ✅ Database-model med Fase 1 domæner i `services/api/prisma/schema.prisma` og initial migration.
- ✅ API-moduler for konto, auth, brugere/profiler, enheder, planer, abonnementer, entitlement-evaluering og playback.
- ✅ Session reservation med lease/heartbeat + pause-reservationsopførsel + automatisk udløbsrens i `PlaybackService.listSessions`.
- ✅ Setup-flow og system endpoints (`/system/setup`, `/system/health`, `/system/ready`, `/system/metrics`, webhook).
- ✅ Billing ledger for webhook-idempotens (`billing_webhook_events`) med deduplikeringsnøgle + fejlstatus.
- ✅ Brugeroprettelse validere e-mail pr. konto.

## Hvad mangler stadig (fase 1 færdiggørelse)

- ⏳ Udvidet testplan: concurrency, token rotation/revocation, security/path traversal og lease-udløb.
- ⏳ CI-pipeline færdig afrapporteret (pipeline findes, men skal verificeres med konkrete gates).
- ⏳ Forretningskritiske policy-tests i API (planversion snapshots, overrides, suspension flow).
- ⏳ Playback pipeline (FFmpeg/worker orchestration) og klientudrulning.

## Push-flow for hver leverance (`mediaserver` repo)

- Brug `C:\Users\Henrik\Documents\BB-Media\mediaserver` som eneste Git-root.
- Kør status først: `git -C C:\Users\Henrik\Documents\BB-Media\mediaserver status --short`
- Stage kun det ønskede scope og commit med format:
  - `git commit -m "phase1: <opgave>"`
- Push altid mod:
  - `git push -u origin main`
- Standard-script:
  - `.\scripts\push-phase1.ps1 -Task "..." -Paths @("services/api/src/...","README.md")`

## Filer

- `services/api/prisma/schema.prisma` – domænemodel
- `services/api/prisma/migrations/` – SQL-migrations
- `services/api/src` – Nest moduler og service lag
- `web/admin/src/app` – simpel setup/login UI
- `.github/workflows/ci.yml` – CI pipeline
- `docker-compose.yml` + `infra/docker/nginx.conf` – driftgrundlag

## Sikkerhed og drift

- JWT access + refresh med token-rotation
- Brugerroller gennem `roles`, `user_roles` og `@Roles`
- Session reservation med advisory lock + lease heartbeat
- Basis observability gennem `prom-client` metrics
- `billing_webhook_events` ledger med idempotent deduplikation

## Næste trin (fase 1→2)

- Playback pipeline med FFMPEG workers
- Chromecast og Android/WebTV klienter
- Vedvarende playback-job system



hvad hele systemet kan og skal : 


# BoltBytes Media Server — Master Project Specification

Arbejd som principal software engineer, systemarkitekt, sikkerhedsansvarlig og teknisk produktejer på dette projekt.

Byg en komplet selvhostet medieplatform inspireret af funktionaliteten i Plex, Jellyfin og Emby, men med:

* Eget navn
* Eget design
* Egen arkitektur
* Egen kode
* Egne API-kontrakter
* Egne klienter
* Egen bruger- og abonnementsstyring

Produktet skal hedde:

**BoltBytes Media Server**

Systemet skal kunne installeres på en remote Linux-server og give autoriserede brugere adgang til administratorens egne film og serier via:

* Webbrowser
* Android APK
* Android TV
* Google Chromecast
* Senere Windows
* Senere iOS og iPadOS
* Senere Apple TV
* Senere Samsung Tizen
* Senere LG webOS

Løsningen skal være produktionsklar, robust, sikker, vedligeholdelig og designet til store mediebiblioteker, mange brugere og flere samtidige streams.

Projektet må ikke ende som en frontend-demo eller en samling mockups. Funktionerne skal implementeres end-to-end med rigtig backend-state, database, API, workers, brugergrænseflade, validering, adgangskontrol, tests og dokumentation.

---

# 1. Overordnede principper

Prioritér i denne rækkefølge:

1. Korrekthed
2. Datasikkerhed
3. Adgangskontrol
4. Stabilitet
5. Dataintegritet
6. Vedligeholdelse
7. Ydeevne
8. Brugervenlighed
9. Udviklingshastighed

Lav ikke minimale eller midlertidige løsninger, hvis det efterlader funktionaliteten halvfærdig.

Implementér funktionerne end-to-end, inklusive:

* Backend
* Database
* API
* Workers
* Webapp
* Android-app
* Android TV-app
* Chromecast-integration
* Administration
* Bruger- og profilstyring
* Abonnementer og entitlements
* Validering
* Fejlhåndtering
* Logging
* Metrics
* Tests
* Dokumentation
* Migrationer
* Deployment
* Backup og restore
* Upgrade-flow

Gæt ikke på ukendte forhold i den eksisterende kodebase.

Inden du ændrer kode, skal du:

1. Gennemgå repository-strukturen.
2. Identificere anvendte frameworks og konventioner.
3. Undersøge database-, API-, kø-, autentificerings- og frontendarkitekturen.
4. Finde eksisterende funktionalitet, som kan genbruges.
5. Identificere teknisk gæld og arkitektoniske risici.
6. Udarbejde en konkret implementeringsplan.
7. Først derefter begynde implementeringen.

Bevar eksisterende konventioner, hvor de er hensigtsmæssige. Refaktorér dem, hvis de ikke kan understøtte projektets krav.

---

# 2. Produktets formål

BoltBytes Media Server skal administrere, organisere og streame administratorens egne film og serier til autoriserede brugere.

Platformen skal understøtte:

* Mediebiblioteker
* Metadata
* Posters og baggrunde
* Film
* Serier
* Sæsoner
* Episoder
* Samlinger
* Brugere
* Profiler
* Roller
* Planer
* Abonnementer
* Paywall
* Feature-entitlements
* Indholdsrettigheder
* Tidsbaseret adgang til indhold
* Enhedsbegrænsninger
* Begrænsning af samtidige streams
* Direct Play
* Direct Stream
* Transcoding
* Hardwareacceleration
* Undertekster
* Flere lydspor
* Intro-markører
* Recap-markører
* Kapitelmarkører
* Rulletekstmarkører
* Automatisk næste episode
* Chromecast
* Offline-downloads
* Afspilningshistorik
* Fortsæt med at se
* Sonarr-integration
* Radarr-integration
* qBittorrent-integration
* Administration
* Serverovervågning
* Audit-log
* Realtime status

---

# 3. Installation og deployment

Systemet skal kunne installeres med Docker Compose.

Som minimum skal installationen indeholde:

* Media Server API
* Webapp
* PostgreSQL
* Redis
* Background workers
* FFmpeg workers
* Transcoding scheduler
* Metadata workers
* Library scanner
* Automation service
* Entitlement service
* Notification service
* Reverse proxy
* Persistent application data
* Logs
* Metrics

Følgende mount-punkter skal understøttes:

```text
/media
/downloads
/transcode
/app/data
```

Serveren er remote. Antag derfor ikke, at mediefilerne ligger lokalt på udviklingsmaskinen.

Understøt medielagre via eksempelvis:

* Lokale diske
* NFS
* SMB
* rclone mounts
* FUSE mounts
* Read-only mounts
* Flere storage roots
* Flere biblioteksmapper

Systemet skal håndtere langsomme og midlertidigt utilgængelige mounts uden at markere hele biblioteket som permanent slettet.

Deployment skal understøtte:

* Docker Compose
* Health checks
* Readiness checks
* Automatisk genstart
* Database-migrationer
* Versionskontrol
* Rollback
* Backup
* Restore
* Logrotation
* Secrets management
* Separate development- og production-profiler

---

# 4. GUI-baseret konfiguration

Al almindelig konfiguration skal kunne foretages via GUI.

Brugeren må ikke være tvunget til at redigere:

* YAML
* JSON
* `.env`
* Konfigurationsfiler
* Docker Compose-filer

Miljøvariabler må bruges til:

* Bootstrap
* Databaseforbindelse
* Krypteringsnøgle
* Deployment secrets
* Container-infrastruktur

Alle normale produktindstillinger skal administreres via GUI og gemmes i databasen.

Førstegangsopsætningen skal indeholde en guide til:

* Oprettelse af administratorkonto
* Servernavn
* Ekstern URL
* Sprog
* Tidszone
* Mediebiblioteker
* Downloadmappe
* Transcode-cache
* Metadataudbydere
* Sonarr
* Radarr
* qBittorrent
* GPU og hardwareacceleration
* SSL og reverse proxy
* Importregler
* Oprydningsregler
* Standardkvalitet
* Maksimal ekstern bitrate
* Standardbrugerplan
* Standardrettigheder
* Chromecast-konfiguration
* Registrering af afspilningsenheder

Passwords, tokens og API-nøgler skal gemmes krypteret.

---

# 5. Arkitektur

Brug en serviceorienteret og modulær arkitektur.

Anbefalet opdeling:

## 5.1 Media Server Core

Ansvarlig for:

* Brugere
* Konti
* Profiler
* Biblioteker
* Medieobjekter
* Afspilningshistorik
* Fortsæt-positioner
* Rettigheder
* Sessions
* Enheder
* Streambeslutninger
* API
* Realtime events
* Afspilningsautorisation

## 5.2 Identity and Access Service

Ansvarlig for:

* Login
* Logout
* Refresh tokens
* Password reset
* E-mailverifikation
* Session revocation
* Roller
* Permissions
* Profiler
* PIN-beskyttelse
* Enhedsregistrering
* Login-historik
* Brute-force-beskyttelse
* To-faktor-autentificering senere

## 5.3 Entitlement Service

Entitlement Service skal være den centrale komponent for plan- og rettighedskontrol.

Den skal afgøre:

* Om brugeren må se et bestemt medie
* Om brugeren må starte en stream
* Hvor mange samtidige streams brugeren må have
* Hvor mange enheder brugeren må have registreret
* Om Direct Play er tilladt
* Om Direct Stream er tilladt
* Om video-transcoding er tilladt
* Om audio-transcoding er tilladt
* Om subtitle burn-in er tilladt
* Hvilken maksimal opløsning brugeren må se
* Hvilken maksimal bitrate brugeren må bruge
* Om ekstern streaming er tilladt
* Om Chromecast er tilladt
* Om offline-downloads er tilladt
* Hvor mange offline-downloads brugeren må have
* Om nyt indhold er tilgængeligt for brugeren
* Om brugeren har adgang til bestemte biblioteker
* Om brugeren har adgang til bestemte ratings eller indholdstyper

Entitlement Service skal fungere, selv om betaling og paywall endnu ikke er aktiveret.

Det betyder, at administratoren fra første version manuelt skal kunne:

* Oprette planer
* Tildele en plan til en bruger
* Ændre en brugers plan
* Give individuelle overrides
* Fjerne individuelle overrides
* Suspendere adgang
* Angive udløbsdato
* Give midlertidig adgang
* Se de effektive rettigheder

Betalingssystemet skal senere kobles på denne service uden at kræve en omskrivning af streaming-, bruger- eller adgangskontrollen.

## 5.4 Subscription and Billing Service

Billing skal udvikles som en separat modulær service.

Den skal senere kunne integreres med en eller flere betalingsudbydere.

Undgå at hardcode forretningslogik direkte til én betalingsudbyder.

Brug en provider-baseret arkitektur med interfaces til:

* Oprettelse af abonnement
* Opgradering
* Nedgradering
* Opsigelse
* Pause
* Genaktivering
* Betalingsstatus
* Webhooks
* Fakturaer
* Refunderinger
* Prøveperioder
* Rabatkoder

Mulige abonnementsstatusser:

```text
pending
trialing
active
past_due
grace_period
paused
canceled
expired
suspended
```

Webhook-behandling skal være:

* Idempotent
* Auditerbar
* Retryable
* Beskyttet mod replay
* Signaturvalideret
* Knyttet til en event ledger

Systemet skal understøtte, at billing er deaktiveret:

```text
billing_enabled = false
```

Når billing er deaktiveret, skal administratoren stadig kunne administrere planer og abonnementer manuelt.

---

# 6. Bruger-, konto- og profilstyring

Skeln mellem:

* Konto
* Bruger
* Profil
* Enhed
* Afspilningssession
* Abonnement
* Plan
* Entitlements

En konto kan senere have flere profiler.

Eksempel:

```text
Konto: Anna
Abonnement: Plan 1

Profiler:
- Anna
- Barn
```

Profiler kan have separat:

* Historik
* Fortsæt med at se
* Favoritter
* Watchlist
* Anbefalinger
* Aldersbegrænsninger
* Sprog
* Undertekstvalg
* Lydvalg
* Kvalitetsindstillinger
* PIN-kode

Abonnements- og streambegrænsninger skal som standard gælde på kontoniveau, så flere profiler ikke kan omgå begrænsningen.

Administrator skal kunne vælge, om en begrænsning gælder:

* Pr. konto
* Pr. bruger
* Pr. profil
* Globalt

---

# 7. Roller og permissions

Understøt mindst følgende roller:

## Administrator

Kan administrere:

* Server
* Biblioteker
* Brugere
* Profiler
* Planer
* Abonnementer
* Betaling
* Streams
* Enheder
* Integrationer
* Metadata
* Logs
* Metrics
* Systemindstillinger

## Operatør

Kan eksempelvis:

* Administrere biblioteker
* Administrere metadata
* Genstarte jobs
* Se streams
* Se logs

Men kan ikke nødvendigvis ændre:

* Betaling
* Serverejerskab
* Administratorer
* Krypteringsnøgler

## Standardbruger

Kan bruge de funktioner, som brugerens plan og entitlements tillader.

## Børneprofil

Har yderligere begrænsninger baseret på:

* Aldersgrænse
* Bibliotek
* Genre
* Administratorgodkendt indhold
* PIN

## Suspenderet bruger

Kan logge ind og se relevant konto- eller betalingsinformation, men kan ikke starte en afspilning.

---

# 8. Planer og entitlements

Administrator skal kunne oprette et vilkårligt antal planer.

En plan skal mindst kunne indeholde:

```text
name
internal_code
description
is_active
is_public
price
currency
billing_interval
trial_days
max_concurrent_streams
max_registered_devices
max_offline_devices
max_offline_downloads
max_video_resolution
max_video_bitrate
max_audio_channels
allow_direct_play
allow_direct_stream
allow_video_transcode
allow_audio_transcode
allow_subtitle_burn_in
allow_chromecast
allow_remote_streaming
allow_offline_downloads
allow_hdr
allow_dolby_vision
allow_lossless_audio
release_delay_months
release_delay_days
library_access_rules
content_rating_rules
grace_period_days
```

Planens pris skal kunne være nul.

Planer skal kunne bruges uden betalingsintegration.

Eksempler:

* Gratis
* Plan 1
* Plan 2
* Premium
* Familie
* Administrator
* Intern test
* Livstidsadgang

## 8.1 Eksempel: Plan 1

Implementér understøttelse for følgende konkrete eksempel:

```text
Plan:
Plan 1

Rettigheder:
- Direct Play er tilladt
- Direct Stream kan være tilladt efter administratorens valg
- Video-transcoding er ikke tilladt
- Audio-transcoding kan konfigureres separat
- Subtitle burn-in er ikke tilladt, hvis det kræver video-transcoding
- Maksimalt 1 samtidig stream
- Chromecast kan tillades eller afvises
- Offline-download er ikke tilladt
- Brugeren må kun se indhold, som er mindst 3 kalendermåneder gammelt
```

Eksempel på bruger:

```text
Bruger:
Anna

Tildelt plan:
Plan 1

Effektive rettigheder:
- Maksimalt 1 aktiv afspilning ad gangen
- Direct Play tilladt
- Video-transcoding afvist
- Kun indhold med tilgængelighedsdato ældre end 3 måneder
```

Hvis Anna forsøger at starte en stream, mens en anden stream allerede er aktiv, skal systemet vise en tydelig besked:

```text
Din plan tillader kun én aktiv afspilning ad gangen.

Aktiv afspilning:
The Last of Us
Android TV
Startet kl. 19.42

Mulige handlinger:
- Stop den anden afspilning
- Gå tilbage
- Se planmuligheder
```

Hvis Annas klient ikke kan Direct Play mediefilen, og hendes plan ikke tillader transcoding, skal systemet ikke starte et skjult transcode-job.

Vis i stedet:

```text
Denne fil kan ikke afspilles direkte på den valgte enhed.

Din nuværende plan tillader ikke den nødvendige videokonvertering.

Mulige handlinger:
- Afspil på en kompatibel enhed
- Vælg en anden version af filmen
- Se planmuligheder
```

---

# 9. Individuelle bruger-overrides

Administrator skal kunne tilsidesætte enkelte planrettigheder for en bestemt bruger.

Eksempel:

```text
Anna har Plan 1.

Overrides:
- Chromecast tilladt
- Maksimalt 2 registrerede enheder
- Video-transcoding fortsat afvist
```

Effektive rettigheder skal beregnes i denne rækkefølge:

1. Systemets sikkerhedsregler
2. Brugerens status
3. Abonnementets status
4. Planens standardrettigheder
5. Administratorens bruger-overrides
6. Profil- og forældrekontrol
7. Mediespecifikke adgangsregler

Sikkerheds- og suspensionsregler må ikke kunne omgås af et almindeligt override.

Administratorpanelet skal vise:

* Planens standardrettigheder
* Brugerens overrides
* De endelige effektive rettigheder
* Hvor hver rettighed stammer fra

---

# 10. Planversionering

En plan må ikke ændres ukontrolleret for eksisterende abonnenter.

Implementér planversionering.

Eksempel:

```text
Plan 1 version 1
Plan 1 version 2
```

Systemet skal understøtte:

* At eksisterende abonnenter beholder gamle vilkår
* At administrator migrerer brugere til en ny planversion
* At ændringer træder i kraft på en bestemt dato
* At brugeren får et snapshot af centrale entitlements
* At ændringer auditeres

Historiske abonnementsdata må ikke ændres ved blot at redigere en aktiv plan.

---

# 11. Begrænsning af samtidige streams

`max_concurrent_streams` skal håndhæves race-sikkert.

Det er ikke tilstrækkeligt kun at tælle aktive rækker og derefter oprette en ny session, da to klienter kan starte samtidig.

Implementér en atomisk reservationsmekanisme.

En afspilningssession skal have:

```text
session_id
account_id
profile_id
user_id
device_id
media_id
media_source_id
playback_method
started_at
last_heartbeat_at
lease_expires_at
ended_at
status
ip_address
is_local
is_cast_session
```

Mulige statusser:

```text
reserving
active
paused
stopping
completed
disconnected
expired
terminated_by_admin
failed
```

Når en stream startes:

1. Autorisér brugeren.
2. Beregn effektive entitlements.
3. Kontroller adgang til mediet.
4. Reservér en stream-plads atomisk.
5. Udfør playback capability negotiation.
6. Opret stream- eller transcode-session.
7. Udsted kortlivede stream tokens.
8. Aktivér sessionen.
9. Modtag løbende heartbeats.

Sessioner skal bruge lease og heartbeat, så en crashet klient ikke optager en stream-plads permanent.

En session uden heartbeat skal udløbe efter en konfigurerbar periode.

Pause skal ikke automatisk frigive stream-pladsen, medmindre en administratorregel siger det.

Chromecast-afspilning tæller som én aktiv stream.

Overførsel fra telefon til Chromecast skal ske atomisk, så den samme afspilning ikke tælles som to streams under handoff.

---

# 12. Registrerede enheder

Skeln mellem:

* Maksimalt antal registrerede enheder
* Maksimalt antal samtidige streams

Eksempel:

```text
max_registered_devices = 5
max_concurrent_streams = 1
```

Det betyder, at brugeren må være logget ind på fem enheder, men kun afspille på én ad gangen.

En enhedsregistrering skal indeholde:

```text
device_id
account_id
device_name
device_type
platform
app_version
first_seen_at
last_seen_at
last_ip_address
is_trusted
is_revoked
capabilities
```

Brugeren skal kunne se og fjerne egne enheder.

Administrator skal kunne:

* Fjerne en enhed
* Logge en enhed ud
* Blokere en enhed
* Ændre enhedsgrænse
* Se seneste aktivitet
* Se aktive streams
* Se klientens playback capabilities

Ved overskridelse af enhedsgrænsen skal brugeren kunne få mulighed for at fjerne en gammel enhed.

---

# 13. Tidsbaseret adgang til indhold

Systemet skal kunne begrænse adgang ud fra mediets udgivelsesdato eller en manuelt angivet tilgængelighedsdato.

Eksempel:

```text
release_delay_months = 3
```

En bruger med denne regel må kun se indhold, når:

```text
current_date >= release_date + 3 calendar months
```

Brug en korrekt kalenderberegning og ikke et fast antal sekunder.

Eksempel:

```text
Udgivelsesdato:
15. januar 2026

Planens forsinkelse:
3 måneder

Tilgængelig fra:
15. april 2026
```

Medieobjektet skal kunne have:

```text
original_release_date
digital_release_date
physical_release_date
first_air_date
availability_date
availability_override
```

Administrator skal kunne vælge, hvilken dato der bruges for forskellige bibliotekstyper.

Eksempel:

* Film bruger digital udgivelsesdato
* Serieepisoder bruger første udsendelsesdato
* Hjemmevideoer bruger ingen forsinkelse
* Manuel dato tilsidesætter metadata

Hvis metadata mangler en sikker udgivelsesdato, skal systemet følge en konfigurerbar politik:

```text
deny_until_reviewed
allow
use_file_date
use_library_default
```

Standardindstillingen for begrænsede planer bør være:

```text
deny_until_reviewed
```

En administrator skal kunne tilsidesætte tilgængelighed for:

* Et enkelt medie
* En sæson
* En serie
* Et bibliotek
* En bruger
* En plan

Brugeren skal kunne se en besked som:

```text
Denne titel er endnu ikke tilgængelig med din nuværende plan.

Tilgængelig fra:
15. april 2026
```

Vis ikke nødvendigvis opgraderingsmuligheder, hvis administratoren har deaktiveret paywall.

---

# 14. Paywall

Systemet skal designes med paywall fra begyndelsen, selv om betaling aktiveres senere.

Paywall skal kunne beskytte:

* Medieafspilning
* Nye udgivelser
* Transcoding
* 4K
* HDR
* Dolby Vision
* Lossless audio
* Chromecast
* Ekstern streaming
* Offline-downloads
* Flere samtidige streams
* Flere registrerede enheder
* Bestemte biblioteker
* Bestemte samlinger
* Live TV senere

Paywall-UI skal kunne vise:

* Aktuel plan
* Planstatus
* Planens rettigheder
* Begrænsninger
* Sammenligning af planer
* Opgrader
* Nedgrader
* Opsig
* Genaktivér
* Betalingshistorik
* Fakturaer
* Udløbsdato
* Grace period
* Hvorfor en bestemt funktion er blokeret

Blokerede funktioner skal give en konkret årsag.

Dårlig besked:

```text
Adgang nægtet
```

God besked:

```text
Din plan understøtter Direct Play, men ikke videotranscoding.

Den valgte enhed kræver, at videoen konverteres fra HEVC til H.264.

Mulige handlinger:
- Afspil på en kompatibel enhed
- Vælg en anden medieversion
- Se planmuligheder
```

Paywall må ikke implementeres som ren frontendlogik.

Alle begrænsninger skal håndhæves server-side.

Frontend skal kun afspejle serverens autoritative beslutning.

---

# 15. Playback Authorization

Opret et centralt playback authorization flow.

Klienten må ikke selv beslutte, om en afspilning er tilladt.

Eksempel på endpoint:

```text
POST /api/v1/playback/authorize
```

Request kan indeholde:

```json
{
  "mediaId": "media-id",
  "mediaSourceId": "source-id",
  "profileId": "profile-id",
  "deviceId": "device-id",
  "requestedMode": "auto",
  "isCastSession": false,
  "capabilities": {
    "containers": ["mp4", "mkv"],
    "videoCodecs": ["h264", "hevc"],
    "audioCodecs": ["aac", "ac3"],
    "subtitleFormats": ["srt", "webvtt"],
    "maxResolution": "3840x2160",
    "maxBitrate": 60000000
  }
}
```

Response skal enten være en tilladelse:

```json
{
  "allowed": true,
  "sessionId": "session-id",
  "playbackMethod": "direct_play",
  "streamUrl": "short-lived-signed-url",
  "expiresAt": "2026-07-27T20:30:00Z",
  "entitlements": {
    "maxResolution": "1920x1080",
    "maxBitrate": 20000000,
    "transcodingAllowed": false
  }
}
```

Eller et struktureret afslag:

```json
{
  "allowed": false,
  "reasonCode": "TRANSCODING_NOT_ALLOWED",
  "message": "Din plan tillader ikke den nødvendige videokonvertering.",
  "details": {
    "requiredVideoConversion": "hevc_to_h264"
  },
  "actions": [
    "SELECT_OTHER_VERSION",
    "SELECT_COMPATIBLE_DEVICE",
    "VIEW_PLANS"
  ]
}
```

Mulige reason codes:

```text
ACCOUNT_SUSPENDED
SUBSCRIPTION_INACTIVE
CONTENT_NOT_AVAILABLE_YET
LIBRARY_NOT_ALLOWED
CONTENT_RATING_NOT_ALLOWED
CONCURRENT_STREAM_LIMIT
DEVICE_LIMIT
DIRECT_PLAY_NOT_ALLOWED
DIRECT_STREAM_NOT_ALLOWED
TRANSCODING_NOT_ALLOWED
RESOLUTION_NOT_ALLOWED
BITRATE_NOT_ALLOWED
REMOTE_STREAMING_NOT_ALLOWED
CHROMECAST_NOT_ALLOWED
OFFLINE_DOWNLOAD_NOT_ALLOWED
MEDIA_UNAVAILABLE
STORAGE_UNAVAILABLE
```

---

# 16. Library Scanner

Library Scanner er ansvarlig for:

* Scanning af biblioteker
* Identifikation af nye filer
* Registrering af ændringer
* Registrering af flyttede filer
* Registrering af slettede filer
* Medieanalyse via ffprobe
* Deduplikering
* Importstatus
* Genforsøg
* Storage availability

Scanning skal kunne udføres som:

* Fuld scanning
* Inkrementel scanning
* Scan af enkelt mappe
* Scan af enkelt fil
* Webhook-baseret scanning
* Planlagt scanning

Ved midlertidigt utilgængelige mounts må indhold ikke automatisk registreres som permanent slettet.

Implementér en grace period og en særskilt status:

```text
storage_unavailable
```

Før filer markeres som slettet, skal systemet kunne kontrollere:

* Om mount root eksisterer
* Om flere filer pludselig mangler samtidigt
* Om storage health check fejler
* Om netværksstorage er utilgængeligt
* Om grace period er udløbet

---

# 17. Metadata Service

Metadata Service er ansvarlig for:

* Match af film og serier
* Alternative titler
* Sæsoner og episoder
* Posters
* Baggrundsbilleder
* Beskrivelser
* Skuespillere
* Genrer
* Udgivelsesår
* Udgivelsesdatoer
* Aldersgrænser
* Lokale NFO-filer
* Lokale billeder
* Manuel identifikation
* Låsning af manuelt redigerede metadata
* Tilgængelighedsdato
* Release window-regler

Understøt i første omgang:

* TMDB
* Lokale NFO-filer
* Lokale posters
* Lokale baggrunde

Arkitekturen skal gøre det muligt senere at tilføje flere metadataudbydere.

Manuelt redigerede eller låste felter må ikke overskrives af automatiske metadataopdateringer.

---

# 18. Medieanalyse

For hver mediefil skal systemet registrere:

* Filsti
* Storage root
* Filstørrelse
* Hash eller stabil identifikator
* Container
* Varighed
* Video-codec
* Video-profil
* Opløsning
* Framerate
* Bitrate
* HDR-format
* Dolby Vision-profil
* Farverum
* Bit depth
* Lydspor
* Lyd-codecs
* Lydkanaler
* Lydsprog
* Undertekstspor
* Undertekstsprog
* Forced-status
* Kapitler
* Vedhæftede billeder
* Filens tilgængelighedsstatus
* Afspilningskompatibilitet

Understøt flere versioner af samme titel:

* 720p
* 1080p
* 4K
* HDR
* SDR
* Dolby Vision
* Director’s Cut
* Extended Edition
* Dubbet version
* Forskellige lydformater

Brugeren skal kunne vælge version under afspilning, hvis planen tillader den valgte kvalitet.

---

# 19. Streaming Service

Streaming Service er ansvarlig for:

* Direct Play
* Direct Stream
* Transcoding
* HLS
* Segmentering
* Signed stream URLs
* Stream sessions
* Bitratevalg
* Adaptive bitrate
* Lydkonvertering
* Undertekstkonvertering
* Tone mapping
* Stream cleanup
* Range requests
* Playback capability negotiation
* Entitlement enforcement

Streamingbeslutningen skal tage højde for:

* Klientens capabilities
* Mediefilens egenskaber
* Brugerens plan
* Brugerens overrides
* Maksimal opløsning
* Maksimal bitrate
* Lokal eller ekstern afspilning
* GPU-kapacitet
* Transcode-kø
* Undertekstformat
* HDR-understøttelse
* Chromecast-modellens capabilities

Prioritér i denne rækkefølge:

1. Direct Play
2. Direct Stream
3. Audio-only transcode
4. Video transcode
5. Subtitle burn-in

Brug ikke transcoding, når Direct Play er muligt.

Start aldrig transcoding, hvis brugerens entitlements ikke tillader det.

---

# 20. Transcoding Workers

Brug FFmpeg og ffprobe.

Understøt:

* CPU-transcoding
* NVIDIA NVENC/NVDEC
* Intel Quick Sync
* VAAPI
* AMD-hardwareacceleration, hvor platformen understøtter det

Implementér automatisk capability detection.

Systemet skal kende klientens understøttede:

* Video-codecs
* Audio-codecs
* Containers
* HDR-formater
* Undertekstformater
* Maksimal opløsning
* Maksimal bitrate
* Maksimale lydkanaler

Transcoding scheduler skal tage højde for:

* Brugerens rettigheder
* GPU-belastning
* VRAM
* Encoder-sessioner
* CPU-belastning
* Ledig transcode-diskplads
* Brugerens prioritet
* Lokal eller ekstern afspilning
* Kvalitetsniveau
* HDR tone mapping
* Køens prioritet

Et transcode-job må ikke fortsætte, efter den tilknyttede afspilningssession er udløbet, medmindre outputtet bevidst cachelagres.

---

# 21. Chromecast

BoltBytes Media Server skal have fuld Chromecast-understøttelse.

Understøt som sender:

* Android APK
* Webapp
* Senere iOS

Brug officielle Google Cast SDK’er for den relevante platform.

Implementér en Cast Receiver.

Foretræk en custom receiver, hvis det er nødvendigt for at understøtte:

* Login-beskyttet indhold
* Signed stream URLs
* Brugerens afspilningsposition
* Undertekster
* Flere lydspor
* Intro-skip
* Recap-skip
* Rulletekst-skip
* Næste episode
* Custom metadata
* Server-side entitlements
* Fejlbeskeder
* Direct Play og transcodingstatus

## 21.1 Chromecast-flow

Når brugeren vælger Chromecast:

1. Find og forbind til Cast-enheden.
2. Kontroller brugerens entitlement `allow_chromecast`.
3. Kontroller streamgrænsen.
4. Registrer Cast-enheden eller sessionen.
5. Indhent Cast-enhedens playback capabilities.
6. Autorisér afspilningen server-side.
7. Vælg Direct Play, Direct Stream eller Transcode.
8. Opret en kortlivet Cast-session-token.
9. Send kun nødvendige metadata til receiveren.
10. Start afspilningen.
11. Synkroniser position, pause, seek og track-valg.
12. Modtag heartbeats.
13. Gem afspilningsposition server-side.
14. Frigiv stream-plads ved afslutning eller timeout.

Langlivede brugeraccess tokens må ikke sendes til Chromecast receiveren.

Brug i stedet:

* Kortlivede Cast-session-tokens
* Signed manifests
* Signed segment URLs
* Begrænset scope
* Automatisk udløb
* Session binding

## 21.2 Handoff

Understøt handoff:

* Telefon til Chromecast
* Chromecast tilbage til telefon
* Web til Chromecast
* Chromecast tilbage til web

Handoff skal bevare:

* Aktuel position
* Valgt lydspor
* Valgt undertekst
* Afspilningsstatus
* Intro-/recap-status
* Medieversion
* Kvalitetsvalg

Handoff skal være atomisk i streambegrænsningen.

Når én afspilning flyttes fra telefonen til Chromecast, må den ikke tælle som to samtidige streams.

## 21.3 Chromecast-afspiller

Mobilen eller webappen skal fungere som fjernbetjening og vise:

* Titel
* Episode
* Poster
* Position
* Varighed
* Pause
* Afspil
* Seek
* 10 sekunder tilbage
* 10 sekunder frem
* Undertekster
* Lydspor
* Kvalitet
* Stop casting
* Intro-skip
* Recap-skip
* Næste episode

## 21.4 Chromecast og planbegrænsninger

Hvis brugerens plan ikke tillader Chromecast:

```text
Chromecast er ikke inkluderet i din nuværende plan.
```

Hvis Chromecast kræver transcoding, men planen kun tillader Direct Play:

```text
Den valgte Chromecast kan ikke afspille denne fil direkte.

Din plan tillader ikke den nødvendige videokonvertering.
```

Forsøg ikke automatisk at omgå begrænsningen.

---

# 22. Afspilningshistorik og fortsæt-position

Afspilningsposition skal gemmes server-side pr.:

* Konto
* Bruger
* Profil
* Medieobjekt

Positionen skal synkroniseres mellem:

* Web
* Android
* Android TV
* Chromecast
* Fremtidige klienter

Positionen skal opdateres:

* Periodisk under afspilning
* Ved pause
* Ved seek
* Ved stop
* Ved app-lukning
* Ved disconnect
* Ved Chromecast-handoff
* Ved afslutning

Gem blandt andet:

* Position
* Varighed
* Seneste afspilningstidspunkt
* Enhed
* Klienttype
* Valgt medieversion
* Valgt lydspor
* Valgt undertekst
* Afspilningshastighed
* Set-status
* Intro sprunget over
* Recap sprunget over
* Afspilningsmetode
* Sidste session-ID

Brugeren skal kunne vælge:

* Fortsæt fra seneste position
* Start forfra
* Markér som set
* Markér som uset
* Fjern fra fortsæt med at se

Markér som set efter en konfigurerbar procentdel, eksempelvis 90 %, eller når rulletekstmarkøren nås.

---

# 23. Intro-, recap- og rulletekstmarkører

Systemet skal understøtte markørtyper:

* Intro
* Recap
* Kapitel
* Rulletekst
* Undertekst-hændelser

Markører skal have:

* Starttid
* Sluttid
* Type
* Confidence score
* Oprindelse
* Manuel eller automatisk status
* Detektionsversion
* Seneste ændringsdato

Afspilleren skal vise relevante knapper:

* Spring intro over
* Spring recap over
* Spring rulletekst over
* Næste episode

Markører skal vises visuelt på tidslinjen.

Brugeren skal kunne:

* Redigere markører
* Tilføje markører
* Slette markører
* Deaktivere automatisk detektion
* Vælge automatisk skip
* Vælge kun at vise en knap

Intro-detektion kan i første version baseres på:

* Lydfingeraftryk
* Sammenligning mellem episoder
* Kapiteldata
* Manuel markering

Design arkitekturen, så mere avanceret ML-baseret detektion kan tilføjes senere.

Markørerne skal virke i:

* Webafspilleren
* Android-appen
* Android TV
* Chromecast receiveren

---

# 24. Undertekster

Understøt:

* Embedded subtitles
* Eksterne SRT-filer
* WebVTT
* ASS/SSA
* PGS
* VobSub

Afspilleren skal kunne:

* Skifte undertekster under afspilning
* Vælge standardsprog
* Huske brugerens valg
* Justere størrelse
* Justere position
* Justere timing
* Vælge skrifttype
* Vælge baggrund
* Slå forced subtitles til

Tekstbaserede undertekster skal så vidt muligt leveres uden at brænde dem ind i videoen.

Billedbaserede eller inkompatible undertekster kan kræve transcoding.

Hvis brugerens plan ikke tillader subtitle burn-in, skal systemet:

1. Forsøge et kompatibelt tekstbaseret undertekstspor.
2. Forsøge en kompatibel ekstern undertekst.
3. Give en tydelig fejl, hvis burn-in er nødvendigt.

Vis undertekstmarkører på tidslinjen, når brugeren aktiverer denne funktion.

Undertekster skal understøttes på Chromecast, når receiveren og formatet tillader det.

---

# 25. Android APK

Byg en native eller Flutter-baseret Android-app.

APK’en skal understøtte:

* Login til brugerens egen server
* Server discovery
* Manuel server-URL
* Bibliotek
* Søgning
* Detaljesider
* Afspilning
* Chromecast
* Fortsæt med at se
* Undertekster
* Lydspor
* Kvalitetsvalg
* Offline-download
* Downloadstatus
* Baggrundsdownload
* Notifikationer
* Profilskifte
* Enhedsadministration
* Konto og plan
* Paywall
* Biometrisk lås, hvis aktiveret

Appen skal vise brugerens planbegrænsninger tydeligt.

Eksempel:

```text
Plan 1
1 samtidig stream
Direct Play
Nye titler efter 3 måneder
Ingen videotranscoding
```

Offline-downloads skal:

* Være app-isolerede
* Have udløbs- og valideringsmekanisme
* Kunne slettes fra appen
* Have downloadkvalitet
* Kunne genoptages
* Håndtere netværksafbrydelser
* Respektere brugerens plan
* Tælle mod downloadgrænsen
* Kunne tilbagekaldes ved suspenderet abonnement

---

# 26. Android TV

Byg en TV-brugergrænseflade optimeret til fjernbetjening.

Android TV-versionen skal understøtte:

* D-pad navigation
* Tydelig fokusmarkering
* Store elementer
* Filmisk hero-visning
* Rækker med indhold
* Fortsæt med at se
* Søgning
* Taleinput, hvor platformen understøtter det
* Detaljesider
* Episodeoversigt
* Direct Play
* Direct Stream
* Transcoding
* Lydspor
* Undertekster
* Intro-skip
* Recap-skip
* Rulletekst-skip
* Næste episode
* Screensaver eller ambient mode
* Automatisk login på godkendte enheder
* Enhedsregistrering
* Plan- og adgangsfejl

TV-afspilleren skal tydeligt vise:

* Aktuel position
* Varighed
* Kapitelmarkører
* Intro-markør
* Recap-markør
* Rulletekstmarkør
* Undertekstmarkører
* Valgt kvalitet
* HDR-status
* Lydformat
* Transcoding eller Direct Play

Hvis en plan blokerer en funktion, skal TV-brugerfladen vise en fjernbetjeningsvenlig forklaring.

---

# 27. Webapp

Byg en moderne responsiv webapp.

Designet skal være:

* Mørkt som standard
* Moderne
* Filmisk
* Hurtigt
* Overskueligt
* Ikke generisk AI-design
* Egnet til store samlinger
* Tilgængeligt med tastatur
* Responsivt på mobil, tablet og desktop

Webappen skal indeholde:

* Hjem
* Fortsæt med at se
* Senest tilføjet
* Film
* Serier
* Sæsoner
* Episoder
* Samlinger
* Favoritter
* Watchlist
* Søgning
* Detaljesider
* Webafspiller
* Chromecast
* Downloads
* Aktivitet
* Brugerprofiler
* Konto
* Aktuel plan
* Paywall
* Indstillinger
* Administration

Webappen skal understøtte Cast sender-funktionalitet.

---

# 28. Automation Service

Automation Service er ansvarlig for integration med:

* Sonarr
* Radarr
* qBittorrent

Integrationerne skal bruge officielle API’er.

Systemet skal kunne:

* Teste forbindelsen
* Modtage webhooks
* Bruge polling som fallback
* Vise aktive downloads
* Vise køstatus
* Vise importstatus
* Vise fejlede imports
* Starte genforsøg
* Registrere færdige downloads
* Vente på Sonarr/Radarr-import
* Scanne den berørte mediemappe
* Bekræfte at mediefilen er afspilningsklar
* Anvende konfigurerbare oprydningsregler

---

# 29. Database som source of truth

Databasen skal være den autoritative sandhed for systemets state.

Filsystemet må ikke alene afgøre:

* Om et medieobjekt eksisterer
* Om en fil er slettet
* Om en import er færdig
* Om en scan er færdig
* Om en download må slettes
* Om en bruger har set et medie
* Om et transcoding-job er aktivt
* Om en bruger har en aktiv stream
* Om en bruger må starte en stream
* Om en bruger har adgang til et bestemt medie
* Om et abonnement er aktivt

Brug vedvarende state machines til længerevarende processer.

Eksempel på import-state:

```text
discovered
→ downloading
→ download_completed
→ awaiting_import
→ imported
→ scanning
→ metadata_pending
→ playable
→ cleanup_waiting
→ cleanup_completed
```

Eksempel på fejl-state:

```text
failed
→ retry_scheduled
→ retrying
→ failed_permanently
```

Alle state transitions skal:

* Være atomiske
* Kunne genoptages efter genstart
* Have timestamps
* Have fejlbeskeder
* Have attempt count
* Kunne vises i GUI
* Kunne auditeres

---

# 30. Sonarr, Radarr og qBittorrent

Dashboardet skal vise:

* Aktive downloads
* Downloadhastighed
* Uploadhastighed
* Progress
* ETA
* Seeding
* Ratio
* Kategori
* Sonarr/Radarr-reference
* Importstatus
* Fejl
* Oprydningsstatus

Understøt regler som:

* Slet torrent efter succesfuld import
* Slet data efter succesfuld import
* Vent X minutter efter import
* Behold indtil ratio er nået
* Behold indtil seedingtid er nået
* Slet kun med bestemte kategorier
* Slet aldrig filer uden verificeret import

Der må ikke slettes downloadfiler, før:

1. Sonarr eller Radarr har bekræftet import.
2. Den importerede fil findes i biblioteket.
3. Media Server har analyseret filen.
4. Media Server har markeret filen som playable.
5. Eventuel ventetid er udløbet.

Oprydningsprocessen skal være idempotent og kunne genoptages efter genstart.

---

# 31. Administration

Administrationspanelet skal indeholde følgende områder.

## 31.1 Dashboard

Vis:

* CPU
* RAM
* GPU
* GPU encoder load
* GPU decoder load
* Diskforbrug
* Netværk
* Aktive streams
* Direct Play-streams
* Direct Stream-streams
* Transcodes
* Cast-streams
* Transcode-kø
* Biblioteksscanninger
* Fejlede jobs
* Downloads
* Imports
* Serverversion
* Seneste hændelser
* Aktive abonnementer
* Brugere pr. plan
* Afviste afspilningsforsøg
* Overskredne streamgrænser

## 31.2 Aktive afspilninger

Vis:

* Bruger
* Profil
* Titel
* Enhed
* IP
* Lokal eller ekstern
* Position
* Kvalitet
* Bitrate
* Direct Play, Direct Stream eller Transcode
* Chromecast-status
* Video-codec
* Audio-codec
* GPU-worker
* Aktuel båndbredde
* Plan
* Stream-pladsnummer
* Seneste heartbeat

Administrator skal kunne:

* Stoppe en session
* Stoppe alle brugerens sessions
* Blokere en enhed
* Åbne brugerens plan
* Se årsagen til playback-metoden

## 31.3 Brugere

Administrator skal kunne:

* Oprette bruger
* Redigere bruger
* Suspendere bruger
* Aktivere bruger
* Slette bruger
* Nulstille password
* Tildele plan
* Ændre plan
* Angive udløbsdato
* Tilføje overrides
* Administrere profiler
* Administrere enheder
* Se sessions
* Se historik
* Se audit-log
* Se effektive entitlements

## 31.4 Planer og abonnementer

Administrator skal kunne:

* Oprette plan
* Redigere plan
* Versionere plan
* Aktivere plan
* Deaktivere plan
* Skjule plan
* Angive pris
* Angive valuta
* Angive faktureringsinterval
* Angive samtidige streams
* Angive registrerede enheder
* Angive Chromecast-adgang
* Angive transcode-adgang
* Angive maksimal kvalitet
* Angive release delay
* Angive bibliotekstilladelser
* Se brugere på planen
* Migrere brugere til ny version

## 31.5 Biblioteksadministration

* Opret bibliotek
* Rediger bibliotek
* Start scanning
* Se scanningshistorik
* Se fejl
* Identificer medie manuelt
* Rediger metadata
* Administrer billeder
* Find dubletter
* Find ukendte filer
* Find manglende episoder
* Se utilgængelige filer
* Rediger tilgængelighedsdato
* Tilsidesæt planbaseret release window

## 31.6 Integrationer

* Sonarr
* Radarr
* qBittorrent
* Metadataudbydere
* Underteksttjenester
* Betalingsudbydere
* Chromecast receiver
* Webhooks

Alle integrationer skal have:

* Status
* Test forbindelse
* Seneste succes
* Seneste fejl
* Logs
* Enable/disable
* Retry

---

# 32. API

Design et versioneret API:

```text
/api/v1
```

API’et skal understøtte:

* REST til almindelige operationer
* WebSocket eller Server-Sent Events til realtime status
* Pagination
* Filtering
* Sorting
* Idempotency keys
* Rate limiting
* Structured errors
* Correlation IDs
* OpenAPI-dokumentation

Eksempel på domæner:

```text
/auth
/accounts
/users
/profiles
/devices
/plans
/plan-versions
/subscriptions
/entitlements
/billing
/invoices
/libraries
/media
/movies
/series
/seasons
/episodes
/playback
/playback/authorize
/sessions
/streams
/cast
/transcodes
/markers
/subtitles
/downloads
/integrations
/jobs
/system
/metrics
/audit
```

Alle playback-, Cast- og download-endpoints skal validere entitlements server-side.

---

# 33. Foreslåede hovedentiteter

Databasen bør mindst indeholde entiteter svarende til:

```text
accounts
users
profiles
roles
permissions
user_roles
devices
sessions
refresh_tokens

plans
plan_versions
plan_entitlements
subscriptions
subscription_events
subscription_snapshots
user_entitlement_overrides
billing_customers
billing_transactions
billing_webhook_events
invoices

libraries
library_paths
storage_roots
media_items
movies
series
seasons
episodes
media_sources
video_streams
audio_streams
subtitle_streams
media_versions
collections
genres
people
media_people
artwork
metadata_locks

playback_sessions
playback_progress
playback_history
stream_reservations
transcode_jobs
transcode_outputs
cast_sessions
cast_session_tokens

media_markers
chapters
intro_detection_jobs
subtitle_files

downloads
download_clients
download_items
import_jobs
cleanup_jobs

integrations
integration_secrets
webhook_events
background_jobs
job_attempts
audit_logs
system_settings
```

Brug foreign keys, unique constraints, checks og relevante indeks.

---

# 34. Sikkerhed

Implementér:

* Secure password hashing
* Token rotation
* Refresh tokens
* Session revocation
* Brute-force protection
* Rate limiting
* CSRF-beskyttelse, hvor relevant
* Input validation
* Path traversal protection
* SSRF protection
* Signed stream URLs
* Kortlivede stream tokens
* Kortlivede Cast tokens
* Kryptering af integration secrets
* Audit logs
* Rollebaseret adgang
* Principle of least privilege
* Webhook-signaturvalidering
* Idempotente billing webhooks
* Device revocation

Filstier fra API-kald må aldrig kunne bruges til at læse vilkårlige serverfiler.

FFmpeg-kommandoer må ikke bygges ved usikker string concatenation.

Brugerens plan må aldrig håndhæves alene i klienten.

Klienten må ikke kunne ændre:

* Plan-ID
* Entitlements
* Maksimal bitrate
* Maksimal opløsning
* Transcodingtilladelse
* Release window
* Streamgrænse

Alle disse beslutninger skal komme fra backend.

---

# 35. Logging og metrics

Brug struktureret logging.

Alle væsentlige operationer skal have:

* Timestamp
* Severity
* Component
* Correlation ID
* User ID, når relevant
* Account ID
* Profile ID
* Device ID
* Session ID
* Job ID
* Media ID
* Error code
* Sanitized error details

Implementér metrics for:

* HTTP latency
* HTTP error rate
* Aktive streams
* Stream reservations
* Stream limit rejections
* Playback authorization rejections
* Stream startup time
* Buffering
* Direct Play-rate
* Direct Stream-rate
* Transcode-rate
* Cast sessions
* Cast failures
* Transcode queue depth
* Transcode duration
* GPU load
* Scan duration
* Metadata failures
* Download throughput
* Job failures
* Database latency
* Redis latency
* Storage availability
* Aktive abonnementer
* Suspenderede abonnementer
* Brugere pr. plan
* Paywall-visninger
* Upgrade-flow senere

Secrets, passwords, tokens, betalingsoplysninger og private stream URLs må ikke logges.

---

# 36. Job- og køsystem

Background jobs skal være:

* Vedvarende
* Idempotente
* Retryable
* Observerbare
* Prioriterbare
* Afbrydelige, hvor relevant

Understøt separate køer til:

* Library scan
* Metadata
* Image processing
* Media analysis
* Intro detection
* Transcoding
* Download imports
* Cleanup
* Notifications
* Billing webhooks
* Subscription updates
* Release availability recalculation

Undgå at lange FFmpeg-jobs blokerer almindelige API-jobs.

---

# 37. Fejlhåndtering

Systemet skal håndtere:

* FFmpeg-crash
* Worker-crash
* Databaseudfald
* Redis-udfald
* Utilgængeligt mount
* Manglende mediefil
* Delvist gennemført import
* Afbrudt download
* Defekt videofil
* Manglende metadata
* Manglende udgivelsesdato
* Klientdisconnect
* Chromecast-disconnect
* Servergenstart under afspilning
* GPU-fejl
* Ikke-understøttet codec
* Manglende diskplads
* Betalingswebhook leveret flere gange
* Abonnement udløber under afspilning
* Streamgrænse nået
* Device limit nået
* Planændring under aktiv session

Fejl skal vises handlingsorienteret i GUI.

Vis eksempelvis ikke kun:

```text
Playback failed
```

Vis i stedet:

```text
Afspilningen kunne ikke startes.

Årsag:
Din plan tillader kun én aktiv afspilning ad gangen.

Aktiv afspilning:
Dune: Part Two
Android TV
Startet kl. 19.42

Handlinger:
- Stop den aktive afspilning
- Gå tilbage
- Se planmuligheder
```

---

# 38. Dataintegritet

Implementér beskyttelse mod:

* Dobbelt imports
* Dobbelt metadataobjekter
* Sletning af forkert fil
* Race conditions
* Samtidige scanninger af samme mappe
* Samtidige transcodes med samme output
* Forældede jobs
* Phantom state efter worker-crash
* Dobbelt streamreservation
* Overskridelse af samtidige streams ved race
* Dobbelt behandling af billing webhook
* Uventet planændring
* Dobbelt Chromecast-session
* Manglende frigivelse af session leases

Brug database constraints, transaktioner, leases og locks, hvor det er nødvendigt.

Redis må gerne bruges til hurtige leases og realtime state, men vedvarende forretningsstate skal kunne gendannes fra databasen.

---

# 39. Performance

Systemet skal kunne håndtere store biblioteker og mange brugere.

Undgå:

* At genindlæse hele biblioteket ved hver ændring
* At scanne alle filer ved hver Sonarr/Radarr-import
* N+1 database queries
* Ubegrænset parallelisering
* At holde lange videostreams gennem almindelige applikationsworkers
* At gemme store binære mediefiler i databasen
* At beregne alle entitlements på ny uden caching ved hvert videosegment
* At udføre billing-kald under almindelig afspilning

Brug:

* Inkrementel scanning
* Batch processing
* Databaseindekser
* Pagination
* Cache
* Backpressure
* Worker concurrency limits
* Streaming responses
* Range requests
* Effektiv thumbnail-cache
* Entitlement snapshots
* Kortlivede authorization decisions
* Signed URLs

Et allerede autoriseret videosegment må ikke kræve et komplet betalingsopslag.

---

# 40. Internationalisering

Brugerfladen skal være flersproget.

Alt brugerrettet tekst skal ligge i translationsfiler eller en eksisterende sprogdatabase.

Hardcod ikke dansk tekst direkte i komponenter.

Understøt som minimum:

* Dansk
* Engelsk

Sprogarkitekturen skal gøre det muligt at tilføje flere sprog senere.

Det gælder også:

* Paywall
* Planbeskrivelser
* Fejlbeskeder
* Chromecast receiver
* Android TV
* E-mails
* Notifikationer
* Fakturaer senere

---

# 41. Tema

Understøt:

* Dark theme
* Light theme
* System theme

Light theme må ikke blot være hvide flader uden visuel struktur.

Begge temaer skal have:

* Tilstrækkelig kontrast
* Tydelige fokusmarkeringer
* Samme informationshierarki
* Tilgængelig navigation

TV- og Chromecast-brugerflader skal være optimeret til stor skærm og betragtningsafstand.

---

# 42. Tests

Implementér relevante:

* Unit tests
* Integration tests
* API tests
* Database tests
* Worker tests
* State-machine tests
* Security tests
* Frontend component tests
* End-to-end tests
* Playback decision tests
* Entitlement tests
* Subscription tests
* Billing webhook tests
* Stream reservation tests
* Chromecast tests
* Import and cleanup tests

Test især:

* Direct Play-valg
* Direct Stream-valg
* Transcoding-valg
* Transcoding afvist af plan
* Fortsæt-position
* Flere brugerprofiler
* Intro-markører
* Undertekster
* Mount midlertidigt utilgængeligt
* Sonarr/Radarr-import
* qBittorrent-oprydning
* Genstart midt i et job
* Dobbelt webhook
* Samtidige jobs
* Manglende diskplads
* Delvist gennemført cleanup
* Samtidig start af to streams med limit 1
* Udløbet session lease
* Chromecast-handoff
* Chromecast tæller som én stream
* Chromecast afvist af plan
* Direct Play-only plan
* Bruger med release delay på 3 måneder
* Indhold præcis på tilgængelighedsdatoen
* Manglende udgivelsesdato
* Individuelt entitlement override
* Planversionering
* Suspenderet abonnement
* Billing webhook leveret flere gange
* Enhedsgrænse
* Fjernelse af registreret enhed

Tests må ikke slette rigtige filer uden for isolerede testmapper.

---

# 43. CI/CD

Opret en GitHub Actions-pipeline, der som minimum udfører:

* Dependency installation
* Lint
* Formatting check
* Type check
* Unit tests
* Integration tests
* Backend build
* Web build
* Android APK build
* Android TV build
* Cast Receiver build
* Docker image build
* Security scanning
* Artifact upload

Senere skal workflowet kunne:

* Oprette versionsnummer
* Bygge release artifacts
* Oprette pre-release for udviklingsversioner
* Oprette stabil release for production tags
* Generere changelog
* Publicere Docker images
* Publicere APK
* Publicere TV-build
* Publicere Cast Receiver
* Signere artifacts

---

# 44. Dokumentation

Dokumentér:

* Arkitektur
* Deployment
* Lokal udvikling
* Database
* API
* State machines
* Streamingbeslutninger
* Hardwareacceleration
* Chromecast
* Cast Receiver
* Entitlement engine
* Planer
* Abonnementer
* Paywall
* Release window-regler
* Integrationer
* Backup
* Restore
* Upgrade
* Fejlsøgning
* Security model
* Billing provider integration
* Teststrategi

---

# 45. Faseopdeling

Implementér projektet i kontrollerede faser.

## Fase 1: Fundament

* Repository-struktur
* Docker Compose
* Database
* Redis
* API
* Authentication
* Konti
* Brugere
* Profiler
* Enheder
* Settings-system
* Førstegangsopsætning
* Grundlæggende adminpanel
* Logging
* Metrics

## Fase 2: Planer og entitlement engine

* Planer
* Planversioner
* Entitlements
* Bruger-overrides
* Abonnementstilstand
* Effektive rettigheder
* Streamgrænser
* Device limits
* Release delay
* Playback authorization
* Audit-log

Billing skal stadig kunne være deaktiveret.

## Fase 3: Bibliotek og metadata

* Biblioteker
* Scanner
* ffprobe-analyse
* Film
* Serier
* Sæsoner
* Episoder
* TMDB
* NFO
* Posters
* Manuel identifikation
* Inkrementel scanning
* Udgivelsesdatoer
* Tilgængelighedsdatoer

## Fase 4: Webafspilning

* Webafspiller
* Range requests
* Direct Play
* Direct Stream
* FFmpeg-transcoding
* HLS
* Undertekster
* Lydspor
* Fortsæt-position
* Afspilningshistorik
* Entitlement enforcement

## Fase 5: Automatisering

* Sonarr
* Radarr
* qBittorrent
* Webhooks
* Imports
* Cleanup-state machine
* Download-dashboard
* Fejlhåndtering

## Fase 6: Markører

* Intro
* Recap
* Kapitel
* Rulletekst
* Tidslinjemarkører
* Manuel redigering
* Automatisk skip

## Fase 7: Android APK

* Login
* Bibliotek
* Søgning
* Afspilning
* Profiler
* Enheder
* Planvisning
* Paywall
* Downloads
* Chromecast
* Push-notifikationer

## Fase 8: Android TV

* TV-navigation
* Fjernbetjening
* TV-afspiller
* Fokusstyring
* Intro-skip
* Episode autoplay
* Store skærme
* Enhedsregistrering
* Planbegrænsninger

## Fase 9: Chromecast

* Android Cast Sender
* Web Cast Sender
* Custom Cast Receiver
* Cast-session-token
* Signed manifests
* Progress synchronization
* Audio- og undertekstvalg
* Intro-skip
* Recap-skip
* Handoff
* Entitlement enforcement
* Session lease

## Fase 10: Billing og paywall

* Billing provider interface
* Checkout
* Webhooks
* Fakturaer
* Prøveperioder
* Grace period
* Opgradering
* Nedgradering
* Opsigelse
* Betalingshistorik
* Plan comparison
* Paywall-UI

---

# 46. Arbejdsmetode

For hver fase skal du:

1. Undersøge eksisterende kode.
2. Beskrive relevant arkitektur.
3. Identificere afhængigheder.
4. Oprette en implementeringsplan.
5. Implementere backend.
6. Implementere frontend.
7. Implementere databaseændringer.
8. Implementere tests.
9. Køre tests.
10. Kontrollere lint og type check.
11. Dokumentere ændringerne.
12. Rapportere resterende risici.

Stop ikke ved den første plausible løsning.

Kontrollér altid:

* Om state kan gendannes efter crash.
* Om operationen er idempotent.
* Om data kan gå tabt.
* Om der findes race conditions.
* Om brugergrænsefladen afspejler den faktiske backend-state.
* Om fejl kan diagnosticeres.
* Om løsningen fungerer med store biblioteker.
* Om løsningen fungerer på en remote server.
* Om planbegrænsninger håndhæves server-side.
* Om samtidige streams håndhæves atomisk.
* Om Chromecast kan omgå planregler.
* Om release delay beregnes deterministisk.
* Om abonnementshistorik bevares.
* Om aktive sessions frigives korrekt.

---

# 47. Rapportering efter hver arbejdsopgave

Afslut altid med følgende struktur:

## Hvad blev undersøgt

Beskriv relevante dele af kodebasen og arkitekturen.

## Hvad blev ændret

Angiv præcise filer, komponenter, services, migrationer og API-endpoints.

## Hvorfor løsningen er korrekt

Forklar state flow, dataintegritet, sikkerhed, entitlement enforcement og relevante designvalg.

## Tests der blev kørt

Angiv de præcise kommandoer og resultater.

## Hvad blev ikke testet

Vær eksplicit om manglende hardware, miljøer, Chromecast-enheder eller integrationer.

## Resterende antagelser og risici

Gæt ikke. Angiv konkret, hvad der stadig kræver validering.

## Næste anbefalede opgave

Angiv det næste logiske trin uden at begynde på uvedkommende funktioner.

---

# 48. Første opgave

Begynd ikke straks med at implementere hele systemet.

Start med at:

1. Gennemgå hele repository-strukturen.
2. Identificere eksisterende kode, frameworks og funktionalitet.
3. Beskrive den nuværende arkitektur.
4. Sammenholde den med kravene i denne specifikation.
5. Udarbejde en gap-analyse.
6. Foreslå en konkret mappe- og servicearkitektur.
7. Foreslå databaseskemaets hovedentiteter.
8. Foreslå entitlement-modellen.
9. Foreslå stream-reservationsmodellen.
10. Foreslå Chromecast-arkitekturen.
11. Foreslå billing provider-arkitekturen.
12. Foreslå implementeringsrækkefølgen.
13. Identificere de største tekniske risici.
14. Rapportere fundene, før større implementering påbegyndes.

Når analysen er afsluttet, skal du fortsætte med Fase 1, medmindre kodebasen viser, at en anden rækkefølge er teknisk nødvendig.

---

# 49. Konkrete acceptkriterier for Anna og Plan 1

Følgende scenario skal fungere end-to-end:

## Opsætning

Administrator opretter:

```text
Plan:
Plan 1

Maksimale samtidige streams:
1

Direct Play:
Tilladt

Video-transcoding:
Ikke tilladt

Release delay:
3 kalendermåneder

Chromecast:
Konfigurerbart

Offline-download:
Ikke tilladt
```

Administrator opretter brugeren:

```text
Navn:
Anna

Plan:
Plan 1
```

## Scenario A: Tilladt Direct Play

Anna åbner en film, der er mere end tre måneder gammel.

Klienten understøtter filens codec og container.

Forventet resultat:

* Playback authorization godkendes.
* En stream-plads reserveres.
* Direct Play vælges.
* Ingen transcode-worker startes.
* Sessionen vises i administrationen.
* Position gemmes server-side.

## Scenario B: Anden samtidig afspilning

Anna har allerede én aktiv afspilning og forsøger at starte en anden.

Forventet resultat:

* Den anden afspilning afvises atomisk.
* Der oprettes ikke et transcode-job.
* Der udstedes ikke en stream-URL.
* Anna får en tydelig forklaring.
* Administrator kan se det afviste forsøg i audit-loggen.

## Scenario C: Transcoding nødvendigt

Anna vælger en enhed, der ikke understøtter videofilens codec.

Forventet resultat:

* Systemet konstaterer, at video-transcoding er nødvendigt.
* Plan 1 tillader ikke video-transcoding.
* Afspilningen afvises.
* FFmpeg startes ikke.
* Brugeren tilbydes en anden medieversion, hvis en kompatibel version findes.

## Scenario D: Nyt indhold

Anna åbner en film, som blev udgivet for én måned siden.

Forventet resultat:

* Afspilningen afvises.
* Der reserveres ingen stream-plads.
* Brugeren får vist tilgængelighedsdatoen.
* Mediet kan efter administratorens valg enten være synligt som låst eller skjult helt.

## Scenario E: Chromecast

Anna caster en tilladt film til Chromecast.

Forventet resultat:

* `allow_chromecast` kontrolleres.
* Cast-sessionen tæller som én stream.
* Telefon-til-Cast handoff tæller ikke som to streams.
* Cast receiveren får et kortlivet token.
* Position og undertekster synkroniseres.
* Hvis Chromecast kræver transcoding, og transcoding ikke er tilladt, afvises afspilningen korrekt.

Disse scenarier skal dækkes af automatiserede integrationstests.
