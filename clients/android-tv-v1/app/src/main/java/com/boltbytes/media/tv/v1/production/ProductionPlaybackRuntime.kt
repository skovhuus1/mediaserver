package com.boltbytes.media.tv.v1.production

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.IOException

enum class ProductionPlaybackPhase {
    Idle,
    Authorizing,
    Preparing,
    Buffering,
    Ready,
    Playing,
    Paused,
    Recovering,
    Ended,
    Failed,
    Released,
}

sealed interface ProductionPlaybackEvent {
    data object Authorize : ProductionPlaybackEvent
    data object Prepare : ProductionPlaybackEvent
    data object Buffer : ProductionPlaybackEvent
    data object Ready : ProductionPlaybackEvent
    data object Play : ProductionPlaybackEvent
    data object Pause : ProductionPlaybackEvent
    data class Recover(val attempt: Int) : ProductionPlaybackEvent
    data object End : ProductionPlaybackEvent
    data class Fail(val message: String) : ProductionPlaybackEvent
    data object Release : ProductionPlaybackEvent
}

data class ProductionPlaybackRuntimeState(
    val phase: ProductionPlaybackPhase = ProductionPlaybackPhase.Idle,
    val playWhenReady: Boolean = false,
    val stallCount: Int = 0,
    val retryAttempt: Int = 0,
    val lastError: String? = null,
    val changedAtMs: Long = 0L,
)

class ProductionPlaybackStateMachine(
    private val nowMs: () -> Long = System::currentTimeMillis,
) {
    var state = ProductionPlaybackRuntimeState(changedAtMs = nowMs())
        private set

    fun transition(event: ProductionPlaybackEvent): ProductionPlaybackRuntimeState {
        if (state.phase == ProductionPlaybackPhase.Released) return state
        state = when (event) {
            ProductionPlaybackEvent.Authorize -> state.copy(
                phase = ProductionPlaybackPhase.Authorizing,
                playWhenReady = true,
                retryAttempt = 0,
                lastError = null,
            )
            ProductionPlaybackEvent.Prepare -> state.copy(
                phase = ProductionPlaybackPhase.Preparing,
                playWhenReady = true,
                lastError = null,
            )
            ProductionPlaybackEvent.Buffer -> state.copy(
                phase = ProductionPlaybackPhase.Buffering,
                stallCount = state.stallCount + if (state.phase == ProductionPlaybackPhase.Playing) 1 else 0,
            )
            ProductionPlaybackEvent.Ready -> state.copy(
                phase = if (state.playWhenReady) ProductionPlaybackPhase.Playing else ProductionPlaybackPhase.Ready,
                lastError = null,
            )
            ProductionPlaybackEvent.Play -> state.copy(
                phase = ProductionPlaybackPhase.Playing,
                playWhenReady = true,
                lastError = null,
            )
            ProductionPlaybackEvent.Pause -> state.copy(
                phase = ProductionPlaybackPhase.Paused,
                playWhenReady = false,
            )
            is ProductionPlaybackEvent.Recover -> state.copy(
                phase = ProductionPlaybackPhase.Recovering,
                playWhenReady = true,
                retryAttempt = event.attempt,
            )
            ProductionPlaybackEvent.End -> state.copy(
                phase = ProductionPlaybackPhase.Ended,
                playWhenReady = false,
            )
            is ProductionPlaybackEvent.Fail -> state.copy(
                phase = ProductionPlaybackPhase.Failed,
                playWhenReady = false,
                lastError = event.message,
            )
            ProductionPlaybackEvent.Release -> state.copy(
                phase = ProductionPlaybackPhase.Released,
                playWhenReady = false,
            )
        }.copy(changedAtMs = nowMs())
        return state
    }
}

data class ProductionPlaybackDiagnostics(
    val phase: ProductionPlaybackPhase = ProductionPlaybackPhase.Idle,
    val mediaId: String? = null,
    val sessionId: String? = null,
    val streamMethod: String? = null,
    val contentType: String? = null,
    val videoHeight: Int? = null,
    val videoBitrate: Int? = null,
    val positionMs: Long = 0L,
    val bufferAheadMs: Long = 0L,
    val stallCount: Int = 0,
    val retryAttempt: Int = 0,
    val droppedFrames: Int = 0,
    val networkOnline: Boolean = true,
    val lastError: String? = null,
    val updatedAtMs: Long = 0L,
)

object ProductionPlaybackDiagnosticsStore {
    private val mutable = MutableStateFlow(ProductionPlaybackDiagnostics())
    val state: StateFlow<ProductionPlaybackDiagnostics> = mutable.asStateFlow()

    fun update(transform: (ProductionPlaybackDiagnostics) -> ProductionPlaybackDiagnostics) {
        mutable.value = transform(mutable.value).copy(updatedAtMs = System.currentTimeMillis())
    }

    fun clear() {
        mutable.value = ProductionPlaybackDiagnostics(updatedAtMs = System.currentTimeMillis())
    }
}

object ProductionNetworkRetryPolicy {
    const val maxAttempts = 3

    fun isSafeMethod(method: String): Boolean = method.equals("GET", true) || method.equals("HEAD", true)

    fun isTransientStatus(status: Int): Boolean =
        status == 408 || status == 425 || status == 429 || status in 500..599

    fun isTransientFailure(error: Throwable): Boolean =
        error is IOException || (error is ProductionApiException && isTransientStatus(error.status))

    fun delayMs(attempt: Int): Long = when (attempt.coerceAtLeast(1)) {
        1 -> 250L
        2 -> 750L
        else -> 1_500L
    }
}

fun productionPlaybackErrorMessage(errorCodeName: String?): String = when {
    errorCodeName.isNullOrBlank() -> "Afspilningen blev afbrudt. Prøv igen."
    "BAD_HTTP_STATUS" in errorCodeName -> "Streamen svarede ikke korrekt. Prøv igen."
    "TIMEOUT" in errorCodeName -> "Forbindelsen til streamen fik timeout. Prøv igen."
    "DECOD" in errorCodeName -> "TV'et kunne ikke afkode videosporet. Prøv en anden kvalitet."
    "NETWORK" in errorCodeName || "IO_" in errorCodeName -> "Netværksforbindelsen blev afbrudt. Prøv igen."
    else -> "Afspilningen blev afbrudt. Prøv igen."
}

fun isRecoverablePlaybackError(errorCodeName: String?): Boolean =
    errorCodeName != null && (
        "BAD_HTTP_STATUS" in errorCodeName ||
            "TIMEOUT" in errorCodeName ||
            "NETWORK" in errorCodeName ||
            "IO_" in errorCodeName
        )
