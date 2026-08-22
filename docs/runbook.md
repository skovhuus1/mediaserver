# Runbook

## Første kontrol

~~~bash
cd /home/seeds/mediaserver
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml ps
curl -fsS http://127.0.0.1:6555/api/v1/system/health
curl -fsS http://127.0.0.1:6555/api/v1/system/ready
~~~

**health** beviser API-processen. **ready** kontrollerer PostgreSQL og Redis. Adminens Diagnostics-side viser derudover worker-heartbeats, CPU, RAM, mounts, jobs og aktive playbacks.

## Logs

~~~bash
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  logs --no-color --tail=200 api worker transcoder admin proxy
~~~

Brug adminens systemlog til account-scopede job-, scanner-, updater- og runtimefejl. Hemmeligheder og signed stream-querystrings må ikke kopieres til tickets.

## 502 Bad Gateway

Kontrollér i rækkefølge:

1. **docker compose ps**
2. API healthstatus
3. API-log
4. proxy-log
5. PostgreSQL og Redis health
6. om proxyen blev genstartet efter containerudskiftning

~~~bash
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml restart proxy
~~~

## Updater

### Deaktiveret

Kontrollér de faktiske container-envs:

~~~bash
sudo docker inspect boltbytes-media-api-1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' |
grep '^BB_MEDIA_UPDATE'
~~~

Efter envændring skal API-containeren genskabes, ikke kun genstartes.

### FETCH_HEAD permission denied

Hostens repository og containerbrugeren har forskellige UID/GID. Kontrollér:

~~~bash
stat -c '%u:%g %A %n' .git .git/FETCH_HEAD
sudo docker exec -u node boltbytes-media-api-1 \
  sh -lc 'id; stat -c "%u:%g %A %n" "$BB_MEDIA_UPDATE_REPO_PATH/.git" "$BB_MEDIA_UPDATE_REPO_PATH/.git/FETCH_HEAD"'
~~~

Ret ejerskab til den valgte driftsmodel og genskab containeren. Undgå at køre skiftevis som root, hostbruger og containerbruger mod samme Git-database.

### index.lock findes allerede

Den aktuelle updater kontrollerer hostens PID-namespace. En lock under fem minutter eller med en aktiv ejer blokeres med PID og alder. En ældre lock uden ejer fjernes automatisk lige før checkout.

En server, der endnu ikke har lock-rettelsen, kræver én manuel bootstrap. Stop først API-processen, så den ikke kan eje eller genoprette låsen. Kontrollér derefter hosten og fjern kun låsen uden ejer:

~~~bash
cd /home/seeds/mediaserver
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml stop api
if sudo fuser .git/index.lock >/dev/null 2>&1; then
  sudo fuser -v .git/index.lock
  echo "STOP: locken har stadig en aktiv ejer"
  exit 1
fi
sudo rm -f .git/index.lock
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml start api
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml restart proxy
~~~

Brug aldrig `reset --hard` som lock-recovery.

### update_dirty_worktree

Commit eller fjern kun de tracked ændringer, du ejer. Updateren ignorerer ikke tracked driftstilpasninger.

### update_not_fast_forward

Updateren accepterer:

- up-to-date
- fast-forward
- squash-equivalent tree i målbranchens historik

Reel divergens blokeres. Gennemgå commits manuelt; brug ikke reset hard.

### Stuck operation

Se updaterens fase og runnerlog i admin. Bekræft, om Docker stadig bygger. Genstart ikke midt i en aktiv image-build uden at have fastslået processen.

## Scanner

Ved **ENOENT /media/media/...** er bibliotekspath typisk gemt med dobbelt mountprefix. Hvis hostens **MEDIA_PATH** bliver **/media** i containeren, skal biblioteket være **/media/Kategori-Film**, ikke **/media/media/Kategori-Film**.

Kontrollér:

~~~bash
sudo docker exec -u node boltbytes-media-worker-1 \
  sh -lc 'realpath /media; find /media -maxdepth 2 -type d | head -100'
~~~

Scannerfejl undersøges via Operationscenter, systemlog og workerlog. Bekræft:

- path findes i workerens mount namespace
- worker har læseadgang
- realpath ligger under storage root
- ffprobe findes
- symlink ikke bruges som genvej uden for root

Parallelitet styres af **BB_MEDIA_SCAN_MAX_CONCURRENT** og **BB_MEDIA_METADATA_MAX_CONCURRENT**.

## Playback

### Ingen læsbar fil

Kør biblioteksscan og kontrollér filstatus. En media item uden en ready MediaFile må ikke autoriseres.

### 401

Token mangler, er udløbet eller matcher ikke sessionens hash. Start ny playbackauthorization.

### 410

Lease er udløbet, sessionen er stoppet, eller device/user er revokeret.

### 416

Range er ugyldig eller indeholder flere ranges. BoltBytes understøtter én byte-range pr. request.

### Transcoding starter uventet

Se playbackdecision og klientkapabiliteter i Diagnostics. Container, video, audio, subtitles, HDR-mode, bandwidthloft og plan kan hver især kræve remux eller transcode.

### A/V sync

Kontrollér source timestamps med ffprobe, valgt playbackmetode og transcoderlog. Direct Stream skal bevare timestamps korrekt; HLS-segmenter skal starte på aligned keyframes.

## Backup og restore

Opret en manuel backup før migrations- eller driftsændringer. Download backupen og opbevar **.env/ENCRYPTION_KEY** separat.

Restore blokerer ved aktive streams/jobs. Brug restore-planen i admin; omgå ikke challenge eller safety backup.

Hvis import afvises, kontrollér account, migrationsversion, ENCRYPTION_KEY, filstørrelse og proxyens client body limit.

## Sonarr og Radarr

Ved offline status:

- test URL fra API-containerens netværk
- kontrollér API key
- kontrollér at URL ikke redirecter
- brug container DNS-navn ved samme Docker-netværk

En webhook med eventtypen **Test** skal returnere 202 uden scan. En importevent skal vise last webhook og enten queue et scan eller referere til det allerede aktive scan.

## Direkte installation

~~~bash
systemctl status bb-media.target
journalctl -u bb-media-api -u bb-media-worker -u bb-media-transcoder -u bb-media-admin --since '30 minutes ago'
nginx -t
~~~

## Migrationfejl

Stop applikationsservices, opret backup og inspicér Prisma-fejlkoden. Kør aldrig reset af produktionsdatabasen. Gendan kun en kompatibel backup.
