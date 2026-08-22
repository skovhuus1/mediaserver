# BoltBytes Media Server

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
| Identitet | Login, refresh-tokenrotation, enheder, profiler, profil-PIN, password-change og rollebaseret adgang |
| Adgang | Planversioner, snapshots, overrides, release windows, suspend/revoke og atomiske streamreservationer |
| Bibliotek | Flere biblioteker, parallel scans, filesystem-watcher, metadata, manuel match, låsning og playback-analyse |
| Playback | Direct Play, Direct Stream/remux, HLS-transcoding, ABR, 4K/HDR-policy, subtitles, historik og fortsæt-position |
| Kundeportal | Personlig forside, anbefalinger, søgning, film-/seriesider, sæsoner, præferencer og downloads |
| Chromecast | Web Sender, signed cast-media-kontrakt og branded receiver-side; produktion kræver registreret Cast App ID |
| Admin | Operationscenter, diagnostics, CPU/RAM/playback-telemetri, logs, opdatering, backup og integrationer |
| Backup | Krypteret PostgreSQL-backup, import, download, retention, pre-restore safety backup og gated restore |
| Automation | Sonarr/Radarr health, lookup, add, root/profile defaults og autentificerede import-webhooks |
| Klienter | Flutter mobile/TV-flavors, manifest- og signaturcertificeret Android-releaseflow, TV-navigation, offline-downloads og cast-handoff |

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
- Updateren accepterer kun validerede fremadgående eller squash-equivalente Git-overgange.
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

Android-releases bygges som separate `mobile`- og `tv`-flavors. Produktionsworkflowet udgiver APK/AAB sammen med checksums, et maskinlæsbart release-manifest og GitHub provenance; fysisk mobil-, TV- og Cast-certificering forbliver en særskilt releasegate.

Licens er ikke fastlagt i repositoryet. Tilføj en licensfil, før projektet distribueres uden for den nuværende private anvendelse.
