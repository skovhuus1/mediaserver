package com.boltbytes.boltbytes_media

import android.app.PictureInPictureParams
import android.graphics.Rect
import android.content.pm.PackageManager
import android.os.Build
import android.util.Rational
import android.view.WindowManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class PlaybackBridge(
    private val activity: MainActivity,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler, EventChannel.StreamHandler {
    private val methods = MethodChannel(messenger, "boltbytes.media/playback")
    private val events = EventChannel(messenger, "boltbytes.media/playback_events")
    private var eventSink: EventChannel.EventSink? = null
    private var active = false
    private var playing = false
    private var keepScreenOnRequested = false
    private var keepScreenOnApplied: Boolean? = null
    private var allowPictureInPicture = false
    private var videoWidth = 16
    private var videoHeight = 9

    init {
        methods.setMethodCallHandler(this)
        events.setStreamHandler(this)
        PlaybackCommandBus.listener = { event, positionMs ->
            activity.runOnUiThread {
                eventSink?.success(
                    mapOf("event" to event, "positionMs" to positionMs),
                )
            }
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "update" -> {
                active = true
                playing = call.argument<Boolean>("playing") == true
                allowPictureInPicture = call.argument<Boolean>("allowPictureInPicture") == true
                videoWidth = (call.argument<Number>("videoWidth")?.toInt() ?: 16).coerceAtLeast(1)
                videoHeight = (call.argument<Number>("videoHeight")?.toInt() ?: 9).coerceAtLeast(1)
                keepScreenOnRequested = true
                applyKeepScreenOn()
                updatePictureInPictureParams()
                MediaPlaybackService.update(
                    activity,
                    title = call.argument<String>("title").orEmpty(),
                    subtitle = call.argument<String>("subtitle").orEmpty(),
                    playing = playing,
                    buffering = call.argument<Boolean>("buffering") == true,
                    positionMs = call.argument<Number>("positionMs")?.toLong() ?: 0,
                    durationMs = call.argument<Number>("durationMs")?.toLong() ?: 0,
                    playbackRate = call.argument<Number>("playbackRate")?.toFloat() ?: 1f,
                )
                result.success(null)
            }
            "enterPictureInPicture" -> {
                if (enterPictureInPicture()) result.success(null)
                else result.error("pip_unavailable", "Picture-in-Picture is unavailable", null)
            }
            "clear" -> {
                active = false
                playing = false
                keepScreenOnRequested = false
                allowPictureInPicture = false
                applyKeepScreenOn()
                MediaPlaybackService.stop(activity)
                updatePictureInPictureParams()
                result.success(null)
            }
            "setKeepScreenOn" -> {
                keepScreenOnRequested = call.arguments == true
                applyKeepScreenOn()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    fun enterPictureInPictureIfActive() {
        if (active && playing && allowPictureInPicture && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            enterPictureInPicture()
        }
    }

    fun reapplyKeepScreenOn() {
        keepScreenOnApplied = null
        applyKeepScreenOn()
    }

    fun pictureInPictureChanged(inPictureInPicture: Boolean) {
        eventSink?.success(
            mapOf(
                "event" to "pipChanged",
                "inPictureInPicture" to inPictureInPicture,
            ),
        )
    }

    private fun updatePictureInPictureParams() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val ratioWidth = videoWidth.coerceIn(1, videoHeight * 239 / 100)
        val ratioHeight = videoHeight.coerceAtLeast(ratioWidth * 100 / 239)
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(ratioWidth, ratioHeight))
        val sourceRect = Rect()
        if (activity.window.decorView.getGlobalVisibleRect(sourceRect) && !sourceRect.isEmpty) {
            builder.setSourceRectHint(sourceRect)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(active && playing && allowPictureInPicture)
                .setSeamlessResizeEnabled(true)
        }
        activity.setPictureInPictureParams(builder.build())
    }

    private fun applyKeepScreenOn() {
        val enabled = active || keepScreenOnRequested
        if (keepScreenOnApplied == enabled) return
        keepScreenOnApplied = enabled
        if (enabled) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        activity.window.decorView.keepScreenOn = enabled
    }

    private fun enterPictureInPicture(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            !active || !allowPictureInPicture ||
            !activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        ) return false
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(videoWidth.coerceAtLeast(1), videoHeight.coerceAtLeast(1)))
        val sourceRect = Rect()
        if (activity.window.decorView.getGlobalVisibleRect(sourceRect) && !sourceRect.isEmpty) {
            builder.setSourceRectHint(sourceRect)
        }
        return activity.enterPictureInPictureMode(builder.build())
    }

    override fun onListen(arguments: Any?, sink: EventChannel.EventSink) {
        eventSink = sink
    }

    override fun onCancel(arguments: Any?) {
        eventSink = null
    }

    fun dispose() {
        methods.setMethodCallHandler(null)
        events.setStreamHandler(null)
        if (PlaybackCommandBus.listener != null) PlaybackCommandBus.listener = null
        eventSink = null
    }
}

object PlaybackCommandBus {
    var listener: ((String, Long?) -> Unit)? = null
    fun emit(event: String, positionMs: Long? = null) = listener?.invoke(event, positionMs)
}
