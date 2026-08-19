package com.boltbytes.boltbytes_media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object PushNotificationChannels {
    const val GENERAL = "bbmedia_general"

    fun ensure(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                GENERAL,
                "BoltBytes Media",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Afspilning, downloads og kontoaktivitet"
            },
        )
    }
}
