# Android TV 4K production acceptance

Denne gate lukkes kun på en fysisk Android/Google TV-enhed med et fysisk 3840x2160-panel og den fjernbetjening, som slutbrugeren anvender. AVD density- eller `wm size`-overrides tæller ikke som 4K-evidence.

## Artifact og installation

- Brug AAB fra `android-tv-vX.Y.Z` workflowet og den interne Google Play TV-track.
- Kontrollér package-id `com.boltbytes.boltbytes_media.tv`, versionName, versionCode, Play-installationskilde og signatur mod `RELEASE_MANIFEST.json`.
- Installér som opgradering uden `-d`, uninstall eller data-clear. En separat fresh-install kan udføres bagefter.
- Byg den interne acceptancevariant med `--dart-define=BB_MEDIA_TV_FOCUS_DIAGNOSTICS=true`; flaget må være `false` i den offentlige release.

## Scenarier

- Cold boot efter force-stop og efter enhedsreboot forlader splash senest efter 8.000 ms.
- Login viser email/adgangskode og QR samtidigt, viser intet URL-felt og erstatter udløbet QR automatisk.
- D-pad når alle hub-tabs, dynamiske rails, titel, søgning, Live TV, downloads, indstillinger og notifikationer uden dead focus.
- Back lukker option-panel før player-overlay, overlay før session og session før titel/hub.
- VOD seek er -10/+30 sekunder. Live-streams ignorerer seek, når kilden ikke er seekable, uden at miste fokus.
- Netværkstab giver offlinebibliotek kun med afspillelige lokale poster; reconnect vender deterministisk tilbage online.
- FCM-token registreres for TV-pakken, og markering af en eller alle notifikationer som læst virker.

## Målinger og evidence

Kør med enheden valgt i `ANDROID_SERIAL` og gem output sammen med release-manifestet:

```powershell
adb shell wm size
adb shell dumpsys package com.boltbytes.boltbytes_media.tv
adb logcat -c
# Gennemfør mindst 100 repræsentative D-pad-input med den fysiske remote.
adb logcat -d -v threadtime | Select-String 'BB_STARTUP_READY|BB_TV_FOCUS_LATENCY_MS|ANR in com.boltbytes.boltbytes_media.tv|FATAL EXCEPTION' | Set-Content tv-4k-runtime-evidence.log
```

Acceptance kræver alle registrerede `BB_TV_FOCUS_LATENCY_MS` under 100 ms, ingen dead focus, ingen app-ANR/crash og `BB_STARTUP_READY elapsedMs` på højst 8.000 ms. Gem også fotos eller screenshots af login, hub, Live TV og player samt dato, TV-model, Android-version, remote-model, release-tag og tester.

## Status

Gaten er åben, indtil ovenstående evidence er indsamlet fra en fysisk 4K-enhed og knyttet til det konkrete TV-releaseartifact.
