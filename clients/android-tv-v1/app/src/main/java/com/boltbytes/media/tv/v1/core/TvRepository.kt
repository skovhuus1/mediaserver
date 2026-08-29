package com.boltbytes.media.tv.v1.core

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.boltbytes.media.tv.v1.BuildConfig
import java.net.URLEncoder
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

class TvRepository(context: Context) {
    private val applicationContext = context.applicationContext
    private val sessions = SecureSessionStore(applicationContext)
    private val api = TvApiClient(BuildConfig.SERVER_URL, sessions)
    val device: TvDeviceDescriptor by lazy(::deviceDescriptor)

    suspend fun restore(): TvUser {
        api.refresh()
        return me()
    }

    suspend fun login(email: String, password: String): TvUser {
        val response = api.post(
            "/auth/login",
            JSONObject()
                .put("email", email.trim().lowercase())
                .put("password", password)
                .put("deviceFingerprint", device.fingerprint)
                .put("deviceName", device.name)
                .put("deviceType", device.type)
                .put("platform", device.platform)
                .put("appVersion", device.appVersion),
            authenticated = false,
        )
        if (response.optBoolean("passwordChangeRequired", false)) {
            throw TvApiException(409, "password_change_required", "Adgangskoden skal ændres på web, før TV-login kan fortsætte")
        }
        val user = response.optJSONObject("user")
        val profileId = user?.text("profileId")
        api.save(
            TvTokens(
                response.getString("accessToken"),
                response.getString("refreshToken"),
                response.longOrNull("expiresIn") ?: 900,
            ),
            profileId,
        )
        return me()
    }

    suspend fun startQr(): TvQrPairing {
        val response = api.post(
            "/auth/tv/start",
            JSONObject()
                .put("deviceFingerprint", device.fingerprint)
                .put("deviceName", device.name)
                .put("deviceType", device.type)
                .put("platform", device.platform)
                .put("appVersion", device.appVersion),
            authenticated = false,
        )
        return TvQrPairing(
            pairingId = response.getString("pairingId"),
            pollToken = response.getString("pollToken"),
            userCode = response.getString("userCode"),
            approveUrl = api.resolveUrl(response.text("approveUrl") ?: response.getString("approvePath"))!!,
            expiresAt = response.getString("expiresAt"),
            pollIntervalSeconds = response.longOrNull("pollIntervalSeconds") ?: 3,
        )
    }

    suspend fun pollQr(pairing: TvQrPairing): Pair<String, TvUser?> {
        val response = api.post(
            "/auth/tv/poll",
            JSONObject().put("pairingId", pairing.pairingId).put("pollToken", pairing.pollToken),
            authenticated = false,
        )
        val status = response.text("status") ?: "pending"
        if (status != "approved" || response.text("accessToken") == null) return status to null
        val profileId = response.optJSONObject("user")?.text("profileId")
        api.save(
            TvTokens(
                response.getString("accessToken"),
                response.getString("refreshToken"),
                response.longOrNull("expiresIn") ?: 900,
            ),
            profileId,
        )
        return status to me()
    }

    suspend fun me(): TvUser = parseUser(api.get("/auth/me"))

    suspend fun selectProfile(profile: TvProfile, pin: String?): TvUser {
        api.refresh(profile.id, pin)
        return me()
    }

    suspend fun home(): TvHomePayload {
        val response = api.get("/experience/home")
        return TvHomePayload(
            hero = response.optJSONObject("hero")?.let { parseMediaCard(it, api::resolveUrl) },
            rows = response.optJSONArray("rows")?.objects()?.map { row ->
                TvHomeRow(
                    id = row.text("id") ?: "row",
                    title = row.text("title") ?: "Bibliotek",
                    items = row.optJSONArray("items")?.objects()?.map { parseMediaCard(it, api::resolveUrl) }.orEmpty(),
                    nextCursor = row.text("nextCursor"),
                )
            }.orEmpty(),
            generatedAt = response.text("generatedAt"),
        )
    }

    suspend fun title(mediaId: String): TvTitleDetail {
        val response = api.get("/experience/titles/$mediaId")
        val title = response.optJSONObject("title") ?: JSONObject()
        val series = response.optJSONObject("series")
        val playback = response.optJSONObject("playback")
        val seasons = series?.optJSONArray("seasons")?.objects()?.map { season ->
            TvSeason(
                number = season.intOrNull("number") ?: 0,
                label = season.text("label") ?: "Sæson ${season.intOrNull("number") ?: 0}",
                episodes = season.optJSONArray("episodes")?.objects()?.map { parseEpisode(it, api::resolveUrl) }.orEmpty(),
            )
        }.orEmpty()
        val discovery = response.optJSONObject("discovery")
        val credits = discovery?.optJSONArray("credits") ?: discovery?.optJSONArray("people") ?: JSONArray()
        return TvTitleDetail(
            anchorMediaId = title.text("mediaId") ?: title.text("id") ?: mediaId,
            mode = response.text("mode") ?: "title",
            displayTitle = title.text("displayTitle") ?: title.text("title") ?: "Titel",
            overview = title.text("overview"),
            releaseYear = title.intOrNull("releaseYear"),
            posterUrl = api.resolveUrl(title.text("posterPath")),
            backdropUrl = api.resolveUrl(title.text("backdropPath")),
            genres = discovery?.optJSONArray("genres")?.let { values ->
                buildList { for (index in 0 until values.length()) values.optString(index).takeIf(String::isNotBlank)?.let(::add) }
            }.orEmpty(),
            seasons = seasons,
            selectedSeasonNumber = series?.intOrNull("selectedSeasonNumber") ?: seasons.firstOrNull()?.number ?: 0,
            resumeEpisode = series?.optJSONObject("resumeEpisode")?.let { parseEpisode(it, api::resolveUrl) },
            people = credits.objects().map { person ->
                TvPerson(
                    name = person.text("name") ?: "Medvirkende",
                    role = person.text("role") ?: person.text("character"),
                    imageUrl = api.resolveUrl(person.text("profilePath") ?: person.text("imagePath")),
                )
            },
            related = response.optJSONArray("related")?.objects()?.map { parseMediaCard(it, api::resolveUrl) }.orEmpty(),
            inWatchlist = response.optJSONObject("viewerState")?.optBoolean("inWatchlist", false) ?: false,
            positionMs = playback?.longOrNull("positionMs") ?: 0,
            durationMs = playback?.longOrNull("durationMs"),
        )
    }

    suspend fun search(query: String): List<TvMediaCard> {
        if (query.trim().length < 2) return emptyList()
        val encoded = URLEncoder.encode(query.trim(), Charsets.UTF_8.name())
        val groups = api.get("/experience/search?q=$encoded").optJSONObject("groups") ?: return emptyList()
        return groups.optJSONArray("titles")?.objects()?.map { parseMediaCard(it, api::resolveUrl) }.orEmpty()
    }

    suspend fun setWatchlist(mediaId: String, enabled: Boolean) {
        if (enabled) api.put("/playback/watchlist/$mediaId") else api.delete("/playback/watchlist/$mediaId")
    }

    suspend fun playbackContext(): TvPlaybackContext {
        val response = api.get("/playback/context")
        return TvPlaybackContext(response.getString("profileId"), response.getString("deviceId"))
    }

    suspend fun authorize(item: TvPlaybackItem, capabilities: JSONObject): TvPlaybackAuthorization {
        val context = playbackContext()
        val response = api.post(
            "/playback/authorize",
            JSONObject()
                .put("profileId", context.profileId)
                .put("mediaId", item.mediaId)
                .put("deviceId", context.deviceId)
                .put("startPositionMs", item.positionMs)
                .put("isCastSession", false)
                .put("capabilities", capabilities),
        )
        val preferences = response.optJSONObject("playbackPreferences")
        return TvPlaybackAuthorization(
            sessionId = response.getString("sessionId"),
            method = response.getString("method"),
            streamToken = response.getString("streamToken"),
            streamUrl = api.resolveUrl(response.getString("streamUrl"))!!,
            contentType = response.text("contentType"),
            audioTracks = response.optJSONArray("audioTracks")?.objects()?.map(::parseTrack).orEmpty(),
            subtitleTracks = response.optJSONArray("subtitleTracks")?.objects()?.map(::parseTrack).orEmpty(),
            qualityMode = preferences?.text("qualityMode") ?: "auto",
            allowUpscale = preferences?.optBoolean("allowUpscale", false) ?: false,
            upscaleMode = preferences?.text("upscaleMode") ?: "off",
        )
    }

    suspend fun heartbeat(sessionId: String, state: String, positionMs: Long, durationMs: Long?, bufferMs: Long) {
        api.patch(
            "/playback/sessions/$sessionId/heartbeat",
            JSONObject()
                .put("runtimeState", state)
                .put("positionMs", positionMs)
                .put("durationMs", durationMs ?: JSONObject.NULL)
                .put("bufferAheadMs", bufferMs),
        )
    }

    suspend fun progress(sessionId: String, positionMs: Long, durationMs: Long?, completed: Boolean) {
        api.patch(
            "/playback/sessions/$sessionId/progress",
            JSONObject()
                .put("positionMs", positionMs)
                .put("durationMs", durationMs ?: JSONObject.NULL)
                .put("completed", completed),
        )
    }

    suspend fun release(sessionId: String) {
        api.delete("/playback/sessions/$sessionId")
    }

    suspend fun logout() {
        val refresh = api.session()?.refreshToken
        if (refresh != null) runCatching { api.post("/auth/logout", JSONObject().put("refreshToken", refresh)) }
        api.clear()
    }

    private fun deviceDescriptor(): TvDeviceDescriptor {
        val androidId = Settings.Secure.getString(applicationContext.contentResolver, Settings.Secure.ANDROID_ID).orEmpty()
        val material = "$androidId:${Build.MANUFACTURER}:${Build.MODEL}:${applicationContext.packageName}"
        val digest = MessageDigest.getInstance("SHA-256").digest(material.toByteArray())
            .joinToString("") { "%02x".format(it) }
        return TvDeviceDescriptor(
            fingerprint = digest,
            name = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(100),
            appVersion = BuildConfig.VERSION_NAME,
        )
    }
}
