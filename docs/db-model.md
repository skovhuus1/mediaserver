# Datamodel og migration

## Baseline migration

- Migration: `services/api/prisma/migrations/0001_init/migration.sql`
- Migration lock: `services/api/prisma/migration_lock.toml`

## Schema highlights

- Alle primære felter er `uuid` med `gen_random_uuid()` default.
- Entitlement- og limit-felter ligger i `plan_versions` med snapshot i `plan_entitlements`.
- Stream concurrency håndteres i `plan_versions.max_concurrent_streams`.
- Session lease: `playback_sessions.lease_expires_at` + `last_heartbeat_at`.
- Audit via `audit_logs` for operationel sporing.
- Billing webhook idempotens via `billing_webhook_events` (`provider`, `event_id` unik).

## Relationelle nøglepunkter

- `subscriptions` refererer en version af en plan (`plan_version_id`).
- `user_entitlement_overrides` holder per-bruger overrides.
- `stream_reservations` har 1:1 til `playback_sessions`.
