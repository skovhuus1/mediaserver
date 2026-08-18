package com.boltbytes.boltbytes_media

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.mediarouter.app.MediaRouteButton
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.MediaTrack
import com.google.android.gms.cast.framework.CastButtonFactory
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.images.WebImage
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory
import org.json.JSONObject

class CastBridge(
    private val activity: Activity,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    companion object {
        const val BUTTON_VIEW_TYPE = "boltbytes.media/cast_button"
        private const val METHOD_CHANNEL = "boltbytes.media/cast"
        private const val EVENT_CHANNEL = "boltbytes.media/cast_events"
    }

    private val methodChannel = MethodChannel(messenger, METHOD_CHANNEL)
    private val eventChannel = EventChannel(messenger, EVENT_CHANNEL)
    private val handler = Handler(Looper.getMainLooper())
    private val castContext = runCatching { CastContext.getSharedInstance(activity) }.getOrNull()
    private var eventSink: EventChannel.EventSink? = null
    private var attachedRemote: RemoteMediaClient? = null

    private val remoteCallback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() = emit("state")
        override fun onMetadataUpdated() = emit("state")
    }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) = emit("sessionStarting", session)

        override fun onSessionStarted(session: CastSession, sessionId: String) {
            attachRemote(session)
            emit("sessionStarted", session)
        }

        override fun onSessionStartFailed(session: CastSession, error: Int) =
            emit("sessionStartFailed", session, error)

        override fun onSessionEnding(session: CastSession) = emit("sessionEnding", session)

        override fun onSessionEnded(session: CastSession, error: Int) {
            emit("sessionEnded", session, error)
            detachRemote()
        }

        override fun onSessionResuming(session: CastSession, sessionId: String) =
            emit("sessionResuming", session)

        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            attachRemote(session)
            emit("sessionResumed", session)
        }

        override fun onSessionResumeFailed(session: CastSession, error: Int) =
            emit("sessionResumeFailed", session, error)

        override fun onSessionSuspended(session: CastSession, reason: Int) =
            emit("sessionSuspended", session, reason)
    }

    private val ticker = object : Runnable {
        override fun run() {
            if (eventSink == null) return
            emit("state")
            handler.postDelayed(this, 1_000)
        }
    }

    init {
        methodChannel.setMethodCallHandler(this)
        eventChannel.setStreamHandler(this)
        castContext?.sessionManager?.addSessionManagerListener(
            sessionListener,
            CastSession::class.java,
        )
        castContext?.sessionManager?.currentCastSession?.let(::attachRemote)
    }

    override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
        eventSink = events
        emit("state")
        handler.removeCallbacks(ticker)
        handler.post(ticker)
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
        handler.removeCallbacks(ticker)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getState" -> result.success(stateMap("state"))
            "loadMedia" -> loadMedia(call, result)
            "play" -> withRemote(result) { it.play(); result.success(null) }
            "pause" -> withRemote(result) { it.pause(); result.success(null) }
            "stop" -> withRemote(result) { it.stop(); result.success(null) }
            "seek" -> withRemote(result) { remote ->
                val positionMs = call.argument<Number>("positionMs")?.toLong() ?: 0L
                remote.seek(MediaSeekOptions.Builder().setPosition(positionMs.coerceAtLeast(0)).build())
                result.success(null)
            }
            "setVolume" -> withRemote(result) { remote ->
                val volume = call.argument<Number>("volume")?.toDouble() ?: 1.0
                remote.setStreamVolume(volume.coerceIn(0.0, 1.0))
                result.success(null)
            }
            "setTextTrack" -> setTextTrack(call, result)
            "endSession" -> {
                val stopReceiver = call.argument<Boolean>("stopReceiver") ?: false
                castContext?.sessionManager?.endCurrentSession(stopReceiver)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun loadMedia(call: MethodCall, result: MethodChannel.Result) {
        withRemote(result) { remote ->
            val contentUrl = call.argument<String>("contentUrl")?.trim().orEmpty()
            val contentType = call.argument<String>("contentType")?.trim().orEmpty()
            if (contentUrl.isEmpty() || contentType.isEmpty()) {
                result.error("cast_media_invalid", "Cast media URL and content type are required", null)
                return@withRemote
            }

            val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_GENERIC).apply {
                putString(MediaMetadata.KEY_TITLE, call.argument<String>("title").orEmpty())
                putString(MediaMetadata.KEY_SUBTITLE, call.argument<String>("subtitle").orEmpty())
                call.argument<String>("posterUrl")
                    ?.takeIf { it.isNotBlank() }
                    ?.let { addImage(WebImage(Uri.parse(it))) }
            }
            val tracks = (call.argument<List<Map<String, Any?>>>("tracks") ?: emptyList())
                .mapNotNull(::mediaTrack)
            val durationMs = call.argument<Number>("durationMs")?.toLong() ?: 0L
            val mediaInfo = MediaInfo.Builder(contentUrl)
                .setContentType(contentType)
                .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                .setMetadata(metadata)
                .setMediaTracks(tracks)
                .setCustomData(jsonObject(call.argument<Any?>("customData")))
                .apply {
                    if (durationMs > 0) setStreamDuration(durationMs)
                }
                .build()
            val activeTrackIds = (call.argument<List<Number>>("activeTrackIds") ?: emptyList())
                .map(Number::toLong)
                .toLongArray()
            val request = MediaLoadRequestData.Builder()
                .setMediaInfo(mediaInfo)
                .setAutoplay(true)
                .setCurrentTime((call.argument<Number>("positionMs")?.toLong() ?: 0L).coerceAtLeast(0))
                .apply { if (activeTrackIds.isNotEmpty()) setActiveTrackIds(activeTrackIds) }
                .build()

            remote.load(request).setResultCallback { channelResult ->
                if (channelResult.status.isSuccess) {
                    result.success(stateMap("mediaLoaded"))
                } else {
                    result.error(
                        "cast_load_failed",
                        channelResult.status.statusMessage ?: "Chromecast rejected the media request",
                        channelResult.status.statusCode,
                    )
                }
            }
        }
    }

    private fun setTextTrack(call: MethodCall, result: MethodChannel.Result) {
        withRemote(result) { remote ->
            val ids = (call.argument<List<Number>>("trackIds") ?: emptyList())
                .map(Number::toLong)
                .toLongArray()
            remote.setActiveMediaTracks(ids).setResultCallback { channelResult ->
                if (channelResult.status.isSuccess) result.success(null)
                else result.error(
                    "cast_track_failed",
                    channelResult.status.statusMessage ?: "Chromecast could not change subtitle track",
                    channelResult.status.statusCode,
                )
            }
        }
    }

    private fun mediaTrack(value: Map<String, Any?>): MediaTrack? {
        val id = (value["id"] as? Number)?.toLong() ?: return null
        val contentUrl = value["contentUrl"]?.toString()?.takeIf(String::isNotBlank) ?: return null
        return MediaTrack.Builder(id, MediaTrack.TYPE_TEXT)
            .setContentId(contentUrl)
            .setContentType(value["contentType"]?.toString() ?: "text/vtt")
            .setSubtype(MediaTrack.SUBTYPE_SUBTITLES)
            .setName(value["label"]?.toString() ?: "Undertekst")
            .apply {
                value["language"]?.toString()?.takeIf(String::isNotBlank)?.let(::setLanguage)
            }
            .build()
    }

    private fun jsonObject(value: Any?): JSONObject {
        val json = JSONObject()
        (value as? Map<*, *>)?.forEach { (key, item) ->
            if (key is String) json.put(key, JSONObject.wrap(item))
        }
        return json
    }

    private fun withRemote(result: MethodChannel.Result, block: (RemoteMediaClient) -> Unit) {
        val remote = castContext?.sessionManager?.currentCastSession?.remoteMediaClient
        if (remote == null) {
            result.error("cast_not_connected", "No Chromecast session is connected", null)
            return
        }
        block(remote)
    }

    private fun attachRemote(session: CastSession) {
        val remote = session.remoteMediaClient ?: return
        if (attachedRemote === remote) return
        detachRemote()
        attachedRemote = remote
        remote.registerCallback(remoteCallback)
    }

    private fun detachRemote() {
        attachedRemote?.unregisterCallback(remoteCallback)
        attachedRemote = null
    }

    private fun emit(event: String, session: CastSession? = null, errorCode: Int? = null) {
        val payload = stateMap(event, session)
        if (errorCode != null) payload["errorCode"] = errorCode
        eventSink?.success(payload)
    }

    private fun stateMap(
        event: String,
        suppliedSession: CastSession? = null,
    ): MutableMap<String, Any?> {
        val session = suppliedSession ?: castContext?.sessionManager?.currentCastSession
        val remote = session?.remoteMediaClient
        val mediaStatus = remote?.mediaStatus
        val receiverApplicationId = activity.getString(R.string.cast_receiver_app_id)
        val runtimeState = when (mediaStatus?.playerState) {
            MediaStatus.PLAYER_STATE_PLAYING -> "playing"
            MediaStatus.PLAYER_STATE_PAUSED -> "paused"
            MediaStatus.PLAYER_STATE_BUFFERING -> "buffering"
            MediaStatus.PLAYER_STATE_LOADING -> "starting"
            MediaStatus.PLAYER_STATE_IDLE -> "idle"
            else -> "unknown"
        }
        return mutableMapOf(
            "event" to event,
            "available" to (castContext != null),
            "connected" to (session?.isConnected == true),
            "deviceName" to session?.castDevice?.friendlyName,
            "positionMs" to (remote?.approximateStreamPosition ?: 0L),
            "durationMs" to (remote?.streamDuration ?: 0L),
            "runtimeState" to runtimeState,
            "volume" to (session?.volume ?: 1.0),
            "muted" to (session?.isMute ?: false),
            "idleReason" to (mediaStatus?.idleReason ?: 0),
            "activeTrackIds" to (mediaStatus?.activeTrackIds?.toList() ?: emptyList<Long>()),
            "receiverApplicationId" to receiverApplicationId,
            "receiverMode" to if (
                receiverApplicationId == CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID
            ) "default" else "custom",
            "mediaTitle" to remote?.mediaInfo?.metadata?.getString(MediaMetadata.KEY_TITLE),
            "contentType" to remote?.mediaInfo?.contentType,
        )
    }

    fun dispose() {
        handler.removeCallbacks(ticker)
        eventSink = null
        eventChannel.setStreamHandler(null)
        methodChannel.setMethodCallHandler(null)
        detachRemote()
        castContext?.sessionManager?.removeSessionManagerListener(
            sessionListener,
            CastSession::class.java,
        )
    }
}

class CastRouteButtonFactory : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    override fun create(context: Context, viewId: Int, args: Any?): PlatformView =
        CastRouteButtonView(context)
}

private class CastRouteButtonView(context: Context) : PlatformView {
    private val button = MediaRouteButton(context).apply {
        contentDescription = "Chromecast"
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        val padding = (8 * resources.displayMetrics.density).toInt()
        setPadding(padding, padding, padding, padding)
    }

    init {
        runCatching { CastButtonFactory.setUpMediaRouteButton(context, button) }
            .onFailure { button.visibility = View.GONE }
    }

    override fun getView(): View = button

    override fun dispose() = Unit
}
