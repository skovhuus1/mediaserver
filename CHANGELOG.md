# Changelog

Alle BoltBytes Media Server-releases følger SemVer og får ét fælles versionsnummer i workspaces, lockfil og health-API.

## 0.2.0 - 2026-08-23

- Retter falsk logout fra `/watch/live`, når kanalguide eller profilkontekst fejler.
- Paginerer og filtrerer kundeguiden server-side til installationer med op til 50.000 kanaler.
- Samler kvalitetsvarianter som `DR 1 FHD DK`, `DR 1 FH DK`, `DR 1 HD DK` og `DR 1 DK` under én stabil kanalidentitet.
- Bevarer manuelt låst kanalnavn, nummer og metadata ved senere importer.
- Prioriterer raske 4K/FHD/HD-kilder og går deterministisk videre uden at gentage en fejlet kilde.
- Giver planlagte optagelser samme kvalitetsprioritet og retry-sikre kildefailover.
