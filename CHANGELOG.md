# Changelog

Alle BoltBytes Media Server-releases følger SemVer og får ét fælles versionsnummer i workspaces, lockfil og health-API.

## Unreleased

## 0.3.1 - 2026-08-26

- Tilfojer fail-soft TheIntroDB-opslag for intro, recap og rulletekster med TMDB-, TVDB- og IMDb-identitet, timeout og valgfri API-nogle.
- Kombinerer eksterne markorer med kapitel- og fingerprint-analyse uden at overskrive manuelle markorer, og registrerer providerresultatet i playback-manifestet.
- Opgraderer playback-markorkontrakten til analyseversion 3 og gor `external_provider` til en eksplicit, typed analysearsag.
- Tilfojer worker-tests for episodeopslag, markorprioritering, credits-slutpunkt, 404-fallback og deaktiveret provider.

## 0.3.0 - 2026-08-25

- Færdiggør den separate Android TV-app med faste mobile/TV-entrypoints, TV-shell, D-pad-navigation, offline/login/settings/downloads/notifications og produktionsrelease-gates.
- Gør VOD-kvalitetsskift autoritativt via aktiv playback-reconfigure og sender valgte renditions uden at gemme device-preference eller genstarte gennem mobilfacaden.
- Tilføjer VOD-lydsporvalg fra ffprobe til authorize/reconfigure, sender valgt audio stream-index til FFmpeg og understøtter Direct Stream samt fuld transcode.
- Løfter TV-playeren til en kompakt professionel transportbar med lavere overlay, tydeligt fokus, lys blå buffer-progress og D-pad-styret undertekst, lydspor, kvalitet og hastighed.
- Holder 90 %-Fortsæt-med-at-se-heuristikken adskilt fra stream-release, så playback kun afsluttes ved faktisk completion eller brugerstop.

## 0.2.14 - 2026-08-25

- Adskiller Fortsæt-med-at-se-heuristikken fra streamens livscyklus, så automatisk set-status ved 90 % ikke længere frigiver reservationen og stopper den aktive afspilning.
- Frigiver kun streamen ved playerens eksplicitte completion-signal og invaliderer home-feed-cachen ved alle progress-opdateringer.

## 0.2.13 - 2026-08-24

- Tilføjer Kundeoplevelse 2.0 med ét samlet profilscopet home-feed, personlig hero, otte standardrækker, dynamiske playlisterækker og cursor-baseret inkrementel indlæsning.
- Tilføjer Min liste med kanonisk serieidentitet, så flere afsnit fra samme serie ikke optræder som separate serier.
- Tilføjer private profilplaylister med film, hele serier og enkelte episoder, 50/500-grænser, drag-and-drop, keyboard-flytning, atomisk versionskontrolleret reorder og valgfri fastgørelse på forsiden.
- Samler kundekort, rails og hurtighandlinger i én responsiv blå BoltBytes-komponent med playback, info, Min liste, playliste og set-status, som synkroniseres mellem synlige forekomster.
- Udvider titel-/seriesider og webplayerens visuelle overlay med profilhandlinger uden at ændre Direct Play, remux, transcoding, ABR, buffer eller subtitle-engine.
- Adskiller serverens SemVer-gate fra Flutter-klienternes releaseversion, så rene API/web-releases ikke skriver i mobil- eller TV-appfiler.

- Udvidet kundesøgning med selvstændige episodehits og rettet anbefalingsscoring for TMDB-genrer, credits, similar-id'er og konkrete forklaringer.
- Tilføjet account-scopet driftsmonitorering med 30 dages CPU-, RAM-, disk-, playback- og jobhistorik, vedvarende alarmer, kvittering og sikker diagnostikeksport.
- Tilføjet Live TV-sporopdagelse og valg af lyd/undertekst gennem ffprobe, samme lease ved rekonfiguration, native HLS-spor i webplayeren og server-rendering af understøttede bitmap-undertekster.

- Gør Live TV-kanalnummeret til en atomisk placering i hele den aktive kanalrække. Et nummer kan skrives direkte i adminpanelet, hvorefter den valgte kanal indsættes på pladsen og alle efterfølgende kanaler forskydes og renummereres uden dubletter.

- Retter Live TV-EPG ved at autoopdage standard Xtream XMLTV, fjerne kapløbet mellem kanal- og EPG-import samt afvise tomme eller umatchede XMLTV-resultater med konkret diagnostik.

- Redesignet webplayerens Live TV-klargøring med kanalbranding, responsiv statusvisning, tilgængelig reduced-motion-adfærd og mulighed for at afbryde under reservationen.

- Aktiverer kun danske Live TV-kanaler som standard, anvender Canal Digital Danmarks kanalliste fra 20. august 2020 som stabil basisrækkefølge og tilføjer atomisk drag-and-drop-rækkefølge i administratorpanelet.

- Flytter store Live TV-synlighedsændringer til annullerbare worker-jobs med progress/resultat og gør M3U-import inkrementel, så identiske kanal- og sourcerækker ikke genskrives.

- Rettet global og gruppebaseret Live TV-kanalsynlighed for kataloger over 50.000 kanaler; scope-opdateringer kører direkte i PostgreSQL med kontrolleret transaktionstid, og adminpanelet viser stabilt layout samt afsluttet status.

## 0.2.12 - 2026-08-24

- Gør Android TV-playerens kvalitet og undertekster fuldt D-pad-styrede med
  synligt fokus, automatisk scroll, OK-valg og fokusretur til playerkontrollen.
- Bevarer brugerens eksplicitte sæsonvalg, selv når serverens fortsæt-position
  peger på en anden sæson.
- Segmenterer Direct Stream efter tid, så lange keyframe-intervaller ikke låser
  HLS-opstarten, og skifter automatisk til transcoding efter 30 sekunder uden
  et stabilt startsegment.
- Erstatter Film og Seriers statiske 36-elements grids med TV-hubs, der viser
  featured titel, nyeste indhold, senest udgivet, genrer og et pagineret
  Alle-katalog med 100 titler pr. side.
- Tilføjer en Nye episoder-række på serieforsiden og server-side
  `released`-sortering efter reel udgivelsesdato for film, serier og episoder.
- Gør hver genre til en fuldt pagineret katalogside frem for et lokalt filter
  over de første få titler.
- Reducerer TV-sidebaren fra 218 til 82 pixels, når den ikke har fokus, og
  udvider den automatisk under D-pad-navigation.
- Tilføjer API- og Flutter-regressionstests for release-sortering, hubrækker,
  genrer, pagination og den kompakte TV-rail.

## 0.2.11 - 2026-08-24

- Retter TV-klientens QR-login, så et godkendt pairing-resultat publicerer den
  indlæste session og skiftet til biblioteket til appens overordnede router.
- Tilføjer en regressionstest af hele overgangen fra pairing-poll og krypteret
  tokenlagring til aktiv profil, `AppStage.library` og router-notifikation.

## 0.2.10 - 2026-08-24

- Erstatter Flutter-standardikonet med BoltBytes-logoet i alle Android-densiteter.
- Tilføjer et rigtigt 320x180 BoltBytes-rasterbanner til Android TV-launcheren.
- Binder TV-banneret til både application og Leanback-activity, så Google TV og
  andre launchere viser branding på appflisen.
- Tilføjer en reproducerbar PowerShell-generator, så banner og launcherikoner
  kan gendannes fra samme visuelle BrandMark-kontrakt.

## 0.2.9 - 2026-08-24

- Serieoversigten accepterer scannerens titel-, displaytitel- og provider-identiteter, så korrekt matchede serier ikke forsvinder fra TV-kataloget.

- Ombygger TV-login til et responsivt todelt layout, så servervalg, QR-login og
  manuel login ikke længere skubbes utilgængeligt under skærmkanten.
- Tilføjer deterministisk D-pad-rækkefølge, initialt fokus, tydelig fokusramme og
  automatisk scroll til den fokuserede handling på lavere TV-opløsninger.
- Redesigner hele TV-skallen i en blå BoltBytes-retning med synligt logo, én
  sidebar, kompakt hero og mindre mediekort uden den dobbelte topnavigation.
- Retter fokusaktivering og automatisk scroll på navigation, hero, katalogkort,
  sæsoner og afsnit samt viser både afsnitsnummer og afsnitstitel.
- Tilføjer Live TV til klienten med M3U/XMLTV-guide, grupper, favoritter,
  atomisk authorize/switch, statuspolling, heartbeat, release og native player.
- Tilføjer regressionstests for 1920x1080/1280x720 login, serieafsnit, Live
  TV-kontrakter og D-pad-kanalnavigation.

## 0.2.8 - 2026-08-24

- Rettet TV-releasecrash før første Flutter-frame ved at bevare WorkManagers
  refleksionsindlæste Room-databaseconstructor gennem R8.
- Flutter-CI bygger og kontrollerer nu en minificeret TV-release-APK i stedet for
  kun en debug-APK.
- Tilføjet mapping-regressionstest og rigtig ADB/Leanback launch-smoke-test.
- Reproduceret den oprindelige fejl på en officiel Google TV API 36-emulator og
  fastholdt den konkrete Android-stacktrace i release-gaten.
- Rettet API 24/25 playback-notifikation, Android 14 updater-receiver,
  TV-launcher-export, Ethernet-TV-kompatibilitet, no-backup-policy og PiP-transition.
- Native Android lint er nu en obligatorisk Flutter-CI-gate.
- Gradle-wrapperen er komplet versionsstyret for både Linux- og Windows-runners.

## 0.2.7 - 2026-08-23

- Hærder Android TV-opstart ved at deaktivere Impeller på TV-flavoren og bruge den bredt kompatible Skia-renderer.
- Initialiserer ikke Google Cast-sender/provider på TV; Chromecast forbliver aktiv i mobilflavoren.
- Isolerer fejl i native playback-, updater-, download- og crashbroer, så en valgfri subsystemfejl ikke lukker hele appen.
- Fanger fejl fra krypteret lokal session under boot og falder tilbage til login med en synlig fejl i stedet for et process-crash.
- Certificerer automatisk, at TV-APK'en har Impeller slået fra og ikke indeholder mobilens Cast-provider.
- Udvider releaseværktøjet, så README-versionen opdateres og kontrolleres sammen med server- og Android-versionerne.

## 0.2.6 - 2026-08-23

- Lader TV- og mobilplayerens aktuelle undertekstvalg følge automatisk episodeafspilning, selv når spor-id'er skifter mellem episoder.
- Matcher næste episodes spor efter sprog, tekst/burn-in, forced-status og label i stedet for at genbruge et ugyldigt spor-id.
- Bevarer et eksplicit valg af `Undertekster: Fra` gennem resten af episodekøen.
- Lader releaseværktøjet opdatere og kontrollere Flutter-versionen samt Android buildnummeret sammen med resten af monorepoet.

## 0.2.5 - 2026-08-23

- Kobler Flutter TV-login på serverens QR-loginkontrakt med start, sikker polling, absolut QR-URL og krypteret tokenlagring efter godkendelse.
- Gør QR-login til primært TV-flow med brugerkode, udløbsstatus, ny-kode handling og manuel e-mail/adgangskode som fallback.
- Tilføjer klienttest for TV QR-start, relativ approve-URL normalisering og tokenlagring ved godkendt poll.

## 0.2.4 - 2026-08-23

- Tilføjer server-side QR/TV-login med `start`, `poll` og `approve`, separat poll-token til TV’et og separat approve-token til QR-linket.
- TV-login udsteder først access/refresh-token én gang, når en allerede logget ind bruger har godkendt QR’en, og auditlogger både godkendelse og forbrug uden at logge hemmelige tokens.
- Tilføjer `/login/tv` godkendelsesside, så QR-linket ikke peger på et dødt endpoint.

## 0.2.3 - 2026-08-23

- Tilføjer server-side `Skjul alle` og `Vis alle` i Live TV-kanalstyringen via et account-scopet bulk-endpoint, så hele kataloget kan ændres uden at sende op til 50.000 kanal-id'er gennem browseren.
- Når alle kanaler skjules, stoppes aktive Live TV-leases, planlagte/aktive optagelser annulleres, relaterede jobs stoppes, og handlingen auditlogges samlet.
- Adminpanelet viser handlingen under `Hele kataloget` med bekræftelse før `Skjul alle`.

## 0.2.2 - 2026-08-23

- Løfter Flutter TV-hjemmeskærmen med kompakt ikon-rail, topnavigation, fuldskærms-hero, profilrettet statusstribe og TV-optimerede medierækker.
- Gør TV-kort mere fjernbetjeningsvenlige med tydelig fokusmarkering, større play-overlay og unikke Hero-tags pr. række, så dubletter i anbefalinger ikke kan udløse Flutter runtime-konflikter.
- Bevarer mobil-layoutet og eksisterende handlers til afspilning, titelvisning, søgning, downloads, notifikationer, admin og indstillinger.

## 0.2.1 - 2026-08-23

- Tilføjer `BB_MEDIA_PUBLIC_URL` som effektiv CORS-origin automatisk, så `https://media.boltbytes.com` ikke fejlagtigt blokerer Cast-status eller API-kald.
- Normaliserer CORS-origins med trailing slash og viser den effektive allow-list i serverindstillinger og diagnostics.
- Autoopdager XMLTV-kilder fra M3U-headerfelterne `url-tvg`, `x-tvg-url` og `tvg-url`, krypterer URL'en og sætter et EPG-job i kø.
- Viser M3U-kanalnavn, logo og gruppe som ikke-optagelig guidefallback, indtil rigtige XMLTV-programtider er importeret.

## 0.2.0 - 2026-08-23

- Retter falsk logout fra `/watch/live`, når kanalguide eller profilkontekst fejler.
- Paginerer og filtrerer kundeguiden server-side til installationer med op til 50.000 kanaler.
- Samler kvalitetsvarianter som `DR 1 FHD DK`, `DR 1 FH DK`, `DR 1 HD DK` og `DR 1 DK` under én stabil kanalidentitet.
- Bevarer manuelt låst kanalnavn, nummer og metadata ved senere importer.
- Prioriterer raske 4K/FHD/HD-kilder og går deterministisk videre uden at gentage en fejlet kilde.
- Giver planlagte optagelser samme kvalitetsprioritet og retry-sikre kildefailover.
- Holder regionale feeds med samme navn adskilt, når deres eksterne id'er ikke er dokumenterede kvalitetsvarianter.
- Kanal op/ned i playeren navigerer server-side gennem hele kataloget, ikke kun den aktuelle guideside.
