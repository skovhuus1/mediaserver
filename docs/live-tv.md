# Live TV

## Omfang

Live TV-domænet importerer M3U-kanaler, samler dubletter, prioriterer redundante kilder, indlæser XMLTV-programmer og reserverer en fysisk forbindelse atomisk. Det er account-scoped og genbruger eksisterende planer, enheder, profiler, jobs, auditlog og worker-infrastruktur.

## Sikkerhed

- Playlist-, XMLTV- og stream-URL'er krypteres med AES-256-GCM via `ENCRYPTION_KEY`.
- Admin-API'et viser kun maskerede URL'er. Upstream-credentials sendes aldrig til kundeweb, Hls.js eller Chromecast.
- Stream-URL'er bruger et kryptografisk token. Kun tokenets hash gemmes i databasen.
- HLS-underressourcer pakkes i korte, krypterede proxyreferencer, så credentials heller ikke lækker gennem mastermanifestet.
- Alle administrative mutationer kræver administratorrolle og skrives til auditloggen. Operators har read-only adgang.
- Børneprofiler kan ikke se kanaler markeret som voksenindhold.

## Administration

1. Åbn `Live TV` i administratorpanelet.
2. Opret en udbyder med navn, M3U-URL og eventuel XMLTV-URL.
3. Tilføj ekstra forbindelser, hvis abonnementet hos udbyderen tillader parallelle streams.
4. Kør kanalimport og derefter EPG-import. Begge kører som durable jobs med status og fejl i opgaveoversigten.
5. Ret kanalnavn, nummer, gruppe, voksenmarkering og aktivering efter behov.
6. Filtrér på synlige eller skjulte kanaler, søg efter kanal eller gruppe, og navigér server-side i kataloger på op til 50.000 kanaler. Klik første checkbox og Shift-klik den sidste for at markere et interval på siden; brug `Vis`/`Skjul`, eller vælg en eksakt gruppe og brug `Vis hele gruppen`/`Skjul hele gruppen`.
7. Flere forbindelseslinjer under samme udbyder bruger samme kanoniske kanal, når `tvg-id` eller det normaliserede navn matcher. Første gyldige kanalnummer bevares; en senere redundant linje kan kun udfylde et manglende nummer.
7. Sæt kildeprioritet og format. Ved fejl går reservationen videre til næste ledige, prioriterede forbindelse.
8. Saml bekræftede dubletter. Samlingen flytter kilder og EPG-match til den valgte kanal.

Bulkændringer er account-scoped og kræver administratorrolle. Skjul udføres i samme databasetransaktion som auditloggen, frigiver aktive leases, annullerer deres streamjobs og annullerer planlagte, køsatte eller aktive optagelser. Operators kan filtrere og inspicere, men ikke ændre kanalstatus.

## Forbindelsespulje og grænser

Reservationen holdes under en account-baseret PostgreSQL advisory lock. Inden en lease oprettes kontrolleres brugerstatus, profil, enhed, effektive entitlements, VOD og Live TV samlet mod `maxConcurrentStreams`, udbyderens `perUserStreamLimit`, forbindelsens `maxStreams`, kanalstatus og børneprofilpolitikken.

En lease har heartbeat og udløber automatisk efter tabt klientkontakt. Hurtigt kanalskift genbruger samme logiske lease og reserverer ikke en ekstra brugerplads.

Aktive optagelser og aktive seersessioner deler de samme fysiske forbindelses- og brugerlofter. En PVR-reservation foretages under samme advisory lock, så to samtidige schedulere eller seere ikke kan tage den sidste forbindelse.

## Afspilning

- Kompatibel HLS proxes direkte uden buffering.
- Andre kilder remuxes først med video/audio-copy til HLS.
- Hvis probe eller remux viser inkompatibel video, bruges H.264/AAC softwaretranscoding, når planen tillader det.
- Streamjobbet stopper FFmpeg, når leasen frigives eller udløber.
- Chromecast-handoff bevarer lease og får kun BoltBytes' absolutte, tokeniserede stream-URL.
- Auto vælger Direct Stream HLS, når planen tillader det, så serveren kan holde en sessionsafgrænset pausebuffer på op til 2 timer. Kunden kan spole tilbage til kanalstart eller til det aktuelle programs start, når dette punkt allerede findes i den aktive buffer. Bufferen oprettes først ved kanalstart, stopper med leasen og er ikke en permanent 24/7-timeshift-optagelse.
- Nginx-ruterne for live-streams og optagelser har buffering slået fra, Range-understøttelse og 7.500 sekunders read/send-timeout.

## PVR-optagelser

- EPG-programmer kan planlægges og annulleres direkte på programkortene i `/watch/live`. `/watch/recordings` viser hele optagelsesbiblioteket og understøtter manuel kanal, titel, start og slut.
- Schedulerjobbet reserverer den bedst prioriterede, ledige kilde kort før programstart og markerer for sene jobs som mistet.
- Workerens optagelse kører som et durable `live-tv.record`-job med lease renewal, progress og annulleringskontrol.
- H.264 kopieres, mens anden video transkodes til H.264. Lyd normaliseres til AAC, og resultatet skrives som faststart-optimeret MP4 i den delte transcode-volume.
- Afspilning kræver et kortlivet token, understøtter `HEAD` og `Range`/`206`, og providerens credentials returneres aldrig.
- Ved streamfejl markeres den konkrete forbindelse som fejlet. Live-sessionens næste jobforsøg reserverer automatisk næste prioriterede kilde med ledig kapacitet.

## Konfiguration

```env
BB_MEDIA_LIVE_TV_IMPORT_MAX_BYTES=268435456
BB_MEDIA_LIVE_TV_EPG_MAX_BYTES=209715200
BB_MEDIA_LIVE_TV_FETCH_TIMEOUT_MS=300000
BB_MEDIA_LIVE_TV_PAUSE_BUFFER_SECONDS=7200
BB_MEDIA_LIVE_TV_RECORDING_SCHEDULER_SECONDS=15
```

M3U er som standard begrænset til 256 MiB og XMLTV til 200 MiB. Begge kilder læses som streams og afbrydes, så snart den effektive grænse overskrides; deklareret `Content-Length` afvises før body-download. Under hentning vises modtagne bytes og procent i opgaveoversigten, og worker-leasen fornyes højst én gang i sekundet plus ved start og slut. Hentning har som standard fem minutters timeout. Grænserne kan hæves for en betroet udbyder, men kræver genoprettelse af worker-containeren. Workerens eksisterende `DATABASE_URL`, `ENCRYPTION_KEY`, FFmpeg og transcode-volume er påkrævet.

## API-overblik

- `GET/POST/PATCH/DELETE /api/v1/live-tv/providers`
- `POST /api/v1/live-tv/providers/:id/connections`
- `POST /api/v1/live-tv/providers/:id/import`
- `POST /api/v1/live-tv/providers/:id/epg/import`
- `GET/PATCH /api/v1/live-tv/admin/channels`
- `PATCH /api/v1/live-tv/admin/channels/bulk`
- `POST /api/v1/live-tv/admin/channels/:id/merge`
- `GET /api/v1/live-tv/guide`
- `PUT/DELETE /api/v1/live-tv/channels/:id/favorite`
- `POST /api/v1/live-tv/playback/authorize`
- `GET /api/v1/live-tv/playback/:leaseId/status`
- `POST /api/v1/live-tv/playback/:leaseId/heartbeat`
- `POST /api/v1/live-tv/playback/:leaseId/switch`
- `POST /api/v1/live-tv/playback/:leaseId/cast-handoff`
- `DELETE /api/v1/live-tv/playback/:leaseId`
- `GET/POST /api/v1/live-tv/recordings`
- `GET /api/v1/live-tv/recordings/schedule-options`
- `POST /api/v1/live-tv/recordings/:id/cancel`
- `DELETE /api/v1/live-tv/recordings/:id`
- `POST /api/v1/live-tv/recordings/:id/playback`
- `GET/HEAD /api/v1/live-tv/recordings/:id/stream?token=...`

## Drift og fejlsøgning

TV-driftssiden på `/live-tv/operations` viser schedulerstatus, linjehealth, de seneste M3U/XMLTV-jobs og aktive leases med metode, bitrate, buffer og stall-tæller. Administratorer kan afbryde en defekt session; operators har read-only adgang.

Hver aktiv udbyder kan automatisk opdatere M3U og XMLTV med separate intervaller. Schedulerens PostgreSQL advisory lock og aktive-job-deduplikering gør den sikker ved flere API-replikaer. Udløbne leases markeres og deres streamjob annulleres, mens EPG-poster ældre end 48 timer ryddes automatisk.

- Manglende kanaler: kontrollér importjobbet og udbyderens seneste fejl i Live TV-panelet.
- Manglende guide: kontrollér XMLTV-URL, tidszone og kanalernes XMLTV-id-match.
- Ingen ledig forbindelse: kontrollér aktive leases, `perUserStreamLimit`, `maxStreams` og planens samlede streamloft.
- Stream bliver stående på klargøring: kontrollér `live-tv.stream`-jobbet og transcoderlogs.
- Chromecast: `BB_MEDIA_PUBLIC_URL` skal være offentlig HTTPS, og receiveren skal kunne hente stream-URL'en uden lokale headers.

## Backup og rollback

Det immutable Git-tag `backup-pre-live-tv-20260823` peger på den validerede version umiddelbart før Live TV. Migrationen er additiv. En kode-rollback kan derfor foretages ved at deploye tagget, mens de nye tabeller bliver liggende urørte. Slet ikke tabeller eller providerdata som del af automatisk rollback.

```bash
git fetch --tags origin
git switch --detach backup-pre-live-tv-20260823
docker compose -f docker-compose.yml -f docker-compose.updater.yml up -d --build --remove-orphans --wait --wait-timeout 300
```
