package com.boltbytes.boltbytes_media

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    private var castBridge: CastBridge? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine
            .platformViewsController
            .registry
            .registerViewFactory(CastBridge.BUTTON_VIEW_TYPE, CastRouteButtonFactory())
        castBridge = CastBridge(this, flutterEngine.dartExecutor.binaryMessenger)
    }

    override fun onDestroy() {
        castBridge?.dispose()
        castBridge = null
        super.onDestroy()
    }
}
