@file:androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])

package com.boltbytes.media.tv.v1.playback

import android.content.Context
import android.hardware.display.DisplayManager
import android.media.MediaCodecList
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import com.boltbytes.media.tv.v1.core.TvPlaybackAuthorization
import com.boltbytes.media.tv.v1.core.TvPlaybackItem
import com.boltbytes.media.tv.v1.core.TvRepository
import com.boltbytes.media.tv.v1.core.TvTrack
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

enum class TvPlaybackPhase { Idle, Authorizing, Preparing, Ready, Buffering, Ended, Error }

data class TvPlaybackState(
    val phase: TvPlaybackPhase = TvPlaybackPhase.Idle,
    val item: TvPlaybackItem? = null,
    val player: ExoPlayer? = null,
    val playing: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long? = null,
    val bufferedPositionMs: Long = 0,
    val audioTracks: List<TvTrack> = emptyList(),
    val subtitleTracks: List<TvTrack> = emptyList(),
    val selectedAudio: String? = null,
    val selectedSubtitle: String? = null,
    val quality: String = "Auto",
    val upscaleLabel: String = "Fra",
    val error: String? = null,
)

class Media3PlaybackController(
    context: Context,
    private val repository: TvRepository,
    private val scope: CoroutineScope,
    private val onEnded: () -> Unit,
) {
    private val applicationContext = context.applicationContext
    private val _state = MutableStateFlow(TvPlaybackState())
    val state: StateFlow<TvPlaybackState> = _state.asStateFlow()
    private val finishMutex = Mutex()
    private var authorization: TvPlaybackAuthorization? = null
    private var finishedSessionId: String? = null
    private var ticker: Job? = null
    private var currentItem: TvPlaybackItem? = null

    fun start(item: TvPlaybackItem) {
        scope.launch {
            finishCurrent(completed = false)
            releasePlayer()
            currentItem = item
            finishedSessionId = null
            _state.value = TvPlaybackState(
                phase = TvPlaybackPhase.Authorizing,
                item = item,
                positionMs = item.positionMs,
                durationMs = item.durationMs,
            )
            runCatching { repository.authorize(item, capabilities()) }
                .onSuccess(::prepare)
                .onFailure { error ->
                    _state.update { it.copy(phase = TvPlaybackPhase.Error, error = error.message ?: "Afspilningen kunne ikke startes") }
                }
        }
    }

    fun retry() {
        currentItem?.let(::start)
    }

    fun togglePlayPause() {
        val player = _state.value.player ?: return
        if (player.isPlaying) player.pause() else player.play()
    }

    fun pause() {
        _state.value.player?.pause()
    }

    fun seekBy(deltaMs: Long) {
        val player = _state.value.player ?: return
        val duration = player.duration.takeIf { it > 0 } ?: Long.MAX_VALUE
        player.seekTo((player.currentPosition + deltaMs).coerceIn(0, duration))
        publishPosition(player)
    }

    fun selectQuality(value: String) {
        val player = _state.value.player ?: return
        val builder = player.trackSelectionParameters.buildUpon()
        when (value) {
            "720p" -> builder.setMaxVideoSize(Int.MAX_VALUE, 720)
            "1080p" -> builder.setMaxVideoSize(Int.MAX_VALUE, 1080)
            "2160p" -> builder.setMaxVideoSize(Int.MAX_VALUE, 2160)
            else -> builder.clearVideoSizeConstraints()
        }
        player.trackSelectionParameters = builder.build()
        _state.update { it.copy(quality = value) }
    }

    fun selectAudio(track: TvTrack) {
        val player = _state.value.player ?: return
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setPreferredAudioLanguage(track.language)
            .build()
        _state.update { it.copy(selectedAudio = track.id) }
    }

    fun selectSubtitle(track: TvTrack?) {
        val player = _state.value.player ?: return
        val builder = player.trackSelectionParameters.buildUpon()
        if (track == null) {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        } else {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                .setPreferredTextLanguage(track.language)
                .setSelectUndeterminedTextLanguage(true)
        }
        player.trackSelectionParameters = builder.build()
        _state.update { it.copy(selectedSubtitle = track?.id) }
    }

    fun finish(completed: Boolean = false, after: (() -> Unit)? = null) {
        scope.launch {
            finishCurrent(completed)
            releasePlayer()
            _state.value = TvPlaybackState()
            after?.invoke()
        }
    }

    fun close() {
        finish(false)
    }

    private fun prepare(auth: TvPlaybackAuthorization) {
        authorization = auth
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                15_000,
                90_000,
                1_000,
                2_500,
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
        val player = ExoPlayer.Builder(applicationContext)
            .setLoadControl(loadControl)
            .build()
            .apply {
                setWakeMode(C.WAKE_MODE_NETWORK)
                addListener(listener)
                setMediaItem(
                    MediaItem.Builder()
                        .setUri(auth.streamUrl)
                        .setMimeType(auth.contentType)
                        .build(),
                )
                playWhenReady = true
                prepare()
            }
        _state.update {
            it.copy(
                phase = TvPlaybackPhase.Preparing,
                player = player,
                audioTracks = auth.audioTracks,
                subtitleTracks = auth.subtitleTracks,
                selectedAudio = auth.audioTracks.firstOrNull(TvTrack::selected)?.id,
                selectedSubtitle = auth.subtitleTracks.firstOrNull(TvTrack::selected)?.id,
                quality = auth.qualityMode.replaceFirstChar { char -> char.titlecase(Locale.ROOT) },
                upscaleLabel = when {
                    !auth.allowUpscale -> "Fra"
                    auth.upscaleMode == "server" -> "Server"
                    else -> "TV"
                },
            )
        }
        ticker?.cancel()
        ticker = scope.launch { telemetryLoop(player, auth) }
    }

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            val player = _state.value.player ?: return
            when (playbackState) {
                Player.STATE_BUFFERING -> _state.update { it.copy(phase = TvPlaybackPhase.Buffering) }
                Player.STATE_READY -> _state.update { it.copy(phase = TvPlaybackPhase.Ready, error = null) }
                Player.STATE_ENDED -> {
                    _state.update { it.copy(phase = TvPlaybackPhase.Ended, playing = false) }
                    scope.launch {
                        finishCurrent(completed = true)
                        onEnded()
                    }
                }
            }
            publishPosition(player)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _state.update { it.copy(playing = isPlaying) }
        }

        override fun onPlayerError(error: PlaybackException) {
            _state.update { it.copy(phase = TvPlaybackPhase.Error, error = error.localizedMessage ?: "Videoafspilleren meldte en fejl") }
        }
    }

    private suspend fun telemetryLoop(player: ExoPlayer, auth: TvPlaybackAuthorization) {
        var seconds = 0
        while (authorization?.sessionId == auth.sessionId && player.applicationLooper.thread.isAlive) {
            delay(1_000)
            seconds += 1
            publishPosition(player)
            val duration = player.duration.takeIf { it > 0 && it != C.TIME_UNSET }
            val buffer = (player.bufferedPosition - player.currentPosition).coerceAtLeast(0)
            if (seconds % 10 == 0) {
                runCatching {
                    repository.heartbeat(
                        auth.sessionId,
                        when {
                            player.playbackState == Player.STATE_BUFFERING -> "buffering"
                            player.isPlaying -> "playing"
                            else -> "paused"
                        },
                        player.currentPosition.coerceAtLeast(0),
                        duration,
                        buffer,
                    )
                }
            }
            if (seconds % 15 == 0) {
                runCatching { repository.progress(auth.sessionId, player.currentPosition.coerceAtLeast(0), duration, false) }
            }
        }
    }

    private fun publishPosition(player: ExoPlayer) {
        _state.update {
            it.copy(
                positionMs = player.currentPosition.coerceAtLeast(0),
                durationMs = player.duration.takeIf { duration -> duration > 0 && duration != C.TIME_UNSET } ?: it.durationMs,
                bufferedPositionMs = player.bufferedPosition.coerceAtLeast(0),
                playing = player.isPlaying,
            )
        }
    }

    private suspend fun finishCurrent(completed: Boolean) = finishMutex.withLock {
        val auth = authorization ?: return
        if (finishedSessionId == auth.sessionId) return
        finishedSessionId = auth.sessionId
        ticker?.cancel()
        ticker = null
        val player = _state.value.player
        val position = player?.currentPosition?.coerceAtLeast(0) ?: _state.value.positionMs
        val duration = player?.duration?.takeIf { it > 0 && it != C.TIME_UNSET } ?: _state.value.durationMs
        runCatching { repository.progress(auth.sessionId, position, duration, completed) }
        runCatching { repository.release(auth.sessionId) }
        authorization = null
    }

    private fun releasePlayer() {
        ticker?.cancel()
        ticker = null
        _state.value.player?.run {
            removeListener(listener)
            release()
        }
    }

    private fun capabilities(): JSONObject {
        val display = applicationContext.getSystemService(DisplayManager::class.java)?.displays?.firstOrNull()
        val metrics = applicationContext.resources.displayMetrics
        val hdr = Build.VERSION.SDK_INT >= 24 && display?.hdrCapabilities?.supportedHdrTypes?.isNotEmpty() == true
        val codecs = runCatching {
            MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
                .filterNot { it.isEncoder }
                .flatMap { it.supportedTypes.asIterable() }
                .mapNotNull {
                    when (it.lowercase()) {
                        "video/avc" -> "h264"
                        "video/hevc" -> "hevc"
                        "video/x-vnd.on2.vp9" -> "vp9"
                        "video/av01" -> "av1"
                        else -> null
                    }
                }
                .distinct()
        }.getOrDefault(listOf("h264"))
        val network = applicationContext.getSystemService(ConnectivityManager::class.java)
        val capabilities = network.activeNetwork?.let(network::getNetworkCapabilities)
        val downlink = capabilities?.linkDownstreamBandwidthKbps?.takeIf { it > 0 }?.div(1_000.0)
        return JSONObject()
            .put("screenHeight", metrics.heightPixels.coerceIn(240, 4320))
            .put("devicePixelRatio", metrics.density.toDouble().coerceIn(0.5, 4.0))
            .apply { downlink?.coerceIn(0.1, 1_000.0)?.let { put("estimatedDownlinkMbps", it) } }
            .put("supportedCodecs", JSONArray(codecs))
            .put("supportedAudioCodecs", JSONArray(listOf("aac", "ac3", "eac3", "opus", "mp3", "flac")))
            .put("supportedContainers", JSONArray(listOf("mp4", "mkv", "webm", "mpegts", "hls")))
            .put("supportsHdr", hdr)
            .put("upscaleMode", "server")
            .put("bufferProfile", "stable")
            .put("startupPolicy", "baseline_first")
    }
}
