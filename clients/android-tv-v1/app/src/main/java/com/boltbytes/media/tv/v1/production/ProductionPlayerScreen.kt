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

private data class PlayerEngineState(
    val preparing: Boolean = true,
    val buffering: Boolean = false,
    val playing: Boolean = false,
    val error: String? = null,
    val authorization: ProductionAuthorization? = null,
    val ended: Boolean = false,
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
    private var heartbeatJob: Job? = null
    private var progressJob: Job? = null
    private var variantMonitorJob: Job? = null
    private var channelIndex = request.channelIndex
    private var automaticRecoveryAttempts = 0

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
            val authorization = if (request.live) api.authorizeLive(request.mediaId) else {
                api.authorizeVod(request.mediaId, positionMs, preferences)
            }
            mutableState.value = mutableState.value.copy(authorization = authorization, preparing = true, error = null)
            startLeases()
            val preparation = awaitPreparation(authorization)
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
        player.prepare()
        player.playWhenReady = true
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
        forceLowestBitrate(false)
        val builder = player.trackSelectionParameters.buildUpon()
        when (label) {
            "Auto", "Original" -> builder.setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
            else -> {
                val height = label.removeSuffix("p").toIntOrNull() ?: Int.MAX_VALUE
                builder.setMaxVideoSize(Int.MAX_VALUE, height)
            }
        }
        player.trackSelectionParameters = builder.build()
    }

    fun setAudio(track: ProductionTrack) {
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setPreferredAudioLanguage(track.language)
            .build()
    }

    fun setSubtitles(track: ProductionTrack?) {
        val builder = player.trackSelectionParameters.buildUpon()
        if (track == null) {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        } else {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            builder.setPreferredTextLanguage(track.language)
        }
        player.trackSelectionParameters = builder.build()
    }

    fun switchChannel(direction: Int) {
        if (!request.live || request.channelIds.isEmpty()) return
        val targetIndex = (channelIndex + direction).mod(request.channelIds.size)
        val authorization = mutableState.value.authorization ?: return
        scope.launch {
            runCatching { api.switchLive(authorization.sessionId, request.channelIds[targetIndex], authorization.streamToken) }
                .onSuccess { switched ->
                    channelIndex = targetIndex
                    mutableState.value = mutableState.value.copy(authorization = switched, preparing = true, error = null)
                    loadAuthorization(switched, 0L)
                    startLeases()
                }
                .onFailure { error -> mutableState.value = mutableState.value.copy(error = error.message ?: "Kanalen kunne ikke skiftes") }
        }
    }

    fun finishAsync(completed: Boolean) {
        if (!finished.compareAndSet(false, true)) return
        heartbeatJob?.cancel()
        progressJob?.cancel()
        variantMonitorJob?.cancel()
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
    val engine = remember(request.mediaId, request.live) { ProductionPlaybackEngine(context, api, request, preferences) }
    val engineState by engine.state.collectAsStateWithLifecycle()
    var controlsVisible by remember(request.mediaId) { mutableStateOf(true) }
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
    val rootFocus = remember { FocusRequester() }
    val playFocus = remember { FocusRequester() }

    LaunchedEffect(engine) { engine.start() }
    DisposableEffect(engine) { onDispose { engine.finishAsync(false) } }

    DisposableEffect(activity, lifecycleOwner) {
        fun keepAwake() { activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
        keepAwake()
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME || event == Lifecycle.Event.ON_START) keepAwake()
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

    LaunchedEffect(engineState.ended) {
        if (engineState.ended && !endedHandled) {
            endedHandled = true
            engine.finishAsync(true)
            onEnded()
        }
    }

    fun exitNow() {
        engine.finishAsync(false)
        onExit()
    }

    val activeMarker = engineState.authorization?.markers?.firstOrNull { marker ->
        positionMs >= marker.startMs && positionMs < marker.endMs
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
            factory = { PlayerView(it).apply { player = engine.player; useController = false } },
            update = { it.player = engine.player },
            modifier = Modifier.fillMaxSize(),
        )

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
                        V1Pill("Kvalitet: $selectedQuality", color = V1Colors.Gold, emphasized = true)
                        Spacer(Modifier.width(8.dp))
                        V1Pill(if (preferences.allowUpscale) "Opskalering: ${preferences.upscaleMode}" else "Opskalering: Fra", color = V1Colors.Blue)
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

        option?.let { selected ->
            ProductionPlayerOptionOverlay(
                option = selected,
                authorization = engineState.authorization,
                preferences = preferences,
                selectedQuality = selectedQuality,
                selectedAudioId = selectedAudioId,
                selectedSubtitleId = selectedSubtitleId,
                onQuality = { selectedQuality = it; engine.setQuality(it); option = null; controlsVisible = true },
                onAudio = { selectedAudioId = it.id; engine.setAudio(it); option = null; controlsVisible = true },
                onSubtitles = { selectedSubtitleId = it?.id; engine.setSubtitles(it); option = null; controlsVisible = true },
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
private fun ProductionPlayerOptionOverlay(
    option: PlayerOption,
    authorization: ProductionAuthorization?,
    preferences: ProductionPreferences,
    selectedQuality: String,
    selectedAudioId: String?,
    selectedSubtitleId: String?,
    onQuality: (String) -> Unit,
    onAudio: (ProductionTrack) -> Unit,
    onSubtitles: (ProductionTrack?) -> Unit,
    onClose: () -> Unit,
) {
    val title = when (option) {
        PlayerOption.Quality -> "Kvalitet"
        PlayerOption.Audio -> "Lydspor"
        PlayerOption.Subtitles -> "Undertekster"
        PlayerOption.Upscaling -> "Opskalering"
    }
    val quality = listOf("Auto", "Original", "2160p", "1080p", "720p", "480p")
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.76f))) {
        V1GlassPanel(Modifier.width(470.dp).fillMaxHeight().align(Alignment.CenterEnd), radius = 0.dp) {
            Column(Modifier.fillMaxSize().padding(34.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Text(title, color = V1Colors.Text, fontSize = 28.sp, fontWeight = FontWeight.Black)
                Text("Valget gælder den aktuelle afspilning", color = V1Colors.Muted, fontSize = 10.sp)
                Spacer(Modifier.height(5.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(9.dp), modifier = Modifier.weight(1f)) {
                    when (option) {
                        PlayerOption.Quality -> items(quality) { label ->
                            ProductionOptionRow(label, if (label == "Auto") "Adaptiv kvalitet uden genstart" else "Maksimal videohøjde", selectedQuality == label) { onQuality(label) }
                        }
                        PlayerOption.Audio -> items(authorization?.audioTracks.orEmpty()) { track ->
                            ProductionOptionRow(track.label, track.language?.uppercase().orEmpty(), selectedAudioId == track.id) { onAudio(track) }
                        }
                        PlayerOption.Subtitles -> {
                            item { ProductionOptionRow("Fra", "Skjul undertekster", selectedSubtitleId == null) { onSubtitles(null) } }
                            items(authorization?.subtitleTracks.orEmpty()) { track ->
                                ProductionOptionRow(track.label, track.language?.uppercase().orEmpty(), selectedSubtitleId == track.id) { onSubtitles(track) }
                            }
                        }
                        PlayerOption.Upscaling -> {
                            item { ProductionOptionRow("Automatisk", if (preferences.allowUpscale) "${preferences.upscaleMode} er aktiv" else "Deaktiveret i indstillinger", preferences.allowUpscale) { onClose() } }
                            item { ProductionOptionRow("Administrér", "Skift permanent under Indstillinger", false) { onClose() } }
                        }
                    }
                }
                V1Button("Luk", onClose, icon = Icons.Rounded.Close)
            }
        }
    }
}

@Composable
private fun ProductionOptionRow(label: String, subtitle: String, selected: Boolean, onClick: () -> Unit) {
    V1FocusSurface(onClick = onClick, modifier = Modifier.fillMaxWidth().height(67.dp), radius = 14.dp) { focused ->
        Row(Modifier.fillMaxSize().padding(horizontal = 15.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(label, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = V1Colors.Muted, fontSize = 8.sp)
            }
            if (focused || selected) Icon(Icons.Rounded.Check, null, tint = V1Colors.Gold, modifier = Modifier.size(18.dp))
        }
    }
}
