package com.boltbytes.media.tv.v1.production

import android.content.Context
import android.hardware.display.DisplayManager
import android.media.MediaCodecList
import android.net.ConnectivityManager
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.TimeUnit

data class ProductionQrChallenge(
    val pairingId: String,
    val pollToken: String,
    val approvalUrl: String,
    val userCode: String,
    val expiresAt: String?,
    val pollIntervalSeconds: Long,
)

internal fun parseProductionQrChallenge(
    response: JSONObject,
    resolveUrl: (String) -> String,
): ProductionQrChallenge {
    val payload = response.payload()
    val pairingId = payload.firstString("pairingId", "requestId", "challengeId", "id")
        ?: error("QR-login mangler pairing-id")
    val pollToken = payload.firstString("pollToken")
        ?: error("QR-login mangler polling-token")
    val approvalPath = payload.firstString(
        "approveUrl",
        "approvalUrl",
        "approvePath",
        "verificationUriComplete",
        "url",
    ) ?: error("QR-login mangler godkendelses-URL")
    return ProductionQrChallenge(
        pairingId = pairingId,
        pollToken = pollToken,
        approvalUrl = resolveUrl(approvalPath),
        userCode = payload.firstString("userCode", "code") ?: "",
        expiresAt = payload.firstString("expiresAt", "expires"),
        pollIntervalSeconds = payload.optLong("pollIntervalSeconds", 2L).coerceIn(1L, 10L),
    )
}

internal fun qrPollPayload(challenge: ProductionQrChallenge): JSONObject =
    JSONObject()
        .put("pairingId", challenge.pairingId)
        .put("pollToken", challenge.pollToken)

class ProductionApi(context: Context) {
    private val applicationContext = context.applicationContext
    private val store = ProductionSessionStore(context)
    private val preferences = context.getSharedPreferences("tv_v1_runtime", Context.MODE_PRIVATE)
    private val refreshMutex = Mutex()
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Volatile
    private var tokens: ProductionTokens? = store.load()

    val deviceId: String by lazy {
        preferences.getString("device_id", null) ?: UUID.randomUUID().toString().also {
            preferences.edit().putString("device_id", it).commit()
        }
    }

    fun hasSession(): Boolean = tokens != null

    suspend fun login(email: String, password: String): JSONObject {
        val response = request(
            method = "POST",
            path = "auth/login",
            body = JSONObject()
                .put("email", email.trim())
                .put("password", password)
                .put("deviceFingerprint", deviceId)
                .put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                .put("deviceType", "tv")
                .put("platform", "android-tv")
                .put("appVersion", "1.0.0"),
            authenticated = false,
        )
        installTokens(response)
        return response
    }

    suspend fun startQr(): ProductionQrChallenge {
        val response = request(
            "POST",
            "auth/tv/start",
            JSONObject()
                .put("deviceFingerprint", deviceId)
                .put("deviceName", "${Build.MANUFACTURER} ${Build.MODEL}".trim())
                .put("deviceType", "tv")
                .put("platform", "android-tv")
                .put("appVersion", "1.0.0"),
            authenticated = false,
        )
        return parseProductionQrChallenge(response, ::resolvePublicUrl)
    }

    suspend fun pollQr(challenge: ProductionQrChallenge): Boolean {
        val response = request(
            "POST",
            "auth/tv/poll",
            qrPollPayload(challenge),
            authenticated = false,
            refreshOnUnauthorized = false,
        )
        val status = response.payload().firstString("status", "state")?.lowercase()
        val auth = parseTokens(response)
        if (auth != null) {
            tokens = auth
            store.save(auth)
            return true
        }
        if (status in listOf("expired", "denied", "rejected", "cancelled")) {
            throw ProductionApiException("QR-login er udløbet eller afvist", 409)
        }
        return false
    }

    suspend fun restore(): Boolean {
        if (tokens == null) return false
        return try {
            refreshSession()
            true
        } catch (error: ProductionApiException) {
            if (error.status == 401 || error.status == 403) {
                clearSession()
                false
            } else {
                throw error
            }
        }
    }

    suspend fun me(): JSONObject = request("GET", "auth/me")

    suspend fun selectProfile(profileId: String, pin: String?) {
        refreshSession(profileId, pin)
    }

    suspend fun home(): ProductionHome = parseHome(request("GET", "experience/home"))

    suspend fun homeRow(id: String, cursor: String?): ProductionRow {
        val suffix = cursor?.let { "?cursor=${encode(it)}" }.orEmpty()
        val payload = request("GET", "experience/home/rows/${encodePath(id)}$suffix").payload()
        return ProductionRow(
            id = id,
            title = payload.firstString("title", "name") ?: "",
            cards = payload.firstArray("items", "cards")?.objects().orEmpty().mapNotNull(::parseCard),
            cursor = payload.firstString("cursor", "nextCursor"),
        )
    }

    suspend fun search(query: String): List<ProductionCard> =
        parseSearch(request("GET", "experience/search?q=${encode(query)}"))

    suspend fun title(id: String): ProductionTitle {
        val base = parseTitle(request("GET", "experience/titles/${encodePath(id)}"))
        if (base.seasons.none { it.episodes.isEmpty() }) return base
        val hydrated = base.seasons.map { season ->
            if (season.episodes.isNotEmpty()) return@map season
            val response = runCatching {
                request("GET", "media/${encodePath(id)}/details?season=${season.number}")
            }.getOrNull()?.payload()
            val episodes = response?.firstArray("episodes", "items")?.objects().orEmpty().mapNotNull(::parseEpisode)
            season.copy(episodes = episodes)
        }
        return base.copy(seasons = hydrated)
    }

    suspend fun addWatchlist(id: String, type: String?) {
        request("PUT", "playback/watchlist/${encodePath(id)}", JSONObject().put("targetType", type ?: "media"))
    }

    suspend fun removeWatchlist(id: String) {
        request("DELETE", "playback/watchlist/${encodePath(id)}")
    }

    suspend fun removeContinue(id: String) {
        request("DELETE", "playback/history/${encodePath(id)}")
    }

    suspend fun setWatched(id: String, watched: Boolean) {
        request("PATCH", "playback/history/${encodePath(id)}/watched", JSONObject().put("watched", watched))
    }

    suspend fun authorizeVod(
        mediaId: String,
        startPositionMs: Long,
        preferences: ProductionPreferences,
    ): ProductionAuthorization {
        val playbackContext = request("GET", "playback/context").payload()
        val profileId = playbackContext.firstString("profileId")
            ?: throw ProductionApiException("Ingen aktiv profil", 409)
        val playbackDeviceId = playbackContext.firstString("deviceId") ?: deviceId
        val metrics = applicationContext.resources.displayMetrics
        val capabilities = productionPlaybackCapabilities(
            screenHeight = metrics.heightPixels,
            devicePixelRatio = metrics.density.toDouble(),
            supportedCodecs = supportedVideoCodecs(),
            hdrEnabled = preferences.hdr,
            supportsHdr = deviceSupportsHdr(),
            allowUpscale = preferences.allowUpscale,
            upscaleMode = preferences.upscaleMode,
            estimatedDownlinkMbps = estimatedDownlinkMbps(),
        )
        val response = request(
            "POST",
            "playback/authorize",
            productionAuthorizePayload(
                profileId = profileId,
                mediaId = mediaId,
                deviceId = playbackDeviceId,
                startPositionMs = startPositionMs,
                capabilities = capabilities,
            ),
        )
        return parseAuthorization(response, ::resolvePublicUrl)
    }

    suspend fun playbackPreparation(statusUrl: String): ProductionPreparationStatus =
        parsePreparationStatus(
            request(
                "GET",
                statusUrl,
                authenticated = false,
                refreshOnUnauthorized = false,
            ),
        )

    suspend fun livePreparation(statusUrl: String): ProductionLivePreparationStatus =
        parseLivePreparationStatus(
            request(
                "GET",
                statusUrl,
                authenticated = false,
                refreshOnUnauthorized = false,
            ),
            ::resolvePublicUrl,
        )

    suspend fun subtitlePreparation(statusUrl: String): ProductionSubtitlePreparationStatus =
        parseSubtitlePreparationStatus(
            request(
                "GET",
                statusUrl,
                authenticated = false,
                refreshOnUnauthorized = false,
            ),
        )

    suspend fun fetchSubtitleWebVtt(sourceUrl: String): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url(resolvePublicUrl(sourceUrl))
            .header("Accept", "text/vtt")
            .header("X-BB-Client", "android-tv-v1")
            .header("X-BB-Device-Id", deviceId)
        client.newCall(builder.build()).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw ProductionApiException("Undertekstsporet er ikke klar (${response.code})", response.code)
            }
            if (!body.trimStart { it.isWhitespace() || it == '\uFEFF' }.startsWith("WEBVTT")) {
                throw ProductionApiException("Undertekstsporet er ikke gyldigt WebVTT", 422)
            }
            body
        }
    }

    private fun supportedVideoCodecs(): List<String> = runCatching {
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .filterNot { it.isEncoder }
            .flatMap { it.supportedTypes.asIterable() }
            .mapNotNull { mimeType ->
                when (mimeType.lowercase()) {
                    "video/avc" -> "h264"
                    "video/hevc" -> "hevc"
                    "video/x-vnd.on2.vp9" -> "vp9"
                    "video/av01" -> "av1"
                    else -> null
                }
            }
            .distinct()
            .ifEmpty { listOf("h264") }
    }.getOrDefault(listOf("h264"))

    private fun deviceSupportsHdr(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val display = applicationContext
            .getSystemService(DisplayManager::class.java)
            ?.displays
            ?.firstOrNull()
        return display?.hdrCapabilities?.supportedHdrTypes?.isNotEmpty() == true
    }

    private fun estimatedDownlinkMbps(): Double? {
        val connectivity = applicationContext.getSystemService(ConnectivityManager::class.java)
            ?: return null
        val network = connectivity.activeNetwork ?: return null
        val capabilities = connectivity.getNetworkCapabilities(network) ?: return null
        return capabilities.linkDownstreamBandwidthKbps
            .takeIf { it > 0 }
            ?.div(1_000.0)
    }

    suspend fun heartbeatVod(sessionId: String, positionMs: Long, playing: Boolean) {
        request(
            "PATCH",
            "playback/sessions/${encodePath(sessionId)}/heartbeat",
            JSONObject()
                .put("positionMs", positionMs)
                .put("runtimeState", if (playing) "playing" else "paused"),
        )
    }

    suspend fun progressVod(sessionId: String, positionMs: Long, durationMs: Long, completed: Boolean) {
        request(
            "PATCH",
            "playback/sessions/${encodePath(sessionId)}/progress",
            JSONObject()
                .put("positionMs", positionMs)
                .put("durationMs", durationMs)
                .put("completed", completed),
        )
    }

    suspend fun releaseVod(sessionId: String) {
        request("DELETE", "playback/sessions/${encodePath(sessionId)}")
    }

    suspend fun reconfigureVod(
        current: ProductionAuthorization,
        startPositionMs: Long,
        qualityMode: String,
        fixedQualityHeight: Int?,
        audioTrackId: String?,
        subtitleTrack: ProductionTrack?,
        preferences: ProductionPreferences,
    ): ProductionAuthorization {
        val streamToken = current.streamToken?.takeIf(String::isNotBlank)
            ?: error("Afspilningssessionen mangler stream-token")
        val metrics = applicationContext.resources.displayMetrics
        val capabilities = productionPlaybackCapabilities(
            screenHeight = metrics.heightPixels,
            devicePixelRatio = metrics.density.toDouble(),
            supportedCodecs = supportedVideoCodecs(),
            hdrEnabled = preferences.hdr,
            supportsHdr = deviceSupportsHdr(),
            allowUpscale = preferences.allowUpscale,
            upscaleMode = preferences.upscaleMode,
            estimatedDownlinkMbps = estimatedDownlinkMbps(),
        )
        val response = request(
            "PATCH",
            "playback/sessions/${encodePath(current.sessionId)}/configuration",
            productionPlaybackConfigurationPayload(
                streamToken = streamToken,
                startPositionMs = startPositionMs,
                qualityMode = qualityMode,
                fixedQualityHeight = fixedQualityHeight,
                audioTrackId = audioTrackId,
                subtitleTrackId = subtitleTrack?.id,
                burnIn = subtitleTrack?.delivery == "burn_in",
                allowUpscale = preferences.allowUpscale && preferences.upscaleMode != "off",
                upscaleMode = if (preferences.allowUpscale && preferences.upscaleMode != "off") "server" else "off",
                capabilities = capabilities,
            ),
        )
        val configured = parseAuthorization(response, ::resolvePublicUrl)
        return configured.copy(
            streamToken = configured.streamToken ?: current.streamToken,
            audioTracks = configured.audioTracks.ifEmpty { current.audioTracks },
            subtitleTracks = configured.subtitleTracks.ifEmpty { current.subtitleTracks },
            markers = configured.markers.ifEmpty { current.markers },
            subtitlePreparationStatusUrl = configured.subtitlePreparationStatusUrl
                ?: current.subtitlePreparationStatusUrl,
        )
    }

    suspend fun guide(): List<ProductionChannel> = parseGuide(request("GET", "live-tv/guide"))

    suspend fun setFavorite(channelId: String, favorite: Boolean) {
        request(if (favorite) "PUT" else "DELETE", "live-tv/favorites/${encodePath(channelId)}")
    }

    suspend fun authorizeLive(channelId: String): ProductionAuthorization {
        val response = request(
            "POST",
            "live-tv/playback/authorize",
            JSONObject()
                .put("channelId", channelId)
                .put("isCastSession", false)
                .put("preferredMethod", "direct_stream"),
        )
        return parseAuthorization(response, ::resolvePublicUrl)
    }

    suspend fun switchLive(
        leaseId: String,
        channelId: String,
        streamToken: String?,
    ): ProductionAuthorization {
        require(!streamToken.isNullOrBlank()) { "Live TV-sessionen mangler stream-token" }
        val response = request(
            "POST",
            "live-tv/playback/leases/${encodePath(leaseId)}/switch",
            JSONObject()
                .put("channelId", channelId)
                .put("streamToken", streamToken)
                .put("preferredMethod", "direct_stream"),
        )
        return parseAuthorization(response, ::resolvePublicUrl)
    }

    suspend fun heartbeatLive(leaseId: String, token: String?, positionMs: Long) {
        request(
            "PATCH",
            "live-tv/stream/${encodePath(leaseId)}/heartbeat${tokenQuery(token)}",
            JSONObject().put("runtimeState", "playing"),
            authenticated = false,
        )
    }

    suspend fun releaseLive(leaseId: String, token: String?) {
        request(
            "DELETE",
            "live-tv/stream/${encodePath(leaseId)}${tokenQuery(token)}",
            authenticated = false,
        )
    }

    suspend fun notifications(): List<ProductionNotification> =
        parseNotifications(request("GET", "client-services/notifications"))

    suspend fun markNotificationRead(id: String) {
        request("POST", "client-services/notifications/${encodePath(id)}/read", JSONObject())
    }

    suspend fun markAllNotificationsRead() {
        request("POST", "client-services/notifications/read-all", JSONObject())
    }

    suspend fun downloads(): List<ProductionDownload> = parseDownloads(request("GET", "offline-downloads"))

    suspend fun renewDownload(id: String) {
        request("POST", "offline-downloads/${encodePath(id)}/renew", JSONObject())
    }

    suspend fun removeDownload(id: String) {
        request("DELETE", "offline-downloads/${encodePath(id)}")
    }

    suspend fun preferences(): ProductionPreferences {
        val profile = parsePreferences(request("GET", "profiles/me/preferences"))
        val device = parsePreferences(request("GET", "devices/me/preferences"))
        return profile.copy(
            qualityMode = device.qualityMode,
            maxHeight = device.maxHeight,
            allowUpscale = device.allowUpscale && device.upscaleMode != "off",
            upscaleMode = if (device.allowUpscale && device.upscaleMode != "off") "server" else "off",
            dataSaver = device.dataSaver,
            hdr = device.hdr,
        )
    }

    suspend fun savePreferences(value: ProductionPreferences) {
        request(
            "PATCH",
            "profiles/me/preferences",
            JSONObject()
                .put("audioLanguage", value.audioLanguage)
                .put("subtitleLanguage", value.subtitleLanguage)
                .put("subtitleMode", value.subtitleMode)
                .put("autoplay", value.autoplay)
                .put("recommendations", value.recommendations)
                .put("playbackRate", value.playbackRate),
        )
        request(
            "PATCH",
            "devices/me/preferences",
            JSONObject()
                .put("qualityMode", value.qualityMode)
                .put("maxHeight", value.maxHeight ?: JSONObject.NULL)
                .put("allowUpscale", value.allowUpscale && value.upscaleMode != "off")
                .put("upscaleMode", if (value.allowUpscale && value.upscaleMode != "off") "server" else "off")
                .put("dataSaver", value.dataSaver)
                .put("hdr", value.hdr),
        )
    }

    suspend fun logout() {
        try {
            request("POST", "auth/logout", JSONObject().put("refreshToken", tokens?.refreshToken), refreshOnUnauthorized = false)
        } finally {
            clearSession()
        }
    }

    fun resolvePublicUrl(value: String): String = when {
        value.startsWith("https://") || value.startsWith("http://") -> value
        value.startsWith("/api/") -> "$ORIGIN$value"
        value.startsWith("/") -> "$ORIGIN$value"
        else -> "$API_ROOT$value"
    }

    private suspend fun refreshSession(profileId: String? = null, profilePin: String? = null) {
        refreshMutex.withLock {
            val current = tokens ?: throw ProductionApiException("Session mangler", 401)
            val body = JSONObject().put("refreshToken", current.refreshToken)
            if (profileId != null) body.put("profileId", profileId)
            if (!profilePin.isNullOrBlank()) body.put("profilePin", profilePin)
            val response = execute("POST", "auth/refresh", body, null)
            val refreshed = parseTokens(response) ?: throw ProductionApiException("Ugyldigt refresh-svar", 401)
            tokens = refreshed
            store.save(refreshed)
        }
    }

    private fun installTokens(response: JSONObject) {
        val auth = parseTokens(response) ?: throw ProductionApiException("Login returnerede ingen session", 500)
        tokens = auth
        store.save(auth)
    }

    private fun clearSession() {
        tokens = null
        store.clear()
    }

    private suspend fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        authenticated: Boolean = true,
        refreshOnUnauthorized: Boolean = true,
    ): JSONObject {
        val token = if (authenticated) tokens?.accessToken else null
        return try {
            execute(method, path, body, token)
        } catch (error: ProductionApiException) {
            if (authenticated && refreshOnUnauthorized && error.status == 401 && tokens != null) {
                try {
                    refreshSession()
                } catch (refreshError: ProductionApiException) {
                    if (refreshError.status == 401 || refreshError.status == 403) clearSession()
                    throw refreshError
                }
                execute(method, path, body, tokens?.accessToken)
            } else {
                throw error
            }
        }
    }

    private suspend fun execute(method: String, path: String, body: JSONObject?, bearer: String?): JSONObject =
        withContext(Dispatchers.IO) {
            val requestBody = body?.toString()?.toRequestBody(JSON)
            val builder = Request.Builder().url(resolvePublicUrl(path))
                .header("Accept", "application/json")
                .header("X-BB-Client", "android-tv-v1")
                .header("X-BB-Device-Id", deviceId)
            if (!bearer.isNullOrBlank()) builder.header("Authorization", "Bearer $bearer")
            builder.method(method, if (method in listOf("POST", "PUT", "PATCH")) requestBody ?: EMPTY_BODY else requestBody)
            client.newCall(builder.build()).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val parsed = when {
                    raw.isBlank() -> JSONObject()
                    raw.trimStart().startsWith("[") -> JSONObject().put("items", JSONArray(raw))
                    else -> runCatching { JSONObject(raw) }.getOrElse { JSONObject().put("message", raw) }
                }
                if (!response.isSuccessful) {
                    val message = parsed.firstString("message", "error", "detail") ?: "Serverfejl ${response.code}"
                    throw ProductionApiException(message, response.code)
                }
                parsed
            }
        }

    private fun tokenQuery(token: String?): String = token?.let { "?token=${encode(it)}" }.orEmpty()
    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.name())
    private fun encodePath(value: String): String = encode(value).replace("+", "%20")

    private companion object {
        const val ORIGIN = "https://media.boltbytes.com"
        const val API_ROOT = "$ORIGIN/api/v1/"
        val JSON = "application/json; charset=utf-8".toMediaType()
        val EMPTY_BODY = ByteArray(0).toRequestBody(JSON)
    }
}

internal fun productionPlaybackCapabilities(
    screenHeight: Int,
    devicePixelRatio: Double,
    supportedCodecs: List<String>,
    hdrEnabled: Boolean,
    supportsHdr: Boolean,
    allowUpscale: Boolean,
    upscaleMode: String,
    estimatedDownlinkMbps: Double? = null,
): JSONObject = JSONObject()
    .put("screenHeight", screenHeight.coerceIn(240, 4_320))
    .put("devicePixelRatio", devicePixelRatio.coerceIn(0.5, 4.0))
    .apply {
        estimatedDownlinkMbps
            ?.coerceIn(0.1, 1_000.0)
            ?.let { put("estimatedDownlinkMbps", it) }
    }
    .put("supportedCodecs", JSONArray(supportedCodecs.ifEmpty { listOf("h264") }))
    .put(
        "supportedAudioCodecs",
        JSONArray(listOf("aac", "ac3", "eac3", "opus", "mp3", "flac")),
    )
    .put(
        "supportedContainers",
        JSONArray(listOf("mov", "mp4", "mkv", "matroska", "webm", "mpegts", "hls")),
    )
    .put("supportsHdr", hdrEnabled && supportsHdr)
    .put(
        "upscaleMode",
        if (allowUpscale && upscaleMode != "off") "server" else "off",
    )
    .put("bufferProfile", "stable")
    .put("startupPolicy", "baseline_first")

internal fun productionAuthorizePayload(
    profileId: String,
    mediaId: String,
    deviceId: String,
    startPositionMs: Long,
    capabilities: JSONObject,
): JSONObject = JSONObject()
    .put("profileId", profileId)
    .put("mediaId", mediaId)
    .put("deviceId", deviceId)
    .put("startPositionMs", startPositionMs.coerceIn(0L, Int.MAX_VALUE.toLong()))
    .put("isCastSession", false)
    .put("capabilities", capabilities)

class ProductionApiException(message: String, val status: Int) : Exception(message)
