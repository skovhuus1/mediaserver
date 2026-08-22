# Sikkerhed og backup

## Trusselsmodel

BoltBytes antager, at klienten kan manipuleres. Rettigheder, streamlimits, kvalitet, release windows og signed URLs afgøres derfor server-side.

Adminportalen må kun publiceres over HTTPS i produktion. PostgreSQL, Redis, API-internal port og admin-internal port må ikke eksponeres direkte.

## Secrets

| Secret | Formål | Rotation |
| --- | --- | --- |
| JWT_SECRET | Signerer access-, setup- og change-tokens | Logger alle aktive access tokens ud |
| ENCRYPTION_KEY | Krypterer settings og backupformat | Kræver planlagt re-encryption |
| TMDB/TVDB | Metadata | Kan udskiftes i admin |
| Servarr API keys | Sonarr/Radarr | Kan udskiftes i integrationen |
| Servarr webhook secret | Inbound webhookauth | Rotér i admin og opdatér provider |
| FCM service account | Push | Udskift via sikker serverkonfiguration |

**scripts/bootstrap-env.mjs** genererer manglende JWT_SECRET og ENCRYPTION_KEY. Den overskriver ikke gyldige eksisterende secrets.

## Passwords og tokens

- Passwords og profil-PIN hashes med en password-hashfunktion.
- Refresh tokens gemmes kun som hash.
- Tokenrotation og revoke er atomisk.
- Midlertidige passwords logges ikke og returneres kun én gang.
- Password-reset tilbagekalder refresh tokens og aktive playbacks.
- Suspension bevarer audit/historik, men fjerner adgang.
- Permanent brugersletning er ikke en normal adminhandling.

## Filesystem

- Medier er read-only i containerne.
- Scanner og stream bruger realpath under storage root.
- Symlinks kan ikke bruges til path escape.
- FFmpeg/ffprobe startes med argument-arrays, ikke shellbyggede paths.
- Downloads, transcodes og backups ligger uden for mediemountet.

## Krypteret backupformat

En **.bbbackup** indeholder et PostgreSQL custom-format archive krypteret med AES-256-GCM. Nøglen afledes fra ENCRYPTION_KEY med salt. Headeren autentificeres sammen med payloaden.

Backup omfatter databaseindhold:

- konti, brugere, profiler og password-hashes
- planer, subscriptions og entitlements
- biblioteksindeks og metadata
- playbackhistorik og settings
- jobs og auditlog

Backup omfatter ikke:

- originale mediefiler
- transcode-cache
- downloads
- .env eller ENCRYPTION_KEY

## Opret og eksportér

Kun bootstrap-account med adminrolle kan administrere komplette backups.

Backupmanageren kan:

- oprette
- importere og kryptografisk validere
- downloade
- slette
- vise schema-kompatibilitet
- forberede restore

Retention styres af **BB_MEDIA_BACKUP_RETENTION**. Uploadgrænsen styres af **BB_MEDIA_BACKUP_MAX_BYTES**.

## Restore-gates

Restore kræver:

- samme account
- samme migrationsversion
- ingen aktive streams
- ingen aktive systemjobs
- gyldig femminutters challenge
- eksakt bekræftelsestekst
- adgang til pg_restore

Før restore oprettes en pre-restore safety backup. pg_restore bruger clean, if-exists, no-owner, no-privileges, single transaction og exit-on-error.

Efter succes:

- snapshot-aktive sessions stoppes
- refresh tokens tilbagekaldes
- aktive reservationsrækker frigives
- snapshot-aktive jobs markeres stoppet
- Redis flushes

## Recoveryøvelse

En backup er ikke bevist, før restore er prøvet på en isoleret installation med samme migrationsversion og ENCRYPTION_KEY.

Anbefalet kvartalsøvelse:

1. Download ny backup.
2. Klargør isoleret PostgreSQL/Redis.
3. Brug kopi af den korrekte ENCRYPTION_KEY.
4. Importér og kør restore-plan.
5. Gendan.
6. Kontrollér login, biblioteksindeks og settings.
7. Slet testmiljøets secrets efter øvelsen.

## Audit

Adminændringer, integrationer, backup og sikkerhedshændelser skrives account-scopet til auditloggen med correlation id. API keys, passwords, refresh tokens, signed streamtokens og webhooksecrets må aldrig indgå i details.
