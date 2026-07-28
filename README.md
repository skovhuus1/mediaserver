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
- Playback-metodevalg uden silent transcode fallback.
- Atomisk stream reservation med Prisma-kompatibel, namespaced PostgreSQL advisory lock, frisk `READ COMMITTED`-visning efter låseventet, lease/heartbeat og kryptografisk stream-token.
- Vedvarende worker-kø med `FOR UPDATE SKIP LOCKED`, jobforsøg, retry/backoff og lease-cleanup.
- Manuel biblioteksscanning via durable `library.scan` jobs med sikker realpath-kontrol, symlink-afvisning, `ffprobe`-metadata og markering af manglende filer uden automatisk sletning.
- Direkte medielevering med HTTP `HEAD`, single-range `GET`, `206 Partial Content`, suffix ranges og hash-valideret session-token; query strings udelades fra API-logs, og stream-access logs er deaktiveret i nginx.
- Integreret HTML5-webafspiller med server-side authorize, browser-capabilities, kortlivet stream-token, 30-sekunders lease-heartbeat, fremdriftslagring hvert 10. sekund og sikker frigivelse af stream-plads ved stop.
- Konto-, bruger- og profilafgrænset playback-historik med idempotent upsert, positions-clamping, automatisk afslutning ved 90 procent og en live `Fortsæt med at se`-sektion, der genoptager fra den gemte position.
- Klikbare `Afspil`-handlinger på film og enkelte serieepisoder; filer der kræver den endnu ikke implementerede transcoder afvises med en konkret fejl i stedet for skjult fallback.
- Scanstatus og manuel scan-trigger i admin-dashboardet.
- Funktionel adminnavigation med live film-/seriefiltrering, søgning, bibliotek-oprettelse, sikker mappevælger, scanning, brugerliste, planliste og driftsindstillinger.
- Server-side mediekatalog med paginering, tekstsøgning, bibliotek-/kategori-/typefiltre, stabil sortering, seriegruppering og kontoafgrænsede mediedetaljer. Adminpanelet har klikbare katalogkort, episodeoversigt, filterchips og fungerende sidekontroller.
- Valgfri TMDB-metadata gennem durable, deduplikerede `media.metadata` jobs. En vellykket scan køer kun manglende metadata, mens admin kan gennemtvinge en opdatering. Overview, rating, udgivelsesdato, provider-id, plakat og backdrop gemmes server-side; API-tokenet eksponeres aldrig.
- TMDB-token og metadata-sprog kan ændres uden container-genstart fra indstillingspanelet. Tokenet valideres mod TMDB, lagres AES-256-GCM-krypteret i `system_settings`, og API/worker bruger miljøvariablen som bagudkompatibel fallback.
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
- 32 unit tests; en citeret cross-platform glob holder alle database-integrationstests i det separate `test:integration`-step, som kun kører mod en URL med `bbmedia_test`.
- Produktionsbuild af shared contracts, NestJS API, worker og Next.js admin.

PostgreSQL-integrationstesten og Docker Compose/container-build kan ikke køres lokalt på den aktuelle Windows-maskine uden lokal PostgreSQL-testdatabase og Docker. De er verificeret i [GitHub Actions-run 30304933724](https://github.com/skovhuus1/mediaserver/actions/runs/30304933724), hvor følgende gates passerede:

- Initial migration på en frisk PostgreSQL 16-database.
- Samtidighedstest: ved to parallelle reservationsforsøg og stream-limit 1 accepteres præcis ét.
- Redis/PostgreSQL service health.
- Produktionsaudit med 0 kendte sårbarheder på high-niveau eller højere.
- Docker Compose-konfiguration og container-build af API, admin og worker.

Fase-2 mediepipelinen er verificeret i [GitHub Actions-run 30315230245](https://github.com/skovhuus1/mediaserver/actions/runs/30315230245):

- Migration `0002_media_pipeline` anvendes efter fase-1-migrationen på en frisk PostgreSQL 16-database.
- Unit-steppet kører 32 tests uden databasefiler; integrationssteppet kører separat 5/5 tests.
- To samtidige scan-triggers opretter præcis én scan-ledger og ét durable worker-job.
- Stream reservation ved limit 1 accepterer fortsat præcis én af to samtidige requests.
- API, admin og worker bygges, produktion-audit er grøn, Compose valideres, og worker-imaget med FFmpeg-laget bygges.
- CI genererer en rigtig MP4, opretter server/admin/bibliotek gennem API’et, sætter en scan i kø og kræver, at worker/ffprobe registrerer mindst ét afspilleligt medie.
- CI autoriserer derefter den importerede MP4 til Direct Play, kræver en tokenbeskyttet `206 Partial Content` Range-response gennem nginx, gemmer 25 procent fremdrift, finder mediet i `Fortsæt med at se` og kræver, at 95 procent markerer det afsluttet.

CI tester en lille rigtig MP4 gennem nginx, men afspiller endnu ikke en stor fil eller host-specifikke mountrettigheder. Det kræver fortsat en staging-server med det faktiske read-only media mount og en rigtig browser.

Container-gaten starter desuden hele Compose-stakken efter image-build, venter på API-health, kontrollerer at worker-processen forbliver kørende og kalder health-endpointet gennem nginx. Det beskytter mod runtime-fejl, som et isoleret `docker compose build` ikke kan opdage, herunder en manglende genereret Prisma-klient.

Eksisterende biblioteker fra den tidligere path-policy repareres automatisk ved scanning, når en gemt sti har det kendte dobbelte storage-root-mønster (for eksempel `/media/media/Film`). Reparationen udføres kun, hvis den oprindelige sti mangler, den korrigerede sti findes, og dens `realpath` fortsat er under det konfigurerede storage root. CI fremprovokerer legacy-formatet og kræver både vellykket import og permanent databaseheling.

Docker-opdateringer genstartes af en ekstern engangs-runner med navnet `boltbytes-media-updater-runner`. Runneren oprettes fra det kørende API-image, overlever at API-containeren bliver erstattet og udfører Compose-build/genstart fra det mountede repository. Den venter på healthy services og genstarter derefter nginx-proxyen, så dens DNS-cache ikke peger på en udskiftet API- eller admin-container. Seneste updater-log kan altid læses med `docker logs boltbytes-media-updater-runner`; næste opdatering erstatter den tidligere runner.

Admin-klienten roterer automatisk access- og refresh-tokens. Parallelle 401-svar samles om én refresh-request, hvert oprindeligt API-kald gentages højst én gang, og sessionen slettes kun ved et bekræftet ugyldigt refresh-token. Midlertidige netværks- og 5xx-fejl under en opdatering bevarer sessionen, så administratoren kan prøve igen, når serveren er healthy.

Biblioteker kan oprettes, redigeres, flyttes mellem storage roots og slettes fra admin-panelet. Opret/ret realpath-validerer den valgte mappe og afviser manglende, ulæselige eller symlink-escaped stier. Redigering og sletning blokeres under queued/running scans, og sletning fjerner kun katalogdata, aldrig mediefiler på storage.

Biblioteksscanneren klassificerer filer deterministisk før ekstern metadataopslag. Film får renset titel, årstal og kategori fra mappestrukturen. Serie- og mixed-biblioteker genkender `S01E02`, `1x02`, `Season 01`, `Sæson 01` og `S01`, og gemmer kategori, serienavn, sæson og episode server-side. CI verificerer klassifikationen gennem en rigtig scannet MP4 og unit tests dækker film, serier og mixed-biblioteker.

## Ikke implementeret endnu

- Automatisk oprettelse af flere biblioteker ud fra mappestrukturen; klassifikation og mappebaserede kategorier er implementeret, men biblioteker oprettes fortsat bevidst af administratoren.
- Lokal caching/proxying af TMDB-billeder; den nuværende implementation gemmer validerede billedstier og henter billeder direkte fra TMDBs faste image-host.
- HLS-packaging og signed segment URLs.
- FFmpeg transcoding workers, scheduler og hardwareacceleration.
- Container-remux/HLS for browserinkompatible codecs og containere; webafspilleren kan derfor kun afspille formater, som browseren selv understøtter.
- Automatisk næste episode, intro-skip og undertekstvalg i webafspilleren.
- TVDB-provider; TMDB er den aktive provider for både film og serier.
- Chromecast sender/receiver og handoff-token.
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
