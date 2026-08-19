package com.boltbytes.boltbytes_media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.BufferedInputStream
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.absoluteValue

class EncryptedDownloadWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : Worker(appContext, parameters) {
    override fun doWork(): Result {
        val id = inputData.getString(KEY_MEDIA_ID)?.trim().orEmpty()
        val url = inputData.getString(KEY_URL)?.trim().orEmpty()
        val title = inputData.getString(KEY_TITLE)?.trim().orEmpty().ifBlank { "BoltBytes Media" }
        if (!id.matches(Regex("^[a-fA-F0-9-]{16,64}$")) || !(url.startsWith("https://") || url.startsWith("http://"))) {
            return failure("Download request is invalid")
        }

        val root = OfflineCrypto.offlineRoot(applicationContext)
        val partial = File(root, "$id.bbenc.partial")
        val target = File(root, "$id.bbenc")
        var connection: HttpURLConnection? = null
        return try {
            setForegroundAsync(foreground(title, 0)).get()
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 20_000
                readTimeout = 45_000
                instanceFollowRedirects = true
                requestMethod = "GET"
                setRequestProperty("Accept", "application/octet-stream")
            }
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) return failure("Server returned HTTP $responseCode")
            val total = connection.contentLengthLong.coerceAtLeast(0)
            val key = OfflineCrypto.getOrCreateKey(id)
            partial.delete()
            var downloaded = 0L
            var chunkIndex = 0L
            RandomAccessFile(partial, "rw").use { encrypted ->
                OfflineCrypto.writeHeader(encrypted, 0)
                encrypted.seek(OfflineCrypto.HEADER_SIZE)
                BufferedInputStream(connection.inputStream, 256 * 1024).use { input ->
                    val buffer = ByteArray(OfflineCrypto.CHUNK_SIZE)
                    while (!isStopped) {
                        val length = readChunk(input, buffer)
                        if (length == 0) break
                        val (nonce, cipherText) = OfflineCrypto.encryptChunk(key, chunkIndex, buffer, length)
                        encrypted.write(nonce)
                        encrypted.write(cipherText)
                        downloaded += length
                        chunkIndex += 1
                        setProgressAsync(progress(downloaded, total))
                        if (total > 0) {
                            setForegroundAsync(foreground(title, (downloaded * 100 / total).toInt().coerceIn(0, 99)))
                        }
                    }
                    buffer.fill(0)
                }
                if (isStopped) throw InterruptedException("Download cancelled")
                OfflineCrypto.writeHeader(encrypted, downloaded)
                encrypted.fd.sync()
            }
            require(downloaded > 0) { "Server returned an empty media file" }
            target.delete()
            require(partial.renameTo(target)) { "Encrypted media could not be committed atomically" }
            setProgressAsync(progress(downloaded, downloaded))
            Result.success(
                Data.Builder()
                    .putString(KEY_LOCAL_PATH, target.absolutePath)
                    .putLong(KEY_DOWNLOADED_BYTES, downloaded)
                    .putLong(KEY_TOTAL_BYTES, downloaded)
                    .build(),
            )
        } catch (error: Exception) {
            partial.delete()
            if (runAttemptCount < 2 && !isStopped) Result.retry() else failure(error.message ?: "Encrypted download failed")
        } finally {
            connection?.disconnect()
        }
    }

    private fun readChunk(input: BufferedInputStream, target: ByteArray): Int {
        var offset = 0
        while (offset < target.size) {
            val read = input.read(target, offset, target.size - offset)
            if (read < 0) break
            if (read == 0) continue
            offset += read
        }
        return offset
    }

    private fun progress(downloaded: Long, total: Long) = Data.Builder()
        .putLong(KEY_DOWNLOADED_BYTES, downloaded)
        .putLong(KEY_TOTAL_BYTES, total)
        .build()

    private fun failure(message: String) = Result.failure(Data.Builder().putString(KEY_ERROR, message.take(500)).build())

    private fun foreground(title: String, progress: Int): ForegroundInfo {
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Offline-downloads", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Gemmer offline")
            .setContentText(title)
            .setOnlyAlertOnce(true)
            .setOngoing(progress < 100)
            .setProgress(100, progress, false)
            .build()
        val notificationId = NOTIFICATION_ID + id.hashCode().absoluteValue % 10_000
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, notification)
        }
    }

    companion object {
        const val KEY_URL = "url"
        const val KEY_MEDIA_ID = "mediaId"
        const val KEY_TITLE = "title"
        const val KEY_DOWNLOADED_BYTES = "downloadedBytes"
        const val KEY_TOTAL_BYTES = "totalBytes"
        const val KEY_LOCAL_PATH = "localPath"
        const val KEY_ERROR = "error"
        private const val CHANNEL_ID = "bbmedia_offline_downloads"
        private const val NOTIFICATION_ID = 18_000
    }
}
