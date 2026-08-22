# Dokumentation

Dette indeks er den aktive dokumentationsindgang. Den tidligere append-baserede README er bevaret i [delivery-history.md](delivery-history.md), men må ikke bruges som aktuel driftsvejledning.

| Dokument | Brug det til |
| --- | --- |
| [Live TV](live-tv.md) | M3U/XMLTV, kanalstyring, forbindelsespulje, afspilning, Chromecast og rollback |
| [architecture.md](architecture.md) | Komponenter, dataejerskab, sikkerhedsgrænser og jobmodel |
| [deployment.md](deployment.md) | Docker, direkte Linux, volumes, domæne og opdatering |
| [domain-nginx-proxy-manager.md](domain-nginx-proxy-manager.md) | DNS, TLS, Range, WebSockets og NPM |
| [runbook.md](runbook.md) | Health, logs, fejlretning, recovery og updater |
| [playback.md](playback.md) | Direct Play, remux, HLS, ABR, subtitles, HDR og Cast |
| [api.md](api.md) | API-principper og endpointfamilier |
| [clients.md](clients.md) | Web-, Android-, mobil- og TV-klienter |
| [security-backup.md](security-backup.md) | Secrets, tokens, backup, restore og audit |
| [integrations.md](integrations.md) | Metadata, Sonarr, Radarr, FCM og Chromecast |
| [roadmap.md](roadmap.md) | Implementeret, eksterne gates og næste leverancer |
| [delivery-history.md](delivery-history.md) | Arkiveret kronologisk leverancelog |

## Dokumentationsregler

- Root-README er kort og driftsklar.
- Aktuel adfærd beskrives i temadokumenterne.
- Leverancer opdaterer både relevant temadokument og root-status.
- Historiske noter slettes ikke; de arkiveres i delivery-history.
- Porte, paths og miljøvariabler skal matche kode og eksempelfiler.
- En funktion markeres kun implementeret, når den er valideret.
