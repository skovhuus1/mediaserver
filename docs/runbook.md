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

## Streamslot frigives ikke

Kontroller workerloggen og `lease_expires_at`. Workerens recurring `playback.expire-leases` job frigiver udløbne reservationsrækker. Heartbeat kan ikke forlænge en afsluttet session.
