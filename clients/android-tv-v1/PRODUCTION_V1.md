# BoltBytes TV V1 production architecture

The Leanback launcher now opens the native production application in
`production/ProductionTvActivity.kt`. `MainActivity` and the original visual
screens remain non-exported preview tooling and are not part of the TV launch
path.

## Runtime

- Fixed API origin: `https://media.boltbytes.com/api/v1/`.
- AES/GCM-protected access and refresh tokens backed by Android Keystore.
- Eight-second generation-protected session bootstrap.
- Email/password and continuously visible QR login.
- Profile selection and TV PIN keypad.
- API-driven home rows, grouped episode rows, search, title details, seasons,
  cast, related titles, watchlist and playback history actions.
- API-driven Live TV guide, favorites, notifications, preferences and download
  status.
- GitHub Release update checks with SHA-256, package-id, monotonic version and
  signer-certificate verification before Android's installation confirmation.

## Playback

- One Media3/ExoPlayer instance owns each VOD or Live TV lease.
- HLS adaptive bitrate selection is left to Media3. No timer reauthorizes or
  recreates the stream when automatic quality changes.
- Progress is persisted every 15 seconds and heartbeat is sent every 20
  seconds without rebuilding the media item.
- Completion and autoplay happen only on Media3 `STATE_ENDED`.
- Session release is idempotent.
- D-pad left/right seeks `-10/+30` while controls are hidden. OK opens the
  controls. Back closes options, then controls, then the route.
- Quality, audio and subtitles use a TV-native full-height option panel.
- Intro, recap and credits buttons consume server-provided playback markers.
- `FLAG_KEEP_SCREEN_ON` is reasserted on lifecycle resume/start.

## Remaining release gates

The source is not production-certified until compile, lint, unit/widget tests,
signed release build, emulator D-pad smoke and physical 4K TV acceptance have
all passed. Local encrypted offline-file transfer and Play/GitHub update
installation still requires a physical package-installer gate. Play-installed
builds are sent to Play Store; sideloaded builds use the verified GitHub APK.
The current Downloads page exposes authoritative server status, renewal and
removal without pretending a server record is already a local file.
