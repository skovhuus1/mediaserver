package com.boltbytes.boltbytes_media

import android.content.Context
import androidx.core.content.edit
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.math.absoluteValue

class OfflineDownloadBridge(
    private val context: Context,
    messenger: BinaryMessenger,
) : MethodChannel.MethodCallHandler {
    private val channel = MethodChannel(messenger, CHANNEL)
    private val workManager = WorkManager.getInstance(context)
    private val mappings = context.getSharedPreferences("bbmedia_offline_work", Context.MODE_PRIVATE)
    private var mediaServer: EncryptedMediaServer? = null

    init {
        purgeLegacyFiles()
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "enqueue" -> enqueue(call, result)
                "query" -> query(call, result)
                "cancel" -> cancel(call, result)
                "serve" -> serve(call, result)
                "stopServe" -> stopServe(result)
                "purgeLegacy" -> result.success(purgeLegacyFiles())
                else -> result.notImplemented()
            }
        } catch (error: Exception) {
            result.error("offline_download_failed", error.message ?: "Offline download failed", null)
        }
    }

    fun dispose() {
        mediaServer?.stop()
        mediaServer = null
        channel.setMethodCallHandler(null)
    }

    private fun enqueue(call: MethodCall, result: MethodChannel.Result) {
        val url = call.argument<String>("url")?.trim().orEmpty()
        val id = validatedId(call.argument<String>("id"))
        val title = call.argument<String>("title")?.trim().orEmpty().ifBlank { "BoltBytes Media" }
        val wifiOnly = call.argument<Boolean>("wifiOnly") ?: true
        require(url.startsWith("https://")) { "Offline downloads require HTTPS" }

        val root = OfflineCrypto.offlineRoot(context)
        File(root, "$id.mp4").delete()
        File(root, "$id.bbenc").delete()
        File(root, "$id.bbenc.partial").delete()
        OfflineCrypto.deleteKey(id)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(if (wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED)
            .build()
        val request = OneTimeWorkRequestBuilder<EncryptedDownloadWorker>()
            .setConstraints(constraints)
            .setInputData(
                workDataOf(
                    EncryptedDownloadWorker.KEY_URL to url,
                    EncryptedDownloadWorker.KEY_MEDIA_ID to id,
                    EncryptedDownloadWorker.KEY_TITLE to title,
                ),
            )
            .addTag("bbmedia-offline-$id")
            .build()
        val nativeId = allocateNativeId(request.id)
        workManager.enqueue(request)
        result.success(nativeId)
    }

    private fun query(call: MethodCall, result: MethodChannel.Result) {
        val nativeId = (call.argument<Number>("downloadId") ?: error("downloadId is required")).toLong()
        val workId = mappings.getString(nativeId.toString(), null)?.let(UUID::fromString)
        if (workId == null) {
            result.success(mapOf("status" to "missing", "downloadId" to nativeId))
            return
        }
        val info = workManager.getWorkInfoById(workId).get(5, TimeUnit.SECONDS)
        if (info == null) {
            result.success(mapOf("status" to "missing", "downloadId" to nativeId))
            return
        }
        val downloaded = info.progress.getLong(EncryptedDownloadWorker.KEY_DOWNLOADED_BYTES, 0)
        val total = info.progress.getLong(EncryptedDownloadWorker.KEY_TOTAL_BYTES, 0)
        result.success(
            mapOf(
                "downloadId" to nativeId,
                "status" to statusName(info.state),
                "reason" to info.outputData.getString(EncryptedDownloadWorker.KEY_ERROR),
                "downloadedBytes" to downloaded,
                "totalBytes" to total,
                "localPath" to info.outputData.getString(EncryptedDownloadWorker.KEY_LOCAL_PATH),
                "encryptionVersion" to OfflineCrypto.VERSION,
            ),
        )
    }

    private fun cancel(call: MethodCall, result: MethodChannel.Result) {
        val nativeId = call.argument<Number>("downloadId")?.toLong()
        nativeId?.let {
            mappings.getString(it.toString(), null)?.let(UUID::fromString)?.let(workManager::cancelWorkById)
            mappings.edit { remove(it.toString()) }
        }
        val path = call.argument<String>("localPath")
        val id = path?.let(::ownedMediaId)
        if (id != null) {
            File(path).delete()
            File(path + ".partial").delete()
            OfflineCrypto.deleteKey(id)
        }
        result.success(true)
    }

    private fun serve(call: MethodCall, result: MethodChannel.Result) {
        val id = validatedId(call.argument<String>("id"))
        val path = call.argument<String>("localPath")?.trim().orEmpty()
        val licenseExpiresAtMillis = call.argument<Number>("licenseExpiresAtMs")?.toLong()
            ?: error("Offline license expiry is required")
        require(licenseExpiresAtMillis > System.currentTimeMillis()) {
            "Offline license has expired"
        }
        require(ownedMediaId(path) == id) { "Offline file is outside the application directory" }
        val file = File(path).canonicalFile
        require(file.isFile && file.extension == "bbenc") { "Encrypted offline file is missing" }
        OfflineCrypto.readHeader(file)
        require(OfflineCrypto.existingKey(id) != null) { "Device-bound offline key is missing" }
        mediaServer?.stop()
        val next = EncryptedMediaServer(
            context,
            id,
            file,
            licenseExpiresAtMillis,
        )
        mediaServer = next
        result.success(mapOf("url" to next.start(), "encryptionVersion" to OfflineCrypto.VERSION))
    }

    private fun stopServe(result: MethodChannel.Result) {
        mediaServer?.stop()
        mediaServer = null
        result.success(true)
    }

    private fun allocateNativeId(workId: UUID): Long {
        var candidate = (workId.mostSignificantBits xor workId.leastSignificantBits).absoluteValue
        if (candidate == 0L) candidate = System.currentTimeMillis()
        while (mappings.contains(candidate.toString())) candidate += 1
        mappings.edit(commit = true) { putString(candidate.toString(), workId.toString()) }
        return candidate
    }

    private fun purgeLegacyFiles(): Int {
        val root = OfflineCrypto.offlineRoot(context)
        var removed = 0
        root.listFiles()?.forEach { file ->
            if (file.extension == "mp4" || file.name.endsWith(".mp4.partial")) {
                if (file.delete()) removed += 1
            }
        }
        return removed
    }

    private fun ownedMediaId(path: String): String? {
        if (path.isBlank()) return null
        val root = OfflineCrypto.offlineRoot(context).canonicalFile
        val candidate = File(path).canonicalFile
        if (!candidate.path.startsWith(root.path + File.separator)) return null
        return candidate.name.removeSuffix(".bbenc").takeIf { it.matches(ID_PATTERN) }
    }

    private fun validatedId(value: String?): String {
        val id = value?.trim().orEmpty()
        require(id.matches(ID_PATTERN)) { "Download id is invalid" }
        return id
    }

    private fun statusName(state: WorkInfo.State) = when (state) {
        WorkInfo.State.ENQUEUED -> "pending"
        WorkInfo.State.RUNNING -> "running"
        WorkInfo.State.BLOCKED -> "paused"
        WorkInfo.State.SUCCEEDED -> "successful"
        WorkInfo.State.FAILED -> "failed"
        WorkInfo.State.CANCELLED -> "missing"
    }

    companion object {
        private const val CHANNEL = "boltbytes.media/offline_downloads"
        private val ID_PATTERN = Regex("^[a-fA-F0-9-]{16,64}$")
    }
}
