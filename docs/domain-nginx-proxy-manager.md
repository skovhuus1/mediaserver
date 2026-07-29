# Domæne og Nginx Proxy Manager

BoltBytes Media Server publiceres som `https://media.boltbytes.com`. Docker-stakken
lytter fortsat på host-port `6555`, men denne port må kun være tilgængelig fra
Nginx Proxy Manager og det betroede LAN.

## 1. DNS

Opret en `A`-record for `media.boltbytes.com`, som peger på den offentlige
IPv4-adresse for Nginx Proxy Manager. Opret kun en `AAAA`-record, hvis IPv6
faktisk routes og firewall-reglerne er på plads.

Port `80/tcp` og `443/tcp` viderestilles til Nginx Proxy Manager. Port `6555`
må ikke viderestilles fra internettet.

## 2. Miljøvariabler

Sæt følgende i serverens `.env`:

```dotenv
PUBLIC_PORT=6555
BB_MEDIA_PUBLIC_URL=https://media.boltbytes.com
CORS_ORIGIN=https://media.boltbytes.com
```

Genopbyg stakken efter ændringen:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml \
  up -d --build --remove-orphans --wait --wait-timeout 300
```

## 3. Proxy Host

Opret en Proxy Host i Nginx Proxy Manager:

- Domain Names: `media.boltbytes.com`
- Scheme: `http`
- Forward Hostname/IP: medieserverens LAN-IP
- Forward Port: `6555`
- Websockets Support: aktiveret
- Block Common Exploits: aktiveret

Under SSL vælges et offentligt Let's Encrypt-certifikat. Aktivér `Force SSL`,
`HTTP/2 Support` og acceptér Let's Encrypt-vilkårene.

Tilføj dette i fanen Advanced:

```nginx
proxy_buffering off;
proxy_request_buffering off;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
send_timeout 3600s;

proxy_set_header Range $http_range;
proxy_set_header If-Range $http_if_range;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
```

Buffering er bevidst deaktiveret for stream-, HLS- og subtitle-svar. Det
forhindrer Nginx i at forsøge at mellemcache store mediefiler og bevarer
`Range`/`Content-Range` for Direct Play.

## 4. Firewall

- Tillad offentlig adgang til Nginx Proxy Manager på `80/tcp` og `443/tcp`.
- Tillad `6555/tcp` fra Nginx Proxy Managers LAN-IP.
- Afvis offentlig adgang direkte til `6555/tcp`.
- PostgreSQL `5432/tcp` og Redis `6379/tcp` må ikke eksponeres fra Docker-host.

## 5. Kontrol

Health-endpointet skal svare gennem domænet:

```bash
curl -fsS https://media.boltbytes.com/api/v1/system/health
```

En autentificeret Direct Play-URL skal returnere `206 Partial Content`:

```bash
curl -i -H 'Range: bytes=0-1' 'https://media.boltbytes.com/api/v1/playback/direct/<signed-path>'
```

Kontrollér desuden i Indstillinger, at effektiv URL er domænet, kilden er
`environment`, og at både HTTPS- og Cast-status er klar.

## 6. Fejlsøgning

- `502 Bad Gateway`: kontrollér at API/proxy-containerne er sunde, og at NPM kan
  nå serverens LAN-IP på port `6555`.
- CORS-fejl: kontrollér den præcise `CORS_ORIGIN`; der må ikke være afsluttende
  skråstreg, hvis browserens origin ikke har den.
- Direct Play returnerer `200`: kontrollér Advanced-konfigurationen og at NPM
  videresender `Range`.
- Chromecast afviser URL'en: kontrollér offentligt gyldigt certifikat, DNS og at
  den genererede URL starter med `https://media.boltbytes.com`.
- Lange streams stopper: kontrollér `proxy_read_timeout` og `send_timeout`.

## 7. Rollback

Deaktivér Proxy Host i Nginx Proxy Manager, fjern den offentlige DNS-record og
sæt den tidligere `BB_MEDIA_PUBLIC_URL` og `CORS_ORIGIN` tilbage. Genopbyg
stakken med samme Docker Compose-kommando. Databasen og mediebibliotekerne
ændres ikke af domæneopsætningen.
