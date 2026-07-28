# Runbook

## Health

```bash
curl http://127.0.0.1:5555/api/v1/system/health
curl http://127.0.0.1:5555/api/v1/system/ready
```

`health` viser processtatus. `ready` kontrollerer både PostgreSQL og Redis.

## Docker logs

```bash
docker compose ps
docker compose logs --tail=200 api worker admin
```

## Direkte installation

```bash
systemctl status bb-media.target
journalctl -u bb-media-api -u bb-media-worker -u bb-media-admin --since "30 minutes ago"
```

## Migration fejler

Stop applikationen, tag databasebackup og inspicer Prisma-fejlkoden. Brug aldrig `prisma migrate reset` på en produktionsdatabase.

## Updater nægter

- `update_dirty_worktree`: commit eller fjern bevidste tracked ændringer.
- `update_not_fast_forward`: historikken divergerer og kræver manuel Git-gennemgang.
- `update_command_failed`: kontroller Git-remote, netværk og servicebrugerens adgang.

Docker-updateren aktiveres eksplicit:

```bash
DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
if grep -q '^DOCKER_GID=' .env; then
  sed -i "s/^DOCKER_GID=.*/DOCKER_GID=$DOCKER_GID/" .env
else
  printf '\nDOCKER_GID=%s\n' "$DOCKER_GID" >> .env
fi
docker compose -f docker-compose.yml -f docker-compose.updater.yml up -d --build
```

Branch vælges i adminpanelet. Kun branches, som findes på den konfigurerede Git-remote, accepteres. En opdatering må kun bevæge den kørende commit fremad; rollback og divergeret historik afvises.

## Streamslot frigives ikke

Kontroller workerloggen og `lease_expires_at`. Workerens recurring `playback.expire-leases` job frigiver udløbne reservationsrækker. Heartbeat kan ikke forlænge en afsluttet session.

## Biblioteksscan fejler

Kontroller den seneste række via `GET /api/v1/libraries/{id}/scans` og workerloggen. Bekræft derefter:

- `ffprobe -version` virker for workerbrugeren.
- Storage root og bibliotekspath findes i samme mount namespace.
- Workerbrugeren har læseadgang.
- Den virkelige bibliotekspath ligger under storage root.

Symlinks følges aldrig. Enkeltfiler, som `ffprobe` ikke kan læse, registreres som `unreadable`; scan-jobbet fortsætter og tæller fejlen.

## Direct stream returnerer 401, 410 eller 416

- `401`: token mangler eller matcher ikke sessionens hash.
- `410`: sessionens lease er udløbet eller afsluttet.
- `416`: klienten sendte en ugyldig eller multi-range request.

Klienten skal sende heartbeat separat. Range-requests forlænger ikke sessionens lease.
