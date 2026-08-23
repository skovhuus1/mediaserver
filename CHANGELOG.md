# Changelog

Alle BoltBytes Media Server-releases følger SemVer og får ét fælles versionsnummer i workspaces, lockfil og health-API.

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
