# Deployment

## Valg af runtime

Docker Compose er standard og den bedst testede installation. Direkte Linux-installation er understøttet, men kræver lokal PostgreSQL, Redis, Nginx, FFmpeg og Node.js.

## Docker Compose

### Krav

- Docker Engine
- Docker Compose v2 som underkommandoen **docker compose**
- Git
- Node.js 22 til bootstrap-scriptet
- En eksisterende hostmappe med medier

### Første installation

~~~bash
git clone https://github.com/skovhuus1/mediaserver.git
cd mediaserver
cp .env.example .env
node scripts/bootstrap-env.mjs
~~~

Redigér mindst:

~~~dotenv
PUBLIC_PORT=6555
MEDIA_PATH=/srv/media
BB_MEDIA_PUBLIC_URL=http://serverens-ip:6555
CORS_ORIGIN=http://serverens-ip:6555
~~~

Start:

~~~bash
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  up -d --build --remove-orphans --wait --wait-timeout 300
~~~

Åbn **http://serverens-ip:6555**.

### Services

| Service | Funktion | Hostport |
| --- | --- | --- |
| proxy | Fælles HTTP-indgang | 6555 |
| admin | Next.js web og kundeportal | Ingen |
| api | NestJS API | Ingen |
| worker | Scanner, metadata og øvrige jobs | Ingen |
| transcoder | FFmpeg playbackjobs | Ingen |
| postgres | Vedvarende database | Ingen |
| redis | Cache og ephemeral state | Ingen |

### Volumes og mounts

| Mount | Adgang | Indhold |
| --- | --- | --- |
| **MEDIA_PATH -> /media** | Read-only | Film, serier og sidecar-undertekster |
| **downloads -> /downloads** | Read-write | Offline artifacts og downloads |
| **transcode_data -> /transcode** | Read-write | HLS og midlertidige transcodes |
| **application_data -> /app/data** | Read-write | Backups og runtime-data |
| **postgres_data** | Read-write | PostgreSQL |
| **redis_data** | Read-write | Redis persistence |

Setup-guiden kan kun browse under monterede rødder. Hvis hoststien er **/srv/media/Film**, men **MEDIA_PATH** peger på en anden mappe, findes biblioteket ikke i containeren.

## Offentligt domæne

Produktionen bruger **https://media.boltbytes.com** via Nginx Proxy Manager.

~~~dotenv
PUBLIC_PORT=6555
BB_MEDIA_PUBLIC_URL=https://media.boltbytes.com
CORS_ORIGIN=https://media.boltbytes.com
~~~

Se [domain-nginx-proxy-manager.md](domain-nginx-proxy-manager.md) for DNS, certifikat, WebSockets, Range og timeouts.

Port **6555** må ikke publiceres direkte på internettet. Tillad kun LAN eller Nginx Proxy Managers IP.

## Updater

Updateren kræver repository-mount, Docker socket, korrekt Docker GID og eksplicit aktivering:

~~~dotenv
BB_MEDIA_UPDATE_ENABLED=true
BB_MEDIA_UPDATE_REPO_PATH=/home/seeds/mediaserver
BB_MEDIA_UPDATE_REMOTE=origin
BB_MEDIA_UPDATE_BRANCH=main
BB_MEDIA_UPDATE_RESTART_MODE=docker-compose
BB_MEDIA_UPDATE_USE_SUDO=false
~~~

Sæt Docker socket-gruppen:

~~~bash
DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
if grep -q '^DOCKER_GID=' .env; then
  sed -i "s/^DOCKER_GID=.*/DOCKER_GID=$DOCKER_GID/" .env
else
  printf '\nDOCKER_GID=%s\n' "$DOCKER_GID" >> .env
fi
~~~

Genskab stakken efter ændring af updater-miljø:

~~~bash
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  up -d --build --force-recreate --remove-orphans --wait --wait-timeout 300
~~~

Repositoryet på hosten skal være skrivbart for containerens node-bruger eller en fælles gruppe. Brug ikke globalt mode 777. Se runbooken ved permission-fejl.

## Manuel opdatering

~~~bash
cd /home/seeds/mediaserver
sudo -u seeds git fetch origin main
sudo -u seeds git switch --detach origin/main
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  up -d --build --remove-orphans --wait --wait-timeout 300
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  restart proxy
~~~

Skift kun til **origin/main**, når den valgte commit er godkendt. Updaterens sikkerhedsregler må ikke omgås med reset hard.

## Direkte Linux

### Krav

- Node.js 22
- npm
- PostgreSQL server og client
- Redis server og client
- Nginx
- FFmpeg og ffprobe
- systemd

Installation:

~~~bash
git clone https://github.com/skovhuus1/mediaserver.git
cd mediaserver
sudo ./scripts/install-direct.sh
~~~

Scriptet:

- opretter **.env** fra **.env.direct.example**
- genererer secrets
- installerer dependencies og migrerer
- bygger API, worker og admin
- opretter API-, admin-, worker- og transcoder-services
- opretter **bb-media.target**
- installerer Nginx på port 6555
- giver kun servicebrugeren lov til at genstarte target via updateren

Direkte installation publiceres på **http://serverens-ip:6555**.

## Secrets

**.env** må ikke committes. Tag en separat krypteret kopi af **.env**. Databasebackupen kan ikke erstatte **ENCRYPTION_KEY**.

Ved rotation:

- JWT_SECRET gør eksisterende access tokens ugyldige.
- ENCRYPTION_KEY må ikke roteres uden en planlagt re-encryption-migration.
- Servarr-, TMDB-, TVDB- og FCM-credentials gemmes krypteret med ENCRYPTION_KEY.

## Rollback

Kode-rollback udføres manuelt til en kendt, kompatibel commit. Database-rollback kræver en backup fra før den inkompatible migration.

Kør aldrig **prisma migrate reset** i produktion. Gendan i stedet via adminens backupflow eller en kontrolleret PostgreSQL-procedure.
