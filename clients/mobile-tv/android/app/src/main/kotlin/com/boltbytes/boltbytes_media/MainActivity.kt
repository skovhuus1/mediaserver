package com.boltbytes.boltbytes_media

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var castBridge: CastBridge? = null
    private var playbackBridge: PlaybackBridge? = null
    private var updateBridge: AppUpdateBridge? = null
    private var offlineDownloadBridge: OfflineDownloadBridge? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine
            .platformViewsController
            .registry
            .registerViewFactory(CastBridge.BUTTON_VIEW_TYPE, CastRouteButtonFactory())
        castBridge = CastBridge(this, flutterEngine.dartExecutor.binaryMessenger)
        playbackBridge = PlaybackBridge(this, flutterEngine.dartExecutor.binaryMessenger)
        updateBridge = AppUpdateBridge(this, flutterEngine.dartExecutor.binaryMessenger)
        offlineDownloadBridge = OfflineDownloadBridge(this, flutterEngine.dartExecutor.binaryMessenger)
    }

    override fun onUserLeaveHint() {
        playbackBridge?.enterPictureInPictureIfActive()
        super.onUserLeaveHint()
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
        castBridge = null
        playbackBridge = null
        updateBridge = null
        offlineDownloadBridge = null
        super.onDestroy()
    }
}
