# BoltBytes Media Server

## Playback-analyse v2: repræsentative previews og sikker intro-konsensus

Playback Lab analyserer nu serier på tværs af episoder i stedet for at gætte ud fra én enkelt fil:

- Workeren opretter et separat `preview.jpg` med FFmpegs repræsentative frame-udvælgelse, så adminpanelet ikke blot viser seriens sorte åbningsframe.
- Fingerprint-format v2 gemmer både perceptuelle hashes og en eksponerings-/kontrastscore pr. frame. Sorte, hvide og visuelt tomme frames tæller ikke som introbevis.
- Automatisk intro kræver som standard konsensus fra mindst to andre analyserede episoder. En ny episode genanalyserer samtidigt tidligere episoder, så de første episoder kan få markøren, når serien har nok data.
- Eksisterende manuelle markører og kapitelmarkører har altid forrang og overskrives ikke af den automatiske analyse.
- Playback Lab viser repræsentativt preview, visuel markørtidslinje, referenceantal, brugbare frames og en konkret årsag: fundet, afventer episoder, for mørkt/ensartet eller ingen sikker gentagelse.
- API-previewet resolver asset-stier under `TRANSCODE_PATH` og afviser stier uden for denne rod.

Eksisterende playback-assets opgraderes ved at vælge **Genopbyg analyse** på en titel eller **Analysér manglende** i Playback Lab. Bedst serie-resultat kræver mindst tre analyserede episoder med samme serieidentitet. Manuel kontrol er fortsat nødvendig for serier med bevidst varierende, meget korte eller næsten helt sorte introsekvenser.

Valideret 22. august 2026 med grøn `npm run ci` (lint, typecheck, 46 API-testfiler/153 tests, 8 worker-testfiler/15 tests og alle builds) samt separat grøn fingerprint-kontrakttest med 7 tests. Den resterende driftsgate er real-media-verifikation i servercontaineren med mindst tre episoder fra samme serie.

## Leverance 2026-08-22: Plex-lignende kundeportal og samlet opgavecenter

- Kundeportalen bruger nu den personlige anbefaling som reel filmisk hero med korrekt TMDB/TVDB-billedsti, skarpere navigation, kompakte bibliotekstal og vandrette mediehylder med egne pile uden native scrollbars.
- Adminpanelet har en ny `Opgaver`-fane, som samler biblioteksscan, metadata og playback-analyse. Fanen viser account-scopet kø, workerstatus, forsøg, fejl, mål, tidsstempler og levende fremdrift.
- Metadatajobs rapporterer præcist antal behandlede og samlede titler. Biblioteksscans rapporterer løbende filantal, og playback-analyse viser navngivne FFmpeg-faser fra probe til seek-preview og markører.
- Playback-analyse kan nu sætte alle manglende analyser i kø på én gang. API'et understøtter også kontrolleret genopbygning af alle film, serier eller begge med deduplikering mod aktive jobs.
- Nye kontrakter: `GET /api/v1/system/jobs` og `POST /api/v1/media/playback-assets/jobs`.

Opgavevisningen er en præsentation af den eksisterende holdbare `SystemJob`-ledger, ikke en separat browserkø. Jobs fortsætter derfor efter navigation og worker-genstart. Operators har read-only adgang; kun administratorer kan starte batcharbejde. Fysisk visuel QA på produktionsdomænet og tidsmåling på serverens rigtige mediebibliotek forbliver en staging-gate efter deployment.

Valideret lokalt på den kombinerede branch: fuld `npm run ci`, 46 API-testfiler med 152 tests, 7 worker-testfiler med 13 tests samt contracts-, API-, worker- og Next.js-produktionsbuild. Ingen databaseændring eller migration er nødvendig, fordi levende fremdrift gemmes i jobbenes eksisterende JSON-payload.

## Mediekompatibilitets-certificering

Worker-image'et indeholder en read-only certificeringskommando til rigtige biblioteksfiler. Den læser de eksisterende scannerdata fra PostgreSQL, bygger en matrix over container, video, opløsning, HDR, lyd og indlejrede undertekster og vælger repræsentative filer med størst mulig codec-dækning.

For hver valgt fil kontrolleres:

- at den scannede fil stadig findes inden for det konfigurerede storage-root;
- frisk FFprobe-læsning og kort video-/lyddecode;
- Direct Stream-lignende video-copy med AAC-remux til MPEG-TS;
- embedded tekstundertekst til WebVTT;
- billedbaseret subtitle-overlay, når PGS/VobSub findes;
- sidecar SRT/WebVTT-konvertering, når et matchende spor findes;
- kort softwaretranscoding til H.264/AAC.

Kør efter opdatering af worker-containeren:

```bash
sudo docker compose exec -T worker \
  node services/worker/dist/media-certification-cli.js \
  --max-samples 24 \
  --seconds 3
```

Rapporterne gemmes som JSON og Markdown i `/app/data/certification` i containeren og dermed i det persistente `application_data`-volume. Kommandoen viser de konkrete rapportstier og returnerer exitkode `1`, hvis en repræsentativ fil eller runtime-test fejler. Absolutte storage-stier skrives ikke i rapporten, og midlertidige remux-filer slettes efter hver prøve.

Brug `--concurrency 1` på en aktiv server. `--no-transcode` kan bruges til en let inventory/decode/remux-kørsel, og `--account-id <uuid>` kan afgrænse fler-account installationer. Certificeringen erstatter ikke fysisk browser-, Android TV- eller Chromecast-acceptance, men identificerer præcist hvilke lokale codec-kombinationer der kræver efterfølgende klienttest.

## Leverance 2026-08-21: mobil/TV-polish og deterministiske undertekster

- Flutter-playeren respekterer nu profilens fire underteksttilstande: `Fra`, `Automatisk`, `Kun tvungne` og `Altid`.
- `Automatisk` aktiverer kun et markeret forced-spor. Normale danske eller engelske spor bliver ikke længere slået til ved hver film eller episode.
- Et manuelt sporvalg eller `Fra` bevares gennem seek, stream-rekonfiguration, kvalitetsændring og Cast-genindlæsning i den aktuelle player-session.
- Sidecar-, embedded- og billedbaserede undertekster eksponerer nu et eksplicit `forced`-flag fra filnavn eller FFprobe-disposition i stedet for at klienten skal gætte ud fra visningsteksten.
- Skift væk fra burn-in genautoriserer streamen ved den aktuelle position, så billedteksten ikke bliver siddende i videobilledet.
- Kvalitetsmenuen viser den valgte faste rendition, og startside-/logo-navigationens fejl fra den igangværende UI-runde er rettet.

Valideret lokalt i denne leverance:

- `npm run lint`: bestået.
- `npm run typecheck`: bestået for contracts, API, worker og admin.
- `npm run test`: 45 API-testfiler med 149 tests og 5 worker-testfiler med 9 tests bestået.
- `npm run build`: contracts, NestJS API, worker og Next.js admin bestået.
- `flutter analyze`: ingen findings.
- `flutter test`: 19 tests bestået.
- Android mobile debug-APK: bygget med produktions-API-URL.
- Android TV debug-APK: bygget med produktions-API-URL.

Fysisk afspilning, fjernbetjeningsfokus og Chromecast discovery kræver fortsat rigtig Android-/TV-/Cast-hardware og er derfor en separat staging-gate. På feature-branchen bestod både push- og PR-varianterne af serverens `validate`-job og Flutter-klientens `validate`-job.

## Leverance 2026-08-20: Mobile TV UI polish (TV-actions og mediekort)

- TV-titelskærmen har fået en samlet action-række med:
  - `Fortsæt`/`Afspil`
  - `Afspil fra start`
  - Download
  - Gem/fjern fra liste
  - Markér set/uselset
- Serielogikken i TV-handlingen bruger nu tydeligere branch: hvis serien er startbar vælges afsnit korrekt, ellers bruges normal medie-start (inkl. gemt position).
- Mediekort-komponenten er opdateret med stærkere fokus-state, renere skygge, tydeligere overlay med titel/ikoner og bedre badge/prøgressionsindikator på TV.
- Disse ændringer er formatteret (`dart format`) og har ingen `flutter analyze`-issues på de redigerede filer.
- GitHub-push: `agent/encrypted-offline-mobile-release` med commit `d769357`.

Manglende efter denne leverance:
- Finere UI-polish af login- og anbefalingsflowet på TV.
- Bedre global topmenu-oplevelse for hurtig genre/sektion-navigering i TV- og mobilvisning.
- Endelig tuning af knapstørrelser/afstande på meget store TV-skærme.

## Leverance 2026-08-19: krypteret offline, push, crash-ledger og Android-release

Denne leverance gør Android- og Android TV-klienten klar til en kontrolleret produktionsudgivelse på fire områder:

- Offline-medier gemmes i formatet `.bbenc` med AES-256-GCM i uafhængige 1 MiB-blokke. Hver blok har tilfældig nonce og autentifikationstag, så manipulation opdages ved afspilning.
- Krypteringsnøglen genereres som en ikke-eksporterbar Android Keystore-nøgle pr. download. En kopieret fil kan derfor ikke afspilles på en anden enhed eller efter sletning af appens nøgle.
- Android WorkManager henter og krypterer direkte til en midlertidig krypteret fil og committer først den færdige container. Der oprettes ikke en færdig ukrypteret mediefil på enheden.
- Offline-playeren læser kun gennem en tokenbeskyttet loopback-server på `127.0.0.1`. Serveren understøtter `HEAD`, byte ranges og autentificeret blokvis dekryptering, så seeking ikke kræver dekryptering af hele filmen.
- Eksisterende `.mp4`-offlinefiler slettes ved første opstart med den nye klient og kan ikke afspilles. Titlerne skal hentes igen; der findes ingen usikker legacy-fallback.
- Firebase Cloud Messaging-tokenet bindes server-side til account, user, aktiv profil og device. Tokenrotation deaktiverer tidligere tokens for samme device.
- Notifikationer har en server-side indbakke og leveringsstatus. En færdig offline-klargøring opretter automatisk en notifikation; `POST /api/v1/client-services/notifications/test` kan bruges til en kontrolleret ende-til-ende-test.
- Flutter framework-fejl, ufangede Dart-fejl og seneste native Android-crash køes krypteret lokalt og sendes til den selvhostede crash-ledger efter login. Authorization, cookies, passwords, secrets og token-queryparametre redigeres før lagring.
- Produktionsworkflowet kræver rigtig release-keystore, bygger mobil-APK, Android TV-APK og Google Play AAB og kan efter eksplicit valg publicere til `internal`, `alpha`, `beta` eller `production` via Android Publisher API.

### Sikkerhedsgrænser for offline

Offline-licensen kontrolleres før den lokale dekrypteringsserver startes. En enhed uden netværk kan ikke modtage en øjeblikkelig tilbagekaldelse; derfor er den eksisterende licensudløbstid den hårde offlinegrænse. Suspension og device-revocation forhindrer fornyelse. Android Keystore beskytter nøglen mod normal filkopiering, men en kompromitteret/rootet enhed ligger uden for DRM-garantien.

Kun loopback-trafik må bruge klartekst. Androids network security config afviser almindelig HTTP til eksterne hosts; produktions-API’en skal derfor være `https://media.boltbytes.com/api/v1`.

### Push-konfiguration

Serverens worker kræver Firebase-servicekontoen som base64-kodet JSON i `.env`:

```bash
BB_MEDIA_FCM_SERVICE_ACCOUNT_JSON_BASE64=<base64-af-service-account-json>
BB_MEDIA_NOTIFICATION_MAX_CONCURRENT=4
```

Android-buildet kræver disse Dart-defines for rigtig push. Hvis de mangler, starter klienten fortsat, men viser push som ikke konfigureret og bruger kun serverindbakken:

```text
BB_MEDIA_FIREBASE_API_KEY
BB_MEDIA_FIREBASE_APP_ID
BB_MEDIA_FIREBASE_MESSAGING_SENDER_ID
BB_MEDIA_FIREBASE_PROJECT_ID
```

GitHub Actions bruger repository variable for `BB_MEDIA_FIREBASE_APP_ID`, `BB_MEDIA_FIREBASE_MESSAGING_SENDER_ID` og `BB_MEDIA_FIREBASE_PROJECT_ID` samt secret `BB_MEDIA_FIREBASE_API_KEY`. FCM-servicekontoen til serveren og Play-servicekontoen er to særskilte rettigheder og bør ikke genbruges.

### Crash-ledger og klientservices

Følgende kontrakter er aktive under `/api/v1/client-services`:

```text
POST   /push/register
DELETE /push/register
GET    /notifications
POST   /notifications/:id/read
POST   /notifications/read-all
POST   /notifications/test
POST   /crashes
GET    /crashes                 admin/operator
```

Crash-ledgeren deduplikerer samme fingerprint fra samme device i 15 minutter og øger `occurrences`. Klienten gemmer højst 20 usendte rapporter i Flutter Secure Storage. Native Android gemmer kun den seneste ufangede fejl i appens private storage indtil næste opstart.

### Google Play og Android TV

Workflowet `.github/workflows/android-release.yml` kræver de eksisterende Android-keystore-secrets. Ved Play-publicering kræves desuden secret `BB_MEDIA_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64`. Servicekontoen skal være knyttet til Play Console og have rettighed til den valgte track for pakken `com.boltbytes.boltbytes_media`.

Kør workflowet manuelt, angiv semantisk version, vælg `publish_play=true`, og start med `internal`. Et tag `android-vX.Y.Z` bygger og publicerer fortsat GitHub Release-artefakter, men skubber ikke automatisk til Play. Release-konfigurationen sætter `BB_MEDIA_REQUIRE_PRODUCTION_SIGNING=true`; manglende eller ufuldstændig keystore stopper buildet i stedet for at falde tilbage til debug-signering.

Før promotion ud af internal track skal disse fysiske gates dokumenteres:

- Krypteret download, airplane-mode playback, seeking og udløbet licens på en rigtig telefon og Android TV-enhed.
- FCM i foreground, background og terminated state.
- Installation/opgradering fra signerede Play-artefakter.
- Chromecast-certificering på fysisk Cast-hardware er fortsat en separat gate.

Apple iOS/tvOS er ikke inkluderet i denne leverance. Det kræver macOS/Xcode, Apple-signering og fysisk validering og må ikke markeres som leveret fra Windows-CI.

### Valideringsbevis for leverancen

Følgende gates blev kørt lokalt på den færdige ændring:

```text
npm run ci                                      PASS
npx prisma validate                            PASS
API unit tests                                 45 filer / 148 tests PASS
Worker unit tests                               5 filer / 9 tests PASS
flutter analyze                                PASS, 0 findings
flutter test                                   18 tests PASS
flutter build apk --debug                      PASS
flutter build appbundle --release              PASS, app-release.aab 54.3 MB
production signing guard uden credentials      PASS, build afvist som forventet
```

Release-AAB’en ovenfor blev kun brugt som lokal compile/lint-gate og er ikke et udgivelsesartefakt, fordi den lokale maskine ikke havde produktions-keystore. Rigtig FCM-levering, Play Console-publicering og krypteret offlineafspilning på fysisk Android/Android TV forbliver eksterne release-gates og skal dokumenteres separat; de er ikke antaget bestået.

## Seneste leverance: Offline-downloads og fysisk Android-certificering

- Mobilklienten kan sætte film og enkelte episoder i kø som 360p, 480p, 720p eller 1080p offlinefiler. Serveren håndhæver fortsat profilens `allowOfflineDownload` og opløsningsloft.
- En separat `offline.prepare`-jobtype producerer atomisk H.264/AAC MP4 i transcode-volumen. Jobbet deler transcode-kapacitet med almindelig playback og fornyer worker-leasen under lange filer.
- Android DownloadManager fortsætter selve overførslen i baggrunden og understøtter Range/resume. Manifest, token og lokal sti gemmes krypteret og er bundet til aktiv profil og registreret enhed.
- Offlinebiblioteket kan åbnes uden serverforbindelse, hvis en gyldig lokal licens og fil findes. Afspilningsposition gemmes lokalt og synkroniseres til normal playback-historik ved næste forbindelse.
- Licenser gælder 30 dage og kan kun fornyes, hvis entitlement stadig tillader download. Download-URL'er har særskilte kortere tokens og giver ikke en playback-session eller ekstra streamreservation.
- `node scripts/certify-android.mjs` installerer en valgt APK via ADB, kontrollerer server-health, starter appen og gemmer device-info, screenshot, logcat, activity- og media-session-data samt en manuel mobil/TV/Cast/offline-checkliste.

Eksempel:

```bash
node scripts/certify-android.mjs \
  --apk clients/mobile-tv/build/app/outputs/flutter-apk/boltbytes-media-mobile-debug.apk \
  --server https://media.boltbytes.com \
  --variant mobile
```

Offline kræver, at den aktive planversion eller et entitlement-override har `allowOfflineDownload=true`. Fysisk Chromecast-certificering kan ikke erstattes af CI; checklisten skal gennemføres med en rigtig Cast-enhed på samme netværk.

## Seneste leverance: Playback-analyse, serieoplevelse og lokal discovery

- Adminpanelet har nu en funktionel `Playback-analyse` med søgning, statusfiltre, worker-fejl, trickplay-målinger, første sprite-preview og automatisk polling under behandling.
- Administratorer kan gemme validerede intro-, recap- og rulletekstmarkører, nulstille til automatisk analyse og tvinge en sikker genopbygning. Operators har fortsat read-only adgang, og alle ændringer auditlogges.
- Kundeportalen samler episodefiler til én serieoplevelse med sæsonfaner, watched/progress-status, fortsæt-valg, næste episode, episodekø og synlige intro/recap/credits-egenskaber.
- Webplayeren viser nu en reel `Spring recap over`-handling, som søger direkte til recap-markørens slutpunkt, samt en særskilt recap-markering på tidslinjen.
- Titelsider linker til lokale person- og samlingssider. Personer, serier, genrer og provider-lignende titler filtreres altid mod filer, som faktisk findes på den aktive konto.
- Nye API-kontrakter: `GET /api/v1/playback-analysis`, `GET/POST/PUT/DELETE /api/v1/playback-analysis/:mediaId/*` samt `GET /api/v1/experience/titles|people|collections/*`.
- Fasen kræver ingen ny database-migration. Den genbruger `MediaPlaybackAsset`, `MediaTimelineMarker`, katalogmetadata og profilscopet playback-historik.
- Verificering for denne leverance dokumenteres i PR'en og CI. Fysisk real-media/cast-certificering på produktionsserveren er fortsat en separat driftsgate.

## Playback Certification og live QoE (2026-08-17)

Implementeret i denne leverance:

- Playback-sessioner gemmer nu faktisk bitrate, HLS-båndbreddeestimat, buffer, opløsning, tabte/dekodede frames, stalls, afspilningshastighed og valgte lyd-/undertekstspor.
- Adminpanelet opdaterer aktive afspilninger hvert andet sekund og klassificerer dem som stabile, startende, pausede, bufferende, ustabile eller uden heartbeat.
- Chromecast heartbeat bruger samme validerede kontrakt som webplayeren, rapporterer den fulde tidslinjeposition efter seek/resume og sender aldrig den ugyldige runtime-state `idle`.
- Direct Play, Direct Stream med remux/lydtranscoding, softwaretranscoding, HDR-fallback, serie-kontinuitet og seek/resume dækkes af den samlede playback-certificering.
- Systemet foretrækker fortsat Direct Play og Direct Stream på servere uden GPU; softwaretranscoding er fallback.

Fysisk Chromecast-certificering kræver fortsat en Cast-enhed på samme netværk og HTTPS. En egen BoltBytes receiver kræver et registreret Google Cast Application ID i `NEXT_PUBLIC_CAST_RECEIVER_APP_ID`; uden dette bruges Google Cast Default Media Receiver sikkert.

> Fremadrettet seek i HLS bruger nu en entydig stream-generation pr. hop. En ny position kan derfor ikke genbruge mastermanifest eller segmenter fra den oprindelige `Fortsæt med at se`-position, og superseded FFmpeg-jobs skriver ikke længere i samme outputmappe.

> Webplayeren parser og renderer nu WebVTT deterministisk mod mediets absolutte tidslinje. Det valgte undertekstspor bevares derfor ved genoptaget afspilning, HLS-opstart og seek, mens Chromecast fortsat modtager de originale WebVTT-spor.

> Playback-resume er nu hærdet mod tre konkrete fejl. Standardundertekster
> prioriterer et komplet normalt spor over korte forced/SDH-spor på samme
> sprog, og workeren skriver et atomisk manifest over de indlejrede tekstspor,
> som faktisk kunne konverteres. Ét defekt spor stopper derfor ikke længere
> filmen eller serien. Tidslinjen har separat scrub-state, så playerens løbende
> `timeupdate` ikke kan trække seek-knappen tilbage, mens brugeren spoler.
>
> Hvis browseren overrapporterer codec-understøttelse, eller en sikker
> Direct Stream-remux fejler, kan playeren bede om én fuld transcoding-fallback
> i den eksisterende playback-session og logical session. API'et foretager en
> ny entitlementkontrol før fallbacken; planer uden video-transcoding omgås
> ikke, og den oprindelige fejl vises sammen med FFmpeg-fejlen, hvis begge
> leveringsmetoder fejler.

> Docker-updateren reparerer repository-ejerskab til API-processens UID/GID
> før Git-status, fetch og checkout. Build-runneren monterer derefter
> kildekoden read-only, så root-kørslen ikke kan efterlade tracked filer eller
> mapper, som næste opdatering ikke kan erstatte.

> Kundeportalen har nu server-side serieaggregater og en rigtig
> `/watch/title/:id`-detaljeside med sæsoner, episoder, næste episode og resume.
> Katalog og anbefalinger linker konsekvent til samme titelobjekt. Playeren
> matcher lyd og undertekster på tværs af to- og trebogstavskoder, skifter HLS
> niveau direkte og viser korrekt ikon for start og afslutning af fullscreen.

> Docker-buildet prøver nu Prisma engine-downloaden op til fire gange med
> stigende ventetid i både API- og worker-images. Midlertidige udfald mod
> `binaries.prisma.sh` stopper derfor ikke updateren ved første netværksfejl.

> Updateren kan nulstille en fastlåst persistent status direkte fra
> adminpanelet. Nulstilling tillades kun, når Docker-runneren ikke længere er
> aktiv. Runner-loggens statusmarkører håndterer også terminalfarvekoder, så en
> fejlet Docker-build registreres som fejlet i stedet for at blive stående på
> eksempelvis 65 procent.

> CI-smoke dækker både eksplicit Direct Play (`original`) og adaptiv HLS
> (`auto`) med op til fire tokenbeskyttede renditions. Workflowet validerer de
> aktuelle `stream_<n>.m3u8`- og `segment_<n>_<sekvens>.ts`-kontrakter samt
> klientens `screenHeight`, pixel-ratio og estimerede netværkssignal.

> Admin-dashboardet viser live CPU/RAM og seneste player-heartbeat med tilstand,
> bitrate, opløsning og buffer. Notifikationer kan ryddes uden at slette
> scanner-/jobhistorik. Kundeportalens topmenu skifter nu synligt mellem hjem,
> film, serier og fortsæt, og tekniske release-tags skjules fra titler.
> Admin-containeren bygger den delte kontraktspakke eksplicit, så samme
> titelrensning bruges i scanner, API og browser.

> `Fortsæt med at se` anvender den gemte position efter browserens
> `loadedmetadata`/HLS-duration er klar. Resume-seeket udføres kun én gang pr.
> stream-load og bevares ved HLS og subtitle-rekonfiguration.
>
> Playerens kvalitetsvælger adskiller nu valgt tilstand fra den rendition, der
> faktisk afspilles. Auto viser det aktuelle HLS-niveau, mens et manuelt valg
> låses med Hls.js `loadLevel`, så ABR deaktiveres uden at tømme den eksisterende
> buffer, og skiftet bekræftes i UI'et, når næste niveau faktisk afspilles.
>
> Undertekster er en grundlæggende tilgængelighedsfunktion og gates ikke af
> abonnementet. WebVTT leveres direkte, mens PGS/VobSub/DVB bruger samme
> logical session til burn-in, også når planens almindelige transcodeflag er
> deaktiveret. Adgang, session, streamlimit og validering håndhæves fortsat.
>
> Docker-images tåler midlertidige npm-registry-udfald under opdatering.
> Dependency-laget bruger fem fetch-retries, op til fem minutters fetch-timeout
> og tre komplette `npm ci`-forsøg med stigende pause. En vedvarende
> netværksfejl stopper fortsat opdateringen uden at erstatte de kørende
> containere.
>
> Adminpanelets server- og metadataindstillinger bruger et responsivt mørkt
> formularsystem med tydelige labels, fokus-state, statusdiagnostik og
> ensartede handlingsknapper. Native hvide felter bruges ikke i
> indstillingsvisningen.
>
> Kundeportalens seriehylder grupperer episoder efter TVDB/TMDB-provider-id,
> derefter metadataens serienavn og først til sidst scannerens rensede titel.
> Et klik på en anbefaling åbner den valgte film eller den samlede serie med
> sæsonfaner, strukturerede episoder og profilens næste/ufærdige afsnit.

BoltBytes Media Server er en selvhostet TypeScript-platform til administration og autoriseret afspilning af egne film og serier. Kodebasen er genopbygget fra bunden med server-side adgangskontrol, reproducerbar installation og en tydelig grænse mellem implementeret funktionalitet og kommende faser.

## Hurtig installation med Docker

Krav: Docker Engine med Compose-plugin og Git.

```bash
git clone https://github.com/skovhuus1/mediaserver.git
cd mediaserver
cp .env.example .env
node scripts/bootstrap-env.mjs
docker compose up --detach --build
```

Sæt `MEDIA_PATH` i `.env` til den host-mappe, som BoltBytes må læse. Docker monterer den read-only som `/media`, og setup-guiden viser dens undermapper med både containersti og rigtig host-sti. Eksempel:

```dotenv
MEDIA_PATH=/home/seeds/Media/Films/user/google/google/external/Media
```

Åbn derefter:

```text
http://SERVERENS-IP:6555
```

## Download af Android-apps

Seneste signed builds ligger som GitHub release assets på disse links:

- Mobil (APK): `https://github.com/skovhuus1/mediaserver/releases/latest/download/boltbytes-media-mobile-release.apk`
- Android TV (APK): `https://github.com/skovhuus1/mediaserver/releases/latest/download/boltbytes-media-tv-release.apk`
- Google Play AAB: `https://github.com/skovhuus1/mediaserver/releases/latest/download/boltbytes-media-google-play-release.aab`

Bemærk:

- Linksene peger på det seneste release-artefakt med det tilsvarende navn i workflowen.
- TV-app er optimeret til fjerne controllere og stor skærm (D-pad/fokus).
- Brug Wi-Fi ved upload/download af større APK-filer.

`JWT_SECRET` og `ENCRYPTION_KEY` genereres automatisk af `scripts/bootstrap-env.mjs`. Eksisterende secrets overskrives ikke, og værdierne skrives aldrig til terminalen.

Valgfri film-/seriemetadata kan aktiveres direkte under `Indstillinger > Metadata` med en TMDB API Read Access Token. Nøglen testes før lagring, krypteres med serverens `ENCRYPTION_KEY` og sendes aldrig tilbage til browseren. Miljøvariablen bevares som fallback:

```dotenv
TMDB_API_TOKEN=
TMDB_LANGUAGE=da-DK
```

Nøglerne bruges kun af API/worker. TMDB leverer film, anbefalingsdata og kan bruges som fallback til serier. TVDB leverer serie-, sæson- og episodemetadata, når en TVDB API-nøgle er konfigureret.

## Direkte installation uden Docker

Direkte installation fungerer Plex-lignende som tre systemd-services bag nginx. Serveren skal have Node.js 22, npm 10+, PostgreSQL 16, Redis 7, FFmpeg/ffprobe, nginx, Git og sudo.

1. Opret PostgreSQL-databasen og brugeren, som er angivet i `.env.direct.example`.
2. Kør `sudo bash scripts/install-direct.sh`.

Installeren bygger API, admin og worker, anvender migrationer, opretter systemd-services, konfigurerer nginx og åbner applikationen på port `5555`. Databasen bruger normalt `5432`, Redis `6379`, API internt `3001` og admin internt `3000`; kun `6555` skal eksponeres offentligt.

## Sikker updater

Updateren kan bruges fra `Opdateringer` i adminpanelet:

- `GET /api/v1/system/update/status`
- `POST /api/v1/system/update/check`
- `POST /api/v1/system/update/apply`

Den kontrollerer remote commit og nægter at opdatere et dirty eller reelt divergeret worktree. Almindelig fast-forward accepteres direkte. Efter et GitHub squash-merge accepteres overgangen kun, når den kørende versions komplette Git tree-hash findes i målbranchens historik. Checkout sker altid til den præcise SHA, der blev valideret efter fetch.

Direkte installation aktiverer updateren og genstarter `bb-media.target` via en snæver sudoers-regel. Docker-updateren er et bevidst opt-in, fordi Docker-socket giver høj host-adgang:

```bash
docker compose -f docker-compose.yml -f docker-compose.updater.yml up --detach --build
```

Standard Docker-installation har updateren deaktiveret. Den sikre manuelle opdatering er:

```bash
git pull --ff-only origin main
docker compose up --detach --build
```

Hvis en ældre updater allerede kører på en feature-commit, der blev squash-merget, kræves én manuel bootstrap. Kommandoen må kun skifte til `main`, når den kørende tree-hash findes i `origin/main`:

```bash
cd /home/seeds/mediaserver
sudo -u seeds git fetch origin main
running_tree="$(sudo -u seeds git show -s --format=%T HEAD)"
if sudo -u seeds git log --format=%T origin/main | grep -Fxq "$running_tree"; then
  sudo -u seeds git switch --detach origin/main
else
  echo "STOP: Den kørende version findes ikke sikkert i main-historikken."
  exit 1
fi
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml up -d --build --remove-orphans --wait --wait-timeout 300
sudo docker compose -f docker-compose.yml -f docker-compose.updater.yml restart proxy
```

## Implementeret i den nye baseline

- NestJS API med `/api/v1`, OpenAPI på `/api/docs`, strukturerede fejl og correlation IDs.
- PostgreSQL-schema og initial migration for accounts, users, profiles, roles, permissions, devices, refresh tokens, plans, plan versions, entitlements, subscriptions, media, playback, audit, jobs og billing webhook-ledger.
- Atomisk førstegangsopsætning med singleton-guard, administrator, profil, storage root, standardplan og abonnement.
- Sikker setup-mappebrowser begrænset til det read-only `MEDIA_PATH`-mount med realpath-kontrol, symlink-filtrering og visning af den tilsvarende host-sti.
- Login, kortlivede JWT access tokens, hash-lagrede refresh tokens, atomisk tokenrotation, reuse-detection, logout og device revocation.
- Browserens device fingerprint bruger native `crypto.randomUUID()` med en RFC 4122 v4-fallback baseret på `crypto.getRandomValues()`, så den første opsætning også fungerer via en almindelig HTTP-serveradresse.
- Konto- og ejerskabskontrol på profiler, enheder, medier, biblioteker, abonnementer og playback sessions.
- Entitlement-evaluering med user/profile overrides, deterministiske kalendermåneder og tydelige afvisningsårsager.
- Entitlement-releasevinduer bruger en eksakt provider-dato, når den findes, og falder ellers tilbage til 1. januar i scannerens validerede udgivelsesår. Medier uden dato eller troværdigt år forbliver blokeret til administratorgennemgang.
- Playback-metodevalg uden silent fallback: browserkompatible MP4/WebM-filer bruger Direct Play, mens inkompatible codecs eller containere kun går til den serverautoriserede transcoder, når planen tillader det.
- 4K HDR-signalprofilering fra `ffprobe`: serveren genkender HDR10/PQ, HLG, Dolby Vision, HEVC og bitdybde. HEVC/Main10 kan bruge 4K HDR Direct Play på en kompatibel klient og plan; inkompatible klienter får eksplicit HDR-til-SDR tone mapping, mens kompatible HLS-klienter kan få HEVC HDR-remux eller Main10-genkodning. Dolby Vision bevares kun ved Direct Play eller bitstream-remux og mærkes aldrig fejlagtigt som bevaret efter almindelig genkodning.
- Atomisk stream reservation med Prisma-kompatibel, namespaced PostgreSQL advisory lock, frisk `READ COMMITTED`-visning efter låseventet, lease/heartbeat og kryptografisk stream-token.
- Vedvarende worker-kø med `FOR UPDATE SKIP LOCKED`, jobforsøg, retry/backoff og lease-cleanup.
- Manuel biblioteksscanning via durable `library.scan` jobs med sikker realpath-kontrol, symlink-afvisning, `ffprobe`-metadata og markering af manglende filer uden automatisk sletning.
- Valgfri planlagt biblioteksscanning pr. bibliotek fra hvert 5. minut til hver 7. dag. Workeren bruger durable jobs og PostgreSQL advisory locks, så parallelle workerinstanser ikke opretter dobbelte scanninger.
- Inkrementel ændringsdetektion sammenligner filstørrelse og ændringstid og genbruger eksisterende probe-data for uændrede filer. Nye, ændrede og tidligere manglende filer analyseres fortsat med `ffprobe`.
- Direkte medielevering med HTTP `HEAD`, single-range `GET`, `206 Partial Content`, suffix ranges og hash-valideret session-token; query strings udelades fra API-logs, og stream-access logs er deaktiveret i nginx.
- Integreret fuldskærms-webafspiller med egen tidslinje, play/pause, 10-sekunders hop, lydstyrke, hastighed, lydspor, faktiske undertekstspor, kvalitetsvalg, information, tastaturstyring og responsivt mobillayout. Server-side authorize, kortlivet stream-token, 30-sekunders lease-heartbeat, fremdriftslagring hvert 10. sekund og sikker frigivelse af stream-plads ved stop er bevaret.
- Konto-, bruger- og profilafgrænset playback-historik med idempotent upsert, positions-clamping, automatisk afslutning ved 90 procent og en live `Fortsæt med at se`-sektion, der genoptager fra den gemte position.
- Klikbare `Afspil`-handlinger på film og enkelte serieepisoder. Inkompatible filer køres gennem en separat durable `playback.transcode`-kø og FFmpeg-container, så scanning og metadataarbejde ikke blokeres af en lang film.
- Tokenbeskyttet HLS med atomisk master-manifest, separat variant-playliste, eksplicit `BANDWIDTH`, `AVERAGE-BANDWIDTH` og `RESOLUTION`, firesekunders MPEG-TS-segmenter, H.264/AAC-output, planens opløsnings-/bitrategrænser og `hls.js`-fallback i browsere uden native HLS. API'et venter som standard på tre komplette segmenter pr. rendition, og browseren venter på otte sekunders lokal buffer før start. Kvalitetsmenuen viser derfor aldrig længere en kunstig nulværdi. HLS-tokenet skrives ikke til nginx-accessloggen.
- Nye installationers administratorplan starter på `2160p/50 Mbps`. Eksisterende abonnementer beholder bevidst deres immutable planversion/snapshot og skal have en ny aktiv 4K-planversion og et abonnement på denne version, før serveren må levere 4K.
- Compose klargør det navngivne transcode-volume med en afgrænset engangs-init-container; API, worker og transcoder kører fortsat som ikke-root og starter først efter migrationer/API-health.
- Chromecast Web Sender via Google Cast Default Media Receiver og et servervalideret handoff på den eksisterende logical session. Receiveren får absolutte medie- og WebVTT-URL'er med et HMAC-signeret, sessionsbundet Cast-token, mens browserens oprindelige stream-token forbliver uændret. HLS viderefører Cast-tokenet til variant-playlister og segmenter. Playeren synkroniserer remote play/pause, seek, lydstyrke, undertekster, heartbeat og playback-historik og fortsætter lokalt, hvis Cast-sessionen afbrydes.
- Automatisk undertekstfund for `.srt`/`.vtt`-sidecars med samme filnavn samt tekstbaserede indlejrede spor (`SRT`, `ASS`, `SSA`, `WebVTT` og `mov_text`) i transcodede filer. Sidecars konverteres sikkert til WebVTT ved levering, mens workeren udtrækker kompatible indlejrede spor før streamen markeres klar.
- Scanstatus og manuel scan-trigger i admin-dashboardet.
- Funktionel adminnavigation med live film-/seriefiltrering, søgning, bibliotek-oprettelse, sikker mappevælger, scanning, brugerliste, planliste og driftsindstillinger.
- Server-side mediekatalog med paginering, tekstsøgning, bibliotek-/kategori-/typefiltre, stabil sortering, seriegruppering og kontoafgrænsede mediedetaljer. Adminpanelet har klikbare katalogkort, episodeoversigt, filterchips og fungerende sidekontroller.
- Valgfri TMDB-metadata gennem durable, deduplikerede `media.metadata` jobs. En vellykket scan køer kun manglende metadata, mens admin kan gennemtvinge en opdatering. Overview, rating, udgivelsesdato, provider-id, plakat og backdrop gemmes server-side; API-tokenet eksponeres aldrig.
- TMDB-token og metadata-sprog kan ændres uden container-genstart fra indstillingspanelet. Tokenet valideres mod TMDB, lagres AES-256-GCM-krypteret i `system_settings`, og API/worker bruger miljøvariablen som bagudkompatibel fallback.
- `Kør metadata` i indstillingerne kan gennemtvinge en ny TMDB-opdatering for alle medier, kun film eller kun serieepisoder gennem den durable worker-kø.
- Admin-katalogets detaljepanel kan sætte en titel-specifik metadata-refresh i kø og låse verificerede metadata mod automatiske overskrivninger. Begge handlinger er kontoafgrænsede, kun for administratorer og auditlogges.
- `Find korrekt match` søger de konfigurerede TMDB/TVDB-providere og viser provider-id, titel, årstal, plakat og beskrivelse før administratorens valg. Valget valideres igen server-side mod providerens detail-endpoint før lagring.
- Manuelle film-match bindes til den enkelte katalogpost. Seriematch bindes til bibliotekets normaliserede lokale serienavn, opdaterer alle nuværende episoder og genbruges automatisk til fremtidige episoder fra senere scans.
- Biblioteksformularer bevarer deres DOM-reference gennem async API-kald, og scannerens lagrede workerfejl vises direkte i bibliotek- og statusvisningen.
- Indstillinger indeholder en durable fejllog med fejlede og delvist fejlede scanninger, worker-jobforsøg, tidsstempler og diagnostiske detaljer; updaterfejl viser også den konkrete kommandofejl.
- Next.js adminskal inspireret af den godkendte BoltBytes-reference med rigtige API-data og tomme tilstande uden mock-film.
- Docker Compose med PostgreSQL, Redis, API, admin, worker og nginx reverse proxy.
- Prisma-klienten genereres under Docker-buildet og kopieres med de nødvendige engines til API- og worker-runtime-images; OpenSSL er eksplicit installeret i begge images.
- Direkte Linux/systemd-installation uden Docker.
- Sikker updater med fast-forward som standard og eksakt tree-verificeret overgang efter squash-merge.
- Docker-updater med valideret GitHub branchvalg, database-gemt valg, SHA-låst checkout, synlige overgangstyper/blocker-årsager og bevaret updater-overlay efter genstart.
- Updaterens Git-processer accepterer kun det eksakte konfigurerede repo som `safe.directory`, så host-mountet virker med den ikke-root API-bruger uden en usikker global wildcard-undtagelse.
- CI-gates på Node.js 22 for migration, lint, typecheck, unit/integration tests, builds, dependency audit, Docker builds og rigtig Compose-opstart; workflow-actions bruger Node-24-kompatible v5-runtimes.

## Valideringsstatus

Lokalt valideret med Node.js 22 og npm 10:

- Prisma client generation og schema validation.
- ESLint.
- TypeScript typecheck for shared contracts, API, worker og admin.
- 93 unit tests; en citeret cross-platform glob holder alle database-integrationstests i det separate `test:integration`-step, som kun kører mod en URL med `bbmedia_test`.
- Produktionsbuild af shared contracts, NestJS API, worker og Next.js admin.

PostgreSQL-integrationstesten og Docker Compose/container-build kan ikke køres lokalt på den aktuelle Windows-maskine uden lokal PostgreSQL-testdatabase og Docker. De er verificeret i [GitHub Actions-run 30304933724](https://github.com/skovhuus1/mediaserver/actions/runs/30304933724), hvor følgende gates passerede:

- Initial migration på en frisk PostgreSQL 16-database.
- Samtidighedstest: ved to parallelle reservationsforsøg og stream-limit 1 accepteres præcis ét.
- Redis/PostgreSQL service health.
- Produktionsaudit med 0 kendte sårbarheder på high-niveau eller højere.
- Docker Compose-konfiguration og container-build af API, admin og worker.

Den samlede fase-2 medie-, playback- og historikpipeline er verificeret i [GitHub Actions-run 30398129039](https://github.com/skovhuus1/mediaserver/actions/runs/30398129039):

- Migration `0002_media_pipeline` anvendes efter fase-1-migrationen på en frisk PostgreSQL 16-database.
- Unit- og integrationssteps køres separat, så rene policytests ikke afhænger af en database, mens reservations- og katalogkontrakter valideres mod PostgreSQL.
- To samtidige scan-triggers opretter præcis én scan-ledger og ét durable worker-job.
- Stream reservation ved limit 1 accepterer fortsat præcis én af to samtidige requests.
- API, admin, worker og den isolerede transcoder bygges, produktion-audit er grøn, Compose valideres, og FFmpeg-laget bygges.
- CI genererer en rigtig MP4, opretter server/admin/bibliotek gennem API’et, sætter en scan i kø og kræver, at worker/ffprobe registrerer mindst ét afspilleligt medie.
- CI autoriserer derefter den importerede MP4 til Direct Play, kræver en tokenbeskyttet `206 Partial Content` Range-response gennem nginx, finder og konverterer en dansk SRT-sidecar, validerer origin-specifik media-CORS, gemmer 25 procent fremdrift, finder mediet i `Fortsæt med at se` og kræver, at 95 procent markerer det afsluttet. Den samme fil tvinges derefter gennem transcoding, hvor CI kræver en master med ikke-nul kvalitet, en tokenomskrevet variant-playliste og et ikke-tomt tokenbeskyttet segment.

CI tester en lille rigtig MP4 gennem nginx, men afspiller endnu ikke en stor fil eller host-specifikke mountrettigheder. Det kræver fortsat en staging-server med det faktiske read-only media mount og en rigtig browser.

Container-gaten starter desuden hele Compose-stakken efter image-build, venter på API-health, kontrollerer at worker-processen forbliver kørende og kalder health-endpointet gennem nginx. Det beskytter mod runtime-fejl, som et isoleret `docker compose build` ikke kan opdage, herunder en manglende genereret Prisma-klient.

Eksisterende biblioteker fra den tidligere path-policy repareres automatisk ved scanning, når en gemt sti har det kendte dobbelte storage-root-mønster (for eksempel `/media/media/Film`). Reparationen udføres kun, hvis den oprindelige sti mangler, den korrigerede sti findes, og dens `realpath` fortsat er under det konfigurerede storage root. CI fremprovokerer legacy-formatet og kræver både vellykket import og permanent databaseheling.

Docker-opdateringer genstartes af en ekstern engangs-runner med navnet `boltbytes-media-updater-runner`. Runneren oprettes fra det kørende API-image, overlever at API-containeren bliver erstattet og udfører Compose-build/genstart fra det mountede repository. Den venter på healthy services og genstarter derefter nginx-proxyen, så dens DNS-cache ikke peger på en udskiftet API- eller admin-container. Seneste updater-log kan altid læses med `docker logs boltbytes-media-updater-runner`; næste opdatering erstatter den tidligere runner.

Adminpanelet viser updaterens faktiske fremdrift fra worktree-kontrol, fetch og overgangsvalidering til checkout, Docker-build, container-health og proxy-restart. Git-faser gemmes durabelt i `system_settings`, mens runneren udsender strukturerede statusmarkører. Den nye API-container kan derfor fortsætte samme procent-, fase- og logvisning efter genstart; midlertidige 502-svar vises som en forventet genstartsperiode. Endpointet `GET /api/v1/system/update/progress` er kun tilgængeligt for administratorer.

Admin-klienten roterer automatisk access- og refresh-tokens. Parallelle 401-svar samles om én refresh-request, hvert oprindeligt API-kald gentages højst én gang, og sessionen slettes kun ved et bekræftet ugyldigt refresh-token. Midlertidige netværks- og 5xx-fejl under en opdatering bevarer sessionen, så administratoren kan prøve igen, når serveren er healthy.

Biblioteker kan oprettes, redigeres, flyttes mellem storage roots og slettes fra admin-panelet. Opret/ret realpath-validerer den valgte mappe og afviser manglende, ulæselige eller symlink-escaped stier. Redigering og sletning blokeres under queued/running scans, og sletning fjerner kun katalogdata, aldrig mediefiler på storage.

Bibliotekssletning blokeres også, mens et medie har en aktiv, ikke-udløbet playback-lease. Når biblioteket kan slettes, fjernes dets afsluttede sessions, reservationer og historik transaktionelt før katalogdataene, så referentiel integritet bevares uden at røre mediefilerne.

Biblioteksscanneren klassificerer filer deterministisk før ekstern metadataopslag. Film får renset titel, årstal og kategori fra mappestrukturen. Serie- og mixed-biblioteker genkender `S01E02`, `1x02`, `Season 01`, `Sæson 01` og `S01`, og gemmer kategori, serienavn, sæson og episode server-side. CI verificerer klassifikationen gennem en rigtig scannet MP4 og unit tests dækker film, serier og mixed-biblioteker.

Automatisk scanning aktiveres under `Biblioteker > Rediger bibliotek`. Intervallet gemmes i databasen, og bibliotekssiden opdaterer queued/running/completed/failed-status hvert tredje sekund. Schedulerens kontrol kører hvert 30. sekund, men opretter først et job, når bibliotekets valgte interval er udløbet. En schedulerfejl logges isoleret og stopper ikke workerens øvrige jobbehandling.

Manuel metadata-matchning åbnes fra en titel i admin-katalogets detaljepanel. `GET /api/v1/media/:id/metadata/matches?q=...` udfører kun søgning, mens `POST /api/v1/media/:id/metadata/match` validerer provider-id'et, opretter eller erstatter den varige binding, låser de berørte katalogposter og opretter et durable `media.metadata`-job. Kun administratorer har adgang; valg, omfang, provider-id, job-id og antal berørte katalogposter gemmes i auditloggen. Oplåsning bevarer bindingen, men tillader automatiske metadataopdateringer fra den samme valgte provider.

## Ikke implementeret endnu

- Automatisk oprettelse af flere biblioteker ud fra mappestrukturen; klassifikation og mappebaserede kategorier er implementeret, men biblioteker oprettes fortsat bevidst af administratoren.
- Lokal caching/proxying af TMDB-billeder; den nuværende implementation gemmer validerede billedstier og henter billeder direkte fra TMDBs faste image-host.
- Hardwareaccelereret videodekodning og CUDA-baseret 4K tone mapping. NVENC-encoding er opt-in og implementeret, mens decode/filtergrafen fortsat kører i software; SDR tone mapping bruger fortsat `zscale`/`tonemap`.
- Egen Chromecast receiver er fortsat en senere fase; Direct Stream virker med den nuværende Default Media Receiver gennem en absolut HTTPS-HLS-URL.
- Automatisk næste episode, intro-/recap-markører og burn-in/OCR af billedbaserede undertekster som PGS/VobSub. Tekstbaserede sidecars og indlejrede tekstspor er implementeret.
- Egen brandet Chromecast receiver og receiver-ejet heartbeat efter controllerfanen lukkes. Den nuværende Default Media Receiver kræver fortsat, at fanen forbliver aktiv, at `BB_MEDIA_PUBLIC_URL` eller serverens eksterne URL kan nås fra Chromecast-enheden, og at webpanelet åbnes via HTTPS. Ved privat HTTPS skal certifikatet være gyldigt på receiveren.
- TVDB-provider; TMDB er den aktive provider for både film og serier.
- Kortlivet separat receiver-token i stedet for det nuværende sessionbundne stream-token.
- Sonarr, Radarr og qBittorrent integration.
- Billing-provider og webhook-signaturverifikation.
- iOS og øvrige native klienter samt signerede Android-release artifacts. Android/Android TV-fundamentet findes nu i `clients/mobile-tv`.
- Backup/restore-automatisering og release artifacts.

Scannerens titel er i denne fase afledt af filnavnet. Scanning startes manuelt fra API/admin; automatisk filesystem watching og planlagte scanninger er endnu ikke implementeret. De øvrige punkter må ikke betragtes som implementeret, selv om fundamentet er forberedt.

## Udvikling

```bash
cp .env.direct.example .env
node scripts/bootstrap-env.mjs
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Kvalitetsgates:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
npm audit --omit=dev --audit-level=high
docker compose config
```

## API-overblik

- `/api/v1/setup/*`
- `/api/v1/auth/*`
- `/api/v1/users/*`
- `/api/v1/profiles/*`
- `/api/v1/devices/*`
- `/api/v1/plans/*`
- `/api/v1/plan-versions/*`
- `/api/v1/subscriptions/*`
- `/api/v1/entitlement-overrides/*`
- `/api/v1/entitlements/evaluate`
- `/api/v1/libraries/*`
- `/api/v1/media/*`
- `/api/v1/playback/*`
- `/api/v1/system/*`

## Repository-flow

Alt arbejde sker på en opgavebranch. Branch-commits pushes til GitHub efter en færdig og dokumenteret chunk. `main` opdateres først, når hele leverancen er valideret og accepteret.

## Dokumentation

- [Arkitektur](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [Runbook](docs/runbook.md)
## Planeditor, 4K og TVDB-seriemetadata (2026-07-29)

- Adminpanelets planoversigt kan oprette en ny immutable planversion med stream- og enhedsgrænser, opløsning op til 8K, bitrate, Direct Play/Direct Stream, transcode, undertekster, Chromecast og offline-download.
- Når en ny version aktiveres, kan administratoren vælge en atomisk overgang af aktive abonnementer. Den gamle subscription afsluttes, en ny subscription bindes til den nye version, og overgangen gemmes i subscription ledger og audit log.
- 4K-adgang styres fortsat server-side. En plan skal mindst tillade `2160p`, en tilstrækkelig `maxVideoBitrate` og den afspilningsmetode, som enheden kræver. HDR passthrough kræver fortsat en kompatibel fil, browser/enhed og Direct Play/Direct Stream.
- Metadataindstillinger understøtter nu separat TMDB Read Access Token til film og TVDB API Key samt valgfri Subscriber PIN til serier. Alle indtastede hemmeligheder valideres hos udbyderen og gemmes krypteret med `ENCRYPTION_KEY`.
- Serie-workeren logger ind mod TVDB v4, søger med `type=series`, matcher titel/år og henter det valgte series extended-record. Hvis TVDB ikke er konfigureret, bruges TMDB fortsat som fallback til serier.
- TVDB-artwork kan vises direkte fra godkendte `thetvdb.com`-URL'er. Klienter, der viser TVDB-data, skal samtidig vise attribution og link til [TheTVDB.com](https://thetvdb.com/) i overensstemmelse med [TVDB's API-regler](https://thetvdb.com/api-information).
- Implementeringen følger [TVDB v4 API-specifikationen](https://thetvdb.github.io/v4-api/) for login, series search og extended series records.
- Nøgler returneres aldrig fra status-endpoints eller til browseren efter lagring. Alternativ miljøkonfiguration er `TMDB_API_TOKEN`, `TVDB_API_KEY`, `TVDB_SUBSCRIBER_PIN` og `TMDB_LANGUAGE`.

### Mangler efter denne leverance

- HDR10/Dolby Vision tone mapping ved transcoding er ikke implementeret; HDR er i denne fase passthrough via Direct Play/Direct Stream.
- TVDB episode-level metadata og sæson-/episode-artwork er ikke implementeret endnu; den nuværende worker beriger serieepisoder med det matchede series-record.
- Android/TV-klienten viser TheTVDB-attribution på seriesider og åbner TheTVDB.com eksternt. Eventuelle kommende klienter skal bevare samme attribution.
## 4K- og HDR-badges på posters (2026-07-29)

- Startsidens mediekort, katalogets posters og “Fortsæt med at se” viser nu et `4K`-badge, når den analyserede fil er mindst 3840 pixels bred eller 2160 pixels høj.
- Et separat `HDR`-badge vises kun, når ffprobe-data er klassificeret som HDR10, HLG eller Dolby Vision. 4K SDR fejlkategoriseres derfor ikke som HDR.
- API’et udleder HDR-status server-side med den fælles video-signal-detektor og returnerer kun det normaliserede `hdr`-felt; den komplette ffprobe-payload eksponeres ikke til webklienten.
## TVDB sæson-/episode-metadata og serieside (2026-07-29)

- TVDB-workerens serieflow bruger nu den officielle `series/{id}/episodes/default/{lang}`-kontrakt med pagination til at matche lokale `SxxExx`-filer mod TVDB’s standard episodeorden.
- Metadatajobbet gemmer canonical serienavn, serieoversigt, serieposter/backdrop, TVDB-serie-id, sæson-id/poster samt episode-id, titel, beskrivelse, premieredato og still-billede.
- Databasemigrationen er additiv. Eksisterende biblioteker backfilles ved at vælge `Serier` og køre metadata fra adminindstillingerne; lokale filstier og scannerens sæson-/episodenumre ændres ikke.
- Seriesiden har sæsonvælger, episode-stills, lokaliserede titler/beskrivelser og korrekt attribution til TheTVDB.com.
- `Afspil næste episode` bruger den aktive profils playback-historik: en påbegyndt episode fortsættes, afsluttede episoder springes over, og derefter vælges første resterende episode i sæson-/episodeorden.
- API’et returnerer kun normaliserede metadata- og HDR-felter. Rå ffprobe-data fjernes fra katalog-, detalje-, historik- og næste-episode-responser.
- TVDB-kontrakten er dokumenteret i den [officielle v4 Swagger](https://thetvdb.github.io/v4-api/) og TVDB anbefaler lokal caching frem for klientkald direkte til udbyderen.

### Kendte rester

- Alternate/DVD/streaming episode orders kan endnu ikke vælges manuelt; standardordenen bruges.
- Manuel sæson- eller episode-specifik override ud over seriens valgte provider mangler fortsat; den nuværende binding er bevidst på film- eller serieniveau.
- TVDB-liveflow kræver fortsat en gyldig nøgle på installationsserveren og verificeres først dér.
## Separat kundeportal og adminområde (2026-07-29)

- Login router nu efter serverens roller: `admin`/`operator` åbner serveradministrationen, mens almindelige brugere åbner profilvalg eller `/watch`.
- `/watch` er en separat kundeoplevelse med egen header, søgning, film, serier, fortsæt med at se, discovery-rækker, metadata, kvalitetsbadges og webplayer. Ingen serverstatus, logs, biblioteker, planer eller updater vises.
- `/profiles` vælger aktiv profil ved sikker refresh-token-rotation. Playback-historik og fortsæt-position følger dermed den valgte profil.
- Adminområdet har knappen `Kundevisning`, og kundeportalen viser `Admin`-returknappen kun for admin/operator-roller.
- Admin-dashboardet kontrollerer rollen via `/auth/me`, før det kalder administrative endpoints. Serverens eksisterende `@Roles`-checks er fortsat den autoritative sikkerhedsgrænse; frontend-routing er kun UX-laget.

## Chromecast end-to-end sender (2026-07-29)

- Cast-handoff bevarer den eksisterende playback-session og logical session, så overgangen ikke reserverer en ekstra stream-plads.
- API'et udsteder et HMAC-signeret, sessionsbundet Cast-token med standardlevetid på seks timer. `CAST_TOKEN_TTL_SECONDS` kan sættes til 300-86400 sekunder.
- Receiverens stream-, HLS- og WebVTT-URL'er er absolutte og bruger `BB_MEDIA_PUBLIC_URL`, kontoens eksterne URL eller browserens validerede origin i den rækkefølge. Localhost-adresser afvises, fordi de peger på receiveren selv.
- Webplayeren bruger Google Cast `RemotePlayerController` til play/pause, seek og lydstyrke. Undertekster skiftes med Cast media-track API'et.
- Remote position, varighed, pause-state, heartbeat og playback-historik synkroniseres, mens fanen er åben. Ved almindelig disconnect fortsætter den lokale player fra receiverens seneste position.
- Hvis receiverens `loadMedia` fejler, rulles Cast-markeringen tilbage uden at frigive den oprindelige playback-session.

### Chromecast-konfiguration

Sæt en adresse, som Chromecast-enheden kan hente fra, når browserens origin eller setup-wizardens eksterne URL ikke er den rigtige:

```dotenv
BB_MEDIA_PUBLIC_URL=https://media.example.dk
CAST_TOKEN_TTL_SECONDS=21600
```

Web Sender-siden skal åbnes via HTTPS, og Chromecast skal kunne nå URL'en og stole på dens TLS-certifikat. Default Media Receiver kræver fortsat en åben controllerfane for heartbeat. En egen BoltBytes receiver med receiver-ejet heartbeat er næste Cast-trin.

## Funktionel admin-topbar og dansk tekst (2026-07-29)

- Topbarens Indstillinger og kundevisning er rigtige links med tydelige klikmål og tastaturfokus.
- Notifikationsknappen viser de seneste durable serverfejl og linker videre til den fulde fejllog.
- Admin-menuen viser den aktuelle konto/profil og giver adgang til kundevisning, profilvalg, indstillinger og logout.
- Logout tilbagekalder refresh-tokenet på serveren, før den lokale session fjernes.
- Beskadigede danske UI-strenge i katalog, planer og metadataindstillinger er rettet til korrekt UTF-8, herunder `æ`, `ø` og `å`.
- Native vandrette scrollbars er skjult under kategori- og sæsonchips, mens touch-, muse- og touchpad-scroll fortsat virker.

## Kundeadministration og offentligt domæne (2026-07-29)

Denne leverance tilføjer komplet administrativ onboarding uden SMTP:

- Nye kunder får en kryptografisk midlertidig adgangskode, som kun vises i svaret én gang.
- Første login udsteder kun et 10-minutters engangstoken til tvunget passwordskifte.
- Password-reset og suspension tilbagekalder refresh-tokens og aktive afspilninger.
- Profiler kan redigeres, PIN-beskyttes med 4-8 cifre og arkiveres uden at slette historik.
- Abonnement, planversion, enheder og entitlement-overrides kan administreres fra kundens detaljevisning.
- Operators har læseadgang, mens ændringer kræver administratorrollen.
- Serverindstillinger viser effektiv public URL, konfigurationskilde samt HTTPS/Cast-status.

Produktionsdomænet er `https://media.boltbytes.com`, mens Docker fortsat bruger host-port `6555` som intern upstream. DNS, certifikat, Nginx Proxy Manager, firewall, Range-streaming, fejlsøgning og rollback er dokumenteret i [`docs/domain-nginx-proxy-manager.md`](docs/domain-nginx-proxy-manager.md).

Fortsat ikke inkluderet i denne fase: SMTP/e-mailinvitationer, betaling, native file-watcher, hardwareaccelereret decode/tone mapping, fysisk Cast-certificering samt signerede Play Store/Android TV-release artifacts.

CI-smoketesten bruger samme standardport `6555` som Compose og `.env.example`, så health-, Direct Play-, subtitle-, HLS- og transcode-kontroller rammer den publicerede testport.


## Personlige kundepr?ferencer og anbefalinger (2026-07-29)

- `/watch/settings` har separate, eksplicitte Gem-forl?b for profil, lyd/undertekster, anbefalinger, sikkerhed og enhedens afspilning.
- Profilpr?ferencer synkroniserer sprogprioritet, underteksttilstand, autoplay og personalisering. Kvalitet, maksimumopl?sning, upscaling, databesparelse, hastighed og HDR gemmes p? den aktive enhed.
- En eksisterende profil-PIN skal bekr?ftes, f?r den ?ndres eller fjernes; ny PIN hashes med bcrypt cost 12.
- Anbefalinger scores kun blandt lokale titler med en registreret mediefil. Historik, provider-lighed, skuespillere, genrer, kategori, rating og Like/Dislike/Ikke for mig indg?r i scoren.
- Anbefalingscache bruger Redis i 15 minutter og versionsbindes til profilindstillinger, seneste historik og seneste feedback. Reset bevarer historikken, men afsk?rer ?ldre signaler.
- Kundeportalens logo linker til `/watch`, kundeheaderen linker til indstillinger, og native vandrette scrollbars skjules p? kunde-r?kker.

### Rester i den samlede personalized-watch-ABR-leverance

- Metadataworkeren udfylder genre-, top-15 credit- og provider-similar-felter fra TMDB. TVDB-serier krydslinkes best-effort til TMDB.
- PGS/VobSub/DVB-billedspor vises som burn-in-valg og rekonfigurerer den eksisterende logical session uden en ekstra streamreservation.
- Denne branch m? ikke merges til `main`, f?r de resterende dele samt alle lokale og GitHub-gates er gr?nne.


## Adaptiv HLS og personlig player (2026-07-29)

- Playback authorization beregner et serverstyret kvalitetsloft som minimum af abonnement, servermaksimum, fysisk sk?rmh?jde, enhedens kvalitetstilstand, databesparelse og upscaling-politik.
- Den f?lles ladder indeholder 360p, 480p, 720p, 1080p, 1440p og 2160p og v?lger h?jst fire j?vnt fordelte renditions. Databesparelse begr?nser output til 720p og cirka 3 Mbps.
- Workeren producerer renditions i ?n FFmpeg-dekodning med segmentjusterede streams, automatisk mastermanifest og nummererede playlists/segmenter. API-et markerer først streamen klar, når alle variant-playlister har den konfigurerede startbuffer; standarden er tre komplette segmenter og kan justeres med `BB_MEDIA_HLS_STARTUP_SEGMENTS=1-8`.
- NVIDIA NVENC vælges kun, når GPU-runtime er synlig, `nvidia-smi` svarer, FFmpeg annoncerer den nødvendige H.264/HEVC-encoder, og en rigtig one-frame encode lykkes. En FFmpeg/NVENC-runtimefejl falder sikkert tilbage til `libx264`/`libx265` uden at slette udtrukne undertekster.
- HDR bevares som HEVC Main10, n?r klient, plan og HDR-mode tillader det. `force_sdr` bruger tone mapping; opskalerede niveauer m?rkes tydeligt og p?st?r ikke at skabe ny kildedetalje.
- Hls.js starter i Auto med player-size- og FPS-drop-capping. Manuelle niveauer kan v?lges, og Auto gendannes med level `-1`.
- Playeren bruger profilens lyd-/undertekstsprog, binder tekstspor efter `loadedmetadata` og `addtrack`, skjuler overlay efter tre sekunders afspilning og holder fullscreen-state synkron med `fullscreenchange`.
- Det tidligere enkelt-rendition assetformat accepteres fortsat read-only under rullende opdatering; nye jobs producerer kun `stream_%v.m3u8` og `segment_%v_%05d.ts`.

### Fortsat rester

- `PATCH /playback/sessions/:id/configuration` genbruger stream-token, session-id og logical session ved aktivering eller fjernelse af PGS/VobSub/DVB burn-in.
- NVENC og HDR/SDR skal fortsat staging-smoketestes på den faktiske NVIDIA-host med rigtige 4K HDR-filer; CI har ingen fysisk NVIDIA-GPU.

## NVIDIA NVENC og transcode-kapacitet (2026-08-12)

Hardwareencoding er bevidst opt-in. Installér først en kompatibel NVIDIA-driver og [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) på Docker-hosten, og verificér [Docker Compose GPU-understøttelsen](https://docs.docker.com/compose/how-tos/gpu-support/). Sæt derefter følgende i `.env`:

```env
BB_MEDIA_GPU_ENABLED=true
BB_MEDIA_TRANSCODE_MAX_CONCURRENT=1
BB_MEDIA_MAX_TRANSCODE_HEIGHT=2160
BB_MEDIA_MAX_TRANSCODE_RENDITIONS=4
NVIDIA_VISIBLE_DEVICES=all
```

Start eller genopbyg installationen med GPU-overlayet:

```bash
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.updater.yml \
  -f docker-compose.nvidia.yml \
  up -d --build --remove-orphans --wait --wait-timeout 300
```

Når `BB_MEDIA_GPU_ENABLED=true`, tilføjer den indbyggede updater automatisk `docker-compose.nvidia.yml` ved alle senere builds og genstarter. Uden flaget starter samme kode på CPU og bruger `libx264`/`libx265`; GPU-overlayet er derfor aldrig et krav for en almindelig installation eller CI.

Transcoderen reserverer kapacitet atomisk på tværs af worker-replikaer. Standardgrænsen er én aktiv transcode, og overskydende jobs bliver i den durable kø. Admin-dashboardet opdaterer CPU, RAM, GPU-belastning, kø, aktiv/tilgængelig kapacitet og encoder for hver session cirka hvert andet sekund. Et worker-heartbeat ældre end 90 sekunder vises som offline i stedet for at genbruge gammel GPU-status.

NVENC-smoke-testen og runtime-fallbacken beskytter tilgængeligheden, men dette er hardwareencoding, ikke fuld GPU-pipeline: videodekodning, skalering, subtitle-overlay og HDR-til-SDR tone mapping bruger fortsat CPU. En fysisk 4K HDR/NVIDIA-stagingtest er derfor fortsat en release-gate, før kapacitet eller billedkvalitet kan betegnes som verificeret på serveren.

## CPU-first Direct Play og softwaretranscoding (2026-08-14)

Installationer uden GPU foretrækker nu Direct Play for en kompatibel source, også når enheden står på `Auto`. En managed HLS-transcode oprettes kun, når databesparelse kræver højst 720p/3 Mbps, et fast kvalitetsvalg reelt afviger fra source, den estimerede netværkskapacitet ikke har 25 procents sikkerhedsmargin, eller serveren eksplicit har deaktiveret Direct Play-prioriteten. Det undgår, at en almindelig kompatibel film bruger CPU alene for at fremstille kvalitetsniveauer, som klienten ikke behøver.

FFprobe-aliaser som `avc1`/`h264`, `hvc1`/`hevc`, `mp4a`/`aac` og flerstrengede formatnavne normaliseres før beslutningen. Webklienten sender desuden understøttede lydcodecs separat. Ældre klienter uden feltet forbliver kompatible; nye klienter får en præcis `audio_codec_unsupported`-årsag frem for en Direct Play-session, der først fejler i browseren.

Softwaretranscoding bruger som standard højst `1080p`, et automatisk CPU-budget med én logisk CPU reserveret til API/operativsystem og højst tre adaptive renditions. `veryfast` bruges for både `libx264` og `libx265`, og det samlede budget deles mellem encoderne og FFmpegs filtergraf. Standardkonfigurationen er:

```env
BB_MEDIA_PREFER_DIRECT_PLAY=true
BB_MEDIA_MAX_TRANSCODE_HEIGHT=1080
BB_MEDIA_MAX_TRANSCODE_RENDITIONS=
BB_MEDIA_CPU_TRANSCODE_PRESET=veryfast
BB_MEDIA_CPU_TRANSCODE_THREADS=
```

Tomme thread- og rendition-felter betyder automatisk detektion. Et eksplicit tal kan bruges ved container-CPU-limits, men trådbudgettet begrænses altid til de logiske CPU'er, Node faktisk kan se. Automatisk rendition-antal er højst fire og kræver cirka to CPU-tråde pr. niveau; en typisk 8-trådet CPU får derfor tre niveauer, mens en mindre host får færre. `BB_MEDIA_MAX_TRANSCODE_HEIGHT=2160` er muligt, men softwarebaseret 4K/HDR-transcoding kan være langsommere end realtid; 4K Direct Play påvirkes ikke af 1080p-transcode-loftet. Adminpanelet viser preset, samlet trådbudget, højdeloft og antal renditions sammen med live CPU/RAM/sessionstatus.
- Egen Chromecast receiver er fortsat en senere fase; Default Media Receiver-flowet er bevaret.

## Brandet stream-loader (2026-08-17)

- Webplayeren viser BoltBytes-logoet, en rolig loader-animation og teksten `Loader...`, mens en Direct Play- eller transcode-stream bliver gjort klar.
- Tekniske FFmpeg-forberedelsesbeskeder eksponeres ikke længere i den almindelige kundevisning.
- Hvis forberedelsen fejler, skifter samme panel til en tydelig fejltilstand og bevarer den konkrete tekniske fejlbesked til fejlfinding.

## Playback-diagnose, Chromecast og rigtige undertekster (2026-08-17)

- En kompatibel originalfil sendes ikke længere til HLS alene på grund af Chromes afrundede `navigator.connection.downlink`-estimat. Den tidligere adfærd kan vælges eksplicit med `BB_MEDIA_AUTO_TRANSCODE_ON_BANDWIDTH=true`; standarden er `false`.
- Afspilningsstatus viser nu en konkret kundevendt årsag, når container, video-/lydcodec, HDR, opløsning, bitrate eller en aktiv kvalitetsindstilling kræver HLS.
- SRT-sidecars og indlejrede tekstspor leveres fortsat som WebVTT, men cues renderes nu som ren, centreret tekst med sort outline i et dedikeret BoltBytes-lag over player-gradienten. Laget har ingen dialogboks eller overskrift og bindes med stabile track-id’er, så burn-in-spor ikke kan forskyde browser- eller Cast-tracknumre.
- Undertekstmenuen kan placere cues øverst, i midten eller nederst og vælge hvid, gul, cyan eller grøn tekst. Placering og farve gemmes lokalt pr. browser/enhed. Et afspilningsspecifikt offset fra `-10,0` til `+10,0` sekunder kan flytte WebVTT-cues tidligere eller senere uden at ændre kildefilen.
- Chromecast-knappen genprøver indlæsning af Google Cast SDK ved klik og viser resultatet synligt i playeren. Default Media Receiver og kravet om HTTPS samt samme lokale netværk er uændret.
- Chromes separate, flytbare vindue `Livetekstning / Oversætter` er en browserfunktion, ligger uden for sidens DOM og kan ikke styles eller lukkes af BoltBytes. Luk vinduet med dets `X`, eller slå Live Caption fra i Chrome, hvis kun filens rigtige SRT/WebVTT-spor skal vises.
- Matroska og andre browser-inkompatible containere bruger Direct Stream, når video, HDR, opløsning og bitrate allerede er kompatible. Videoen kopieres bit-identisk til HLS/fMP4, mens kun et inkompatibelt lydspor konverteres til AAC, hvis planen tillader audio-transcoding.

## Stabil HLS-start og manuelle kvalitetsvalg (2026-08-17)

- Progressive EVENT-playlister starter ved tidsposition `0` i stedet for at følge den voksende live-edge. Det forhindrer playeren i at ramme slutningen af det nyeste firesekunderssegment under opstart.
- Auto starter konservativt på laveste rendition, bruger større båndbredde-margin før opgradering og har op til 60 sekunders normal buffer. Browseren starter først selve afspilningen med mindst otte sekunders lokal buffer.
- Et manuelt kvalitetsvalg sætter Hls.js `loadLevel` og deaktiverer dermed ABR. Det eksisterende bufferindhold bevares, og UI'et viser skiftet som færdigt, når det valgte niveau faktisk leveres.

## Direct Stream-remux (2026-08-17)

- Playback-beslutningen vælger nu `direct_stream`, når blokeringerne alene er container, lydcodec eller deaktiveret Direct Play. Video-codec, HDR, opløsning og bitrate skal allerede være understøttet; ellers bruges den eksisterende fulde transcode eller en konkret entitlement-fejl.
- Workeren producerer én original HLS/fMP4-rendition med `-c:v copy`. Kompatibel lyd kopieres, mens inkompatibel lyd alene kodes til AAC stereo ved 192 kbps. HEVC mærkes `hvc1`, så kompatible MSE-browsere og Chromecast kan genkende streamen uden videoreencoding.
- Init-segmenter og `.m4s`-segmenter er underlagt samme path-allowlist, stream-token, CORS og lease-kontrol som MPEG-TS. `EXT-X-MAP` omskrives med et kortlivet token, og traversal afvises.
- Webplayeren behandler Direct Stream som HLS, venter på en stabil startbuffer og viser kun originalniveauet. Burn-in-rekonfiguration beholder samme logical session og skifter kontrolleret til fuld transcode.
- CI genererer en rigtig H264/AC3 Matroska-fil, kræver `direct_stream`, henter master, variant, init og mediesegment gennem nginx og verificerer med FFprobe, at output fortsat er H264-video med AAC-lyd. Unit tests låser desuden FFmpeg-kontrakten til `-c:v copy` og tester fMP4-tokenisering.


## Burn-in og session-rekonfiguration (2026-07-29)

- PGS, VobSub/DVD og DVB-billedspor klassificeres fra ffprobe og vises med stabilt `burnin-<streamIndex>`-id.
- Kunden kan aktivere eller fjerne burn-in direkte i playerens undertekstmenu. API-et kr?ver den eksisterende stream-token og planens video-transcode samt subtitle-burn-in entitlement.
- Reconfiguration beholder samme playback-session, logical session, lease, historik og streamreservation. Et superseded worker-job stoppes, f?r det nye job overtager outputmappen.
- Workeren l?gger billedsporet oven p? videoen f?r HDR-bevarelse eller SDR tone mapping og bygger derefter alle adaptive renditions fra samme filtergraf.
- Tekstspor leveres fortsat som WebVTT. Chromecast-tracklisten indeholder kun WebVTT; burn-in ligger allerede i videostr?mmen.
- Unit-testen verificerer, at reconfiguration genbruger session og logical session og ikke opretter en ny reservation.

## Playback reliability: serier, seek, undertekster, Cast og bufferstyret upscaling

Leverancen på `agent/playback-series-cast-buffering` gør følgende:

- Serie-detaljer indlæser kun den valgte sæsons episodefiler. De øvrige sæsoner returneres som små summaries med episodeantal, og PostgreSQL har målrettede indeks til provider-id og visningstitel.
- Serieoversigten caches i Redis i 60 sekunder. Redis-fejl må ikke blokere kataloget.
- `GET /api/v1/playback/history/series-next` understøtter `afterMediaId`, så autoplay og knappen Næste altid vælger episoden umiddelbart efter den aktuelle episode.
- Playback-autorisation og session-rekonfiguration understøtter `startPositionMs`. FFmpeg bruger input-seek, mens samme reservation og logical session bevares. Det gør Fortsæt og seek uden for en endnu produceret HLS-buffer brugbare.
- WebVTT-cues evalueres mod den absolutte medietid efter seek. Standardsporet bindes igen ved `load`, `addtrack` og `cuechange`, og et image/burn-in-spor auto-vælges aldrig som et usynligt tekstspor.
- Google Cast SDK-callback registreres før SDK-scriptet indlæses. Et tidligere fejlet script kan genindlæses, og Cast bruger Google Default Media Receiver via HTTPS.
- Auto-kvalitet starter på source-kvalitet eller lavere. Upscalede renditions låses først op, når den lokale HLS-buffer er mindst 210 sekunder; playeren kan opbygge op til fem minutters buffer, når upscaling er tilladt.

Driftsbemærkninger:

- Chromecast kræver en Cast-understøttet Chrome-browser, HTTPS på den offentlige URL og at sender og receiver kan opdage hinanden på netværket.
- Reel Cast-hardware, Nginx Proxy Manager og et produktionsbibliotek skal stadig indgå i staging-smoke efter deployment; unit- og CI-tests kan ikke bevise lokal mDNS/device discovery.
- Efter merge opdateres serveren gennem updateren eller med den dokumenterede Docker Compose bootstrap. Prisma-migrationen køres af API-startflowet før den nye version bliver healthy.

Valideret 17. august 2026:

- `npm run ci`: grøn lint, typecheck, `34/34` API-testfiler, `117/117` API-tests samt contracts-, API-, worker- og Next.js-produktionsbuild.
- `npx vitest run shared/contracts/src/playback-runtime.spec.ts`: `3/3` playback-policytests grønne.
- `npx prisma validate --schema services/api/prisma/schema.prisma`: schema validt.
- Lokal integrationstest blev sikkerhedsafvist uden en dedikeret `bbmedia_test`-database og test-JWT. GitHub `validate` med isoleret PostgreSQL/Redis er derfor obligatorisk før squash-merge.

## Playback-synkronisering og standardundertekster (2026-08-17)

Denne leverance retter tre sammenhaengende fejl i webafspilleren:

- Resume og on-demand seek fra Direct Stream skifter til fuld video- og lydtranscoding, naar abonnementet tillader video-transcoding. Det undgaar forskellige starttidsstempler mellem kopieret video og genkodet lyd.
- HLS-kvalitetsvisningen bruger serverens validerede rendition-bitrate matchet paa oploesning frem for HLS.js' midlertidige bootstrap-estimat.
- Det valgte WebVTT-standardspor aktiveres eksplicit og holdes loadet. Browserens native cue-rendering er transparent, saa kun BoltBytes-rendereren viser tekst med brugerens placering, farve og offset.
- Direct Play og Direct Stream fra filens begyndelse er uændret. Planer uden video-transcoding omgaas ikke.

Validering:

- `npm run test --workspace=@boltbytes/api -- playback-direct-stream.spec.ts playback-reconfiguration.spec.ts`: 4/4 tests bestaaet, inklusive Fortsaet fra gemt episodeposition.
- `npm run ci`: ESLint, contracts/API/worker/admin typecheck, 34 testfiler med 118/118 tests samt contracts-, NestJS-, worker- og Next.js-build bestaaet.
- Tilbagevaerende driftskontrol: deploy den nye container og smoke-test den konkrete FBI-fil i en rigtig browser for fysisk A/V-synkronisering, korrekt rendition-bitrate og vedvarende standardundertekster.

## Parallel biblioteksscanning og metadata (2026-08-17)

Jobs-workeren afvikler nu uafhængige jobtyper i separate, kontrollerede kapacitetsspor:

- Op til to forskellige biblioteker scannes samtidigt som standard.
- Op til to biblioteksspecifikke metadatajobs kører samtidigt som standard. Når et lille bibliotek er færdigscannet, kan det derfor hente metadata, mens et større bibliotek fortsat scanner.
- Lease-cleanup har sit eget enkelt slot og bliver ikke blokeret af lange katalogjobs.
- Playback-transcoding kører fortsat i den separate `transcoder`-service og følger `BB_MEDIA_TRANSCODE_MAX_CONCURRENT`.
- PostgreSQL `FOR UPDATE SKIP LOCKED`, job-leases og den eksisterende advisory lock pr. bibliotek bevares, så samme job eller bibliotek ikke behandles dobbelt.
- Ved kontrolleret nedlukning stopper workeren med at claime nye jobs og venter på allerede aktive jobs.

Kapaciteten konfigureres i `.env`:

```env
BB_MEDIA_SCAN_MAX_CONCURRENT=2
BB_MEDIA_METADATA_MAX_CONCURRENT=2
```

Scan- og metadata-grænser accepterer `1-8`. Start med `2`, også på en kraftig server, og hæv først til `3` eller `4`, når disk-I/O, PostgreSQL og TMDB/TVDB-rate limits er observeret under en fuld scanning. En høj CPU-kapacitet fjerner ikke disk- eller providerbegrænsninger.

Validering:

- Worker-unit-tests: 1 testfil og 3/3 tests bestået for defaults, grænse-clamping, uafhængige slots og transcode-isolation.
- `npm run ci`: lint, alle typechecks, 35 testfiler med samlet 121/121 tests samt alle production-builds bestået.
- Lokal `docker compose config --quiet` kunne ikke køres, fordi Docker CLI ikke er installeret på udviklingsmaskinen. GitHub `validate` skal derfor bestå Compose-validering, image-build og container-startup før merge.
# Playback- og seriepålidelighed

Den aktuelle fase gør playback og serievisning deterministisk på tværs af API, worker og webklient:

- Resume-transcoding bruger et hurtigt groft input-seek efterfulgt af et præcist output-seek. Video- og lydtidsstempler nulstilles, og lydsporet bruger asynkron resampling, så lyd og billede starter på samme tidslinje.
- HLS Auto starter i ægte adaptiv tilstand. Et manuelt niveau låser `currentLevel`, `nextLevel` og `loadLevel`, så Hls.js ikke fortsætter med at skifte bag brugerens valg. Upscaling låses fortsat op efter mindst 210 sekunders buffer.
- Direct Play kan nu bruge indbyggede tekstundertekster. API'et sætter et separat subtitle-job i kø, klienten venter på WebVTT-filen, og standardsporet bindes igen ved `loadedmetadata`, `loadeddata`, `canplay`, `addtrack` og track-load.
- Seriecontinuity beregnes ét sted på serveren. Senest brugte uafsluttede episode genoptages, næste episode findes i stabil sæson-/episoderækkefølge, og afslutningen af en episode kan ikke overskrives af player-cleanup.
- Seriekataloget aggregeres i PostgreSQL i stedet for at sende samtlige episoder gennem Node-processen. Titeldetaljen indlæser kun den valgte sæson og viser set-status og progression pr. episode.
- Kundevisninger, Fortsæt med at se og næste-episode-resultater udelukker mediefiler, som ikke længere har status `ready`.

## BoltBytes Cast receiver

Projektet serverer en CAF receiver på `https://media.boltbytes.com/cast/receiver`. Receiveren sender et underskrevet heartbeat hvert femte sekund, så Cast-afspilningen beholder den eksisterende logical session og streamreservation.

1. Registrér URL'en som en Custom Web Receiver i Google Cast SDK Developer Console.
2. Sæt det tildelte application ID som `BB_MEDIA_CAST_RECEIVER_APP_ID` i `.env`.
3. Genbyg `admin`-containeren, fordi `NEXT_PUBLIC_CAST_RECEIVER_APP_ID` indlejres ved Next.js-build.

Hvis variablen er tom, bruges Googles Default Media Receiver som kompatibilitetsfallback. Den kan afspille streamen, men bruger ikke BoltBytes-receiverens server-heartbeat. En fysisk Cast-enhed på samme netværk er fortsat nødvendig for endelig device-acceptance; CI validerer token, receiver-kontrakt, builds og container-ruter, men kan ikke simulere Googles discovery-protokol.
# Fase: serieoplevelse, trickplay og intro/credits

Denne leverance gør serievisningen og playerens tidslinje funktionel på Plex-niveau:

- Sæsoner vises samlet med episodeorden, varighed, fremdrift, næste episode og særskilt `Specials`-sæson.
- Titel- og playerbesøg sætter holdbare `media.playback-assets`-jobs i kø. Jobbene deduplikeres og køres parallelt med scans/metadata uden at bruge transcode-workerens streampladser.
- Workeren genererer autentificerede JPEG-sprites i det delte `/transcode`-volume og et koordinatmanifest. Ingen lokal filsti eksponeres til klienten.
- Tidslinjen viser hover-forhåndsvisning, intro-/credits-markører og virker fortsat med Direct Play, Direct Stream og transcode-seeks.
- Kapitelnavne er den stærkeste automatiske markørkilde. Intro kan desuden findes ved gentagne visuelle fingeraftryk på tværs af episoder; credits kan foreslås fra en sen sort overgang. Utilstrækkelig evidens giver ingen falsk knap.
- Manuelle adminmarkører via `PUT /api/v1/media/:id/timeline-markers` har altid forrang. `null` fjerner den pågældende markør.
- Under rulletekster viser episodespilleren en 10-sekunders næste-afsnit-countdown, som kan annulleres. Profilens eksisterende autoplay-indstilling respekteres.

Nye API-kontrakter:

- `GET /api/v1/media/:id/playback-assets`
- `POST /api/v1/media/:id/playback-assets/jobs` (admin)
- `PUT /api/v1/media/:id/timeline-markers` (admin)
- `GET /api/v1/media/:id/trickplay/:sheet`

Valgfri workerkapacitet: `BB_MEDIA_PLAYBACK_ASSET_MAX_CONCURRENT` (standard `2`, maksimum `8`). Ved opdatering anvendes migrationen automatisk af den normale container-start. Genererede sprites kan slettes og gendannes; databasen og de manuelle markører er den varige autoritet.

## Flutter Android- og Android TV-klient (2026-08-18)

Den første native klientleverance ligger i `clients/mobile-tv` og bruger serverens eksisterende `/api/v1`-kontrakter direkte. Det er ikke en statisk prototype.

Klientens centrale URL-builder accepterer både klientrelative endpoints som `/playback/context`, serverudstedte API-stier som `/api/v1/playback/...` og komplette HTTPS-URL'er. Dermed tilføjes `/api/v1` aldrig to gange ved polling af Direct Stream/transcode-status. Følsomme query-parametre, herunder stream-tokens, sløres desuden i fejlbeskeder, før de vises i appen.

Implementeret:

- Android mobil/tablet og Android TV fra samme Flutter-kodebase med separat `BB_MEDIA_DEVICE_TYPE`, Leanback-launcher og retningsbestemt fjernbetjeningsfokus.
- Login med konfigurerbar serveradresse, krypteret access/refresh-tokenlagring, automatisk tokenrotation, engangs-passwordskifte og profilvalg med valgfri PIN.
- Login-UI i TV/Android forbedret: serverfeltet validerer hostformat (ingen fulde URL'er), filtrerer whitespace, og form-felterne har forbedret fjernbetjeningsfokus (op/ned + Enter/Done-flow).
- Personlig forside fra recommendations, katalog og profilscopet `Fortsæt med at se`; Hjem, Film, Serier, Fortsæt, søgning, profilskifte og logout udfører alle rigtig navigation.
- Samlet serieside med sæsonvalg, episoder, set-status, progression, resumeepisode og TheTVDB-attribution.
- Native Android-video via den officielle Flutter `video_player`/ExoPlayer-backend. Klienten autoriserer server-side, understøtter Direct Play og adaptiv HLS, venter på Direct Stream/transcode readiness og genbruger logical session ved HLS-seek/reconfiguration.
- Heartbeat og progression bruger absolut medietid og gemmes hvert 10. sekund. Afslutning frigiver sessionen, mens serverens lease fortsat er crash-sikker fallback.
- Serverens foretrukne tekstundertekst vælges automatisk, WebVTT rendres uafhængigt af control-overlayet, og billedbaserede spor anmoder om burn-in gennem sessionens configuration-endpoint.
- Kvalitetsmenuen har Auto, Original og de serverautoriserede renditions. Ændringer gemmes på den registrerede enhed og genautoriserer fra den aktuelle position.
- Android-mobilbuildet bruger Google Cast Framework `22.3.1` gennem en vedligeholdt Kotlin/Flutter-bro. Den native Cast-knap håndterer discovery, session start/resume, reconnect og enhedsstatus; Android TV-buildet skjuler senderknappen.
- Cast genbruger den eksisterende logical playback-session via `/cast-handoff`, sender kun serverudstedte HTTPS-streams og WebVTT-spor til receiveren og synkroniserer remote play/pause, seek, position, heartbeat, historik og valgt undertekst. Billedbaserede undertekster genindlæser den samme Cast-session med server-side burn-in.
- Androids Cast-notifikation fortsætter med remote controls i baggrunden. Når playeren lukkes eksplicit, stoppes receiver-mediet, handoff rulles tilbage og streamreservationen frigives deterministisk.

Chromecast receiver-ID til mobilbuildet kan leveres som Gradle-property eller miljøvariabel. Uden værdien bruges Google Default Media Receiver (`CC1AD845`):

```powershell
$env:BB_MEDIA_CAST_RECEIVER_APP_ID = '<registreret Cast Application ID>'
C:\dev\flutter\bin\flutter.bat build apk --debug --dart-define=BB_MEDIA_API_URL=https://media.boltbytes.com/api/v1 --dart-define=BB_MEDIA_DEVICE_TYPE=mobile
```

Værdien skal være samme registrerede Custom Web Receiver-ID som serverens `BB_MEDIA_CAST_RECEIVER_APP_ID`, og receiver-URL'en skal være `https://media.boltbytes.com/cast/receiver`. Default Receiver virker uden registrering, men receiver-ejet heartbeat kræver BoltBytes receiver-ID'et. Fysisk discovery, TLS, HLS, 4K/HDR og subtitle-acceptance kræver fortsat en rigtig Chromecast/Google TV-enhed på samme netværk; CI kan validere kode, builds og kontrakter, men kan ikke simulere Googles discovery-protokol.

Lokal udvikling:

```powershell
cd clients/mobile-tv
C:\dev\flutter\bin\flutter.bat pub get
C:\dev\flutter\bin\flutter.bat run --dart-define=BB_MEDIA_API_URL=https://media.boltbytes.com/api/v1 --dart-define=BB_MEDIA_DEVICE_TYPE=mobile
```

Android TV køres eller bygges med `--dart-define=BB_MEDIA_DEVICE_TYPE=tv`:

```powershell
C:\dev\flutter\bin\flutter.bat build apk --debug --dart-define=BB_MEDIA_API_URL=https://media.boltbytes.com/api/v1 --dart-define=BB_MEDIA_DEVICE_TYPE=tv
```

Den nye `flutter-client` GitHub-workflow kræver format, analyze, unit/widget tests samt både mobil- og TV-debug-APK. Debug-artifacts gemmes i syv dage og er kun til staging. Signering, package identity/final branding, Play Store/AAB, fysisk telefon/TV-certificering, Chromecast sender-SDK og offline downloads er næste native release-gates og må ikke betegnes som færdige i denne fase.

Lokal validering 18. august 2026:

- `flutter analyze`: ingen issues.
- `flutter test`: 4 testfiler og `9/9` tests bestået for tokenrotation, kontraktparsing, serie/resume, adaptive renditions, WebVTT og branding.
- Mobil-debug-APK bygget med `BB_MEDIA_DEVICE_TYPE=mobile`; TV-debug-APK bygget med `BB_MEDIA_DEVICE_TYPE=tv` og samme produktions-API-base.
- `npm run ci`: ESLint, alle TypeScript-typechecks, `43/43` API-testfiler med `144/144` tests, `3/3` worker-tests samt contracts-, API-, worker- og Next.js-produktionsbuild bestået.
- Fysisk Android-enhed, Android TV, rigtig mediefil og Chromecast er ikke tilsluttet udviklingsmaskinen og forbliver derfor eksplicit staging-acceptance, ikke lokal testbevis.
# Flutter Chromecast: global session and diagnostics

The Android sender now keeps an active Chromecast playback alive when the full-screen player is closed. A global mini player owns server heartbeat and playback-history updates and provides remote play/pause, seek and stop controls. Logout stops and releases the remote playback before tokens are revoked.

The profile screen includes a Chromecast diagnostic dialog. It reports Google Cast SDK availability, receiver mode, receiver application ID, connected device, receiver state and active media. This separates build configuration from the remaining physical-device acceptance test.

For a registered BoltBytes Custom Web Receiver, configure the same application ID in both deployment and GitHub Actions:

```env
BB_MEDIA_CAST_RECEIVER_APP_ID=YOUR_REGISTERED_CAST_APP_ID
```

Create the repository Actions variable `BB_MEDIA_CAST_RECEIVER_APP_ID` before building the APK. The server's public receiver URL is `https://media.boltbytes.com/cast/receiver`; register that HTTPS URL in the Google Cast SDK Developer Console and register the physical Chromecast as a test device while the receiver is unpublished. If the variable is absent, Android deliberately falls back to Google's Default Media Receiver (`CC1AD845`) and the diagnostic dialog shows that fallback.

Physical acceptance still requires an Android phone and Chromecast on the same Wi-Fi: discovery must list the device, handoff must start media, subtitles must switch, navigation away from the player must leave playback running, the global mini player must control the receiver, and stop/logout must release the server session.
# Native Android playback, TV controls and signed updates

The Flutter client now shares one server-side playback model across Android mobile, Android TV and Chromecast. Series playback uses `/playback/history/series-next`, profile `autoplayNext`, and real timeline markers for intro, recap and credits actions. A ten-second credits countdown can advance to the next local episode and can be cancelled by the viewer.

Android playback integrates Picture-in-Picture, screen wake-lock, a foreground media notification, lock-screen/transport controls, background-capable `video_player` operation and bounded stream reconnection. Android TV keeps directional/keyboard playback controls and uses the same next-episode queue without enabling mobile PiP.

Profiles now have a server-synchronised **Min liste** through `playback/watchlist`, plus manual set/unset watched state. Client settings edit existing profile and device preferences and expose Cast diagnostics and update checks.

Production Android updates are accepted only from non-prerelease `android-v*` GitHub Releases. Configure these repository secrets before running `android-release`:

```text
BB_MEDIA_ANDROID_KEYSTORE_BASE64
BB_MEDIA_ANDROID_STORE_PASSWORD
BB_MEDIA_ANDROID_KEY_ALIAS
BB_MEDIA_ANDROID_KEY_PASSWORD
```

Also configure the repository variable `BB_MEDIA_CAST_RECEIVER_APP_ID`. The release workflow refuses to publish without both a stable signing identity and a registered Cast receiver ID. Android requires every update for an installed package to use the same signing certificate; back up the keystore outside GitHub and never rotate it casually.

## UI completion - 2026-08-22

Denne leverance samler kundeportal, titeloplevelse, webplayer, administration og Flutter-klienter i et fælles BoltBytes-design med grafit, rav og jade som gennemgaende visuelle signaler.

### Implementeret

- Kundeportalens header, navigation, sokning, profiler, rails, anbefalinger, settings, person-, collection- og seriesider bruger nu samme responsive shell.
- Mobilnavigationen er en fast bundnavigation, mens desktop og TV bevarer tydelig topnavigation og tastatur-/fjernbetjeningsfokus.
- Delvise katalogfejl logger ikke længere kunden ud. Film og serier indlaeses uafhaengigt, og fejl vises med en konkret status uden at blokere resten af portalen.
- Anbefalinger har nu en rigtig fejl- og retry-state, og relative TMDB-posterstier omsaettes til gyldige billed-URL'er.
- Serieoplevelsen har en samlet hero, faner, episodekort, ko-status og ensartede loading-, empty- og error-states.
- Webplayeren har et roligere fuldskaerms-overlay, tydelig tidslinje, kvalitetsmenu, undertekststatus, Cast-status, trickplay og mobile kontrolflader. Den eksisterende seek-, subtitle-, quality- og Cast-logik er bevaret.
- Webplayeren respekterer nu standard-undertekstvalget (`subtitleMode`) og aktiverer ikke undertekster ved `off`. OFF er synlig for alle afspilningsmetoder. Ved load af undertekster er der fallback til et gyldigt WebVTT-spor, hvis det valgte spor mangler.
- Kvalitetslåsen er rettet (forkert variabelreference fjernet), og seek-situationer gemmer fremdrift med kort debounce ved `seeked`, så brugeren ikke mister position ved hurtige seek-handlinger.
- Adminpanelet har et samlet kontrolrumsdesign med tydeligere formularer, tabeller, task center, playback-analyse, statuskort og en responsiv bundnavigation pa sma skaerme.
- Den dekorative admin-playerbar er fjernet, fordi rigtig afspilning foregar i webplayeren.
- Flutter mobil/TV bruger samme rav/jade-identitet, forbedrede fokusmarkeringer og konsistente kort, profiler, notifikationer, titel- og Cast-flader.
- Login viser den konfigurerede BoltBytes-server som et betroet valg. Server-URL'en er skjult som standard og kan kun aendres via `Skift`, sa fjernbetjeningsnavigation starter direkte pa e-mailfeltet.
- Mediekort konkurrerer ikke laengere om automatisk TV-fokus; fokusoverdragelse styres af skaermens navigation.

### Verificeret

- `npm run ci`: bestaaet inklusive lint, typecheck, 153 API-tests, 17 worker-tests, contracts build, API build, worker build og Next.js production build.
- `flutter analyze`: bestaaet uden fund.
- `flutter test`: 19 af 19 tests bestaaet.
- Mobil debug-APK: [download fra GitHub Release](https://github.com/skovhuus1/mediaserver/releases/download/ui-completion-2026-08-22/boltbytes-media-mobile-ui-debug.apk). Binære APK'er lagres som release-assets og ikke i Git-historikken.
- Mobil SHA-256: `E988367DCC2AAD501542CDB997FA7CE09F1D2CE726E224B5D35A5415EB7DA7C6`.
- TV debug-APK: [download fra GitHub Release](https://github.com/skovhuus1/mediaserver/releases/download/ui-completion-2026-08-22/boltbytes-media-tv-ui-debug.apk). Binære APK'er lagres som release-assets og ikke i Git-historikken.
- TV SHA-256: `9F534F4EE115C151C3B5E734712C13D7338AFD90E7069FA59521AC650176AD8B`.

### Fysiske release-gates

- Visuel kontrol pa den rigtige `media.boltbytes.com`-installation kraever adgang til den deployede konto og dens faktiske katalogdata.
- Fjernbetjeningsfokus, overscan og Cast-dialog skal fortsat smoke-testes pa den konkrete Android TV-enhed og Chromecast-hardware, fordi emulator- og widgettests ikke kan bevise hardwareadfaerd.

## Webplayer-stabilitet - 2026-08-22

- Manuel HLS-kvalitet skifter nu niveau én gang og forbliver låst uden gentagne niveauskrivninger, der kunne skabe en endeløs skiftecyklus før afspilning.
- Auto-kvalitet overdrager niveauskift til Hls.js og respekterer det eksisterende server-, skærm- og upscale-loft.
- Underteksttilstanden `off` starter uden undertekster. Automatisk fallback til første tekstspor sker kun ved den eksplicitte tilstand `always`.
- Et valgt WebVTT-spor beholdes stabilt. En load-fejl vises på det valgte spor i stedet for lydløst at skifte sprog eller spor under afspilning.
- Fysisk HLS-, subtitle- og Chromecast-acceptance skal fortsat udføres mod `media.boltbytes.com`, fordi browserens netværksforhold og Cast-hardware ikke kan bevises af unit-tests alene.
