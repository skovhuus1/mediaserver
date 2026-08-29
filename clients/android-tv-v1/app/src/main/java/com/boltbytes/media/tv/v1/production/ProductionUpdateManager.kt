package com.boltbytes.media.tv.v1.production

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

sealed interface ProductionUpdateState {
    data object Idle : ProductionUpdateState
    data object Checking : ProductionUpdateState
    data class UpToDate(val version: String) : ProductionUpdateState
    data class Available(val version: String, val notes: String) : ProductionUpdateState
    data class Downloading(val version: String, val progress: Float) : ProductionUpdateState
    data class Ready(val version: String, val file: File) : ProductionUpdateState
    data class PermissionRequired(val version: String, val file: File) : ProductionUpdateState
    data class Failure(val message: String) : ProductionUpdateState
}

private data class GitHubRelease(
    val version: String,
    val notes: String,
    val apkName: String,
    val apkUrl: String,
    val checksumUrl: String,
)

class ProductionUpdateManager(private val context: Context) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()
    private val mutableState = MutableStateFlow<ProductionUpdateState>(ProductionUpdateState.Idle)
    val state: StateFlow<ProductionUpdateState> = mutableState.asStateFlow()

    val currentVersionName: String
        get() = currentPackage().versionName ?: "0.0.0"

    suspend fun check() {
        mutableState.value = ProductionUpdateState.Checking
        try {
            val release = fetchRelease()
            if (compareSemanticVersions(release.version, currentVersionName) <= 0) {
                mutableState.value = ProductionUpdateState.UpToDate(currentVersionName)
            } else {
                mutableState.value = ProductionUpdateState.Available(release.version, release.notes)
            }
        } catch (error: Exception) {
            mutableState.value = ProductionUpdateState.Failure(error.message ?: "Opdateringstjek mislykkedes")
        }
    }

    suspend fun download() {
        val available = mutableState.value as? ProductionUpdateState.Available ?: return
        try {
            val release = fetchRelease()
            require(release.version == available.version) { "Den seneste release ændrede sig. Kontrollér igen." }
            val expectedHash = fetchText(release.checksumUrl).lineSequence()
                .firstOrNull { it.contains(release.apkName) }
                ?.trim()?.split(Regex("\\s+"))?.firstOrNull()
                ?: error("Release mangler en SHA-256 for ${release.apkName}")
            require(expectedHash.matches(Regex("[a-fA-F0-9]{64}"))) { "Release har en ugyldig SHA-256" }
            val directory = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates")
            require(directory.exists() || directory.mkdirs()) { "Opdateringsmappen kunne ikke oprettes" }
            val temporary = File(directory, "${release.apkName}.part")
            val target = File(directory, release.apkName)
            downloadFile(release.apkUrl, temporary, release.version)
            verifyCandidate(temporary, expectedHash.lowercase())
            if (target.exists()) target.delete()
            require(temporary.renameTo(target)) { "Den validerede APK kunne ikke færdiggøres" }
            mutableState.value = ProductionUpdateState.Ready(release.version, target)
        } catch (error: Exception) {
            mutableState.value = ProductionUpdateState.Failure(error.message ?: "Download mislykkedes")
        }
    }

    fun install() {
        val ready = when (val value = mutableState.value) {
            is ProductionUpdateState.Ready -> value
            is ProductionUpdateState.PermissionRequired -> ProductionUpdateState.Ready(value.version, value.file)
            else -> return
        }
        if (installedFromPlay()) {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            mutableState.value = ProductionUpdateState.PermissionRequired(ready.version, ready.file)
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", ready.file)
        context.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, APK_MIME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION),
        )
    }

    private suspend fun fetchRelease(): GitHubRelease = withContext(Dispatchers.IO) {
        val releases = executeArray(RELEASES_URL)
        val response = (0 until releases.length()).mapNotNull(releases::optJSONObject)
            .filter { !it.optBoolean("draft") && !it.optBoolean("prerelease") && it.optString("tag_name").startsWith(TAG_PREFIX) }
            .maxByOrNull { it.optString("tag_name").removePrefix(TAG_PREFIX).versionWeight() }
            ?: error("Der findes ingen stabil TV V1-release")
        val tag = response.optString("tag_name")
        val version = tag.removePrefix(TAG_PREFIX)
        require(version.matches(Regex("\\d+\\.\\d+\\.\\d+"))) { "Release-versionen er ugyldig" }
        var apkName: String? = null
        var apkUrl: String? = null
        var checksumUrl: String? = null
        val assets = response.optJSONArray("assets") ?: error("Release mangler assets")
        for (index in 0 until assets.length()) {
            val asset = assets.optJSONObject(index) ?: continue
            val name = asset.optString("name")
            val url = asset.optString("browser_download_url")
            if (name.startsWith("BoltBytes-TV-V1-") && name.endsWith(".apk")) {
                apkName = name
                apkUrl = url
            }
            if (name == "sha256.txt") checksumUrl = url
        }
        GitHubRelease(
            version = version,
            notes = response.optString("body"),
            apkName = apkName ?: error("Release mangler den signerede TV-APK"),
            apkUrl = apkUrl ?: error("Release mangler APK-downloadlink"),
            checksumUrl = checksumUrl ?: error("Release mangler sha256.txt"),
        )
    }

    private suspend fun downloadFile(url: String, target: File, version: String) = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).header("User-Agent", USER_AGENT).build()
        client.newCall(request).execute().use { response ->
            require(response.isSuccessful) { "APK-download gav HTTP ${response.code}" }
            val body = response.body ?: error("APK-download var tom")
            val total = body.contentLength().coerceAtLeast(1L)
            body.byteStream().use { input ->
                FileOutputStream(target, false).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var copied = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        copied += count
                        mutableState.value = ProductionUpdateState.Downloading(version, (copied.toFloat() / total).coerceIn(0f, 1f))
                    }
                    output.fd.sync()
                }
            }
        }
    }

    private fun verifyCandidate(file: File, expectedHash: String) {
        require(file.isFile && file.length() > 0L) { "Den downloadede APK er tom" }
        require(sha256(file) == expectedHash) { "APK'ens SHA-256 matcher ikke releasen" }
        val candidate = archivePackage(file) ?: error("Filen er ikke en læsbar Android APK")
        val current = currentPackage()
        require(candidate.packageName == EXPECTED_PACKAGE) { "APK'en har forkert package-id: ${candidate.packageName}" }
        require(versionCode(candidate) > versionCode(current)) { "APK-versionen er ikke nyere end den installerede version" }
        require(signerDigests(candidate) == signerDigests(current)) { "APK'en er signeret med et andet certifikat" }
    }

    private fun executeArray(url: String): JSONArray {
        val request = Request.Builder().url(url).header("Accept", "application/vnd.github+json")
            .header("User-Agent", USER_AGENT).build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            require(response.isSuccessful) { "GitHub gav HTTP ${response.code}" }
            return JSONArray(body)
        }
    }

    private fun fetchText(url: String): String {
        val request = Request.Builder().url(url).header("User-Agent", USER_AGENT).build()
        client.newCall(request).execute().use { response ->
            require(response.isSuccessful) { "Checksum-download gav HTTP ${response.code}" }
            return response.body?.string() ?: error("Checksum-filen var tom")
        }
    }

    @Suppress("DEPRECATION")
    private fun currentPackage(): PackageInfo = if (Build.VERSION.SDK_INT >= 33) {
        context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
    } else {
        context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
    }

    @Suppress("DEPRECATION")
    private fun archivePackage(file: File): PackageInfo? = if (Build.VERSION.SDK_INT >= 33) {
        context.packageManager.getPackageArchiveInfo(file.absolutePath, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
    } else {
        context.packageManager.getPackageArchiveInfo(file.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
    }

    @Suppress("DEPRECATION")
    private fun signerDigests(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners.orEmpty().toList()
        } else {
            info.signatures.orEmpty().toList()
        }
        return signatures.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
        }.toSet()
    }

    @Suppress("DEPRECATION")
    private fun installedFromPlay(): Boolean = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName == "com.android.vending"
    } else {
        context.packageManager.getInstallerPackageName(context.packageName) == "com.android.vending"
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    @Suppress("DEPRECATION")
    private fun versionCode(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode
    } else {
        info.versionCode.toLong()
    }

    private fun String.versionWeight(): Long {
        val parts = split('.').map { it.toLongOrNull() ?: 0L }
        return parts.getOrElse(0) { 0L } * 1_000_000L +
            parts.getOrElse(1) { 0L } * 1_000L +
            parts.getOrElse(2) { 0L }
    }

    private companion object {
        const val EXPECTED_PACKAGE = "com.boltbytes.boltbytes_media.tv"
        const val TAG_PREFIX = "android-tv-v1-v"
        const val RELEASES_URL = "https://api.github.com/repos/skovhuus1/mediaserver/releases?per_page=30"
        const val USER_AGENT = "BoltBytes-TV-V1-Updater"
        const val APK_MIME = "application/vnd.android.package-archive"
    }
}

internal fun compareSemanticVersions(left: String, right: String): Int {
    val a = left.split('.').map { it.toIntOrNull() ?: 0 }
    val b = right.split('.').map { it.toIntOrNull() ?: 0 }
    for (index in 0 until maxOf(a.size, b.size)) {
        val comparison = a.getOrElse(index) { 0 }.compareTo(b.getOrElse(index) { 0 })
        if (comparison != 0) return comparison
    }
    return 0
}
