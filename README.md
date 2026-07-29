# BoltBytes Media Server

BoltBytes Media Server er en selvhostet TypeScript-platform til administration og autoriseret afspilning af egne film og serier. Kodebasen er genopbygget fra bunden med server-side adgangskontrol, reproducerbar installation og en tydelig grænse mellem implementeret funktionalitet og kommende faser.

## Hurtig installation med Docker

Krav: Docker Engine med Compose-plugin og Git.

```bash
git clone https://github.com/skovhuus1/mediaserver.git
cd mediaserver
cp .env.example .env
node scripts/bootstrap-env.mjs
docker compose up --detach --build
```

Sæt `MEDIA_PATH` i `.env` til den host-mappe, som BoltBytes må læse. Docker monterer den read-only som `/media`, og setup-guiden viser dens undermapper med både containersti og rigtig host-sti. Eksempel:

```dotenv
MEDIA_PATH=/home/seeds/Media/Films/user/google/google/external/Media
```

Åbn derefter:

```text
http://SERVERENS-IP:5555
```

`JWT_SECRET` og `ENCRYPTION_KEY` genereres automatisk af `scripts/bootstrap-env.mjs`. Eksisterende secrets overskrives ikke, og værdierne skrives aldrig til terminalen.

Valgfri film-/seriemetadata kan aktiveres direkte under `Indstillinger > Metadata` med en TMDB API Read Access Token. Nøglen testes før lagring, krypteres med serverens `ENCRYPTION_KEY` og sendes aldrig tilbage til browseren. Miljøvariablen bevares som fallback:

```dotenv
TMDB_API_TOKEN=
TMDB_LANGUAGE=da-DK
```

Tokenet bruges kun af API/worker. TMDB dækker både film og serier i den nuværende pipeline, så en TVDB-nøgle er ikke påkrævet. TVDB kan senere tilføjes som en separat provider, hvis der opstår et konkret behov for TVDB-specifikke ids eller metadata.

## Direkte installation uden Docker

Direkte installation fungerer Plex-lignende som tre systemd-services bag nginx. Serveren skal have Node.js 22, npm 10+, PostgreSQL 16, Redis 7, FFmpeg/ffprobe, nginx, Git og sudo.

1. Opret PostgreSQL-databasen og brugeren, som er angivet i `.env.direct.example`.
2. Kør `sudo bash scripts/install-direct.sh`.

Installeren bygger API, admin og worker, anvender migrationer, opretter systemd-services, konfigurerer nginx og åbner applikationen på port `5555`. Databasen bruger normalt `5432`, Redis `6379`, API internt `3001` og admin internt `3000`; kun `5555` skal eksponeres offentligt.

## Sikker updater

Updateren kan bruges fra `Opdateringer` i adminpanelet:

- `GET /api/v1/system/update/status`
- `POST /api/v1/system/update/check`
- `POST /api/v1/system/update/apply`

Den kontrollerer remote commit og nægter at opdatere et dirty eller reelt divergeret worktree. Almindelig fast-forward accepteres direkte. Efter et GitHub squash-merge accepteres overgangen kun, når den kørende versions komplette Git tree-hash findes i målbranchens historik. Checkout sker altid til den præcise SHA, der blev valideret efter fetch.

Direkte installation aktiverer updateren og genstarter `bb-media.target` via en snæver sudoers-regel. Docker-updateren er et bevidst opt-in, fordi Docker-socket giver høj host-adgang:

```bash
docker compose -f docker-compose.yml -f docker-compose.updater.yml up --detach --build
```

Standard Docker-installation har updateren deaktiveret. Den sikre manuelle opdatering er:

```bash
git pull --ff-only origin main
docker compose up --detach --build
```

Hvis en ældre updater allerede kører på en feature-commit, der blev squash-merget, kræves én manuel bootstrap. Kommandoen må kun skifte til `main`, når den kørende tree-hash findes i `origin/main`:

```bash
cd /home/seeds/mediaserver
sudo -u seeds git fetch origin main
running_tree="$(sudo -u seeds git show -s --format=%T HEAD)"
if sudo -u seeds git log --format=%T origin/main | grep -Fxq "$running_tree"; then
  sudo -u seeds git switch --detach origin/main
else
  echo "STOP: Den kørende version findes ikke sikkert i main-historikken."
  exit 1
fi
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml up -d --build --remove-orphans --wait --wait-timeout 300
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml restart proxy
```

## Implementeret i den nye baseline

- NestJS API med `/api/v1`, OpenAPI på `/api/docs`, strukturerede fejl og correlation IDs.
- PostgreSQL-schema og initial migration for accounts, users, profiles, roles, permissions, devices, refresh tokens, plans, plan versions, entitlements, subscriptions, media, playback, audit, jobs og billing webhook-ledger.
- Atomisk førstegangsopsætning med singleton-guard, administrator, profil, storage root, standardplan og abonnement.
- Sikker setup-mappebrowser begrænset til det read-only `MEDIA_PATH`-mount med realpath-kontrol, symlink-filtrering og visning af den tilsvarende host-sti.
- Login, kortlivede JWT access tokens, hash-lagrede refresh tokens, atomisk tokenrotation, reuse-detection, logout og device revocation.
- Browserens device fingerprint bruger native `crypto.randomUUID()` med en RFC 4122 v4-fallback baseret på `crypto.getRandomValues()`, så den første opsætning også fungerer via en almindelig HTTP-serveradresse.
- Konto- og ejerskabskontrol på profiler, enheder, medier, biblioteker, abonnementer og playback sessions.
- Entitlement-evaluering med user/profile overrides, deterministiske kalendermåneder og tydelige afvisningsårsager.
- Entitlement-releasevinduer bruger en eksakt provider-dato, når den findes, og falder ellers tilbage til 1. januar i scannerens validerede udgivelsesår. Medier uden dato eller troværdigt år forbliver blokeret til administratorgennemgang.
- Playback-metodevalg uden silent fallback: browserkompatible MP4/WebM-filer bruger Direct Play, mens inkompatible codecs eller containere kun går til den serverautoriserede transcoder, når planen tillader det.
- 4K HDR-signalprofilering fra `ffprobe`: serveren genkender HDR10/PQ, HLG, Dolby Vision, HEVC og bitdybde. HEVC/Main10 kan bruge 4K HDR Direct Play på en kompatibel klient og plan; inkompatible klienter får eksplicit HDR-til-SDR tone mapping, mens kompatible HLS-klienter kan få HEVC HDR-remux eller Main10-genkodning. Dolby Vision bevares kun ved Direct Play eller bitstream-remux og mærkes aldrig fejlagtigt som bevaret efter almindelig genkodning.
- Atomisk stream reservation med Prisma-kompatibel, namespaced PostgreSQL advisory lock, frisk `READ COMMITTED`-visning efter låseventet, lease/heartbeat og kryptografisk stream-token.
- Vedvarende worker-kø med `FOR UPDATE SKIP LOCKED`, jobforsøg, retry/backoff og lease-cleanup.
- Manuel biblioteksscanning via durable `library.scan` jobs med sikker realpath-kontrol, symlink-afvisning, `ffprobe`-metadata og markering af manglende filer uden automatisk sletning.
- Direkte medielevering med HTTP `HEAD`, single-range `GET`, `206 Partial Content`, suffix ranges og hash-valideret session-token; query strings udelades fra API-logs, og stream-access logs er deaktiveret i nginx.
- Integreret fuldskærms-webafspiller med egen tidslinje, play/pause, 10-sekunders hop, lydstyrke, hastighed, lydspor, faktiske undertekstspor, kvalitetsvalg, information, tastaturstyring og responsivt mobillayout. Server-side authorize, kortlivet stream-token, 30-sekunders lease-heartbeat, fremdriftslagring hvert 10. sekund og sikker frigivelse af stream-plads ved stop er bevaret.
- Konto-, bruger- og profilafgrænset playback-historik med idempotent upsert, positions-clamping, automatisk afslutning ved 90 procent og en live `Fortsæt med at se`-sektion, der genoptager fra den gemte position.
- Klikbare `Afspil`-handlinger på film og enkelte serieepisoder. Inkompatible filer køres gennem en separat durable `playback.transcode`-kø og FFmpeg-container, så scanning og metadataarbejde ikke blokeres af en lang film.
- Tokenbeskyttet HLS med atomisk master-manifest, separat variant-playliste, eksplicit `BANDWIDTH`, `AVERAGE-BANDWIDTH` og `RESOLUTION`, firesekunders MPEG-TS-segmenter, H.264/AAC-output, planens opløsnings-/bitrategrænser og `hls.js`-fallback i browsere uden native HLS. Kvalitetsmenuen viser derfor aldrig længere en kunstig nulværdi. HLS-tokenet skrives ikke til nginx-accessloggen.
- Nye installationers administratorplan starter på `2160p/50 Mbps`. Eksisterende abonnementer beholder bevidst deres immutable planversion/snapshot og skal have en ny aktiv 4K-planversion og et abonnement på denne version, før serveren må levere 4K.
- Compose klargør det navngivne transcode-volume med en afgrænset engangs-init-container; API, worker og transcoder kører fortsat som ikke-root og starter først efter migrationer/API-health.
- Chromecast Web Sender via Google Cast Default Media Receiver og et servervalideret handoff på den eksisterende logical session. Receiveren får absolutte medie- og WebVTT-URL'er med et HMAC-signeret, sessionsbundet Cast-token, mens browserens oprindelige stream-token forbliver uændret. HLS viderefører Cast-tokenet til variant-playlister og segmenter. Playeren synkroniserer remote play/pause, seek, lydstyrke, undertekster, heartbeat og playback-historik og fortsætter lokalt, hvis Cast-sessionen afbrydes.
- Automatisk undertekstfund for `.srt`/`.vtt`-sidecars med samme filnavn samt tekstbaserede indlejrede spor (`SRT`, `ASS`, `SSA`, `WebVTT` og `mov_text`) i transcodede filer. Sidecars konverteres sikkert til WebVTT ved levering, mens workeren udtrækker kompatible indlejrede spor før streamen markeres klar.
- Scanstatus og manuel scan-trigger i admin-dashboardet.
- Funktionel adminnavigation med live film-/seriefiltrering, søgning, bibliotek-oprettelse, sikker mappevælger, scanning, brugerliste, planliste og driftsindstillinger.
- Server-side mediekatalog med paginering, tekstsøgning, bibliotek-/kategori-/typefiltre, stabil sortering, seriegruppering og kontoafgrænsede mediedetaljer. Adminpanelet har klikbare katalogkort, episodeoversigt, filterchips og fungerende sidekontroller.
- Valgfri TMDB-metadata gennem durable, deduplikerede `media.metadata` jobs. En vellykket scan køer kun manglende metadata, mens admin kan gennemtvinge en opdatering. Overview, rating, udgivelsesdato, provider-id, plakat og backdrop gemmes server-side; API-tokenet eksponeres aldrig.
- TMDB-token og metadata-sprog kan ændres uden container-genstart fra indstillingspanelet. Tokenet valideres mod TMDB, lagres AES-256-GCM-krypteret i `system_settings`, og API/worker bruger miljøvariablen som bagudkompatibel fallback.
- `Kør metadata` i indstillingerne kan gennemtvinge en ny TMDB-opdatering for alle medier, kun film eller kun serieepisoder gennem den durable worker-kø.
- Biblioteksformularer bevarer deres DOM-reference gennem async API-kald, og scannerens lagrede workerfejl vises direkte i bibliotek- og statusvisningen.
- Indstillinger indeholder en durable fejllog med fejlede og delvist fejlede scanninger, worker-jobforsøg, tidsstempler og diagnostiske detaljer; updaterfejl viser også den konkrete kommandofejl.
- Next.js adminskal inspireret af den godkendte BoltBytes-reference med rigtige API-data og tomme tilstande uden mock-film.
- Docker Compose med PostgreSQL, Redis, API, admin, worker og nginx reverse proxy.
- Prisma-klienten genereres under Docker-buildet og kopieres med de nødvendige engines til API- og worker-runtime-images; OpenSSL er eksplicit installeret i begge images.
- Direkte Linux/systemd-installation uden Docker.
- Sikker updater med fast-forward som standard og eksakt tree-verificeret overgang efter squash-merge.
- Docker-updater med valideret GitHub branchvalg, database-gemt valg, SHA-låst checkout, synlige overgangstyper/blocker-årsager og bevaret updater-overlay efter genstart.
- Updaterens Git-processer accepterer kun det eksakte konfigurerede repo som `safe.directory`, så host-mountet virker med den ikke-root API-bruger uden en usikker global wildcard-undtagelse.
- CI-gates på Node.js 22 for migration, lint, typecheck, unit/integration tests, builds, dependency audit, Docker builds og rigtig Compose-opstart; workflow-actions bruger Node-24-kompatible v5-runtimes.

## Valideringsstatus

Lokalt valideret med Node.js 22 og npm 10:

- Prisma client generation og schema validation.
- ESLint.
- TypeScript typecheck for shared contracts, API, worker og admin.
- 35 unit tests; en citeret cross-platform glob holder alle database-integrationstests i det separate `test:integration`-step, som kun kører mod en URL med `bbmedia_test`.
- Produktionsbuild af shared contracts, NestJS API, worker og Next.js admin.

PostgreSQL-integrationstesten og Docker Compose/container-build kan ikke køres lokalt på den aktuelle Windows-maskine uden lokal PostgreSQL-testdatabase og Docker. De er verificeret i [GitHub Actions-run 30304933724](https://github.com/skovhuus1/mediaserver/actions/runs/30304933724), hvor følgende gates passerede:

- Initial migration på en frisk PostgreSQL 16-database.
- Samtidighedstest: ved to parallelle reservationsforsøg og stream-limit 1 accepteres præcis ét.
- Redis/PostgreSQL service health.
- Produktionsaudit med 0 kendte sårbarheder på high-niveau eller højere.
- Docker Compose-konfiguration og container-build af API, admin og worker.

Den samlede fase-2 medie-, playback- og historikpipeline er verificeret i [GitHub Actions-run 30398129039](https://github.com/skovhuus1/mediaserver/actions/runs/30398129039):

- Migration `0002_media_pipeline` anvendes efter fase-1-migrationen på en frisk PostgreSQL 16-database.
- Unit- og integrationssteps køres separat, så rene policytests ikke afhænger af en database, mens reservations- og katalogkontrakter valideres mod PostgreSQL.
- To samtidige scan-triggers opretter præcis én scan-ledger og ét durable worker-job.
- Stream reservation ved limit 1 accepterer fortsat præcis én af to samtidige requests.
- API, admin, worker og den isolerede transcoder bygges, produktion-audit er grøn, Compose valideres, og FFmpeg-laget bygges.
- CI genererer en rigtig MP4, opretter server/admin/bibliotek gennem API’et, sætter en scan i kø og kræver, at worker/ffprobe registrerer mindst ét afspilleligt medie.
- CI autoriserer derefter den importerede MP4 til Direct Play, kræver en tokenbeskyttet `206 Partial Content` Range-response gennem nginx, finder og konverterer en dansk SRT-sidecar, validerer origin-specifik media-CORS, gemmer 25 procent fremdrift, finder mediet i `Fortsæt med at se` og kræver, at 95 procent markerer det afsluttet. Den samme fil tvinges derefter gennem transcoding, hvor CI kræver en master med ikke-nul kvalitet, en tokenomskrevet variant-playliste og et ikke-tomt tokenbeskyttet segment.

CI tester en lille rigtig MP4 gennem nginx, men afspiller endnu ikke en stor fil eller host-specifikke mountrettigheder. Det kræver fortsat en staging-server med det faktiske read-only media mount og en rigtig browser.

Container-gaten starter desuden hele Compose-stakken efter image-build, venter på API-health, kontrollerer at worker-processen forbliver kørende og kalder health-endpointet gennem nginx. Det beskytter mod runtime-fejl, som et isoleret `docker compose build` ikke kan opdage, herunder en manglende genereret Prisma-klient.

Eksisterende biblioteker fra den tidligere path-policy repareres automatisk ved scanning, når en gemt sti har det kendte dobbelte storage-root-mønster (for eksempel `/media/media/Film`). Reparationen udføres kun, hvis den oprindelige sti mangler, den korrigerede sti findes, og dens `realpath` fortsat er under det konfigurerede storage root. CI fremprovokerer legacy-formatet og kræver både vellykket import og permanent databaseheling.

Docker-opdateringer genstartes af en ekstern engangs-runner med navnet `boltbytes-media-updater-runner`. Runneren oprettes fra det kørende API-image, overlever at API-containeren bliver erstattet og udfører Compose-build/genstart fra det mountede repository. Den venter på healthy services og genstarter derefter nginx-proxyen, så dens DNS-cache ikke peger på en udskiftet API- eller admin-container. Seneste updater-log kan altid læses med `docker logs boltbytes-media-updater-runner`; næste opdatering erstatter den tidligere runner.

Adminpanelet viser updaterens faktiske fremdrift fra worktree-kontrol, fetch og overgangsvalidering til checkout, Docker-build, container-health og proxy-restart. Git-faser gemmes durabelt i `system_settings`, mens runneren udsender strukturerede statusmarkører. Den nye API-container kan derfor fortsætte samme procent-, fase- og logvisning efter genstart; midlertidige 502-svar vises som en forventet genstartsperiode. Endpointet `GET /api/v1/system/update/progress` er kun tilgængeligt for administratorer.

Admin-klienten roterer automatisk access- og refresh-tokens. Parallelle 401-svar samles om én refresh-request, hvert oprindeligt API-kald gentages højst én gang, og sessionen slettes kun ved et bekræftet ugyldigt refresh-token. Midlertidige netværks- og 5xx-fejl under en opdatering bevarer sessionen, så administratoren kan prøve igen, når serveren er healthy.

Biblioteker kan oprettes, redigeres, flyttes mellem storage roots og slettes fra admin-panelet. Opret/ret realpath-validerer den valgte mappe og afviser manglende, ulæselige eller symlink-escaped stier. Redigering og sletning blokeres under queued/running scans, og sletning fjerner kun katalogdata, aldrig mediefiler på storage.

Bibliotekssletning blokeres også, mens et medie har en aktiv, ikke-udløbet playback-lease. Når biblioteket kan slettes, fjernes dets afsluttede sessions, reservationer og historik transaktionelt før katalogdataene, så referentiel integritet bevares uden at røre mediefilerne.

Biblioteksscanneren klassificerer filer deterministisk før ekstern metadataopslag. Film får renset titel, årstal og kategori fra mappestrukturen. Serie- og mixed-biblioteker genkender `S01E02`, `1x02`, `Season 01`, `Sæson 01` og `S01`, og gemmer kategori, serienavn, sæson og episode server-side. CI verificerer klassifikationen gennem en rigtig scannet MP4 og unit tests dækker film, serier og mixed-biblioteker.

## Ikke implementeret endnu

- Automatisk oprettelse af flere biblioteker ud fra mappestrukturen; klassifikation og mappebaserede kategorier er implementeret, men biblioteker oprettes fortsat bevidst af administratoren.
- Lokal caching/proxying af TMDB-billeder; den nuværende implementation gemmer validerede billedstier og henter billeder direkte fra TMDBs faste image-host.
- Hardwareacceleration, flere adaptive HLS-renditions og serverstyret transcode-kapacitetsplanlægning; den nuværende separate transcoder bruger softwarebaseret `libx264` og producerer én planbegrænset rendition.
- Hardwareaccelereret 4K tone mapping/encoding. HDR-pathen bruger i første omgang softwarefiltrene `zscale`/`tonemap` samt `libx265`, mens kompatibel HEVC kan remuxes uden videogenkodning.
- Ægte container-remux uden video-reencoding. `direct_stream` vælges derfor bevidst ikke endnu; browserinkompatible containere går gennem transcoding.
- Automatisk næste episode, intro-/recap-markører og burn-in/OCR af billedbaserede undertekster som PGS/VobSub. Tekstbaserede sidecars og indlejrede tekstspor er implementeret.
- Egen brandet Chromecast receiver og receiver-ejet heartbeat efter controllerfanen lukkes. Den nuværende Default Media Receiver kræver fortsat, at fanen forbliver aktiv, at `BB_MEDIA_PUBLIC_URL` eller serverens eksterne URL kan nås fra Chromecast-enheden, og at webpanelet åbnes via HTTPS. Ved privat HTTPS skal certifikatet være gyldigt på receiveren.
- TVDB-provider; TMDB er den aktive provider for både film og serier.
- Kortlivet separat receiver-token i stedet for det nuværende sessionbundne stream-token.
- Sonarr, Radarr og qBittorrent integration.
- Billing-provider og webhook-signaturverifikation.
- Android, Android TV og øvrige native klienter.
- Backup/restore-automatisering og release artifacts.

Scannerens titel er i denne fase afledt af filnavnet. Scanning startes manuelt fra API/admin; automatisk filesystem watching og planlagte scanninger er endnu ikke implementeret. De øvrige punkter må ikke betragtes som implementeret, selv om fundamentet er forberedt.

## Udvikling

```bash
cp .env.direct.example .env
node scripts/bootstrap-env.mjs
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Kvalitetsgates:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
npm audit --omit=dev --audit-level=high
docker compose config
```

## API-overblik

- `/api/v1/setup/*`
- `/api/v1/auth/*`
- `/api/v1/users/*`
- `/api/v1/profiles/*`
- `/api/v1/devices/*`
- `/api/v1/plans/*`
- `/api/v1/plan-versions/*`
- `/api/v1/subscriptions/*`
- `/api/v1/entitlement-overrides/*`
- `/api/v1/entitlements/evaluate`
- `/api/v1/libraries/*`
- `/api/v1/media/*`
- `/api/v1/playback/*`
- `/api/v1/system/*`

## Repository-flow

Alt arbejde sker på en opgavebranch. Branch-commits pushes til GitHub efter en færdig og dokumenteret chunk. `main` opdateres først, når hele leverancen er valideret og accepteret.

## Dokumentation

- [Arkitektur](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Runbook](docs/runbook.md)
## Planeditor, 4K og TVDB-seriemetadata (2026-07-29)

- Adminpanelets planoversigt kan oprette en ny immutable planversion med stream- og enhedsgrænser, opløsning op til 8K, bitrate, Direct Play/Direct Stream, transcode, undertekster, Chromecast og offline-download.
- Når en ny version aktiveres, kan administratoren vælge en atomisk overgang af aktive abonnementer. Den gamle subscription afsluttes, en ny subscription bindes til den nye version, og overgangen gemmes i subscription ledger og audit log.
- 4K-adgang styres fortsat server-side. En plan skal mindst tillade `2160p`, en tilstrækkelig `maxVideoBitrate` og den afspilningsmetode, som enheden kræver. HDR passthrough kræver fortsat en kompatibel fil, browser/enhed og Direct Play/Direct Stream.
- Metadataindstillinger understøtter nu separat TMDB Read Access Token til film og TVDB API Key samt valgfri Subscriber PIN til serier. Alle indtastede hemmeligheder valideres hos udbyderen og gemmes krypteret med `ENCRYPTION_KEY`.
- Serie-workeren logger ind mod TVDB v4, søger med `type=series`, matcher titel/år og henter det valgte series extended-record. Hvis TVDB ikke er konfigureret, bruges TMDB fortsat som fallback til serier.
- TVDB-artwork kan vises direkte fra godkendte `thetvdb.com`-URL'er. Klienter, der viser TVDB-data, skal samtidig vise attribution og link til [TheTVDB.com](https://thetvdb.com/) i overensstemmelse med [TVDB's API-regler](https://thetvdb.com/api-information).
- Implementeringen følger [TVDB v4 API-specifikationen](https://thetvdb.github.io/v4-api/) for login, series search og extended series records.
- Nøgler returneres aldrig fra status-endpoints eller til browseren efter lagring. Alternativ miljøkonfiguration er `TMDB_API_TOKEN`, `TVDB_API_KEY`, `TVDB_SUBSCRIBER_PIN` og `TMDB_LANGUAGE`.

### Mangler efter denne leverance

- HDR10/Dolby Vision tone mapping ved transcoding er ikke implementeret; HDR er i denne fase passthrough via Direct Play/Direct Stream.
- TVDB episode-level metadata og sæson-/episode-artwork er ikke implementeret endnu; den nuværende worker beriger serieepisoder med det matchede series-record.
- TVDB-attribution skal også føjes til kommende TV- og mobilklienter, når de begynder at vise TVDB-data.
## 4K- og HDR-badges på posters (2026-07-29)

- Startsidens mediekort, katalogets posters og “Fortsæt med at se” viser nu et `4K`-badge, når den analyserede fil er mindst 3840 pixels bred eller 2160 pixels høj.
- Et separat `HDR`-badge vises kun, når ffprobe-data er klassificeret som HDR10, HLG eller Dolby Vision. 4K SDR fejlkategoriseres derfor ikke som HDR.
- API’et udleder HDR-status server-side med den fælles video-signal-detektor og returnerer kun det normaliserede `hdr`-felt; den komplette ffprobe-payload eksponeres ikke til webklienten.
## TVDB sæson-/episode-metadata og serieside (2026-07-29)

- TVDB-workerens serieflow bruger nu den officielle `series/{id}/episodes/default/{lang}`-kontrakt med pagination til at matche lokale `SxxExx`-filer mod TVDB’s standard episodeorden.
- Metadatajobbet gemmer canonical serienavn, serieoversigt, serieposter/backdrop, TVDB-serie-id, sæson-id/poster samt episode-id, titel, beskrivelse, premieredato og still-billede.
- Databasemigrationen er additiv. Eksisterende biblioteker backfilles ved at vælge `Serier` og køre metadata fra adminindstillingerne; lokale filstier og scannerens sæson-/episodenumre ændres ikke.
- Seriesiden har sæsonvælger, episode-stills, lokaliserede titler/beskrivelser og korrekt attribution til TheTVDB.com.
- `Afspil næste episode` bruger den aktive profils playback-historik: en påbegyndt episode fortsættes, afsluttede episoder springes over, og derefter vælges første resterende episode i sæson-/episodeorden.
- API’et returnerer kun normaliserede metadata- og HDR-felter. Rå ffprobe-data fjernes fra katalog-, detalje-, historik- og næste-episode-responser.
- TVDB-kontrakten er dokumenteret i den [officielle v4 Swagger](https://thetvdb.github.io/v4-api/) og TVDB anbefaler lokal caching frem for klientkald direkte til udbyderen.

### Kendte rester

- Alternate/DVD/streaming episode orders kan endnu ikke vælges manuelt; standardordenen bruges.
- Manuel metadata-matchning ved forkerte eller tvetydige serienavne mangler.
- TVDB-liveflow kræver fortsat en gyldig nøgle på installationsserveren og verificeres først dér.
## Separat kundeportal og adminområde (2026-07-29)

- Login router nu efter serverens roller: `admin`/`operator` åbner serveradministrationen, mens almindelige brugere åbner profilvalg eller `/watch`.
- `/watch` er en separat kundeoplevelse med egen header, søgning, film, serier, fortsæt med at se, discovery-rækker, metadata, kvalitetsbadges og webplayer. Ingen serverstatus, logs, biblioteker, planer eller updater vises.
- `/profiles` vælger aktiv profil ved sikker refresh-token-rotation. Playback-historik og fortsæt-position følger dermed den valgte profil.
- Adminområdet har knappen `Kundevisning`, og kundeportalen viser `Admin`-returknappen kun for admin/operator-roller.
- Admin-dashboardet kontrollerer rollen via `/auth/me`, før det kalder administrative endpoints. Serverens eksisterende `@Roles`-checks er fortsat den autoritative sikkerhedsgrænse; frontend-routing er kun UX-laget.

## Chromecast end-to-end sender (2026-07-29)

- Cast-handoff bevarer den eksisterende playback-session og logical session, s� overgangen ikke reserverer en ekstra stream-plads.
- API'et udsteder et HMAC-signeret, sessionsbundet Cast-token med standardlevetid p� seks timer. `CAST_TOKEN_TTL_SECONDS` kan s�ttes til 300-86400 sekunder.
- Receiverens stream-, HLS- og WebVTT-URL'er er absolutte og bruger `BB_MEDIA_PUBLIC_URL`, kontoens eksterne URL eller browserens validerede origin i den r�kkef�lge. Localhost-adresser afvises, fordi de peger p� receiveren selv.
- Webplayeren bruger Google Cast `RemotePlayerController` til play/pause, seek og lydstyrke. Undertekster skiftes med Cast media-track API'et.
- Remote position, varighed, pause-state, heartbeat og playback-historik synkroniseres, mens fanen er �ben. Ved almindelig disconnect forts�tter den lokale player fra receiverens seneste position.
- Hvis receiverens `loadMedia` fejler, rulles Cast-markeringen tilbage uden at frigive den oprindelige playback-session.

### Chromecast-konfiguration

S�t en adresse, som Chromecast-enheden kan hente fra, n�r browserens origin eller setup-wizardens eksterne URL ikke er den rigtige:

```dotenv
BB_MEDIA_PUBLIC_URL=https://media.example.dk
CAST_TOKEN_TTL_SECONDS=21600
```

Web Sender-siden skal �bnes via HTTPS, og Chromecast skal kunne n� URL'en og stole p� dens TLS-certifikat. Default Media Receiver kr�ver fortsat en �ben controllerfane for heartbeat. En egen BoltBytes receiver med receiver-ejet heartbeat er n�ste Cast-trin.
