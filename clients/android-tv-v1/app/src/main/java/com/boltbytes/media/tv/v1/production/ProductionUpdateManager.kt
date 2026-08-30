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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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
        .readTimeout(2, TimeUnit.MINUTES)
        .followRedirects(true)
        .followSslRedirects(true)
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
        var stage = "Forberedelse af opdatering"
        try {
            val completed = withContext(Dispatchers.IO) {
                stage = "Hentning af releaseoplysninger"
                val release = fetchRelease()
                require(release.version == available.version) { "Den seneste release ændrede sig. Kontrollér igen." }
                stage = "Hentning af checksum"
                val expectedHash = parseReleaseChecksum(fetchText(release.checksumUrl), release.apkName)
                stage = "Oprettelse af opdateringsmappe"
                val externalRoot = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                val directory = externalRoot?.let { File(it, "updates") } ?: File(context.filesDir, "updates")
                require(directory.exists() || directory.mkdirs()) { "Opdateringsmappen kunne ikke oprettes" }
                val temporary = File(directory, "${release.apkName}.part")
                val target = File(directory, release.apkName)
                stage = "Download af APK"
                downloadFile(release.apkUrl, temporary, release.version)
                stage = "Validering af APK"
                verifyCandidate(temporary, expectedHash.lowercase())
                if (target.exists()) target.delete()
                stage = "Færdiggørelse af APK"
                require(temporary.renameTo(target)) { "Den validerede APK kunne ikke færdiggøres" }
                ProductionUpdateState.Ready(release.version, target)
            }
            mutableState.value = completed
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            mutableState.value = ProductionUpdateState.Failure(
                "$stage fejlede: ${error.message ?: error.javaClass.simpleName}",
            )
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
        var lastError: Exception? = null
        repeat(DOWNLOAD_ATTEMPTS) { attempt ->
            try {
                downloadAttempt(url, target, version)
                return@withContext
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                lastError = error
                if (attempt < DOWNLOAD_ATTEMPTS - 1) delay(RETRY_DELAY_MS * (attempt + 1))
            }
        }
        throw lastError ?: error("APK-download mislykkedes")
    }

    private fun downloadAttempt(url: String, target: File, version: String) {
        val existingBytes = target.takeIf(File::isFile)?.length() ?: 0L
        val builder = Request.Builder()
            .url(url)
            .header("Accept", "application/octet-stream")
            .header("Cache-Control", "no-cache")
            .header("User-Agent", USER_AGENT)
        if (existingBytes > 0L) builder.header("Range", "bytes=$existingBytes-")
        client.newCall(builder.build()).execute().use { response ->
            if (response.code == 416 && target.delete()) error("Serveren afviste den gemte del; download genstartes")
            require(response.code == 200 || response.code == 206) { "APK-download gav HTTP ${response.code}" }
            val body = response.body ?: error("APK-download var tom")
            val append = existingBytes > 0L && response.code == 206
            val baseBytes = if (append) existingBytes else 0L
            val responseBytes = body.contentLength()
            val totalBytes = if (responseBytes >= 0L) baseBytes + responseBytes else 0L
            body.byteStream().use { input ->
                FileOutputStream(target, append).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var copied = 0L
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        copied += count
                        val progress = if (totalBytes > 0L) {
                            ((baseBytes + copied).toFloat() / totalBytes).coerceIn(0f, 1f)
                        } else {
                            0f
                        }
                        mutableState.value = ProductionUpdateState.Downloading(version, progress)
                    }
                    output.fd.sync()
                    if (responseBytes >= 0L) {
                        require(copied == responseBytes) {
                            "APK-download blev afbrudt (${baseBytes + copied}/$totalBytes bytes)"
                        }
                    }
                }
            }
            mutableState.value = ProductionUpdateState.Downloading(version, 1f)
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
    private fun archivePackage(file: File): PackageInfo? {
        val info = if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getPackageArchiveInfo(file.absolutePath, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        } else {
            context.packageManager.getPackageArchiveInfo(file.absolutePath, PackageManager.GET_SIGNING_CERTIFICATES)
        }
        info?.applicationInfo?.sourceDir = file.absolutePath
        info?.applicationInfo?.publicSourceDir = file.absolutePath
        return info
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
        const val DOWNLOAD_ATTEMPTS = 3
        const val RETRY_DELAY_MS = 1_500L
    }
}

internal fun parseReleaseChecksum(content: String, apkName: String): String {
    val lines = content.lineSequence().map(String::trim).filter(String::isNotEmpty).toList()
    val preferred = lines.firstOrNull { it.contains(apkName) } ?: lines.singleOrNull()
        ?: error("Release mangler en entydig SHA-256 for $apkName")
    val hash = preferred.split(Regex("\\s+")).firstOrNull().orEmpty()
    require(hash.matches(Regex("[a-fA-F0-9]{64}"))) { "Release har en ugyldig SHA-256" }
    return hash.lowercase()
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
