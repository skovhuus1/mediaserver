# Deployment

## Docker Compose

Kør secret-bootstrap før første start. PostgreSQL- og Redis-data ligger i named volumes. `/media` monteres read-only, mens `/downloads`, `/transcode` og `/app/data` er skrivbare.

Miljøspecifikke host paths kan sættes før start:

```bash
MEDIA_PATH=/home/seeds/Media/Films/user/google/google/external/Media DOWNLOADS_PATH=/mnt/downloads docker compose up -d --build
```

`MEDIA_PATH` monteres read-only som `/media` i API og worker. Setup-guiden kan browse alle undermapper under denne rod, men kan ikke gå uden for mountet. Eksponeret port er `5555`. Databasen og Redis publiceres ikke på hosten.

## Direkte Linux

`scripts/install-direct.sh` opretter:

- `bb-media-api.service`
- `bb-media-admin.service`
- `bb-media-worker.service`
- `bb-media.target`
- nginx site på port `5555`

Installerens sudoers-regel tillader kun restart af `bb-media.target`. Den giver ikke generel root-shell.

`ffprobe` skal være installeret og tilgængelig i `PATH`; direct-installeren stopper før ændringer, hvis kravet mangler. Worker-containeren installerer FFmpeg-pakken i runtime-imaget. Mediebrugeren skal have læseadgang til de konfigurerede mount points.

## Secrets

`.env` må ikke committes. Backup skal inkludere `.env`, men filen skal opbevares krypteret. Hvis `ENCRYPTION_KEY` mistes, kan krypterede integration secrets ikke gendannes. Hvis `JWT_SECRET` roteres, bliver eksisterende access tokens ugyldige.
