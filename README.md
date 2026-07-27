# BoltBytes Media Server

TypeScript-first medieplatform i en monorepo med tre kerneenheder:

- `services/api` (NestJS)
- `web/admin` (Next.js)
- `shared/types` (kontrakter)

Derudover leveres Docker- og driftinfrastruktur under `infra/` og `docker-compose.yml`.

## Hurtig-start (lokalt)

```bash
npm install
cp .env.example .env
# Udfyld DATABASE_URL m.v. hvis nødvendigt
npm run dev
```

## Fase-1 endpoints

API er versioneret med `/api/v1`.

- `GET  /api/v1/accounts/bootstrap-state`
- `POST /api/v1/system/setup`
- `GET  /api/v1/system/health`
- `GET  /api/v1/system/ready`
- `GET  /api/v1/system/metrics`
- `POST /api/v1/system/webhook/billing`
- `POST /api/v1/auth/register-admin`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET  /api/v1/auth/me`
- `GET  /api/v1/users`
- `POST /api/v1/users`
- `GET  /api/v1/profiles`
- `POST /api/v1/profiles`
- `GET  /api/v1/devices`
- `POST /api/v1/devices`
- `DELETE /api/v1/devices/:id`
- `GET  /api/v1/plans`
- `POST /api/v1/plans`
- `GET  /api/v1/plan-versions`
- `POST /api/v1/plan-versions`
- `GET  /api/v1/subscriptions`
- `POST /api/v1/subscriptions`
- `PATCH /api/v1/subscriptions/:id/cancel`
- `POST /api/v1/entitlements/evaluate`
- `POST /api/v1/playback/authorize`
- `GET  /api/v1/playback/sessions`
- `PATCH /api/v1/playback/sessions/:id/heartbeat`
- `DELETE /api/v1/playback/sessions/:id`
- `GET  /api/v1/media`
- `POST /api/v1/media`
- `GET  /api/v1/libraries`
- `POST /api/v1/libraries`
- `PATCH /api/v1/libraries/:id/scan`
- `GET  /api/v1/system/health` (global)

## Implementeret i denne omgang (fase 1)

- ✅ Database-model med Fase 1 domæner i `services/api/prisma/schema.prisma` og initial migration.
- ✅ API-moduler for konto, auth, brugere/profiler, enheder, planer, abonnementer, entitlement-evaluering og playback.
- ✅ Session reservation med lease/heartbeat + pause-reservationsopførsel + automatisk udløbsrens i `PlaybackService.listSessions`.
- ✅ Setup-flow og system endpoints (`/system/setup`, `/system/health`, `/system/ready`, `/system/metrics`, webhook).
- ✅ Billing ledger for webhook-idempotens (`billing_webhook_events`) med deduplikeringsnøgle + fejlstatus.
- ✅ Brugeroprettelse validere e-mail pr. konto.

## Hvad mangler stadig (fase 1 færdiggørelse)

- ⏳ Udvidet testplan: concurrency, token rotation/revocation, security/path traversal og lease-udløb.
- ⏳ CI-pipeline færdig afrapporteret (pipeline findes, men skal verificeres med konkrete gates).
- ⏳ Forretningskritiske policy-tests i API (planversion snapshots, overrides, suspension flow).
- ⏳ Playback pipeline (FFmpeg/worker orchestration) og klientudrulning.

## Push-flow for hver leverance (`mediaserver` repo)

- Brug `C:\Users\Henrik\Documents\BB-Media\mediaserver` som eneste Git-root.
- Kør status først: `git -C C:\Users\Henrik\Documents\BB-Media\mediaserver status --short`
- Stage kun det ønskede scope og commit med format:
  - `git commit -m "phase1: <opgave>"`
- Push altid mod:
  - `git push -u origin main`
- Standard-script:
  - `.\scripts\push-phase1.ps1 -Task "..." -Paths @("services/api/src/...","README.md")`

## Filer

- `services/api/prisma/schema.prisma` – domænemodel
- `services/api/prisma/migrations/` – SQL-migrations
- `services/api/src` – Nest moduler og service lag
- `web/admin/src/app` – simpel setup/login UI
- `.github/workflows/ci.yml` – CI pipeline
- `docker-compose.yml` + `infra/docker/nginx.conf` – driftgrundlag

## Sikkerhed og drift

- JWT access + refresh med token-rotation
- Brugerroller gennem `roles`, `user_roles` og `@Roles`
- Session reservation med advisory lock + lease heartbeat
- Basis observability gennem `prom-client` metrics
- `billing_webhook_events` ledger med idempotent deduplikation

## Næste trin (fase 1→2)

- Playback pipeline med FFMPEG workers
- Chromecast og Android/WebTV klienter
- Vedvarende playback-job system
