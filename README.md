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

Åbn derefter:

```text
http://SERVERENS-IP:5555
```

`JWT_SECRET` og `ENCRYPTION_KEY` genereres automatisk af `scripts/bootstrap-env.mjs`. Eksisterende secrets overskrives ikke, og værdierne skrives aldrig til terminalen.

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

Den kontrollerer remote commit, nægter at opdatere et dirty eller divergeret worktree, anvender kun `git pull --ff-only` og tillader kun faste kommandoer uden shell-interpolation.

Direkte installation aktiverer updateren og genstarter `bb-media.target` via en snæver sudoers-regel. Docker-updateren er et bevidst opt-in, fordi Docker-socket giver høj host-adgang:

```bash
docker compose -f docker-compose.yml -f docker-compose.updater.yml up --detach --build
```

Standard Docker-installation har updateren deaktiveret. Den sikre manuelle opdatering er:

```bash
git pull --ff-only origin main
docker compose up --detach --build
```

## Implementeret i den nye baseline

- NestJS API med `/api/v1`, OpenAPI på `/api/docs`, strukturerede fejl og correlation IDs.
- PostgreSQL-schema og initial migration for accounts, users, profiles, roles, permissions, devices, refresh tokens, plans, plan versions, entitlements, subscriptions, media, playback, audit, jobs og billing webhook-ledger.
- Atomisk førstegangsopsætning med singleton-guard, administrator, profil, storage root, standardplan og abonnement.
- Login, kortlivede JWT access tokens, hash-lagrede refresh tokens, atomisk tokenrotation, reuse-detection, logout og device revocation.
- Konto- og ejerskabskontrol på profiler, enheder, medier, biblioteker, abonnementer og playback sessions.
- Entitlement-evaluering med user/profile overrides, deterministiske kalendermåneder og tydelige afvisningsårsager.
- Playback-metodevalg uden silent transcode fallback.
- Atomisk stream reservation med Prisma-kompatibel, namespaced PostgreSQL advisory lock, frisk `READ COMMITTED`-visning efter låseventet, lease/heartbeat og kryptografisk stream-token.
- Vedvarende worker-kø med `FOR UPDATE SKIP LOCKED`, jobforsøg, retry/backoff og lease-cleanup.
- Manuel biblioteksscanning via durable `library.scan` jobs med sikker realpath-kontrol, symlink-afvisning, `ffprobe`-metadata og markering af manglende filer uden automatisk sletning.
- Direkte medielevering med HTTP `HEAD`, single-range `GET`, `206 Partial Content`, suffix ranges og hash-valideret session-token; query strings udelades fra API-logs, og stream-access logs er deaktiveret i nginx.
- Scanstatus og manuel scan-trigger i admin-dashboardet.
- Next.js adminskal inspireret af den godkendte BoltBytes-reference med rigtige API-data og tomme tilstande uden mock-film.
- Docker Compose med PostgreSQL, Redis, API, admin, worker og nginx reverse proxy.
- Prisma-klienten genereres under Docker-buildet og kopieres med de nødvendige engines til API- og worker-runtime-images; OpenSSL er eksplicit installeret i begge images.
- Direkte Linux/systemd-installation uden Docker.
- Sikker updater med fast-forward-krav og eksplicit Docker opt-in.
- CI-gates på Node.js 22 for migration, lint, typecheck, unit/integration tests, builds, dependency audit, Docker builds og rigtig Compose-opstart; workflow-actions bruger Node-24-kompatible v5-runtimes.

## Valideringsstatus

Lokalt valideret med Node.js 22 og npm 10:

- Prisma client generation og schema validation.
- ESLint.
- TypeScript typecheck for shared contracts, API, worker og admin.
- Tolv unit tests; en citeret cross-platform glob holder alle database-integrationstests i det separate `test:integration`-step, som kun kører mod en URL med `bbmedia_test`.
- Produktionsbuild af shared contracts, NestJS API, worker og Next.js admin.

PostgreSQL-integrationstesten og Docker Compose/container-build kan ikke køres lokalt på den aktuelle Windows-maskine uden lokal PostgreSQL-testdatabase og Docker. De er verificeret i [GitHub Actions-run 30304933724](https://github.com/skovhuus1/mediaserver/actions/runs/30304933724), hvor følgende gates passerede:

- Initial migration på en frisk PostgreSQL 16-database.
- Samtidighedstest: ved to parallelle reservationsforsøg og stream-limit 1 accepteres præcis ét.
- Redis/PostgreSQL service health.
- Produktionsaudit med 0 kendte sårbarheder på high-niveau eller højere.
- Docker Compose-konfiguration og container-build af API, admin og worker.

Fase-2 mediepipelinen er verificeret i [GitHub Actions-run 30315230245](https://github.com/skovhuus1/mediaserver/actions/runs/30315230245):

- Migration `0002_media_pipeline` anvendes efter fase-1-migrationen på en frisk PostgreSQL 16-database.
- Unit-steppet kører 12 tests uden databasefiler; integrationssteppet kører separat 2/2 tests.
- To samtidige scan-triggers opretter præcis én scan-ledger og ét durable worker-job.
- Stream reservation ved limit 1 accepterer fortsat præcis én af to samtidige requests.
- API, admin og worker bygges, produktion-audit er grøn, Compose valideres, og worker-imaget med FFmpeg-laget bygges.

CI har ikke kørt en fuld scanning af en rigtig mediefil eller afspillet en stor fil gennem nginx. Det kræver en staging-server med et faktisk read-only media mount og indgår i den næste smoke-test.

Container-gaten starter desuden hele Compose-stakken efter image-build, venter på API-health, kontrollerer at worker-processen forbliver kørende og kalder health-endpointet gennem nginx. Det beskytter mod runtime-fejl, som et isoleret `docker compose build` ikke kan opdage, herunder en manglende genereret Prisma-klient.

## Ikke implementeret endnu

- Metadataudbydere, titelmatchning og poster-download.
- HLS-packaging og signed segment URLs.
- FFmpeg transcoding workers, scheduler og hardwareacceleration.
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
