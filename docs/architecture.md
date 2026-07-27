# Arkitektur

## Runtime

BoltBytes er en modulær monolit med en separat worker-proces:

```text
Klient -> nginx:5555 -> Next admin:3000
                    -> Nest API:3001 -> PostgreSQL
                                    -> Redis
Worker ----------------------------> PostgreSQL job ledger
```

API’et ejer alle beslutninger om identitet, konto, plan, entitlement, playback-metode og streamgrænser. Klientfelter bruges kun som input og kan ikke ændre effektive rettigheder.

## Identitet

Access tokens er kortlivede JWT’er. Refresh tokens er tilfældige 384-bit værdier, og kun SHA-256-hash lagres. Rotation udføres i en serializable transaktion med conditional revoke; genbrug af et roteret token tilbagekalder hele tokenfamilien.

## Entitlements

Effektive rettigheder beregnes i denne rækkefølge:

```text
PlanVersion snapshot -> user override -> profile override
```

Kun kendte booleske og numeriske felter kan overrides. Release delay anvender UTC og clamped kalendermåneder, så 31. januar plus en måned bliver sidste gyldige dag i februar.

## Playback reservation

Reservationer serialiseres pr. bruger med en PostgreSQL transaction-level advisory lock. Inde i samme transaktion ryddes udløbne leases, aktive slots tælles, og session plus reservation oprettes. En afbrudt transaktion kan derfor ikke efterlade en halv reservation.

Heartbeat og stop kræver både account scope og session-ejerskab. Administrator/operator kan se kontosessions; almindelige brugere kan kun se og ændre egne sessions.

## Worker

Jobs er vedvarende rækker i `system_jobs`. Workers claimer med `FOR UPDATE SKIP LOCKED`, skriver `job_attempts`, holder lease og bruger eksponentiel retry. Ukendte jobtyper fejler eksplicit og markeres aldrig som gennemført.

## Scanner

Et scan oprettes atomisk som `library_scans` plus et durable `library.scan` job. Workeren følger ikke symlinks, kalder `realpath` på storage root, bibliotek og fil og afviser alle paths uden for root. `ffprobe` køres med argument-array uden shell, 30 sekunders timeout og begrænset outputbuffer.

Filer upsertes efter den unikke nøgle `(library_id, relative_path)`. Hver fil får et `last_seen_scan_id`; efter et gennemført scan markeres ikke-sete filer som `missing`, men hverken medieposter eller filer slettes automatisk.

## Direct streaming

Playback authorization kræver en scannet fil med status `ready`. Den eksisterende stream-token returneres kun som klartekst ved reservation, mens databasen kun gemmer SHA-256-hash. `GET` og `HEAD` på sessionsstreamen validerer token, aktiv lease, playback-metode og realpath under storage root.

Kun én HTTP byte-range understøttes pr. request. Nginx buffering er deaktiveret på API-ruten, så store filer streames uden fuld proxy-buffering. Stream-ruten har nginx access-log slået fra, og API-loggeren gemmer kun path uden query string, så stream-tokenet ikke skrives til normale requestlogs.
