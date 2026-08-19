package com.boltbytes.boltbytes_media

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class AppUpdateBridge(
    private val activity: MainActivity,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, "boltbytes.media/update")
    private val downloads = activity.getSystemService(DownloadManager::class.java)
    private var downloadId: Long? = null
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val completed = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
            if (completed != downloadId) return
            val uri = downloads.getUriForDownloadedFile(completed) ?: return
            activity.startActivity(
                Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
    }

    init {
        channel.setMethodCallHandler(this)
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            activity.registerReceiver(receiver, filter)
        }
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != "downloadAndInstall") {
            result.notImplemented()
            return
        }
        val url = call.argument<String>("url")?.trim().orEmpty()
        val version = call.argument<String>("version")?.replace(Regex("[^0-9A-Za-z._-]"), "_").orEmpty()
        if (!url.startsWith("https://github.com/skovhuus1/mediaserver/releases/download/")) {
            result.error("update_url_invalid", "Update URL is not an approved BoltBytes release", null)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            activity.startActivity(
                Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${activity.packageName}"),
                ),
            )
            result.success(mapOf("permissionRequired" to true))
            return
        }
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle("BoltBytes Media $version")
            .setDescription("Downloader signeret app-opdatering")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                "boltbytes-media-$version.apk",
            )
        downloadId = downloads.enqueue(request)
        result.success(mapOf("permissionRequired" to false, "downloadId" to downloadId))
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
        runCatching { activity.unregisterReceiver(receiver) }
    }
}
