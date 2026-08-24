# BoltBytes Media Server

Aktuel release: **0.2.11**. Se [CHANGELOG](CHANGELOG.md).

### Android TV release-start og runtime-gate

TV-klienten har fra `0.2.8` en eksplicit R8-regel, der bevarer Room/WorkManagers
refleksionskrævede `WorkDatabase_Impl`-constructor. Uden reglen kunne en minificeret
release-APK lukke i AndroidX `InitializationProvider`, før Flutter viste første frame.

Flutter-CI bygger derfor TV-varianten som rigtig release, validerer R8-mappingen og
certificerer APK-manifest, ABI og signatur. En tilsluttet Android/Google TV-enhed
eller emulator kan desuden køre den faktiske launch-gate:

```bash
node scripts/smoke-android-tv-launch.mjs clients/mobile-tv/build/app/outputs/flutter-apk/app-tv-release.apk
```

Gaten installerer APK'en, rydder crash-bufferen, starter Leanback-activity og fejler,
hvis processen ikke overlever eller Android registrerer et app-crash.

Fra `0.2.10` bruger Android-flavorerne BoltBytes-launcherikonet i alle densiteter,
og TV-flavoren har et separat 320x180-rasterbanner til Leanback/Google TV. Banner
og ikoner gendannes reproducerbart med
`powershell -File scripts/generate-android-tv-branding.ps1`; TV-manifestet binder
banneret til både application og launcher-activity.

Native Android lint køres desuden mod `tvRelease`. Klienten understøtter minSdk 24,
Ethernet-TV uden Wi-Fi-krav, eksplicit no-backup af tokens/offline-nøgler og de nyere
Android-regler for dynamiske updater-receivere og eksporterede Leanback activities.
Gradles Linux- og Windows-wrappers samt wrapper-JAR er versionsstyrede, så den samme
native lint- og release-kæde kan køres reproducerbart lokalt og på GitHub Actions.

## Live TV fra M3U

BoltBytes Media Server understøtter en komplet, account-scoped Live TV-kæde med krypterede M3U/XMLTV-kilder, kanalimport, dubletmatching, kildeprioritet, EPG, favoritter, atomisk forbindelsespulje, Direct Play, remux/transcoding, Chromecast-handoff og hurtigt kanalskift.

- Opret og administrer udbydere, forbindelser, kanalrækkefølge og EPG under `Live TV` i administratorpanelet.
- Hvis M3U-headeren annoncerer `url-tvg`, `x-tvg-url` eller `tvg-url`, opretter serveren automatisk XMLTV-kilden og sætter et EPG-job i kø. Kanaler vises stadig med M3U-navn, logo og gruppe som ikke-optagelig guidefallback, indtil rigtige XMLTV-programtider er importeret.
- Kanalstyringen understøtter op til 50.000 kanaler, server-side pagination, debounced kanal- og gruppesøgning, Shift-markering af intervaller samt atomisk visning/skjul af markeringer, en hel gruppe eller hele kataloget. Kvalitets- og landesuffikser som `DR 1 FHD DK`, `DR 1 FH DK`, `DR 1 HD DK` og `DR 1 DK` samles automatisk under én stabil kanalidentitet. Et manuelt låst navn eller kanalnummer bevares ved senere importer. Skjulte kanaler fjernes server-side fra kundernes guide; aktive streams stoppes, og planlagte eller aktive optagelser annulleres atomisk.
- Kilde-URL'er krypteres med AES-256-GCM og returneres aldrig til browseren eller Chromecast-modtageren.
- Store M3U-kilder understøttes op til 256 MiB som standard med streaming bytekontrol, synlig byte-/procentprogress, løbende job-lease renewal og fem minutters timeout; grænsen kan konfigureres for betroede udbydere.
- M3U-parseren itererer linjer uden en ekstra fuld filkopi. Kanalimporten behandler uafhængige kanalidentiteter med kontrolleret parallelisme, serialiserer dubletter og deaktiverer forsvundne kilder i PostgreSQL-batches på højst 1.000 ID'er.
- Katalogets kategori- og biblioteksfacets caches konto-scopet i 60 sekunder og samler samtidige cache-misses, så film- og seriesider ikke gentager de samme databasequeries for hver sidevisning.
- Redis-klienten samler samtidige første opkoblinger og har en fem sekunders ready-grænse, så parallelle API-kald ikke starter konkurrerende forbindelsesforsøg eller hænger ubegrænset under Redis-fejl.
- En PostgreSQL advisory lock reserverer forbindelser atomisk og håndhæver både abonnementets samlede streamgrænse, udbyderens brugergrænse og hver forbindelses kapacitet.
- Afspilleren bruger Direct HLS, når kilden er kompatibel, ellers FFmpeg-remux og softwaretranscoding via den eksisterende worker/transcoder-arkitektur.
- Kundeportalen viser en pagineret, søgbar kanalguide, nu/næste, favoritter og hurtig server-backed kanalnavigation gennem hele kataloget på `/watch/live`. TV- eller guidefejl vises lokalt og må ikke fejlagtigt rydde eller omdirigere en gyldig login-session; forældede filtersvar kan ikke overskrive en nyere guideforespørgsel.
- Live TV kan pauses og spoles tilbage til tidligste tilgængelige punkt i den aktive session, højst 2 timer. Bufferen starter først, når kunden åbner kanalen, slettes med sessionen og er derfor ikke en permanent 24/7-timeshift-optagelse. Hvis programmet startede efter kanalstart, begrænses tidslinjen til programstart.
- PVR kan planlægges eller annulleres direkte på programkortene i `/watch/live`; `/watch/recordings` understøtter desuden manuel planlægning, forbindelsesreservation, live-progress, administration og tokeniseret Range-afspilning af færdige MP4-optagelser.
- Ved et aktivt upstream-svigt markerer stream-worker forbindelsen som fejlramt og forsøger næste uprøvede kilde under samme atomiske puljelås. Rækkefølgen er rask forbindelse, 4K/FHD/HD/standard/SD, provider, linje og administrativ tie-breaker.
- TV-drift på `/live-tv/operations` automatiserer M3U/XMLTV, viser linjehealth, jobs og aktive streams samt giver sikker admin-afbrydelse.
- Den stabile version før Live TV kan gendannes fra tagget `backup-pre-live-tv-20260823`.
- Live TV-leverancen, 50K-kanalstyringen og performance-/stabilitetsauditten er lokalt verificeret 23. august 2026 med gyldig Prisma-schema, grøn lint og typecheck, 199 API-tests, 46 worker-tests, 7 release-tests samt production builds af contracts, API, worker og admin.
- Den sidste driftsaccept kræver en rigtig M3U/XMLTV-konto på serveren til en kontrolleret to-timers pausetest, provider-failover og en komplet PVR-optagelse; automatiske tests bruger ikke kundens provider-credentials.

Den komplette drift-, sikkerheds- og rollbackvejledning findes i [Live TV-dokumentationen](docs/live-tv.md).

BoltBytes er en selvhostet medieplatform med serverstyret adgang, biblioteksautomation, webafspiller, adminportal og Flutter-klienter til mobil og TV. Projektet prioriterer sikker drift, korrekt playback og synlig fejlsøgning frem for skjult klientlogik.

> Aktiv udvikling. Centrale server-, web-, playback-, backup- og integrationsflows er implementeret. Betaling og offentlig app-store-udgivelse er fortsat separate leverancer.

## Hurtig start med Docker

Krav:

- Git
- Node.js 22 til secret-bootstrap
- Docker Engine med Compose v2
- Læseadgang til serverens mediemapper

~~~bash
git clone https://github.com/skovhuus1/mediaserver.git
cd mediaserver
cp .env.example .env
node scripts/bootstrap-env.mjs
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  up -d --build --remove-orphans --wait --wait-timeout 300
~~~

Åbn <http://serverens-ip:6555>. Første besøg starter setup-guiden.

Standardporten er **6555**. PostgreSQL og Redis er interne Docker-services og publiceres ikke på hosten.

## Mediemappe

Sæt hostens mediarod i **.env** før første start:

~~~dotenv
MEDIA_PATH=/home/seeds/Media/Films/user/google/google/external/Media
PUBLIC_PORT=6555
BB_MEDIA_PUBLIC_URL=https://media.boltbytes.com
CORS_ORIGIN=https://media.boltbytes.com
~~~

Hostmappen monteres read-only som **/media** i API og worker. Biblioteker vælges derefter under denne containersti, eksempelvis **/media/Kategori-Film**. En hoststi uden Docker-mount kan ikke browses eller scannes fra containeren.

## Implementeret

| Område | Nuværende funktion |
| --- | --- |
| Identitet | Login, QR-login til TV, refresh-tokenrotation, enheder, profiler, profil-PIN, password-change og rollebaseret adgang |
| Adgang | Planversioner, snapshots, overrides, release windows, suspend/revoke og atomiske streamreservationer |
| Bibliotek | Flere biblioteker, parallel scans, filesystem-watcher, metadata, manuel match, låsning og playback-analyse |
| Playback | Direct Play, Direct Stream/remux, HLS-transcoding, ABR, 4K/HDR-policy, subtitles, historik og fortsæt-position |
| Kundeportal | Kompakt personlig forside, anbefalinger, søgning, film-/seriesider, sæsoner, overordnede normaliserede genrefiltre, kompakt Fortsæt med at se-række med profilscopet fjernelse, præferencer og downloads |
| Chromecast | Web Sender, signed cast-media-kontrakt og branded receiver-side; produktion kræver registreret Cast App ID |
| Admin | Operationscenter, diagnostics, CPU/RAM/playback-telemetri, logs, opdatering, backup og integrationer |
| Backup | Krypteret PostgreSQL-backup, import, download, retention, pre-restore safety backup og gated restore |
| Automation | Sonarr/Radarr health, lookup, add, root/profile defaults og autentificerede import-webhooks |
| Klienter | Flutter mobile/TV-flavors, manifest- og signaturcertificeret Android-releaseflow, TV-optimeret forside med hero/rails/fokusnavigation, serverkoblet QR-login, episode-autoplay med undertekstkontinuitet, offline-downloads og cast-handoff |

QR-login til TV bruger `/api/v1/auth/tv/start`, `/api/v1/auth/tv/poll` og `/api/v1/auth/tv/approve`. TV-klienten viser QR-kode og brugerkode, poller med separat poll-token, gemmer access/refresh-token krypteret efter godkendelse og falder tilbage til manuel e-mail/adgangskode-login. QR-linket får en separat approve-token, og `/login/tv` kræver en eksisterende websession før TV’et kan godkendes.

Når poll-svaret er godkendt, indlæser TV-klienten `/auth/me`, binder den aktive
profil og publicerer først derefter `library`-stadiet til app-routeren. En
regressionstest fastholder, at login-skærmen ikke kan blive stående på
"Godkendt. Logger ind..." efter en gennemført pairing.

## Arkitektur

~~~text
Browser, mobil, TV og Cast
            |
      proxy :6555
       /          \
Next.js admin     NestJS API
                       |
       PostgreSQL -----+----- Redis
             |               |
      job worker       transcode worker
             |
       read-only /media
~~~

API'et ejer identitet, entitlements, playbackvalg, streamlimits og signed URLs. Workerprocesserne udfører durable jobs og FFmpeg-arbejde. Klienter kan beskrive kapabiliteter og præferencer, men kan ikke hæve serverens rettigheder.

## Repository

| Sti | Ansvar |
| --- | --- |
| **services/api** | NestJS API, Prisma-domæner, auth, playback, drift og integrationer |
| **services/worker** | Scanner, metadata, playback-analyse, jobs og transcoding |
| **web/admin** | Setup, adminportal, kundeportal, player og cast receiver |
| **clients/mobile-tv** | Flutter-app til Android mobil og TV |
| **shared/contracts** | Delte TypeScript-kontrakter |
| **infra** | Nginx og driftskonfiguration |
| **scripts** | Bootstrap, direkte installation, updater og releaseværktøjer |
| **docs** | Vedligeholdt drift-, arkitektur- og funktionsdokumentation |

## Kommandoer

~~~bash
npm run lint
npm run version:check
npm run typecheck
npm run test
npm run test:release
npm run test:integration
npm run build
npm run ci
~~~

Prisma:

~~~bash
npm run prisma:generate
npm run prisma:migrate
~~~

## Sikkerhed

- Commit aldrig **.env**, API-nøgler, JWT-secrets eller backupfiler.
- **scripts/bootstrap-env.mjs** genererer manglende **JWT_SECRET** og **ENCRYPTION_KEY**.
- Mistet **ENCRYPTION_KEY** betyder, at krypterede settings og backups ikke kan dekrypteres.
- Medier monteres read-only. Midlertidige transcodes og applikationsdata bruger separate skrivbare volumes.
- Updateren accepterer kun validerede fremadgående eller squash-equivalente Git-overgange og rydder kun en `index.lock`, når grace-perioden er udløbet og hostens PID-namespace beviser, at ingen proces ejer den.
- Restore kræver owner-role, nul aktive streams/jobs, tidsbegrænset challenge og en automatisk safety backup.

## Produktion

Den anbefalede offentlige adresse er <https://media.boltbytes.com> via Nginx Proxy Manager. Port **6555** må kun være tilgængelig fra LAN/proxy; offentlig trafik bruger 80/443.

Se [domæne og Nginx Proxy Manager](docs/domain-nginx-proxy-manager.md).

## Dokumentation

- [Dokumentationsindeks](docs/README.md)
- [Arkitektur](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Runbook](docs/runbook.md)
- [Playback](docs/playback.md)
- [API-overblik](docs/api.md)
- [Klienter](docs/clients.md)
- [Sikkerhed og backup](docs/security-backup.md)
- [Integrationer](docs/integrations.md)
- [Roadmap](docs/roadmap.md)
- [Historisk leverancelog](docs/delivery-history.md)

## Bidrag og release-flow

Arbejdet laves på **agent/...** branches. Hver færdig leverance skal have opdateret dokumentation, lokale gates og grønne push- og PR-checks. Først derefter squash-merges den til **main**.

Alle releases bruger ét SemVer-nummer. Sæt næste version med `npm run version:set -- 0.2.1`, opdater `CHANGELOG.md`, og kør `npm run version:check`; CI afviser versionsdrift mellem pakker, lockfil og health-API.

Android-releases bygges som separate `mobile`- og `tv`-flavors. Produktionsworkflowet udgiver APK/AAB sammen med checksums, et maskinlæsbart release-manifest og GitHub provenance; fysisk mobil-, TV- og Cast-certificering forbliver en særskilt releasegate.

TV-klienten bruger en blå BoltBytes-shell med synligt logo, kompakte mediekort og én samlet D-pad-model. TV-login har QR som primær handling, serievisningen viser sæsoner og alle afsnit, og Live TV-klienten bruger serverens guide-, favorit-, forbindelsespulje-, heartbeat- og kanalskiftkontrakter. E-mail-login er en eksplicit fallback og kræver ikke, at brugeren kan pege eller swipe på skærmen.

Licens er ikke fastlagt i repositoryet. Tilføj en licensfil, før projektet distribueres uden for den nuværende private anvendelse.
