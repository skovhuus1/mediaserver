package com.boltbytes.boltbytes_media

import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var castBridge: CastBridge? = null
    private var playbackBridge: PlaybackBridge? = null
    private var updateBridge: AppUpdateBridge? = null
    private var offlineDownloadBridge: OfflineDownloadBridge? = null
    private var crashBridge: CrashBridge? = null

    private val isTvBuild: Boolean
        get() = getString(R.string.device_variant).equals("tv", ignoreCase = true)

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        runCatching { PushNotificationChannels.ensure(this) }
            .onFailure { Log.e(TAG, "Notification channels could not initialize", it) }

        val messenger = flutterEngine.dartExecutor.binaryMessenger
        if (!isTvBuild) {
            runCatching {
                flutterEngine
                    .platformViewsController
                    .registry
                    .registerViewFactory(CastBridge.BUTTON_VIEW_TYPE, CastRouteButtonFactory())
                CastBridge(this, messenger)
            }.onSuccess { castBridge = it }
                .onFailure { Log.e(TAG, "Cast bridge could not initialize", it) }
        }
        playbackBridge = optionalBridge("playback") { PlaybackBridge(this, messenger) }
        updateBridge = optionalBridge("updater") { AppUpdateBridge(this, messenger) }
        offlineDownloadBridge = optionalBridge("offline downloads") {
            OfflineDownloadBridge(this, messenger)
        }
        crashBridge = optionalBridge("crash reporting") { CrashBridge(this, messenger) }
    }

    override fun onUserLeaveHint() {
        playbackBridge?.enterPictureInPictureIfActive()
        super.onUserLeaveHint()
    }

    override fun onResume() {
        super.onResume()
        playbackBridge?.reapplyKeepScreenOn()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) playbackBridge?.reapplyKeepScreenOn()
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: android.content.res.Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        playbackBridge?.pictureInPictureChanged(isInPictureInPictureMode)
    }

    override fun onDestroy() {
        castBridge?.dispose()
        playbackBridge?.dispose()
        updateBridge?.dispose()
        offlineDownloadBridge?.dispose()
        crashBridge?.dispose()
        castBridge = null
        playbackBridge = null
        updateBridge = null
        offlineDownloadBridge = null
        crashBridge = null
        super.onDestroy()
    }

    private inline fun <T> optionalBridge(name: String, factory: () -> T): T? =
        runCatching(factory)
            .onFailure { Log.e(TAG, "$name bridge could not initialize", it) }
            .getOrNull()

    companion object {
        private const val TAG = "BoltBytesMainActivity"
    }
}
