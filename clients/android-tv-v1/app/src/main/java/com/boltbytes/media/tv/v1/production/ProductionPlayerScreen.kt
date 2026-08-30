@file:androidx.annotation.OptIn(markerClass = [androidx.media3.common.util.UnstableApi::class])

package com.boltbytes.media.tv.v1.production

import android.app.Activity
import android.content.Context
import android.view.KeyEvent as AndroidKeyEvent
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Audiotrack
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Forward30
import androidx.compose.material.icons.rounded.HighQuality
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Subtitles
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.PlayerView
import com.boltbytes.media.tv.v1.ui.V1Button
import com.boltbytes.media.tv.v1.ui.V1Colors
import com.boltbytes.media.tv.v1.ui.V1FocusSurface
import com.boltbytes.media.tv.v1.ui.V1GlassPanel
import com.boltbytes.media.tv.v1.ui.V1Pill
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

private enum class PlayerOption { Quality, Audio, Subtitles, Upscaling }

internal const val PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS = 10

internal fun shouldStartNextEpisodeCountdown(
    positionMs: Long,
    durationMs: Long,
    creditsStartMs: Long?,
    alreadyHandled: Boolean,
    autoplay: Boolean,
    nextEpisodeId: String?,
): Boolean {
    if (alreadyHandled || !autoplay || nextEpisodeId.isNullOrBlank() || durationMs <= 0L) {
        return false
    }
    val fallbackStartMs = (durationMs - PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS * 1_000L)
        .coerceAtLeast(0L)
    val triggerAtMs = creditsStartMs
        ?.takeIf { it in 0L until durationMs }
        ?: fallbackStartMs
    return positionMs >= triggerAtMs
}

internal fun isCreditsMarkerType(type: String): Boolean = when (type.trim().lowercase()) {
    "credits", "credit", "end_credits", "end-credits", "rulletekst" -> true
    else -> false
}

private enum class SubtitleTextSize(val label: String, val fontSizeSp: Int) {
    Small("Lille", 24),
    Normal("Normal", 29),
    Large("Stor", 35),
    ExtraLarge("Ekstra stor", 42),
}

private enum class SubtitleTextColor(val label: String, val color: Color) {
    White("Hvid", Color.White),
    WarmWhite("Varm hvid", Color(0xFFFFF4D6)),
    Yellow("Gul", Color(0xFFFFE16B)),
    Cyan("Lys blå", Color(0xFF9CEBFF)),
}

private enum class SubtitleBackground(
    val label: String,
    val color: Color,
) {
    None("Ingen", Color.Transparent),
    Shadow("Skygge", Color.Black.copy(alpha = 0.30f)),
    Dim("Sort 60 %", Color.Black.copy(alpha = 0.60f)),
    Solid("Sort 85 %", Color.Black.copy(alpha = 0.85f)),
}

private data class ProductionSubtitleStyle(
    val size: SubtitleTextSize = SubtitleTextSize.Normal,
    val textColor: SubtitleTextColor = SubtitleTextColor.White,
    val background: SubtitleBackground = SubtitleBackground.Shadow,
    val timingOffsetMs: Int = 0,
)

private class ProductionSubtitleStyleStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        "production_player_subtitle_style",
        Context.MODE_PRIVATE,
    )

    fun load(): ProductionSubtitleStyle = ProductionSubtitleStyle(
        size = enumValue(preferences.getString("size", null), SubtitleTextSize.Normal),
        textColor = enumValue(preferences.getString("text_color", null), SubtitleTextColor.White),
        background = enumValue(preferences.getString("background", null), SubtitleBackground.Shadow),
        timingOffsetMs = preferences.getInt("timing_offset_ms", 0).coerceIn(-10_000, 10_000),
    )

    fun save(style: ProductionSubtitleStyle) {
        preferences.edit()
            .putString("size", style.size.name)
            .putString("text_color", style.textColor.name)
            .putString("background", style.background.name)
            .putInt("timing_offset_ms", style.timingOffsetMs.coerceIn(-10_000, 10_000))
            .apply()
    }

    private inline fun <reified T : Enum<T>> enumValue(value: String?, fallback: T): T =
        enumValues<T>().firstOrNull { it.name == value } ?: fallback
}

private data class PlayerEngineState(
    val preparing: Boolean = true,
    val buffering: Boolean = false,
    val playing: Boolean = false,
    val error: String? = null,
    val authorization: ProductionAuthorization? = null,
    val ended: Boolean = false,
    val activeVideoHeight: Int? = null,
    val activeVideoBitrate: Int? = null,
    val subtitleCues: List<ProductionSubtitleCue> = emptyList(),
    val selectedSubtitleTrackId: String? = null,
    val subtitleStatusMessage: String? = null,
)

private class ProductionPlaybackEngine(
    context: Context,
    private val api: ProductionApi,
    private val request: ProductionPlaybackRequest,
    private val preferences: ProductionPreferences,
) : Player.Listener {
    private val trackSelector = DefaultTrackSelector(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val finished = AtomicBoolean(false)
    private val restarting = AtomicBoolean(false)
    private val reconfiguring = AtomicBoolean(false)
    private val switchingChannel = AtomicBoolean(false)
    private var heartbeatJob: Job? = null
    private var progressJob: Job? = null
    private var variantMonitorJob: Job? = null
    private var subtitleLoadJob: Job? = null
    private var channelIndex = request.channelIndex
    private var automaticRecoveryAttempts = 0
    private var selectedQualityMode = preferences.qualityMode.lowercase()
    private var selectedFixedQualityHeight = preferences.maxHeight
    private var selectedAudioTrackId: String? = null
    private var selectedSubtitleTrack: ProductionTrack? = null

    val player: ExoPlayer = ExoPlayer.Builder(context)
        .setTrackSelector(trackSelector)
        .setLoadControl(
            DefaultLoadControl.Builder().setBufferDurationsMs(
                25_000,
                90_000,
                1_500,
                2_500,
            ).build(),
        )
        .build()
        .apply {
            addListener(this@ProductionPlaybackEngine)
            setWakeMode(C.WAKE_MODE_NETWORK)
            setHandleAudioBecomingNoisy(true)
            playbackParameters = playbackParameters.withSpeed(preferences.playbackRate)
        }

    private val mutableState = MutableStateFlow(PlayerEngineState())
    val state: StateFlow<PlayerEngineState> = mutableState.asStateFlow()

    suspend fun start() {
        authorizeAndStart(request.startPositionMs)
    }

    private suspend fun authorizeAndStart(positionMs: Long) {
        try {
            var authorization = if (request.live) api.authorizeLive(request.mediaId) else {
                api.authorizeVod(request.mediaId, positionMs, preferences)
            }
            mutableState.value = mutableState.value.copy(authorization = authorization, preparing = true, error = null)
            startLeases()
            val preparation = if (request.live) {
                authorization = awaitLivePreparation(authorization)
                mutableState.value = mutableState.value.copy(authorization = authorization)
                null
            } else {
                awaitPreparation(authorization)
            }
            val stageLowestRendition = !request.live &&
                preferences.qualityMode.equals("auto", ignoreCase = true) &&
                preparation?.allVariantsReady == false
            forceLowestBitrate(stageLowestRendition)
            loadAuthorization(authorization, positionMs)
            monitorVariantReadiness(authorization, preparation)
        } catch (error: Exception) {
            mutableState.value = mutableState.value.copy(preparing = false, buffering = false, error = error.message ?: "Afspilningen kunne ikke startes")
        }
    }

    private suspend fun awaitLivePreparation(
        authorization: ProductionAuthorization,
    ): ProductionAuthorization {
        val statusUrl = authorization.preparationStatusUrl
            ?: error("Serveren returnerede ingen Live TV-statusadresse")
        val deadline = android.os.SystemClock.elapsedRealtime() + 60_000L
        while (!finished.get()) {
            val status = api.livePreparation(statusUrl)
            when (status.state.lowercase()) {
                "ready", "active" -> return authorization.copy(
                    audioTracks = status.audioTracks.ifEmpty { authorization.audioTracks },
                    subtitleTracks = status.subtitleTracks.ifEmpty { authorization.subtitleTracks },
                )
                "failed", "released", "expired", "cancelled" -> error(status.message)
            }
            if (android.os.SystemClock.elapsedRealtime() >= deadline) {
                error("Live TV-streamen blev ikke klar inden for 60 sekunder")
            }
            delay(500L)
        }
        error("Live TV-afspilningen blev afbrudt")
    }

    private suspend fun awaitPreparation(authorization: ProductionAuthorization): ProductionPreparationStatus? {
        val statusUrl = authorization.preparationStatusUrl ?: return null
        val deadline = android.os.SystemClock.elapsedRealtime() + 120_000L
        while (!finished.get()) {
            val status = api.playbackPreparation(statusUrl)
            when (status.state.lowercase()) {
                "ready" -> return status
                "failed" -> error(status.message)
            }
            if (android.os.SystemClock.elapsedRealtime() >= deadline) {
                error("Serveren nåede ikke at klargøre streamen")
            }
            delay(500L)
        }
        return null
    }

    private fun monitorVariantReadiness(
        authorization: ProductionAuthorization,
        preparation: ProductionPreparationStatus?,
    ) {
        variantMonitorJob?.cancel()
        val statusUrl = authorization.preparationStatusUrl ?: return
        if (preparation?.allVariantsReady != false || !preferences.qualityMode.equals("auto", ignoreCase = true)) return
        variantMonitorJob = scope.launch {
            while (isActive && !finished.get()) {
                delay(1_000L)
                val status = runCatching { api.playbackPreparation(statusUrl) }.getOrNull() ?: continue
                if (status.state.equals("failed", ignoreCase = true)) return@launch
                if (status.allVariantsReady) {
                    forceLowestBitrate(false)
                    return@launch
                }
            }
        }
    }

    private fun forceLowestBitrate(enabled: Boolean) {
        trackSelector.parameters = trackSelector.buildUponParameters()
            .setForceLowestBitrate(enabled)
            .build()
    }

    private fun loadAuthorization(authorization: ProductionAuthorization, positionMs: Long) {
        val item = MediaItem.Builder().setUri(authorization.streamUrl).apply {
            authorization.contentType?.takeIf(String::isNotBlank)?.let { setMimeType(it) }
        }.build()
        val localPositionMs = (positionMs - authorization.streamTimelineOffsetMs).coerceAtLeast(0L)
        player.setMediaItem(item, localPositionMs)
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
        player.playWhenReady = true
        player.prepare()
        player.play()
    }

    private fun startLeases() {
        heartbeatJob?.cancel()
        progressJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive && !finished.get()) {
                val authorization = mutableState.value.authorization
                if (authorization != null) {
                    runCatching {
                        if (request.live) api.heartbeatLive(authorization.sessionId, authorization.streamToken, absolutePositionMs())
                        else api.heartbeatVod(authorization.sessionId, absolutePositionMs(), player.isPlaying)
                    }
                }
                delay(5_000L)
            }
        }
        if (!request.live) {
            progressJob = scope.launch {
                while (isActive && !finished.get()) {
                    delay(15_000L)
                    val authorization = mutableState.value.authorization ?: continue
                    runCatching { api.progressVod(authorization.sessionId, absolutePositionMs(), absoluteDurationMs(), false) }
                }
            }
        }
    }

    fun togglePlay() {
        if (player.isPlaying) player.pause() else player.play()
    }

    fun seekBy(deltaMs: Long) {
        if (!player.isCurrentMediaItemSeekable) return
        val target = (player.currentPosition + deltaMs).coerceAtLeast(0L).let { value ->
            val duration = safeDuration()
            if (duration > 0) value.coerceAtMost(duration) else value
        }
        player.seekTo(target)
    }

    fun seekTo(positionMs: Long) {
        if (!player.isCurrentMediaItemSeekable) return
        val offset = mutableState.value.authorization?.streamTimelineOffsetMs ?: 0L
        player.seekTo((positionMs - offset).coerceAtLeast(0L))
    }

    fun retry() {
        automaticRecoveryAttempts = 0
        restartPlayback()
    }

    private fun restartPlayback() {
        if (!restarting.compareAndSet(false, true) || finished.get()) return
        scope.launch {
            val resumePositionMs = absolutePositionMs().coerceAtLeast(request.startPositionMs)
            val resumeDurationMs = absoluteDurationMs()
            val previous = mutableState.value.authorization
            heartbeatJob?.cancel()
            progressJob?.cancel()
            variantMonitorJob?.cancel()
            player.stop()
            if (previous != null) {
                if (request.live) {
                    runCatching { api.releaseLive(previous.sessionId, previous.streamToken) }
                } else {
                    runCatching { api.progressVod(previous.sessionId, resumePositionMs, resumeDurationMs, false) }
                    runCatching { api.releaseVod(previous.sessionId) }
                }
            }
            mutableState.value = mutableState.value.copy(
                authorization = null,
                preparing = true,
                buffering = false,
                error = null,
            )
            try {
                authorizeAndStart(resumePositionMs)
            } finally {
                restarting.set(false)
            }
        }
    }

    fun setQuality(label: String) {
        when (label) {
            "Auto" -> {
                selectedQualityMode = "auto"
                selectedFixedQualityHeight = null
            }
            "Original" -> {
                selectedQualityMode = "original"
                selectedFixedQualityHeight = null
            }
            else -> {
                selectedQualityMode = "fixed"
                selectedFixedQualityHeight = label.removeSuffix("p").toIntOrNull()
            }
        }
        if (request.live) {
            forceLowestBitrate(false)
            val height = selectedFixedQualityHeight ?: Int.MAX_VALUE
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                .setMaxVideoSize(Int.MAX_VALUE, height)
                .build()
        } else {
            requestVodReconfiguration()
        }
    }

    fun setAudio(track: ProductionTrack) {
        selectedAudioTrackId = track.id
        if (request.live) {
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                .setPreferredAudioLanguage(track.language)
                .build()
        } else {
            requestVodReconfiguration()
        }
    }

    fun setSubtitles(track: ProductionTrack?) {
        val wasBurnIn = selectedSubtitleTrack?.delivery == "burn_in"
        subtitleLoadJob?.cancel()
        selectedSubtitleTrack = track
        mutableState.value = mutableState.value.copy(
            subtitleCues = emptyList(),
            selectedSubtitleTrackId = track?.id,
            subtitleStatusMessage = null,
        )
        when {
            !request.live && (wasBurnIn || track?.delivery == "burn_in") -> requestVodReconfiguration()
            track == null -> Unit
            track.delivery == "webvtt" -> loadClientSubtitle(track)
            else -> publishSubtitleFailure(track, "Undertekstformatet understøttes ikke")
        }
    }

    private fun loadClientSubtitle(track: ProductionTrack) {
        val sourceUrl = track.sourceUrl
        if (sourceUrl.isNullOrBlank()) {
            publishSubtitleFailure(track, "Undertekstsporet mangler en gyldig kilde")
            return
        }
        subtitleLoadJob?.cancel()
        mutableState.value = mutableState.value.copy(
            selectedSubtitleTrackId = track.id,
            subtitleStatusMessage = "Forbereder ${track.label}…",
        )
        subtitleLoadJob = scope.launch {
            val maxAttempts = if (track.id.startsWith("embedded-")) 45 else 3
            var lastMessage = "Undertekstsporet kunne ikke indlæses"
            for (attempt in 0 until maxAttempts) {
                if (finished.get() || selectedSubtitleTrack?.id != track.id) return@launch
                val fetched = runCatching { api.fetchSubtitleWebVtt(sourceUrl) }
                if (fetched.isSuccess) {
                    val parsed = runCatching { parseProductionWebVtt(fetched.getOrThrow()) }
                    if (parsed.isSuccess) {
                        mutableState.value = mutableState.value.copy(
                            subtitleCues = parsed.getOrThrow(),
                            selectedSubtitleTrackId = track.id,
                            subtitleStatusMessage = null,
                        )
                        return@launch
                    }
                    lastMessage = parsed.exceptionOrNull()?.message ?: "Undertekstsporet er ugyldigt"
                } else {
                    lastMessage = fetched.exceptionOrNull()?.message ?: lastMessage
                }
                val statusUrl = mutableState.value.authorization?.subtitlePreparationStatusUrl
                if (track.id.startsWith("embedded-") && statusUrl != null) {
                    val status = runCatching { api.subtitlePreparation(statusUrl) }.getOrNull()
                    if (status?.unavailableTrackIds?.contains(track.id) == true) {
                        lastMessage = "Undertekstsporet kunne ikke udtrækkes fra mediet"
                        break
                    }
                }
                if (attempt + 1 < maxAttempts) delay(1_000L)
            }
            if (selectedSubtitleTrack?.id == track.id) publishSubtitleFailure(track, lastMessage)
        }
    }

    private fun publishSubtitleFailure(track: ProductionTrack, message: String) {
        if (selectedSubtitleTrack?.id != track.id) return
        selectedSubtitleTrack = null
        mutableState.value = mutableState.value.copy(
            subtitleCues = emptyList(),
            selectedSubtitleTrackId = null,
            subtitleStatusMessage = "$message. Videoen fortsætter.",
        )
    }

    private fun requestVodReconfiguration() {
        if (request.live || finished.get() || !reconfiguring.compareAndSet(false, true)) return
        scope.launch {
            val current = mutableState.value.authorization
            if (current == null) {
                reconfiguring.set(false)
                return@launch
            }
            val positionMs = absolutePositionMs()
            player.pause()
            mutableState.value = mutableState.value.copy(preparing = true, buffering = false, error = null)
            try {
                val configured = api.reconfigureVod(
                    current = current,
                    startPositionMs = positionMs,
                    qualityMode = selectedQualityMode,
                    fixedQualityHeight = selectedFixedQualityHeight,
                    audioTrackId = selectedAudioTrackId,
                    subtitleTrack = selectedSubtitleTrack,
                    preferences = preferences,
                )
                mutableState.value = mutableState.value.copy(authorization = configured, preparing = true, error = null)
                val preparation = awaitPreparation(configured)
                val stageLowestRendition = selectedQualityMode == "auto" && preparation?.allVariantsReady == false
                forceLowestBitrate(stageLowestRendition)
                loadAuthorization(configured, positionMs)
                monitorVariantReadiness(configured, preparation)
                mutableState.value = mutableState.value.copy(
                    selectedSubtitleTrackId = selectedSubtitleTrack?.id,
                    subtitleStatusMessage = null,
                )
                selectedSubtitleTrack?.takeIf { it.delivery == "webvtt" }?.let(::loadClientSubtitle)
                automaticRecoveryAttempts = 0
            } catch (error: Exception) {
                player.playWhenReady = true
                val selectedSubtitle = selectedSubtitleTrack
                if (selectedSubtitle?.delivery == "burn_in") {
                    publishSubtitleFailure(selectedSubtitle, error.message ?: "Burn-in kunne ikke startes")
                } else {
                    mutableState.value = mutableState.value.copy(
                        preparing = false,
                        buffering = false,
                        error = null,
                        subtitleStatusMessage = "Valget kunne ikke anvendes: ${error.message ?: "ukendt fejl"}",
                    )
                }
            } finally {
                reconfiguring.set(false)
            }
        }
    }

    fun switchChannel(direction: Int) {
        if (
            !request.live ||
            request.channelIds.isEmpty() ||
            !switchingChannel.compareAndSet(false, true)
        ) return
        val targetIndex = (channelIndex + direction).mod(request.channelIds.size)
        val authorization = mutableState.value.authorization
        if (authorization == null) {
            switchingChannel.set(false)
            return
        }
        scope.launch {
            try {
                val switched = api.switchLive(
                    authorization.sessionId,
                    request.channelIds[targetIndex],
                    authorization.streamToken,
                )
                channelIndex = targetIndex
                mutableState.value = mutableState.value.copy(
                    authorization = switched,
                    preparing = true,
                    buffering = false,
                    error = null,
                )
                startLeases()
                val ready = awaitLivePreparation(switched)
                if (finished.get()) return@launch
                mutableState.value = mutableState.value.copy(authorization = ready)
                loadAuthorization(ready, 0L)
                automaticRecoveryAttempts = 0
            } catch (error: Exception) {
                mutableState.value = mutableState.value.copy(
                    preparing = false,
                    buffering = false,
                    error = error.message ?: "Kanalen kunne ikke skiftes",
                )
            } finally {
                switchingChannel.set(false)
            }
        }
    }

    fun finishAsync(completed: Boolean) {
        if (!finished.compareAndSet(false, true)) return
        heartbeatJob?.cancel()
        progressJob?.cancel()
        variantMonitorJob?.cancel()
        subtitleRefreshJob?.cancel()
        val authorization = mutableState.value.authorization
        val position = absolutePositionMs()
        val duration = absoluteDurationMs()
        player.playWhenReady = false
        player.release()
        scope.launch {
            if (authorization != null) {
                if (request.live) {
                    runCatching { api.releaseLive(authorization.sessionId, authorization.streamToken) }
                } else {
                    runCatching { api.progressVod(authorization.sessionId, position, duration, completed) }
                    runCatching { api.releaseVod(authorization.sessionId) }
                }
            }
        }
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
        val ended = playbackState == Player.STATE_ENDED
        mutableState.value = mutableState.value.copy(
            preparing = playbackState == Player.STATE_IDLE,
            buffering = playbackState == Player.STATE_BUFFERING,
            playing = player.isPlaying,
            ended = ended,
        )
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        mutableState.value = mutableState.value.copy(playing = isPlaying)
    }

    override fun onTracksChanged(tracks: Tracks) {
        publishActiveVideoFormat()
    }

    override fun onVideoSizeChanged(videoSize: VideoSize) {
        publishActiveVideoFormat(videoSize.height)
    }

    override fun onPlayerError(error: PlaybackException) {
        if (
            error.errorCode == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS &&
            automaticRecoveryAttempts < 1 &&
            !finished.get()
        ) {
            automaticRecoveryAttempts += 1
            restartPlayback()
            return
        }
        mutableState.value = mutableState.value.copy(
            preparing = false,
            buffering = false,
            error = "Afspilningen stoppede: ${error.errorCodeName}",
        )
    }

    private fun publishActiveVideoFormat(decodedHeight: Int? = null) {
        val format = player.videoFormat
        mutableState.value = mutableState.value.copy(
            activeVideoHeight = format?.height?.takeIf { it > 0 }
                ?: decodedHeight?.takeIf { it > 0 },
            activeVideoBitrate = format?.bitrate?.takeIf { it > 0 },
        )
    }

    private fun safeDuration(): Long = player.duration.takeIf { it != C.TIME_UNSET && it > 0L } ?: 0L
    fun absolutePositionMs(): Long = (
        (mutableState.value.authorization?.streamTimelineOffsetMs ?: 0L) + player.currentPosition.coerceAtLeast(0L)
        ).coerceAtLeast(0L)
    fun absoluteDurationMs(): Long = (
        (mutableState.value.authorization?.streamTimelineOffsetMs ?: 0L) + safeDuration()
        ).coerceAtLeast(0L)
    fun absoluteBufferedPositionMs(): Long = (
        (mutableState.value.authorization?.streamTimelineOffsetMs ?: 0L) + player.bufferedPosition.coerceAtLeast(0L)
        ).coerceAtLeast(0L)
}

@Composable
internal fun ProductionPlayerScreen(
    api: ProductionApi,
    request: ProductionPlaybackRequest,
    preferences: ProductionPreferences,
    onExit: () -> Unit,
    onEnded: () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val lifecycleOwner = LocalLifecycleOwner.current
    val subtitleStyleStore = remember(context.applicationContext) { ProductionSubtitleStyleStore(context) }
    var subtitleStyle by remember { mutableStateOf(subtitleStyleStore.load()) }
    val engine = remember(request.mediaId, request.live) {
        ProductionPlaybackEngine(
            context = context,
            api = api,
            request = request,
            preferences = preferences,
        )
    }
    val engineState by engine.state.collectAsStateWithLifecycle()
    var controlsVisible by remember(request.mediaId) { mutableStateOf(false) }
    var option by remember(request.mediaId) { mutableStateOf<PlayerOption?>(null) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var bufferedMs by remember { mutableLongStateOf(0L) }
    var lastInteraction by remember { mutableLongStateOf(android.os.SystemClock.elapsedRealtime()) }
    var seekIndicator by remember { mutableIntStateOf(0) }
    var selectedQuality by remember(request.mediaId) { mutableStateOf(if (preferences.qualityMode == "fixed") "${preferences.maxHeight ?: 1080}p" else preferences.qualityMode.replaceFirstChar(Char::uppercase)) }
    var selectedAudioId by remember(request.mediaId) { mutableStateOf<String?>(null) }
    var selectedSubtitleId by remember(request.mediaId) { mutableStateOf<String?>(null) }
    var endedHandled by remember(request.mediaId) { mutableStateOf(false) }
    var nextEpisodeCountdown by remember(request.mediaId) { mutableIntStateOf(-1) }
    var nextEpisodeCountdownCancelled by remember(request.mediaId) { mutableStateOf(false) }
    var playbackLifecycleActive by remember {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED))
    }
    val creditsStartMs = engineState.authorization?.markers
        ?.filter { isCreditsMarkerType(it.type) }
        ?.minOfOrNull { it.startMs }
    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }

    LaunchedEffect(engine) { engine.start() }
    DisposableEffect(engine) { onDispose { engine.finishAsync(false) } }

    DisposableEffect(activity, lifecycleOwner) {
        fun keepAwake() { activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
        keepAwake()
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME || event == Lifecycle.Event.ON_START) {
                playbackLifecycleActive = true
                keepAwake()
            } else if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                playbackLifecycleActive = false
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    LaunchedEffect(engine) {
        while (true) {
            positionMs = engine.absolutePositionMs()
            durationMs = engine.absoluteDurationMs()
            bufferedMs = engine.absoluteBufferedPositionMs().coerceAtLeast(positionMs)
            delay(400L)
        }
    }

    LaunchedEffect(controlsVisible, option) {
        if (controlsVisible && option == null) {
            delay(80L)
            runCatching { playFocus.requestFocus() }
        } else if (!controlsVisible && option == null) {
            runCatching { rootFocus.requestFocus() }
        }
    }

    LaunchedEffect(lastInteraction, controlsVisible, option, engineState.playing) {
        if (controlsVisible && option == null && engineState.playing) {
            delay(5_000L)
            if (android.os.SystemClock.elapsedRealtime() - lastInteraction >= 4_900L) controlsVisible = false
        }
    }

    LaunchedEffect(seekIndicator) {
        if (seekIndicator != 0) {
            delay(850L)
            seekIndicator = 0
        }
    }

    LaunchedEffect(positionMs, durationMs, creditsStartMs, preferences.autoplay, request.nextEpisodeId) {
        if (
            nextEpisodeCountdown < 0 &&
            !nextEpisodeCountdownCancelled &&
            shouldStartNextEpisodeCountdown(
                positionMs = positionMs,
                durationMs = durationMs,
                creditsStartMs = creditsStartMs,
                alreadyHandled = endedHandled,
                autoplay = preferences.autoplay,
                nextEpisodeId = request.nextEpisodeId,
            )
        ) {
            option = null
            controlsVisible = false
            nextEpisodeCountdown = PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS
        }
    }

    LaunchedEffect(engineState.ended) {
        if (engineState.ended && !endedHandled) {
            endedHandled = true
            engine.finishAsync(true)
            when {
                nextEpisodeCountdown >= 0 -> Unit
                nextEpisodeCountdownCancelled -> onExit()
                preferences.autoplay && !request.nextEpisodeId.isNullOrBlank() -> {
                    option = null
                    controlsVisible = false
                    nextEpisodeCountdown = PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS
                }
                else -> onEnded()
            }
        }
    }

    LaunchedEffect(nextEpisodeCountdown, playbackLifecycleActive) {
        when {
            nextEpisodeCountdown > 0 && playbackLifecycleActive -> {
                delay(1_000L)
                nextEpisodeCountdown -= 1
            }
            nextEpisodeCountdown == 0 -> {
                nextEpisodeCountdown = -1
                engine.finishAsync(true)
                onEnded()
            }
        }
    }

    fun exitNow() {
        engine.finishAsync(false)
        onExit()
    }

    val activeMarker = engineState.authorization?.markers?.firstOrNull { marker ->
        positionMs >= marker.startMs && positionMs < marker.endMs
    }
    val activeRendition = activeRenditionLabel(
        height = engineState.activeVideoHeight,
        bitrate = engineState.activeVideoBitrate,
    )
    val qualityStatus = if (selectedQuality.equals("Auto", ignoreCase = true)) {
        "Auto · ${activeRendition ?: "finder kvalitet"}"
    } else {
        selectedQuality
    }
    val activeSubtitleText = activeProductionSubtitleText(
        cues = engineState.subtitleCues,
        positionMs = positionMs,
        timingOffsetMs = subtitleStyle.timingOffsetMs,
    )

    LaunchedEffect(engineState.selectedSubtitleTrackId) {
        selectedSubtitleId = engineState.selectedSubtitleTrackId
    }

    fun updateSubtitleStyle(updated: ProductionSubtitleStyle) {
        val normalized = updated.copy(timingOffsetMs = updated.timingOffsetMs.coerceIn(-10_000, 10_000))
        subtitleStyle = normalized
        subtitleStyleStore.save(normalized)
    }

    BackHandler {
        when {
            option != null -> {
                option = null
                controlsVisible = true
                lastInteraction = android.os.SystemClock.elapsedRealtime()
            }
            controlsVisible -> controlsVisible = false
            else -> exitNow()
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black)
            .focusRequester(rootFocus)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown || event.nativeKeyEvent.repeatCount > 0) return@onPreviewKeyEvent false
                if (option != null) return@onPreviewKeyEvent false
                val keyCode = event.nativeKeyEvent.keyCode
                if (controlsVisible) {
                    lastInteraction = android.os.SystemClock.elapsedRealtime()
                    return@onPreviewKeyEvent false
                }
                when (keyCode) {
                    AndroidKeyEvent.KEYCODE_DPAD_CENTER,
                    AndroidKeyEvent.KEYCODE_ENTER,
                    AndroidKeyEvent.KEYCODE_BUTTON_A,
                    -> {
                        controlsVisible = true
                        lastInteraction = android.os.SystemClock.elapsedRealtime()
                        true
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                        if (!request.live || engine.player.isCurrentMediaItemSeekable) {
                            engine.seekBy(-10_000L)
                            seekIndicator = -10
                        }
                        true
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                        if (!request.live || engine.player.isCurrentMediaItemSeekable) {
                            engine.seekBy(30_000L)
                            seekIndicator = 30
                        }
                        true
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_UP -> {
                        if (request.live) engine.switchChannel(-1)
                        request.live
                    }
                    AndroidKeyEvent.KEYCODE_DPAD_DOWN -> {
                        if (request.live) engine.switchChannel(1)
                        request.live
                    }
                    else -> false
                }
            }
            .focusable(!controlsVisible && option == null),
    ) {
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    player = engine.player
                    useController = false
                }
            },
            update = {
                it.player = engine.player
            },
            modifier = Modifier.fillMaxSize(),
        )

        activeSubtitleText?.let { text ->
            ProductionSubtitleOverlay(
                text = text,
                style = subtitleStyle,
                controlsVisible = controlsVisible,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }

        engineState.subtitleStatusMessage?.let { message ->
            V1GlassPanel(
                Modifier.align(Alignment.TopCenter).padding(top = 42.dp).width(520.dp).height(54.dp),
                radius = 27.dp,
            ) {
                Box(Modifier.fillMaxSize().padding(horizontal = 20.dp), contentAlignment = Alignment.Center) {
                    Text(message, color = V1Colors.Text, fontSize = 11.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
                }
            }
        }

        if (seekIndicator != 0) {
            V1GlassPanel(Modifier.align(Alignment.Center).width(172.dp).height(86.dp), radius = 43.dp) {
                Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                    Icon(if (seekIndicator < 0) Icons.Rounded.Replay10 else Icons.Rounded.Forward30, null, tint = V1Colors.Gold, modifier = Modifier.size(31.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(if (seekIndicator < 0) "10 sek tilbage" else "30 sek frem", color = V1Colors.Text, fontSize = 12.sp, fontWeight = FontWeight.Black)
                }
            }
        }

        activeMarker?.let { marker ->
            V1Button(
                label = when (marker.type.lowercase()) {
                    "recap" -> "Spring recap over"
                    "credits", "end_credits" -> "Spring rulletekster over"
                    else -> "Spring intro over"
                },
                onClick = { engine.seekTo(marker.endMs) },
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 54.dp, bottom = if (controlsVisible) 244.dp else 54.dp),
                primary = true,
                icon = Icons.Rounded.Forward30,
            )
        }

        if (engineState.buffering && engineState.error == null) {
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CircularProgressIndicator(color = V1Colors.Gold, strokeWidth = 3.dp, modifier = Modifier.size(45.dp))
                Text("Buffer…", color = V1Colors.Text, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }

        if (controlsVisible && option == null) {
            Box(
                Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent, Color.Black.copy(alpha = 0.92f)), startY = 220f)),
            ) {
                Column(
                    Modifier.fillMaxWidth().height(256.dp).align(Alignment.BottomCenter)
                        .padding(start = 54.dp, end = 54.dp, top = 25.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(request.title, color = V1Colors.Text, fontSize = 20.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(if (request.live) "LIVE" else "${formatTime(positionMs)} / ${formatTime(durationMs)}", color = if (request.live) V1Colors.Danger else V1Colors.Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                        V1Pill("Kvalitet: $qualityStatus", color = V1Colors.Gold, emphasized = true)
                        Spacer(Modifier.width(8.dp))
                        V1Pill(
                            if (preferences.allowUpscale && preferences.upscaleMode != "off") "Opskalering: Server" else "Opskalering: Fra",
                            color = V1Colors.Blue,
                        )
                    }
                    ProductionTimeline(positionMs, bufferedMs, durationMs, request.live)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        V1Button("10 sek", { engine.seekBy(-10_000L); lastInteraction = android.os.SystemClock.elapsedRealtime() }, icon = Icons.Rounded.Replay10)
                        V1Button(
                            if (engineState.playing) "Pause" else "Fortsæt",
                            { engine.togglePlay(); lastInteraction = android.os.SystemClock.elapsedRealtime() },
                            modifier = Modifier.focusRequester(playFocus),
                            primary = true,
                            icon = if (engineState.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        )
                        V1Button("30 sek", { engine.seekBy(30_000L); lastInteraction = android.os.SystemClock.elapsedRealtime() }, icon = Icons.Rounded.Forward30)
                        Spacer(Modifier.width(14.dp))
                        V1Button("Kvalitet", { option = PlayerOption.Quality }, icon = Icons.Rounded.HighQuality)
                        V1Button("Lyd", { option = PlayerOption.Audio }, icon = Icons.Rounded.Audiotrack)
                        V1Button("Undertekster", { option = PlayerOption.Subtitles }, icon = Icons.Rounded.Subtitles)
                        V1Button("Opskalering", { option = PlayerOption.Upscaling }, icon = Icons.Rounded.Settings)
                    }
                }
            }
        }

        if (nextEpisodeCountdown >= 0) {
            BackHandler {
                nextEpisodeCountdown = -1
                nextEpisodeCountdownCancelled = true
                controlsVisible = true
                lastInteraction = android.os.SystemClock.elapsedRealtime()
                playFocus.requestFocus()
            }
            ProductionNextEpisodeCountdown(
                title = request.nextEpisodeTitle ?: "Næste afsnit",
                remainingSeconds = nextEpisodeCountdown,
                onPlayNow = {
                    nextEpisodeCountdown = -1
                    engine.finishAsync(true)
                    onEnded()
                },
                onCancel = {
                    nextEpisodeCountdown = -1
                    nextEpisodeCountdownCancelled = true
                    controlsVisible = true
                    lastInteraction = android.os.SystemClock.elapsedRealtime()
                    playFocus.requestFocus()
                },
            )
        }

        option?.let { selected ->
            ProductionPlayerOptionOverlay(
                option = selected,
                authorization = engineState.authorization,
                preferences = preferences,
                selectedQuality = selectedQuality,
                activeRendition = activeRendition,
                selectedAudioId = selectedAudioId,
                selectedSubtitleId = selectedSubtitleId,
                subtitleStyle = subtitleStyle,
                onQuality = { selectedQuality = it; engine.setQuality(it); option = null; controlsVisible = true },
                onAudio = { selectedAudioId = it.id; engine.setAudio(it); option = null; controlsVisible = true },
                onSubtitles = { engine.setSubtitles(it); option = null; controlsVisible = true },
                onSubtitleStyle = ::updateSubtitleStyle,
                onClose = { option = null; controlsVisible = true },
            )
        }

        engineState.error?.let { error ->
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.72f)), contentAlignment = Alignment.Center) {
                V1GlassPanel(Modifier.width(610.dp).height(260.dp)) {
                    Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Icon(Icons.Rounded.Replay, null, tint = V1Colors.Gold, modifier = Modifier.size(43.dp))
                        Text("Afspilningen blev afbrudt", color = V1Colors.Text, fontSize = 24.sp, fontWeight = FontWeight.Black)
                        Text(error, color = V1Colors.Muted, fontSize = 11.sp, maxLines = 2)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            V1Button("Prøv igen", engine::retry, primary = true, icon = Icons.Rounded.Replay)
                            V1Button("Tilbage", ::exitNow, icon = Icons.Rounded.Close)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductionTimeline(positionMs: Long, bufferedMs: Long, durationMs: Long, live: Boolean) {
    val duration = durationMs.coerceAtLeast(1L)
    val played = if (live && durationMs <= 0L) 1f else (positionMs.toFloat() / duration).coerceIn(0f, 1f)
    val buffered = if (live && durationMs <= 0L) 1f else (bufferedMs.toFloat() / duration).coerceIn(0f, 1f)
    Box(Modifier.fillMaxWidth().height(7.dp).background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(5.dp))) {
        Box(Modifier.fillMaxWidth(buffered).fillMaxHeight().background(V1Colors.Cyan.copy(alpha = 0.82f), RoundedCornerShape(5.dp)))
        Box(Modifier.fillMaxWidth(played).fillMaxHeight().background(V1Colors.Gold, RoundedCornerShape(5.dp)))
    }
}

@Composable
private fun ProductionNextEpisodeCountdown(
    title: String,
    remainingSeconds: Int,
    onPlayNow: () -> Unit,
    onCancel: () -> Unit,
) {
    val playNowFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { playNowFocus.requestFocus() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xF21A2530), Color(0xFA080D12)),
                    radius = 1_300f,
                ),
            )
            .padding(horizontal = 86.dp, vertical = 62.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.74f)
                .background(Color(0xF21B242D), RoundedCornerShape(30.dp))
                .padding(horizontal = 42.dp, vertical = 34.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(38.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(modifier = Modifier.size(126.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(
                        progress = { remainingSeconds.coerceIn(0, PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS).toFloat() / PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS },
                        modifier = Modifier.fillMaxSize(),
                        color = V1Colors.Gold,
                        trackColor = Color.White.copy(alpha = 0.12f),
                        strokeWidth = 8.dp,
                    )
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            remainingSeconds.coerceAtLeast(0).toString(),
                            color = V1Colors.Text,
                            fontSize = 43.sp,
                            fontWeight = FontWeight.Black,
                        )
                        Text("SEK", color = V1Colors.Muted, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold)
                    }
                }

                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("NÆSTE AFSNIT", color = V1Colors.Gold, fontSize = 11.sp, fontWeight = FontWeight.Black)
                    Text(
                        title,
                        color = V1Colors.Text,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        "Starter automatisk. Du kan også fortsætte med det samme.",
                        color = V1Colors.Muted,
                        fontSize = 12.sp,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        V1Button(
                            "Afspil nu",
                            onPlayNow,
                            modifier = Modifier.focusRequester(playNowFocus),
                            primary = true,
                            icon = Icons.Rounded.PlayArrow,
                        )
                        V1Button("Annuller", onCancel, icon = Icons.Rounded.Close)
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductionSubtitleOverlay(
    text: String,
    style: ProductionSubtitleStyle,
    controlsVisible: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .padding(
                start = 120.dp,
                end = 120.dp,
                bottom = if (controlsVisible) 274.dp else 30.dp,
            )
            .background(style.background.color, RoundedCornerShape(10.dp))
            .padding(horizontal = 14.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = style.textColor.color,
            fontSize = style.size.fontSizeSp.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            lineHeight = (style.size.fontSizeSp + 5).sp,
            maxLines = 4,
        )
    }
}

@Composable
private fun ProductionPlayerOptionOverlay(
    option: PlayerOption,
    authorization: ProductionAuthorization?,
    preferences: ProductionPreferences,
    selectedQuality: String,
    activeRendition: String?,
    selectedAudioId: String?,
    selectedSubtitleId: String?,
    subtitleStyle: ProductionSubtitleStyle,
    onQuality: (String) -> Unit,
    onAudio: (ProductionTrack) -> Unit,
    onSubtitles: (ProductionTrack?) -> Unit,
    onSubtitleStyle: (ProductionSubtitleStyle) -> Unit,
    onClose: () -> Unit,
) {
    val firstOptionFocus = remember(option) { FocusRequester() }
    val title = when (option) {
        PlayerOption.Quality -> "Kvalitet"
        PlayerOption.Audio -> "Lydspor"
        PlayerOption.Subtitles -> "Undertekster"
        PlayerOption.Upscaling -> "Opskalering"
    }
    val quality = listOf("Auto", "Original", "2160p", "1080p", "720p", "480p")
    val focusedQuality = selectedQuality.takeIf(quality::contains) ?: quality.first()
    val audioTracks = authorization?.audioTracks.orEmpty()
    val focusedAudioId = selectedAudioId?.takeIf { selected -> audioTracks.any { it.id == selected } }
        ?: audioTracks.firstOrNull()?.id
    val focusedSubtitleId = selectedSubtitleId?.takeIf { selected ->
        authorization?.subtitleTracks.orEmpty().any { it.id == selected }
    }
    val focusCloseButton = option == PlayerOption.Audio && audioTracks.isEmpty()

    LaunchedEffect(option, authorization?.sessionId) {
        delay(80L)
        runCatching { firstOptionFocus.requestFocus() }
    }

    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.76f))) {
        V1GlassPanel(Modifier.width(470.dp).fillMaxHeight().align(Alignment.CenterEnd), radius = 0.dp) {
            Column(Modifier.fillMaxSize().padding(34.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Text(title, color = V1Colors.Text, fontSize = 28.sp, fontWeight = FontWeight.Black)
                Text("Valget gælder den aktuelle afspilning", color = V1Colors.Muted, fontSize = 10.sp)
                Spacer(Modifier.height(5.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.weight(1f)) {
                    when (option) {
                        PlayerOption.Quality -> items(quality) { label ->
                            ProductionOptionRow(
                                label,
                                if (label == "Auto") {
                                    activeRendition?.let { "Aktuelt $it · adaptiv kvalitet" }
                                        ?: "Finder den aktive rendition"
                                } else {
                                    "Maksimal videohøjde"
                                },
                                selectedQuality == label,
                                modifier = if (label == focusedQuality) Modifier.focusRequester(firstOptionFocus) else Modifier,
                            ) { onQuality(label) }
                        }
                        PlayerOption.Audio -> items(audioTracks) { track ->
                            ProductionOptionRow(
                                track.label,
                                track.language?.uppercase().orEmpty(),
                                selectedAudioId == track.id,
                                modifier = if (track.id == focusedAudioId) Modifier.focusRequester(firstOptionFocus) else Modifier,
                            ) { onAudio(track) }
                        }
                        PlayerOption.Subtitles -> {
                            item { ProductionOptionHeader("SPOR") }
                            item {
                                ProductionOptionRow(
                                    "Fra",
                                    "Skjul undertekster",
                                    selectedSubtitleId == null,
                                    modifier = if (focusedSubtitleId == null) Modifier.focusRequester(firstOptionFocus) else Modifier,
                                ) { onSubtitles(null) }
                            }
                            items(authorization?.subtitleTracks.orEmpty()) { track ->
                                ProductionOptionRow(
                                    track.label,
                                    track.language?.uppercase().orEmpty(),
                                    selectedSubtitleId == track.id,
                                    modifier = if (track.id == focusedSubtitleId) Modifier.focusRequester(firstOptionFocus) else Modifier,
                                ) { onSubtitles(track) }
                            }
                            item { ProductionOptionHeader("UDSEENDE OG SYNKRONISERING") }
                            item {
                                ProductionAdjustableOptionRow(
                                    label = "Størrelse",
                                    value = subtitleStyle.size.label,
                                    help = "Venstre/højre eller OK skifter størrelse",
                                    onPrevious = {
                                        onSubtitleStyle(subtitleStyle.copy(size = cycleEnum(subtitleStyle.size, -1)))
                                    },
                                    onNext = {
                                        onSubtitleStyle(subtitleStyle.copy(size = cycleEnum(subtitleStyle.size, 1)))
                                    },
                                )
                            }
                            item {
                                ProductionAdjustableOptionRow(
                                    label = "Farve",
                                    value = subtitleStyle.textColor.label,
                                    help = "Hvid, varm hvid, gul eller lys blå",
                                    onPrevious = {
                                        onSubtitleStyle(subtitleStyle.copy(textColor = cycleEnum(subtitleStyle.textColor, -1)))
                                    },
                                    onNext = {
                                        onSubtitleStyle(subtitleStyle.copy(textColor = cycleEnum(subtitleStyle.textColor, 1)))
                                    },
                                )
                            }
                            item {
                                ProductionAdjustableOptionRow(
                                    label = "Baggrund",
                                    value = subtitleStyle.background.label,
                                    help = "Ingen, skygge eller sort tekstfelt",
                                    onPrevious = {
                                        onSubtitleStyle(subtitleStyle.copy(background = cycleEnum(subtitleStyle.background, -1)))
                                    },
                                    onNext = {
                                        onSubtitleStyle(subtitleStyle.copy(background = cycleEnum(subtitleStyle.background, 1)))
                                    },
                                )
                            }
                            item {
                                ProductionAdjustableOptionRow(
                                    label = "Undertekstforskydning",
                                    value = subtitleOffsetLabel(subtitleStyle.timingOffsetMs),
                                    help = "Venstre: tidligere · højre: senere · OK: nulstil",
                                    onPrevious = {
                                        onSubtitleStyle(
                                            subtitleStyle.copy(
                                                timingOffsetMs = (subtitleStyle.timingOffsetMs - 100).coerceAtLeast(-10_000),
                                            ),
                                        )
                                    },
                                    onNext = {
                                        onSubtitleStyle(
                                            subtitleStyle.copy(
                                                timingOffsetMs = (subtitleStyle.timingOffsetMs + 100).coerceAtMost(10_000),
                                            ),
                                        )
                                    },
                                    onClick = { onSubtitleStyle(subtitleStyle.copy(timingOffsetMs = 0)) },
                                )
                            }
                        }
                        PlayerOption.Upscaling -> {
                            item {
                                ProductionOptionRow(
                                    "Automatisk",
                                    if (preferences.allowUpscale && preferences.upscaleMode != "off") {
                                        activeRendition?.let { "Server tilladt · aktuelt $it" }
                                            ?: "Server tilladt · afventer aktiv rendition"
                                    } else {
                                        "Deaktiveret i indstillinger"
                                    },
                                    preferences.allowUpscale && preferences.upscaleMode != "off",
                                    modifier = Modifier.focusRequester(firstOptionFocus),
                                ) { onClose() }
                            }
                            item { ProductionOptionRow("Administrér", "Skift permanent under Indstillinger", false) { onClose() } }
                        }
                    }
                }
                V1Button(
                    "Luk",
                    onClose,
                    modifier = Modifier
                        .then(if (focusCloseButton) Modifier.focusRequester(firstOptionFocus) else Modifier)
                        .blockHorizontalFocusExit(),
                    icon = Icons.Rounded.Close,
                )
            }
        }
    }
}

@Composable
private fun ProductionOptionHeader(label: String) {
    Text(
        label,
        color = V1Colors.Gold,
        fontSize = 8.sp,
        fontWeight = FontWeight.Black,
        modifier = Modifier.padding(top = 8.dp, bottom = 2.dp),
    )
}

@Composable
private fun ProductionAdjustableOptionRow(
    label: String,
    value: String,
    help: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onClick: () -> Unit = onNext,
) {
    V1FocusSurface(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(67.dp)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) {
                    false
                } else {
                    when (event.nativeKeyEvent.keyCode) {
                        AndroidKeyEvent.KEYCODE_DPAD_LEFT -> {
                            onPrevious()
                            true
                        }
                        AndroidKeyEvent.KEYCODE_DPAD_RIGHT -> {
                            onNext()
                            true
                        }
                        else -> false
                    }
                }
            },
        radius = 14.dp,
    ) { focused ->
        Row(
            Modifier.fillMaxSize().padding(horizontal = 15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    label,
                    color = if (focused) V1Colors.Gold else V1Colors.Text,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
                Text(help, color = V1Colors.Muted, fontSize = 8.sp)
            }
            Text(
                "‹  $value  ›",
                color = if (focused) V1Colors.Gold else V1Colors.Text,
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
            )
        }
    }
}

@Composable
private fun ProductionOptionRow(
    label: String,
    subtitle: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    V1FocusSurface(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(67.dp).blockHorizontalFocusExit(),
        radius = 14.dp,
    ) { focused ->
        Row(Modifier.fillMaxSize().padding(horizontal = 15.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = V1Colors.Muted, fontSize = 8.sp)
            }
            if (focused || selected) Icon(Icons.Rounded.Check, null, tint = V1Colors.Gold, modifier = Modifier.size(18.dp))
        }
    }
}

private fun Modifier.blockHorizontalFocusExit(): Modifier = onPreviewKeyEvent { event ->
    event.type == KeyEventType.KeyDown && when (event.nativeKeyEvent.keyCode) {
        AndroidKeyEvent.KEYCODE_DPAD_LEFT,
        AndroidKeyEvent.KEYCODE_DPAD_RIGHT,
        -> true
        else -> false
    }
}

private inline fun <reified T : Enum<T>> cycleEnum(value: T, direction: Int): T {
    val values = enumValues<T>()
    val current = values.indexOf(value).coerceAtLeast(0)
    return values[(current + direction).mod(values.size)]
}

private fun subtitleOffsetLabel(offsetMs: Int): String = when {
    offsetMs > 0 -> "%+.1f sek · senere".format(offsetMs / 1_000f)
    offsetMs < 0 -> "%+.1f sek · tidligere".format(offsetMs / 1_000f)
    else -> "0,0 sek"
}

private fun activeRenditionLabel(height: Int?, bitrate: Int?): String? {
    val resolution = height?.takeIf { it > 0 }?.let { "${it}p" }
    val rate = bitrate?.takeIf { it > 0 }?.let { "%.1f Mbit/s".format(it / 1_000_000f) }
    return listOfNotNull(resolution, rate).takeIf { it.isNotEmpty() }?.joinToString(" · ")
}
