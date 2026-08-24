# Changelog

Alle BoltBytes Media Server-releases følger SemVer og får ét fælles versionsnummer i workspaces, lockfil og health-API.

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
