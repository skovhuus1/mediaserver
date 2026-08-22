# API-overblik

Basepath er **/api/v1**. OpenAPI genereres af NestJS-applikationen. Alle protected endpoints kræver Bearer access token.

## Principper

- account scope håndhæves server-side
- roller håndhæves i guards og service
- input valideres med DTO'er
- fejl har stabil code og konkret message
- correlation id følger request og audit
- secrets returneres ikke fra statusendpoints
- signed playbacktokens er kortlivede
- destructive driftshandlinger har ekstra gates

## Endpointfamilier

| Familie | Ansvar |
| --- | --- |
| **/auth** | login, refresh, logout, password-change og profilvalg |
| **/accounts** | accountstatus og scope |
| **/users** | oprettelse, redigering, reset, suspend og reactivate |
| **/profiles** | profil, PIN, arkivering og preferences |
| **/devices** | registrering, aktivitet, revoke og device preferences |
| **/plans** | planer og versioner |
| **/subscriptions** | manuel tildeling, planændring og annullering |
| **/entitlements** | evaluation og overrides |
| **/libraries** | storage, paths, scanner og watcher |
| **/media** | katalog, metadata, search, recommendations og feedback |
| **/playback** | authorize, sessions, heartbeat, config, history og streaming |
| **/system** | health, readiness, diagnostics, updater, logs og settings |
| **/system/backups** | create, import, download, delete, plan og restore |
| **/system/integrations/servarr** | Sonarr/Radarr connection, lookup, add og webhooks |

## Auth-flow

Login kan returnere:

- normal access/refresh session
- password-change-required med kortlivet change token
- profile selection
- profile PIN required

Refresh tokens roteres. Logout revokerer den aktuelle tokenfamilie. Password-reset og suspension tilbagekalder tokens og aktive playbacksessioner.

## Playback-flow

1. Klienten sender media id og capabilities til authorize.
2. Serveren evaluerer entitlement og vælger metode.
3. Reservation og session oprettes atomisk.
4. Klienten bruger signed stream/HLS/subtitle URL.
5. Heartbeat opdaterer lease og runtime telemetry.
6. Stop eller lease expiry frigiver slot.

## Fejlformat

En typisk fejl:

~~~json
{
  "statusCode": 409,
  "code": "stream_limit_reached",
  "message": "Planen tillader allerede det maksimale antal aktive streams.",
  "details": {
    "limit": 1
  }
}
~~~

Klienter skal styre adfærd efter **code**. **message** er menneskelæselig og kan ændre sprog.

## Health

~~~bash
curl -fsS http://127.0.0.1:6555/api/v1/system/health
curl -fsS http://127.0.0.1:6555/api/v1/system/ready
~~~

Health er liveness. Ready beviser dependencies.

## Servarr-webhook

Webhooken er public, men autentificeret med Basic-password eller **X-BoltBytes-Webhook-Secret**:

~~~text
POST /api/v1/system/integrations/servarr/webhooks/{accountId}/{sonarr|radarr}
~~~

Test-event giver 202 uden scan. Import-events queue det konfigurerede bibliotek eller genbruger et aktivt scan.

## Kompatibilitet

Eksisterende endpoints og fejlkoder ændres ikke uden migration. Nye klientfelter skal have serverdefaults, så ældre klienter fortsat virker.
