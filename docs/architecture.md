# Arkitektur (Fase 1)

## Domænemoduler i API

- `auth` – login/register/refresh/logout, token-rotation.
- `accounts`, `users`, `profiles`, `devices` – kontosætning og identitetsdomæne.
- `plans`, `subscriptions`, `entitlements`, `system` – kontrakter og abonnementer.
- `media`, `libraries`, `playback` – playback forretningslogik.
- `billing` – webhook ledger + provider-port til fremtidig abonnementsintegration.

## Sessionmodel

`playback_sessions` repræsenterer en aktiv session med lease og status. `stream_reservations` er en afledt post, der binder en session til konkret reservation.

Kontrakt: sessioner udnyttes gennem:

1. `EntitlementService.evaluateForProfile`
2. `PlaybackDecisionService.chooseMethod`
3. `StreamReservationService.reserve`

## Databasen

`services/api/prisma/schema.prisma` indeholder den fulde fase-1 model med:

- `accounts`, `users`, `profiles`, `roles`, `permissions`
- `plans`, `plan_versions`, `plan_entitlements`, `subscriptions`, `subscription_events`, `subscription_snapshots`
- `playback_sessions`, `stream_reservations`, `playback_history`
- `system_settings`, `system_jobs`, `job_attempts`, `billing_webhook_events`
- auth relaterede tabeller (devices, refresh_tokens)
