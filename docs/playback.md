# Playback

## Beslutningsrækkefølge

Playback authorization kombinerer:

1. Account-, user- og profilstatus
2. Planversion og entitlement overrides
3. Aktiv streamgrænse
4. Scannet ready-fil
5. Device/browser capabilities
6. Profil- og enhedspræferencer
7. Container-, codec-, HDR-, audio- og subtitlekompatibilitet
8. Serverens transcodekapacitet

Svar indeholder en konkret beslutningsårsag. Generisk access denied er ikke tilstrækkeligt.

## Direct Play

Direct Play bruges, når container og streams kan afspilles af klienten. API'et understøtter GET, HEAD og én HTTP byte-range.

Krav:

- sessionlease er aktiv
- signed streamtoken matcher hash
- filstatus er ready
- realpath ligger under storage root

Nginx buffering er slået fra for streamruter. Querystring med streamtoken logges ikke i normal accesslog.

## Direct Stream

Direct Stream remuxer uden videoencode, når videoen er kompatibel, men container eller lyd kræver ændring. Det reducerer CPU og bevarer kildekvaliteten.

Timestamps bevares, og seek skal starte fra den ønskede position i stedet for at falde tilbage til continue-positionen.

## HLS og transcoding

HLS bruges ved inkompatibel video, burn-in subtitle, HDR-to-SDR eller serverstyret bitrate/resolution.

Ladderen kan indeholde 360p, 480p, 720p, 1080p, 1440p og 2160p, men begrænses af plan, source, device, server og maksimumrenditions.

CPU er standard. NVIDIA/NVENC aktiveres kun, når runtime og encoder-health faktisk er tilgængelig. Ingen GPU betyder softwaretranscoding.

## ABR

Auto bruger Hls.js bandwidthestimat og playerstørrelse. Manuel kvalitet låser et konkret HLS-level; den må ikke fortsætte automatisk skift efter valget.

Upscaling er en outputresolution, ikke ny kildedetalje. Det må først prioriteres, når startup og buffer er stabile. Data saver begrænser Auto.

Diagnostics viser valgt metode, current bitrate, height, buffer ahead, bandwidth estimate, stalls og dropped frames.

## 4K og HDR

Direct Play er foretrukket for kompatible 4K/HDR-kilder. Transcoding afhænger af serverens maksimum og tilgængelig encoderkapacitet.

HDR-mode:

| Mode | Adfærd |
| --- | --- |
| auto | Bevar HDR ved kompatibel klient, ellers serverbeslutning |
| prefer_hdr | Foretræk HDR-output inden for entitlement og capabilities |
| force_sdr | Tone-map ved behov og når transcoding er tilladt |

Badges på posters kommer fra analyserede width/height og HDR-metadata, ikke filnavn alene.

## Undertekster

Tekstundertekster er altid tilgængelige uafhængigt af plan.

Understøttet flow:

- sidecar SRT/WebVTT
- embedded SRT/ASS/SSA til WebVTT
- stabile track ids
- sprogvalg fra profilpræferencer
- off, auto, always og forced
- position, farve og offset i playeren
- absolutte subtitle-URLs til Cast

PGS/VobSub er bitmapspor og kan kræve burn-in. Det ændrer playbackkonfigurationen inden for samme logical session, men kræver transcodekapacitet.

Et valgt startspor bindes efter loadedmetadata og track-load. Continue playback må ikke deaktivere sporet efter seek.

## Continue og historik

Playeren søger til serverens continue-position efter metadata er loaded. Et efterfølgende bruger-seek har højere prioritet og må ikke overskrives af den oprindelige resume-position.

Heartbeat opdaterer position, duration og runtime state. Afsluttede titler fjernes fra continue-rækken efter den gældende completiongrænse.

Serier grupperes som serie -> sæson -> episode. Næste episode kan starte automatisk, når profilpræferencen tillader det.

## Overlay og fullscreen

Overlay skjules efter inaktivitet under afspilning og vises ved input, pause, seek, menu eller fejl. Subtitle cues påvirkes ikke af overlay-hide.

Fullscreen-knappen er en toggle. Escape forlader først fullscreen; næste Escape kan lukke playeren.

## Chromecast

Websenderen indlæser Google Cast Framework og bruger serverens signed cast-media-kontrakt. Receiveren viser BoltBytes-branding, titel, artwork, playbackstatus, kvalitet og fejltilstand.

Produktion kræver:

- offentlig HTTPS URL
- gyldigt certifikat
- Cast receiver registreret hos Google
- BB_MEDIA_CAST_RECEIVER_APP_ID
- absolute media og subtitle URLs
- CORS gennem public domain

Receiverregistrering og fysisk Cast-test er eksterne release-gates, ikke noget CI kan bevise.
