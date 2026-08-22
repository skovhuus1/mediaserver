# Integrationer

## TMDB

TMDB leverer primært filmmetadata, credits, similar og billeder. Read Access Token sættes i admin eller miljø.

Credentials valideres før lagring og gemmes krypteret. Providerfejl må ikke blokere visning af lokale medier.

## TVDB

TVDB bruges til serier og episodeordener. API key og valgfri Subscriber PIN kan gemmes i admin.

TVDB-data skal vises med nødvendig attribution. Hvis et TVDB-match har TMDB external id, kan recommendations suppleres med TMDB similar/credits.

## Sonarr og Radarr

Adminområdet **Sonarr / Radarr** understøtter:

- separate base URLs og API keys
- live system status
- BoltBytes library binding
- Servarr root folder
- quality profile
- Sonarr series lookup
- Radarr movie lookup
- monitored add med automatisk søgning
- import-webhook og latest event
- secret rotation

API keys og webhooksecrets gemmes krypteret. Base URL må være HTTP eller HTTPS og må ikke indeholde username/password. Redirects følges ikke, så API key ikke sendes til et andet hostnavn.

### Webhookopsætning

1. Gem providerforbindelsen.
2. Kopiér webhook URL, Basic username og engangspassword.
3. Opret Webhook/Connect i Sonarr eller Radarr.
4. Brug username **boltbytes** og det viste password.
5. Kør providerens Test.
6. Kontrollér latest webhook i BoltBytes.
7. Kontrollér at en færdig import queue'r det bundne bibliotek.

Hvis provideren understøtter custom headers, kan **X-BoltBytes-Webhook-Secret** bruges i stedet for Basic.

## Chromecast

Web og Flutter bruger Google Cast Sender Framework. BoltBytes hoster branded receiverkoden på **/cast/receiver**.

Produktion kræver registrering i Google Cast SDK Console og et receiver App ID. Public URL skal være HTTPS.

## FCM

FCM bruges til push-notifikationer til mobile devices. Service account leveres som base64-konfiguration og må ikke returneres til adminbrowseren.

Delivery kører som durable jobs med retry. Device revoke skal stoppe fremtidig levering til tokenet.

## Nginx Proxy Manager

NPM er driftsintegration, ikke en applikationsdependency. Den terminerer TLS og videresender til port 6555. Range, WebSockets, streamingtimeouter og disabled buffering er nødvendige for playback og Cast.
