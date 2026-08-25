# BoltBytes Media mobile og TV

Flutter-klienten deler domæne- og netværkskode, men Android leveres som to rigtige product flavors:

- `mobile`: touch-launcher uden Leanback launcher.
- `tv`: Leanback launcher, TV-banner og krav om `android.software.leanback`.

Det forhindrer, at samme APK blot omdøbes til både mobil og TV.

TV-flavoren bruger Flutter Skia-rendereren for kompatibilitet med ældre og leverandørspecifikke TV-grafikdrivere. Google Cast-senderen initialiseres kun i mobilflavoren; en fejl i en valgfri native bro eller lokal sessionslagring må ikke længere lukke appen under opstart.

## Lokal udvikling

~~~bash
flutter pub get
flutter run --flavor mobile --target=lib/main_mobile.dart --dart-define=BB_MEDIA_DEVICE_TYPE=mobile --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
flutter run --flavor tv --target=lib/main_tv.dart --dart-define=BB_MEDIA_DEVICE_TYPE=tv --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
flutter build apk --debug --flavor mobile --target=lib/main_mobile.dart --build-number=100021301 --dart-define=BB_MEDIA_DEVICE_TYPE=mobile --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
flutter build apk --debug --flavor tv --target=lib/main_tv.dart --build-number=100021301 --dart-define=BB_MEDIA_DEVICE_TYPE=tv --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
~~~

TV-shell test:

~~~bash
flutter test test/library_contract_test.dart
flutter test test/title_contract_test.dart
flutter test test/app_shell_screens_test.dart
flutter test test/tv_focus_controller_test.dart
flutter test test/tv_catalog_hub_test.dart
flutter test test/tv_library_screen_test.dart
flutter test test/tv_login_navigation_test.dart
flutter test test/tv_title_screen_test.dart
flutter test test/tv_profile_screen_test.dart
flutter test test/tv_series_navigation_test.dart
~~~

Standardflavoren er `mobile`. `main_mobile.dart` og `main_tv.dart` sætter nu runtime-identiteten eksplicit. Mobil kan fortsat ændre serveren, mens TV altid bruger det kompilerede `https://media.boltbytes.com/api/v1`, ignorerer gamle gemte URL'er og aldrig skriver en server-URL til lokal lagring.

Bootstrap har en absolut deadline på otte sekunder. Manglende token går straks til login; timeout eller netværksfejl går kun til offline-stage, når den aktive profil har en afspillelig download. Ellers vises login med en genkørbar startup-fejl. Forsinkede storage- og netværksoperationer kan ikke committe en ældre app-stage.

## Opdelt klientarkitektur

Klienten har tre tydelige lag:

- `lib/src/shared_core`: bootstrap, app-stage routing, `LibraryContract`/`LibraryUseCase` for katalogdata og `TitleContract`/`TitleUseCase` for titeldetaljer, status, watchlist og watched-state.
- `lib/src/mobile`: mobil-entrypoint og `MobileShellScreens`; mobilbiblioteket bruger shared-core, men beholder touch-navigation og mobilwidgets.
- `lib/src/tv`: TV-entrypoint, `TvShellScreens`, `TvHubScreen`, `TvTitleScreen`, `TvProfileScreen`, `TvFocusController`, TV-design tokens og det separate `TvLibraryScreen`-grid.

`AppShellScreens.buildByStage` er den stabile grænse mellem fælles session/state og de to UI-shells. Login, password change og offline fallback genbruges fortsat, mens bibliotek, profilvalg og titeldetaljer nu ejes separat af TV-shellen. UI-komponenter bygger ikke katalog- eller titel-URL'er og parser ikke deres payloads; det ligger i shared-core-kontrakterne.

## TV-oplevelse

TV-flavoren bruger et separat leanback-layout for biblioteket:

- QR-login er koblet til serverens `/api/v1/auth/tv/start` og `/api/v1/auth/tv/poll`, så TV’et viser en kode, poller sikkert med separat poll-token og gemmer tokens krypteret, når en eksisterende websession godkender login på `/login/tv`.
- top-row med Hjem, Film, Serier, Live TV, Fortsæt, Genre, Søg og Min profil.
- hero med Afspil/Fortsæt og Mere info samt separate rails for Continue Watching, anbefalinger, nye titler og Min liste.
- persistent actionbar for indstillinger, downloads og notifikationer; den indgår i samme DPAD-fokusgraf som top-row og medierækker.
- server-side søgning via katalogets `q`-parameter i stedet for at hente hele kataloger og filtrere lokalt.
- genrevisning i et separat TV-grid med eksplicit kolonnefokus, pagination og stabil back-stack.
- dedikeret TV-detaljeside med hero-actions, lokal sæsonskift, lodret episodefokus, playback-start, watchlist, watched-state og offline-download uden afhængighed til mobilens `TitleScreen`.
- dedikeret TV-profilvælger med store profilkort, PIN-flow, eksplicit D-pad-fokus og forudsigelig retur til aktivt bibliotek uden mobilens diagnostikpaneler.
- TV-kort med tydelig fokusring, større play-overlay og unikke Hero-tags pr. række, så anbefalinger med samme titel i flere rækker ikke konflikter.
- tomme eller dynamisk forsvundne rows normaliseres i `TvNavigationState`, så fokus altid kan komme videre til næste række eller actionbaren.
- bibliotekets TV-entrypoint peger på `TvHubScreen`; `LibraryScreen` bruges kun af mobil-shellen.

Mobil-layoutet bruger fortsat den kompakte touch-navigation.

Serieafspilning går automatisk videre efter nedtællingen, når profilens `autoplayNext` er aktiv. Et manuelt undertekstvalg følger episodekøen efter sprog og sportype, også når næste episode bruger andre track-id'er; valget `Fra` bevares ligeledes, indtil kunden vælger et spor igen.

## CI

`flutter-client.yml` udfører formatkontrol, analyze, hele testsuiten, Android lint for begge flavors og eksplicitte builds. Derefter kontrollerer `scripts/android-release-evidence.mjs` de faktisk mergede APK- og AAB-manifests, package-id, versionsdata, signaturer og flavoridentitet.

Debug-certifikatet er kun tilladt i PR-CI. Det kan ikke passere produktionsgaten.

## Produktionsrelease

Mobil og TV publiceres uafhængigt via `android-mobile-vX.Y.Z` og `android-tv-vX.Y.Z`. TV-releasen er APK-only og kræver:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- produktspecifik `FIREBASE_MOBILE_DART_DEFINES_BASE64` eller `FIREBASE_TV_DART_DEFINES_BASE64`
- repository variable `BB_MEDIA_CAST_RECEIVER_APP_ID`
- repository variable `BB_MEDIA_DEFAULT_SERVER_URL`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, når Play-publicering vælges

Releasecommitten skal findes i `origin/main`, versionen skal være numerisk `MAJOR.MINOR.PATCH`, tagget må ikke være genbrugt, og TV-serveren skal være præcis `https://media.boltbytes.com/api/v1`. `versionCode` beregnes separat for hvert produkt som `100000000 + major*1000000 + minor*10000 + patch*100 + GITHUB_RUN_ATTEMPT`.

Workflowet publicerer først APK'en efter Flutter- og releaseværktøjstests samt følgende artifact-gates:

- korrekt package ID, versionName og versionCode
- separat mobil- og TV-manifest
- ingen `REQUEST_INSTALL_PACKAGES`
- APK Signature Scheme v2 eller nyere
- samme ikke-debug certifikat på begge APK'er og AAB
- SHA-256 checksums og GitHub artifact attestation

En publiceret release overskrives ikke. Et mislykket workflow kan kun fortsætte på en eksisterende draft.

## Downloads og verifikation

Når version `X.Y.Z` faktisk er publiceret, er de direkte links:

- `https://github.com/skovhuus1/mediaserver/releases/download/android-mobile-vX.Y.Z/boltbytes-media-mobile-release.apk`
- `https://github.com/skovhuus1/mediaserver/releases/download/android-tv-vX.Y.Z/boltbytes-media-tv-release.apk`

Hent også `SHA256SUMS.txt` og `RELEASE_MANIFEST.json` fra samme release:

~~~bash
sha256sum -c SHA256SUMS.txt
gh attestation verify boltbytes-media-mobile-release.apk -R skovhuus1/mediaserver
~~~

Et link er først gyldigt, når releasen findes. README må ikke bruges som bevis for et endnu ikke publiceret artifact.

## Fysisk certificering

Automatisk CI beviser build, manifest, signatur og provenance. Den beviser ikke fysisk funktion. Før en bred rollout skal `scripts/certify-android.mjs` og [4K acceptance-gaten](docs/tv-4k-acceptance.md) dække:

- login og playback på en fysisk mobil
- D-pad, fokus og back-navigation på fysisk Android TV
- seek, subtitles, Direct Play og transcode
- Cast discovery, handoff og disconnect
- install, upgrade og rollback

Se [Flutter flavors](https://docs.flutter.dev/deployment/flavors), [Flutter Android release](https://docs.flutter.dev/deployment/android), [Android app signing](https://developer.android.com/studio/publish/app-signing) og [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## Separate mobile and TV architecture

The Flutter client has two independent UI entrypoints backed by shared business logic:

- `lib/main_mobile.dart`: existing touch-first mobile shell.
- `lib/main_tv.dart`: remote-first TV shell. Code below `lib/src/tv` must not import `lib/src/screens`.
- `lib/src/shared_core`: stable shell contracts, typed API adapters, preferences, notifications, Live TV, offline library, and playback session controllers.

`AppShellScreens` and `buildByStage` remain the stable routing boundary. The TV shell owns hub, title, VOD player, Live TV guide/player, settings, downloads/offline playback, notifications, profiles, and the offline application stage. QR login and password-change remain shared baseline flows.

### TV navigation

The top tabs are `Hjem`, `Film`, `Serier`, `Live TV`, `Fortsat`, `Genre`, `Sog`, and `Min profil`. Every TV screen exposes explicit focus zones and visible focus styling. VOD seeking uses -10/+30 seconds, controls close after five seconds of inactivity, and back closes an option panel before the overlay and playback session.

Live TV uses a fixed channel rail and a 12-hour EPG with 30-minute columns. The guide refreshes every minute while retaining channel/program selection. Future programmes open details only. During live playback, up/down switches channel and left/right seek only for seekable sources; non-seekable sources remain focusable and display `LIVE`.

Settings are saved explicitly per category. Download entries remain visible when expired or invalid, but only valid entries can start the encrypted local stream. Notification actions support read-one and read-all; there is no delete/clear operation because the backend exposes no delete endpoint.

### Validate and release

```powershell
flutter analyze
flutter test
node ../../scripts/android-version-code.mjs --version 0.2.13 --attempt 1
flutter build apk --debug --flavor mobile -t lib/main_mobile.dart --build-name=0.2.13 --build-number=100021301 --dart-define=BB_MEDIA_DEVICE_TYPE=mobile --dart-define=BB_MEDIA_APP_VERSION=0.2.13 --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
flutter build apk --debug --flavor tv -t lib/main_tv.dart --build-name=0.2.13 --build-number=100021301 --dart-define=BB_MEDIA_DEVICE_TYPE=tv --dart-define=BB_MEDIA_APP_VERSION=0.2.13 --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
flutter run -d emulator-5554 --flavor tv -t lib/main_tv.dart --dart-define=BB_MEDIA_DEVICE_TYPE=tv --dart-define=BB_MEDIA_DEFAULT_SERVER_URL=https://media.boltbytes.com/api/v1
```

The mobile package is `com.boltbytes.boltbytes_media`; the independently installable TV package is `com.boltbytes.boltbytes_media.tv`. Never certify or rename the generic `app-debug.apk`: release and smoke gates consume only `app-mobile-*` and `app-tv-*` outputs from explicit flavor/entrypoint builds.

Mobile releases use `android-mobile-vX.Y.Z`; TV releases use `android-tv-vX.Y.Z`. Each product has an independent version stream and Firebase Android app. CI receives Firebase values through the product-specific `FIREBASE_MOBILE_DART_DEFINES_BASE64` or `FIREBASE_TV_DART_DEFINES_BASE64` secret and never writes protected configuration to the repository.

The automated architecture test rejects imports from `lib/src/tv` into `lib/src/screens`. `scripts/smoke-android-tv-launch.mjs` requires the `BB_STARTUP_READY` marker within 8,000 ms and can enforce `BB_TV_FOCUS_LATENCY_MS` samples when diagnostics are enabled. Final D-pad acceptance follows [docs/tv-4k-acceptance.md](docs/tv-4k-acceptance.md); emulator/widget results do not close this hardware gate.
