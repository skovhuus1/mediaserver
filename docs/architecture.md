# Arkitektur

## Mål

BoltBytes er en modulær medieplatform. Backend er en modulær monolit, mens tidskrævende og fejlbare operationer køres i separate workerprocesser. Serveren er autoritet for identitet, rettigheder, playbackvalg og limits.

## Runtime

~~~text
                    HTTPS / LAN
                         |
                  Nginx proxy :6555
                    /           \
             Next.js :3000    NestJS :3001
                                  |
                +-----------------+-----------------+
                |                                   |
          PostgreSQL                           Redis
                |                                   |
        job worker / scanner             cache / ephemeral state
                |
        transcode worker -> FFmpeg
                |
        /media read-only
~~~

Docker-stakken indeholder proxy, admin, API, worker, transcoder, PostgreSQL, Redis og init-services. API, admin og workers bygges fra samme repository, men kan genstartes uafhængigt.

## Domænegrænser

| Domæne | Ejer |
| --- | --- |
| Identity | Brugere, profiler, enheder, access/refresh tokens og roller |
| Accounts | Account-scope, suspension og bootstrap-owner |
| Plans | Planversioner, entitlements, snapshots og overrides |
| Catalog | Storage roots, biblioteker, filer, metadata og scannerstatus |
| Playback | Authorization, reservation, session, heartbeat, history og streamkonfiguration |
| Experience | Kundeportal, søgning, rækker, recommendations og feedback |
| System | Health, diagnostics, updater, logs, backup og eksterne integrationer |

Cross-account adgang må aldrig bero på et klientfilter. Alle opslag scopes i API-servicen.

## Identitet og sessioner

Access tokens er kortlivede JWT'er. Refresh tokens er tilfældige høj-entropi-værdier, mens databasen kun gemmer hash. Rotation udføres atomisk, og genbrug af et roteret token kan tilbagekalde hele tokenfamilien.

Første login med midlertidigt password giver kun et kortlivet password-change-token. Almindelige access- og refresh-tokens udstedes først efter passwordskift.

Profil-PIN er separat fra brugerpassword. Beskyttede profiler kræver PIN ved valg, og PIN-forsøg rate-limites.

## Entitlements

Effektive rettigheder beregnes server-side:

~~~text
PlanVersion snapshot -> user override -> profile override -> device/playback constraints
~~~

Klienter kan ikke aktivere transcoding, 4K, HDR, højere bitrate eller flere streams ved at sende andre værdier. Release delay bruger kalenderbaserede UTC-grænser.

## Playbackreservation

En reservation serialiseres pr. bruger med PostgreSQL advisory lock. Udløbne leases ryddes, aktive slots tælles, og session plus reservation oprettes i samme transaktion.

Heartbeat forlænger lease. Stop, revoke, suspension, password-reset og device-revoke lukker relevante sessions og frigiver streamslots.

Cast-handoff bevarer den logiske session, så afsender og receiver ikke tæller som to samtidige streams.

## Durable jobs

**system_jobs** er den vedvarende kø. Workers claimer med **FOR UPDATE SKIP LOCKED**, opretter **job_attempts**, holder lease og bruger retry. Ukendte jobtyper fejler eksplicit.

Aktuelle jobfamilier omfatter library scan, metadata, playback assets, transcoding, offline prepare og notifications.

## Scanner og watcher

Et scan oprettes atomisk som **library_scans** plus et **library.scan** job. Advisory locks og aktiv-status forhindrer dubletter.

Scanneren:

- normaliserer paths med realpath
- følger ikke symlinks
- afviser paths uden for storage root
- kører ffprobe uden shell
- opdaterer last-seen scan id
- markerer ikke-sete filer som missing
- sletter aldrig automatisk mediehistorik

Watcheren sender heartbeat og debouncer filhændelser. Planlagte scans og webhookscans bruger den samme durable jobkontrakt.

## Metadata og oplevelse

TMDB og TVDB bruges kun gennem server/worker. Credentials gemmes krypteret. Metadata kan matches manuelt og låses pr. titel.

Recommendations scorer kun lokale, afspillelige medier. Historik, genrer, credits, provider-similar og feedback bidrager til rækkerne. Redis-cachen invalideres ved relevant historik-, metadata- eller bibliotekændring.

## Streaming

Direct Play læser en scannet ready-fil og understøtter single-range GET/HEAD. Direct Stream remuxer kompatible streams uden unødvendig video-encode. HLS-transcoding genererer en serverbegrænset bitrate ladder.

Undertekster normaliseres til WebVTT, når formatet tillader det. Bitmapspor kan kræve burn-in og dermed transcoding, men almindelige tekstundertekster er ikke en planfordel.

## Driftssikkerhed

Updateren arbejder på en valideret target-SHA, afviser tracked dirty state og tillader kun fast-forward eller dokumenteret squash-equivalent tree-historik.

Backups er PostgreSQL custom-format omsluttet af AES-256-GCM. Restore har preflight, challenge, safety backup, single transaction og session/cache cleanup.

Sonarr/Radarr webhooks har separate krypterede secrets og kan kun queue det bibliotek, integrationen er bundet til.
