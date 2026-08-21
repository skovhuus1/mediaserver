# BoltBytes Media mobile og TV

Den native Android-klient til BoltBytes Media Server. Projektet bygger både et adaptivt mobil/tablet-layout og et fjernbetjeningsvenligt Android TV-layout fra samme kontraktlag.

Se repository-roden for kørselskommandoer, arkitektur, sikkerhedsmodel og aktuel acceptance-status.

## Download seneste Android-versioner

- Mobil APK: `https://github.com/skovhuus1/mediaserver/releases/latest/download/boltbytes-media-mobile-release.apk`
- Android TV APK: `https://github.com/skovhuus1/mediaserver/releases/latest/download/boltbytes-media-tv-release.apk`
- Google Play AAB: `https://github.com/skovhuus1/mediaserver/releases/latest/download/boltbytes-media-google-play-release.aab`

Hvis linket returnerer 404, er der ikke publiceret et tag `android-vX.Y.Z` siden
sidste ændring, eller workflowet er endnu ikke kørt succesfuldt.

## Seneste implementering (phase: UX polish)

- Forbedret biblioteksshell i `library_screen.dart`
  - Logo (BrandLockup) er nu klikbar hjem-knap.
  - Topnavigationen er gjort til scrollbare “pill”-tabs med tydelig aktive state (og vises også på mobil).
  - Hurtige knapper til Notifikationer og Downloads er rykket frem fra menuen.
  - TV-sidepanel får direkte handlinger for Notifikationer og Downloads.
- Login påklædt bedre i `auth_screens.dart`
  - Serverfeltet normaliserer automatisk indsatte URL’er/hosts.
  - Bedre validering af host + optional port.
  - Hjælpetekst der gør det tydeligt, at https-URL kan indsættes.
- Notifikationer i `notification_inbox_screen.dart`
  - Tilføjet ryd-knap (lokalt markerer som tom indbakke efter server-side read-all).
- Brand-komponent i `widgets/brand.dart`
  - Understøtter valgfri tap-callback og tooltip, så logo kan bruges som hjem-navigation.

### Kørsel / kontrol

- Koden er formateret med `dart format`.
- Hurtigt tjek: `dart analyze` på de ændrede filer.

### Næste iteration

- Plex-agtig afspillingsopsætning (realtids-undertekster, hurtig overlay, smartere TV-fokus samt samlet admin/kunde-oplevelse-fortolkning).

## Udført i denne iteration

- Undertekstflow forbedret:
  - `SubtitleTrack.isText` genkender nu webvtt/srt/ass/ssa og embedded/tekst-tracks korrekt.
  - Faldt ved manglende undertekstkilde bliver nu håndteret med en tydelig fejl i UI'en.
  - Undertekstmenuen har tydeligt opdelte tekst- og indbrændte spor + fallback når ingen undertekster findes.
- Playback UX:
  - Forbedret fallback ved at rydde lokal fejl-state når undertekster slås fra.
  - Login: e-mailfeltet afviser URL-lignende input, så loginfelt ikke tager web-adresser ved en fejl.

## Nyt i denne runde

- Titelafspilning i `library_screen.dart` og `title_screen.dart`
  - Serietryk åbner altid serien som title-side i stedet for at forsøge at afspille et seriesag overordnet.
  - Continue / anbefalinger bruger fortsat samme `onPlay`-vej med automatisk serie-håndtering.
- Afspilning i `player_screen.dart`
  - Undertekster genindlæses efter seek/reconfigure, så de ikke forsvinder ved tidsnavigation.
  - Søgehandlinger gemmer straks afspilningsposition i session-progress.
  - Kvalitetsændring er låst mod dobbelte kald, så den ikke “flakker” på gentagende switches.
  - Slideren har et renere tema for mere moderne, Plex-lignende playback-UI.
