# BoltBytes Media mobile og TV

Flutter-klienten deler domæne- og netværkskode, men Android leveres som to rigtige product flavors:

- `mobile`: touch-launcher uden Leanback launcher.
- `tv`: Leanback launcher, TV-banner og krav om `android.software.leanback`.

Det forhindrer, at samme APK blot omdøbes til både mobil og TV.

## Lokal udvikling

~~~bash
flutter pub get
flutter run --flavor mobile --dart-define=BB_MEDIA_DEVICE_TYPE=mobile
flutter run --flavor tv --dart-define=BB_MEDIA_DEVICE_TYPE=tv
~~~

Standardflavoren er `mobile`. Produktionsbuilds får server-URL og Cast App ID via beskyttet releasekonfiguration; slutbrugeren skal ikke indtaste en teknisk URL i det normale loginflow.

## TV-oplevelse

TV-flavoren bruger et separat leanback-layout for biblioteket:

- QR-login er koblet til serverens `/api/v1/auth/tv/start` og `/api/v1/auth/tv/poll`, så TV’et viser en kode, poller sikkert med separat poll-token og gemmer tokens krypteret, når en eksisterende websession godkender login på `/login/tv`.
- kompakt venstre ikon-rail og topnavigation, så D-pad fokus ikke skal igennem lange tekstmenuer.
- fuldskærms-hero med Afspil/Fortsæt og Mere info, koblet til de eksisterende playback- og titelsider.
- statusstribe for Fortsæt, Film, Serier og 4K/HDR samt deduplikerede medierækker.
- TV-kort med tydelig fokusring, større play-overlay og unikke Hero-tags pr. række, så anbefalinger med samme titel i flere rækker ikke konflikter.

Mobil-layoutet bruger fortsat den kompakte touch-navigation.

Serieafspilning går automatisk videre efter nedtællingen, når profilens `autoplayNext` er aktiv. Et manuelt undertekstvalg følger episodekøen efter sprog og sportype, også når næste episode bruger andre track-id'er; valget `Fra` bevares ligeledes, indtil kunden vælger et spor igen.

## CI

`flutter-client.yml` udfører formatkontrol, analyze, tests og bygger begge debug-flavors. Derefter kontrollerer `scripts/android-release-evidence.mjs` de faktisk mergede manifests, versionsdata, signaturer og at APK-hashene er forskellige.

Debug-certifikatet er kun tilladt i PR-CI. Det kan ikke passere produktionsgaten.

## Produktionsrelease

`android-release.yml` kan køres fra `main` eller via et `android-v*` tag. Workflowet kræver:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `FIREBASE_ANDROID_OPTIONS_BASE64` eller `GOOGLE_SERVICES_JSON_BASE64`
- repository variable `BB_MEDIA_CAST_RECEIVER_APP_ID`
- repository variable `BB_MEDIA_DEFAULT_SERVER_URL`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, når Play-publicering vælges

Releasecommitten skal findes i `origin/main`. Workflowet publicerer først efter Flutter-tests og følgende artifact-gates:

- korrekt package ID, versionName og versionCode
- separat mobil- og TV-manifest
- ingen `REQUEST_INSTALL_PACKAGES`
- APK Signature Scheme v2 eller nyere
- samme ikke-debug certifikat på begge APK'er og AAB
- SHA-256 checksums og GitHub artifact attestation

En publiceret release overskrives ikke. Et mislykket workflow kan kun fortsætte på en eksisterende draft.

## Downloads og verifikation

Når version `X.Y.Z` faktisk er publiceret, er de direkte links:

- `https://github.com/skovhuus1/mediaserver/releases/download/android-vX.Y.Z/boltbytes-media-mobile-release.apk`
- `https://github.com/skovhuus1/mediaserver/releases/download/android-vX.Y.Z/boltbytes-media-tv-release.apk`

Hent også `SHA256SUMS.txt` og `RELEASE_MANIFEST.json` fra samme release:

~~~bash
sha256sum -c SHA256SUMS.txt
gh attestation verify boltbytes-media-mobile-release.apk -R skovhuus1/mediaserver
~~~

Et link er først gyldigt, når releasen findes. README må ikke bruges som bevis for et endnu ikke publiceret artifact.

## Fysisk certificering

Automatisk CI beviser build, manifest, signatur og provenance. Den beviser ikke fysisk funktion. Før en bred rollout skal `scripts/certify-android.mjs` og den dokumenterede matrix dække:

- login og playback på en fysisk mobil
- D-pad, fokus og back-navigation på fysisk Android TV
- seek, subtitles, Direct Play og transcode
- Cast discovery, handoff og disconnect
- install, upgrade og rollback

Se [Flutter flavors](https://docs.flutter.dev/deployment/flavors), [Flutter Android release](https://docs.flutter.dev/deployment/android), [Android app signing](https://developer.android.com/studio/publish/app-signing) og [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
