package com.boltbytes.media.tv.v1

import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import com.boltbytes.media.tv.v1.ui.BoltBytesTvTheme as CinematicTheme
import com.boltbytes.media.tv.v1.ui.V1ExperienceVisualScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        check(BuildConfig.SERVER_URL == "https://media.boltbytes.com/api/v1")
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        setContent {
            V1VisualApp(
                startOnHub = BuildConfig.DEBUG &&
                    intent.getBooleanExtra("bb_preview_hub", false),
                previewRoute = if (BuildConfig.DEBUG) {
                    intent.getStringExtra("bb_preview_route")
                } else {
                    null
                },
            )
        }
    }
}

@Composable
private fun V1VisualApp(startOnHub: Boolean, previewRoute: String?) {
    CinematicTheme {
        V1ExperienceVisualScreen(
            startOnHub = startOnHub,
            previewRoute = previewRoute,
        )
    }
}
