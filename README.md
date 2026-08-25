# BoltBytes Media Server

Aktuel release: **0.3.0**. Se [CHANGELOG](CHANGELOG.md).

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

### Android TV-player, buffer, lydspor og undertekster

Fra `0.3.0` bruger TV-playeren en dedikeret session-reconfigure for kvalitet og
VOD-lydspor. Valg af Auto eller en fast rendition sendes til den aktive
playback-session og gemmes ikke som en generel device preference. Det betyder, at
kvalitetsvælgeren og lydsporvalg kan reagere direkte på den aktuelle stream uden
at gå gennem mobilens player-facade.

TV-bufferprofilen holder 30-120 sekunder fremad og 30 sekunder bagud. Playerens
progressbar viser set position og lys blå buffer-position separat. Android TV
annoncerer `upscaleMode=device`, så serveren ikke softwareopskalerer over kildens
opløsning; TV'ets hardware står for panelopskalering uden ekstra FFmpeg-belastning.

Tekstundertekster vises som standard lavt i safe-zone med hvid tekst, sort outline
og uden boks. Stil, farve, størrelse, placering og timing gemmes pr. profil under
klientens indstillinger.

## Kundeoplevelse 2.0

Kundewebben bruger et samlet, profilscopet home-feed på `GET /api/v1/experience/home`.
Feedet leverer hero, effektiv rækkeopsætning og første cursor-side af hver synlig
række i ét kald. Første side caches i Redis i 60 sekunder pr. account/profil og
invalideres ved Min liste, playlister, historik og profilindstillinger.

- Standardrækkefølgen er Anbefalinger, Fortsæt med at se, Min liste, Seneste
  episoder, Nye film, Nye serier, Genrer og Populært lokalt.
- Fortsæt med at se markerer fortsat en titel som set ved 90 %, men denne
  historikheuristik frigiver aldrig den aktive stream. Reservationen afsluttes
  kun ved et eksplicit `ended`-signal eller når brugeren stopper playeren.
- `/watch/my-list` viser profilens kanoniske Min liste. Serieafsnit gemmes som én
  stabil serieidentitet, så samme serie ikke gentages for hvert afsnit.
- `/watch/playlists` administrerer op til 50 private playlister pr. profil og 500
  poster pr. playliste. Film, hele serier og enkelte episoder understøttes.
- Playlister kan fastgøres som dynamiske `playlist:<uuid>`-rækker, omarrangeres
  med drag-and-drop eller keyboard og bruger `expectedUpdatedAt`, så samtidige
  ændringer afvises eksplicit frem for at overskrive hinanden.
- Alle mutationer er account- og profile-scopede, auditloggede og rydder den
  relevante home-cache. Sletning fjerner playlistens home-reference i samme
  databasetransaktion.
- Fælles mediekort og vandrette rails understøtter mus, touch, scroll-snap,
  piletaster, Home/End, artwork-fallbacks, skeletons og tom-/fejltilstande.
- Titel-/seriesider og webplayeroverlayet kan administrere Min liste og
  playlister. Playback-, ABR-, transcoding-, buffer- og subtitle-engine er ikke
  ændret af denne UI-leverance.

Offentlige kontrakter:

```text
GET    /api/v1/experience/home
GET    /api/v1/experience/home/rows/:id?cursor=...
GET    /api/v1/playback/playlists
POST   /api/v1/playback/playlists
GET    /api/v1/playback/playlists/:id
PATCH  /api/v1/playback/playlists/:id
DELETE /api/v1/playback/playlists/:id
PUT    /api/v1/playback/playlists/:id/items/:mediaId
DELETE /api/v1/playback/playlists/:id/items/:itemId
PATCH  /api/v1/playback/playlists/:id/items/order
```

## Live TV fra M3U

- Live TV-workerens `ffprobe`-katalog eksponerer stabile lyd- og undertekstspor. Webplayeren kan skifte native HLS-spor direkte eller rekonfigurere remux/transcoding på samme lease via `PATCH /api/v1/live-tv/playback/leases/:id/tracks`; undertekster er eksplicit slået fra som standard.
- Server-renderede Live TV-undertekster understøtter bitmapspor som DVB, DVD og PGS. Ukendte eller tekstbaserede codecs afvises med en konkret fejl frem for at starte en lydløs eller forkert stream.

### Søgning, anbefalinger og driftsovervågning

- `/api/v1/experience/search` søger på titler, konkrete episoder, personer og genrer. Alle resultater er lokale, account-scopede og kræver en læsbar scannet mediefil.
- Anbefalinger bruger historik, feedback, TMDB-similar-id'er, genrer og topcredits. Afsluttede titler forbliver udelukket efter et anbefalings-reset; reset fjerner kun ældre signalers indflydelse.
- API'et sampler driftsdata hvert minut og bevarer `system_metric_samples` i 30 dage. `GET /api/v1/system/telemetry?range=24h` understøtter `1h`, `6h`, `24h`, `7d` og `30d`.
- `GET /api/v1/system/alerts` viser deduplikerede alarmer for ressourcepres, buffering og jobfejl. Administratorer kan kvittere via `PATCH /api/v1/system/alerts/:id/acknowledge`.
- `GET /api/v1/system/diagnostics/export` genererer en account-scopet JSON-pakke med aktuelle checks, 24 timers metrics og alarmer. Hemmeligheder, M3U-credentials og updater-tokens medtages ikke.

BoltBytes Media Server understøtter en komplet, account-scoped Live TV-kæde med krypterede M3U/XMLTV-kilder, kanalimport, dubletmatching, kildeprioritet, EPG, favoritter, atomisk forbindelsespulje, Direct Play, remux/transcoding, Chromecast-handoff og hurtigt kanalskift.

- Webplayerens klargøringsscene viser kanalidentitet, reel streammetode og en indetermineret status uden opdigtede procenter. Den responsive blå statusflade understøtter reduceret bevægelse og kan altid lukkes, mens forbindelsen reserveres.

- Opret og administrer udbydere, forbindelser, kanalrækkefølge og EPG under `Live TV` i administratorpanelet.
- Hvis M3U-headeren annoncerer `url-tvg`, `x-tvg-url` eller `tvg-url`, opretter serveren automatisk XMLTV-kilden. Standard Xtream-playlister på `get.php` får desuden sikkert udledt deres `xmltv.php`-endpoint. EPG-jobbet starter først efter kanalimporten er committed og fejler konkret ved nul aktuelle programmer eller nul kanalmatch; indtil rigtige XMLTV-programtider er importeret, vises M3U-navn, logo og gruppe som ikke-optagelig guidefallback.
- Kanalstyringen understøtter op til 50.000 kanaler, server-side pagination, debounced kanal- og gruppesøgning, Shift-markering af intervaller samt atomisk visning/skjul af markeringer, en hel gruppe eller hele kataloget. Kvalitets- og landesuffikser som `DR 1 FHD DK`, `DR 1 FH DK`, `DR 1 HD DK` og `DR 1 DK` samles automatisk under én stabil kanalidentitet. Et manuelt låst navn eller kanalnummer bevares ved senere importer. Skjulte kanaler fjernes server-side fra kundernes guide; aktive streams stoppes, og planlagte eller aktive optagelser annulleres atomisk.
- Første migration aktiverer kun danske M3U-kanaler og sorterer dem efter Canal Digital Danmarks offentliggjorte liste fra 20. august 2020. Nye importer bruger samme land/gruppe/navne-policy. Administratoren kan derefter trække aktive kanaler eller skrive et ønsket kanalnummer direkte. Nummeret er en global, én-baseret placering: flyttes Showtime eksempelvis til `2`, bliver den kanal 2, og alle efterfølgende aktive kanaler forskydes og renummereres atomisk. Rækkefølgen gemmes account-scoped, auditlogges og bruges af guide samt forrige/næste kanal.
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
| Kundeportal | Personlig hero og redigerbart home-feed, Min liste, private playlister, fælles hurtighandlinger, anbefalinger, søgning, film-/seriesider, sæsoner, genrer, Fortsæt med at se, præferencer og downloads |
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

Server, worker, admin og delte kontrakter bruger ét SemVer-nummer. Sæt næste serverversion med `npm run version:set -- 0.2.14`, opdater `CHANGELOG.md`, og kør `npm run version:check`; CI afviser versionsdrift mellem serverpakker, lockfil, health-API og README. Flutter mobile/TV versionsstyres og udgives separat, så rene serverleverancer aldrig skriver i appmapperne.

Android-releases bygges som separate `mobile`- og `tv`-flavors. Produktionsworkflowet udgiver APK/AAB sammen med checksums, et maskinlæsbart release-manifest og GitHub provenance; fysisk mobil-, TV- og Cast-certificering forbliver en særskilt releasegate.

TV-klienten bruger en blå BoltBytes-shell med synligt logo, kompakte mediekort og én samlet D-pad-model. TV-login har QR som primær handling, serievisningen viser sæsoner og alle afsnit, og Live TV-klienten bruger serverens guide-, favorit-, forbindelsespulje-, heartbeat- og kanalskiftkontrakter. E-mail-login er en eksplicit fallback og kræver ikke, at brugeren kan pege eller swipe på skærmen.

Playerens kvalitets- og undertekstmenuer er fjernbetjeningsklare med op/ned-navigation, OK-valg, automatisk scroll og fokusretur. TV viser valgene i et kompakt højrepanel, mens touch-klienter fortsat bruger et bottom sheet. Direct Stream lukker tidsbaserede HLS-segmenter uden at vente på perfekte keyframe-intervaller; hvis den stabile startbuffer stadig mangler efter 30 sekunder, genbruger klienten samme session og skifter automatisk til transcoding.

Film og Serier har separate TV-forsider med featured titel, Nyeste, Senest
udgivet, genreindgange og et lazy Alle-katalog. Serier viser desuden Nye
episoder. Første side henter op til 100 titler, og Load mere samt hver genreside
bruger serverens pagination, så store biblioteker ikke afkortes eller bygges i
TV’ets hukommelse på én gang. `sort=released` bruger reel udgivelsesdato, mens
`sort=newest` fortsat viser det senest tilføjede eller ændrede indhold.

TV-navigationen bruger en 82-pixels ikonrail, når fokus er i indholdet. Railen
udvider sig til fulde etiketter under D-pad-navigation og kollapser igen, når
fokus forlader menuen.

Licens er ikke fastlagt i repositoryet. Tilføj en licensfil, før projektet distribueres uden for den nuværende private anvendelse.

### Live TV-kanalstyring ved store kataloger

- Vis alle og Skjul alle arbejder på hele kontoens katalog direkte i PostgreSQL og er ikke begrænset af den valgte side eller 50.000-kanalsgrænsen for manuel UUID-bulkmarkering.
- Gruppevisning kan ændres uden at indlæse alle kanal-id'er i API-processens hukommelse. Skjulning frigiver berørte aktive streams, annullerer berørte optagelser og skriver resultatet til auditloggen atomisk.
- Adminpanelet holder globale handlinger, gruppehandlinger og manuel markering i separate responsive rækker og viser både igangværende status og afsluttet antal.

### Durable Live TV-vedligeholdelsesjobs

- Globale og gruppebaserede synlighedsændringer oprettes som `live-tv.channel-visibility`-jobs. Jobbet leases af workeren, deduplikeres pr. scope og handling, kan annulleres og udfører kanalændring, streamfrigivelse, optagelsesannullering og audit atomisk.
- `GET /api/v1/live-tv/admin/jobs` returnerer progress, seneste fejl, varighed og et vedvarende resultat. Adminpanelets Opgaver-række opdateres hvert andet sekund og viser antal ændrede kanaler eller M3U-importens nye, ændrede, uændrede og deaktiverede sources.
- M3U-importen springer identiske kanalmetadata og sourcerækker over. Manglende sources deaktiveres fortsat i afgrænsede batches, og afsluttende importstatistik gemmes både i job-payloaden og auditloggen.
