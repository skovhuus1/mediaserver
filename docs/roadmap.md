# Roadmap

## Leveret foundation

- modulær NestJS API og Prisma/PostgreSQL
- Redis cache og durable workers
- auth, profiler, devices og RBAC
- plans, subscriptions og entitlements
- streamreservation, leases og audit
- setup, health, metrics, logs og updater
- Docker og direkte Linux-installation

## Leveret medieoplevelse

- biblioteksscanner, watcher og planlagte scans
- TMDB/TVDB metadata og manuel match
- playback-analyse, intro/credits markers og media badges
- Direct Play, Direct Stream og HLS
- subtitles, continue watching og playbackhistorik
- personlig kundeportal, søgning og recommendations
- responsive web UI og TV-orienteret Flutter UI
- Chromecast sender og receiverkode
- offline/downloadfoundation

## Leveret drift

- operationscenter
- systemdiagnostics og live playback telemetry
- krypteret backup/restore
- Sonarr/Radarr automation
- branch-aware updater med progress
- CI for backend, web, Docker og Flutter

## Eksterne gates

Disse kræver credentials, hardware eller konto uden for repositoryet:

- Google Cast receiverregistrering
- fysisk Chromecast-test
- Android signing og Play Console
- fysisk Android TV D-pad-test
- FCM service account
- TMDB/TVDB credentials
- Sonarr/Radarr instances
- offentligt DNS og TLS
- restoreøvelse på isoleret database

## Næste produktleverancer

1. Betalingsprovider og idempotent webhookledger
2. App-store release, signing og staged rollout
3. Fysisk device-certificering for 4K/HDR, subtitles, seek og Cast
4. Hardwaretranscoding certification pr. GPU/runtime
5. SMTP/invitationsflow og password recovery
6. Finere household/admin delegation
7. End-to-end observability med alarmer og retention
8. Accessibility- og localization-pass på alle klienter
9. Belastnings- og chaos-tests for scanner, transcode og restore
10. Dokumenteret supportmatrix for codecs, TV-modeller og browsers

## Definition of done

En roadmaplinje er først færdig, når:

- funktion og fejltilstand er implementeret
- relevante tests er grønne
- build er grøn
- drift og rollback er dokumenteret
- README/status er opdateret
- branch- og PR-checks er grønne
- ekstern eller fysisk gate er dokumenteret separat, hvis den ikke kan automatiseres
