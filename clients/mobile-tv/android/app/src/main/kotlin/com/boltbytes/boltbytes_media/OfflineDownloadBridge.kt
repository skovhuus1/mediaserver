package com.boltbytes.boltbytes_media

import android.app.DownloadManager
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Environment
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File

class OfflineDownloadBridge(
    private val context: Context,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL)
    private val manager = context.getSystemService(DownloadManager::class.java)

    init {
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "enqueue" -> enqueue(call, result)
                "query" -> query(call, result)
                "cancel" -> cancel(call, result)
                else -> result.notImplemented()
            }
        } catch (error: Exception) {
            result.error("offline_download_failed", error.message ?: "Offline download failed", null)
        }
    }

    fun dispose() {
        channel.setMethodCallHandler(null)
    }

    private fun enqueue(call: MethodCall, result: MethodChannel.Result) {
        val url = call.argument<String>("url")?.trim().orEmpty()
        val id = call.argument<String>("id")?.trim().orEmpty()
        val title = call.argument<String>("title")?.trim().orEmpty().ifBlank { "BoltBytes Media" }
        val wifiOnly = call.argument<Boolean>("wifiOnly") ?: true
        require(url.startsWith("https://") || url.startsWith("http://")) { "Download URL is invalid" }
        require(id.matches(Regex("^[a-fA-F0-9-]{16,64}$"))) { "Download id is invalid" }
        val root = File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "offline")
        root.mkdirs()
        File(root, "$id.mp4").delete()
        val request = DownloadManager.Request(Uri.parse(url))
            .setTitle(title)
            .setDescription("Gemmes til offline afspilning")
            .setMimeType("video/mp4")
            .setAllowedOverMetered(!wifiOnly)
            .setAllowedOverRoaming(false)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_MOVIES, "offline/$id.mp4")
        result.success(manager.enqueue(request))
    }

    private fun query(call: MethodCall, result: MethodChannel.Result) {
        val downloadId = (call.argument<Number>("downloadId") ?: error("downloadId is required")).toLong()
        val cursor = manager.query(DownloadManager.Query().setFilterById(downloadId))
        cursor.use {
            if (!it.moveToFirst()) {
                result.success(mapOf("status" to "missing", "downloadId" to downloadId))
                return
            }
            val status = it.int(DownloadManager.COLUMN_STATUS)
            val localUri = it.string(DownloadManager.COLUMN_LOCAL_URI)
            result.success(
                mapOf(
                    "downloadId" to downloadId,
                    "status" to statusName(status),
                    "reason" to it.int(DownloadManager.COLUMN_REASON),
                    "downloadedBytes" to it.long(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR),
                    "totalBytes" to it.long(DownloadManager.COLUMN_TOTAL_SIZE_BYTES),
                    "localPath" to localUri?.let { value -> Uri.parse(value).path },
                ),
            )
        }
    }

    private fun cancel(call: MethodCall, result: MethodChannel.Result) {
        val downloadId = call.argument<Number>("downloadId")?.toLong()
        if (downloadId != null && downloadId > 0) manager.remove(downloadId)
        val path = call.argument<String>("localPath")
        if (!path.isNullOrBlank()) deleteOwnedFile(path)
        result.success(true)
    }

    private fun deleteOwnedFile(path: String) {
        val root = File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES), "offline").canonicalFile
        val candidate = File(path).canonicalFile
        if (candidate.path.startsWith(root.path + File.separator)) candidate.delete()
    }

    private fun statusName(status: Int) = when (status) {
        DownloadManager.STATUS_PENDING -> "pending"
        DownloadManager.STATUS_RUNNING -> "running"
        DownloadManager.STATUS_PAUSED -> "paused"
        DownloadManager.STATUS_SUCCESSFUL -> "successful"
        DownloadManager.STATUS_FAILED -> "failed"
        else -> "unknown"
    }

    private fun Cursor.int(column: String) = getInt(getColumnIndexOrThrow(column))
    private fun Cursor.long(column: String) = getLong(getColumnIndexOrThrow(column))
    private fun Cursor.string(column: String) = getString(getColumnIndexOrThrow(column))

    companion object {
        private const val CHANNEL = "boltbytes.media/offline_downloads"
    }
}
