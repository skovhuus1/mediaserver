# BoltBytes TV V1

Separat native Android TV-klient i Kotlin og Jetpack Compose. Release-id er `com.boltbytes.boltbytes_media.tv`; intern debug bruger `.v1`. Endpointet er fastlåst til `https://media.boltbytes.com/api/v1`. Flutter-klienten er urørt.

## Aktuel status

- Cinematic TV-design og D-pad-navigation er implementeret for login, profiler, hub, genre, titel, player, Live TV, downloads, notifikationer og indstillinger.
- Film- og serieforsiderne bevarer de kuraterede rækker og tilbyder separate `Alle film`/`Alle TV-serier`-faner med pagineret katalogindlæsning. Søgning åbner med TV-fokus og søger i hele biblioteket.
- Native lint kompilerer skærmene og kontrollerer Android TV-manifestet.
- Produktionskontrakterne har unit-tests for blandt andet katalogparsing, søgning, playbackmarkører og API-modeller.
- Typed API/session, rigtigt email/QR-login og den autoritative Media3-playbackmotor er fortsat integrationsgates. Den nuværende APK er en interaktiv V1-oplevelsesprototype og må ikke beskrives som funktionelt produktionsfærdig.

## Lokal kvalitetskontrol

```powershell
.\gradlew.bat --console=plain :app:lintDebug :app:testDebugUnitTest
```

Debug-buildet bruger package-id `com.boltbytes.boltbytes_media.tv.v1` og må kun bruges til lokal udvikling.

## Produktionssigneret APK

Workflowet `Android TV V1 signed release` bygger release-package-id `com.boltbytes.boltbytes_media.tv`. Det kræver repository-secrets for den eksisterende Android-uploadnøgle og afviser både manglende signering og Androids debug-certifikat. En release kan ikke falde tilbage til debug-signering.

Workflowet køres manuelt med en numerisk version, eksempelvis `1.0.0`. Det kører lint, compile-gate, release-build og kontrollerer package-id, version, Leanback-launcher, touchscreen-krav, banner og signatur før APK'en uploades som GitHub Actions-artifact.
