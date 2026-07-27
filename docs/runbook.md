# Runbook – fase 1

## Bootstrap flow

1. Start database og API.
2. Kør `POST /api/v1/system/setup` med konto og admin.
3. Opret de første roller via bootstrap (ADMINISTRATOR oprettes automatisk hvis fraværende).
4. Opret planer/plan-versioner og tildel abonnementer.
5. Opret media og bibibliotek(er).

## Playback beslutningsflow

1. Klient kalder `POST /api/v1/playback/authorize`.
2. Entitlement bliver evalueret server-side.
3. Metode vælges via `PlaybackDecisionService`.
4. Reservation reserverer plads med lease og advisory lock.
5. Klienten sender heartbeat og forlanger forlængelse.

## Fejl-situationer

- `max_streams_reached` – når kontoens aktive samtidige sessioner rammer limit.
- `no_subscription` – bruger uden aktivt abonnement.
- `release_delay_active` – indhold ikke frigivet.
- `transcode_blocked` – plan tillader ikke transkodning.

## Recovery

- Ved service-downtime frigives lejede sessions ved heartbeat timeout:
  - `/playback/sessions` listen validerer `lease_expires_at`.
  - Udløbne sessioner markeres som `expired`.
