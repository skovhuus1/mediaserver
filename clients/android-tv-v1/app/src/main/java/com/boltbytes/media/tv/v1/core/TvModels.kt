package com.boltbytes.media.tv.v1.core

import org.json.JSONArray
import org.json.JSONObject

data class TvTokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresInSeconds: Long,
)

data class TvProfile(
    val id: String,
    val name: String,
    val child: Boolean,
    val language: String?,
    val hasPin: Boolean,
)

data class TvUser(
    val id: String,
    val accountId: String,
    val email: String,
    val displayName: String,
    val activeProfileId: String?,
    val profiles: List<TvProfile>,
)

data class TvQrPairing(
    val pairingId: String,
    val pollToken: String,
    val userCode: String,
    val approveUrl: String,
    val expiresAt: String,
    val pollIntervalSeconds: Long,
)

data class TvMediaCard(
    val mediaId: String,
    val targetType: String,
    val targetKey: String,
    val title: String,
    val type: String,
    val seriesTitle: String?,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val releaseYear: Int?,
    val overview: String?,
    val rating: Double?,
    val posterUrl: String?,
    val backdropUrl: String?,
    val positionMs: Long,
    val durationMs: Long?,
    val progressPercent: Int,
    val badgeCount: Int?,
    val inWatchlist: Boolean,
    val watched: Boolean,
) {
    val episodeLabel: String?
        get() = if (seasonNumber != null && episodeNumber != null) {
            "S${seasonNumber.toString().padStart(2, '0')}E${episodeNumber.toString().padStart(2, '0')}"
        } else {
            null
        }

    val playbackTitle: String
        get() = seriesTitle?.takeIf { type == "episode" } ?: title

    fun asPlaybackItem(): TvPlaybackItem = TvPlaybackItem(
        mediaId = mediaId,
        title = title,
        seriesTitle = seriesTitle,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        positionMs = positionMs,
        durationMs = durationMs,
        artworkUrl = backdropUrl ?: posterUrl,
    )
}

data class TvHomeRow(
    val id: String,
    val title: String,
    val items: List<TvMediaCard>,
    val nextCursor: String?,
)

data class TvHomePayload(
    val hero: TvMediaCard?,
    val rows: List<TvHomeRow>,
    val generatedAt: String?,
)

data class TvEpisode(
    val id: String,
    val title: String,
    val overview: String?,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val releaseYear: Int?,
    val stillUrl: String?,
    val durationMs: Long?,
    val watched: Boolean,
    val positionMs: Long,
    val progressPercent: Int,
) {
    fun asPlaybackItem(seriesTitle: String): TvPlaybackItem = TvPlaybackItem(
        mediaId = id,
        title = title,
        seriesTitle = seriesTitle,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        positionMs = positionMs,
        durationMs = durationMs,
        artworkUrl = stillUrl,
    )
}

data class TvSeason(
    val number: Int,
    val label: String,
    val episodes: List<TvEpisode>,
)

data class TvPerson(
    val name: String,
    val role: String?,
    val imageUrl: String?,
)

data class TvTitleDetail(
    val anchorMediaId: String,
    val mode: String,
    val displayTitle: String,
    val overview: String?,
    val releaseYear: Int?,
    val posterUrl: String?,
    val backdropUrl: String?,
    val genres: List<String>,
    val seasons: List<TvSeason>,
    val selectedSeasonNumber: Int,
    val resumeEpisode: TvEpisode?,
    val people: List<TvPerson>,
    val related: List<TvMediaCard>,
    val inWatchlist: Boolean,
    val positionMs: Long,
    val durationMs: Long?,
)

data class TvPlaybackItem(
    val mediaId: String,
    val title: String,
    val seriesTitle: String?,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val positionMs: Long,
    val durationMs: Long?,
    val artworkUrl: String?,
)

data class TvPlaybackContext(
    val profileId: String,
    val deviceId: String,
)

data class TvTrack(
    val id: String,
    val label: String,
    val language: String?,
    val selected: Boolean,
)

data class TvPlaybackAuthorization(
    val sessionId: String,
    val method: String,
    val streamToken: String,
    val streamUrl: String,
    val contentType: String?,
    val audioTracks: List<TvTrack>,
    val subtitleTracks: List<TvTrack>,
    val qualityMode: String,
    val allowUpscale: Boolean,
    val upscaleMode: String,
)

data class TvDeviceDescriptor(
    val fingerprint: String,
    val name: String,
    val type: String = "tv",
    val platform: String = "android-tv",
    val appVersion: String,
)

internal fun JSONObject.text(key: String): String? =
    opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.trim()?.takeIf(String::isNotEmpty)

internal fun JSONObject.intOrNull(key: String): Int? =
    opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.toIntOrNull()

internal fun JSONObject.longOrNull(key: String): Long? =
    opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.toLongOrNull()

internal fun JSONObject.doubleOrNull(key: String): Double? =
    opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.toDoubleOrNull()

internal fun JSONArray.objects(): List<JSONObject> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
}

internal fun parseProfile(json: JSONObject): TvProfile = TvProfile(
    id = json.getString("id"),
    name = json.text("name") ?: "Profil",
    child = json.optBoolean("isChildProfile", false),
    language = json.text("language"),
    hasPin = json.optBoolean("hasPin", false),
)

internal fun parseUser(json: JSONObject): TvUser = TvUser(
    id = json.getString("id"),
    accountId = json.getString("accountId"),
    email = json.text("email") ?: "",
    displayName = json.text("displayName") ?: json.text("email") ?: "Bruger",
    activeProfileId = json.text("activeProfileId") ?: json.text("profileId"),
    profiles = json.optJSONArray("profiles")?.objects()?.map(::parseProfile).orEmpty(),
)

internal fun parseMediaCard(json: JSONObject, resolve: (String?) -> String?): TvMediaCard {
    val viewer = json.optJSONObject("viewerState")
    return TvMediaCard(
        mediaId = json.text("mediaId") ?: json.text("id") ?: error("Media card is missing mediaId"),
        targetType = json.text("targetType") ?: json.text("type") ?: "media",
        targetKey = json.text("targetKey") ?: json.text("mediaId") ?: json.text("id") ?: "",
        title = json.text("title") ?: "Uden titel",
        type = json.text("type") ?: "media",
        seriesTitle = json.text("seriesTitle"),
        seasonNumber = json.intOrNull("seasonNumber"),
        episodeNumber = json.intOrNull("episodeNumber"),
        releaseYear = json.intOrNull("releaseYear"),
        overview = json.text("overview"),
        rating = json.doubleOrNull("rating"),
        posterUrl = resolve(json.text("posterPath")),
        backdropUrl = resolve(json.text("backdropPath")),
        positionMs = json.longOrNull("positionMs") ?: 0,
        durationMs = json.longOrNull("durationMs"),
        progressPercent = json.intOrNull("progressPercent") ?: 0,
        badgeCount = json.intOrNull("badgeCount"),
        inWatchlist = viewer?.optBoolean("inWatchlist", false) ?: json.optBoolean("inWatchlist", false),
        watched = viewer?.optBoolean("watched", false) ?: json.optBoolean("watched", false),
    )
}

internal fun parseEpisode(json: JSONObject, resolve: (String?) -> String?): TvEpisode = TvEpisode(
    id = json.getString("id"),
    title = json.text("title") ?: "Afsnit",
    overview = json.text("overview"),
    seasonNumber = json.intOrNull("seasonNumber") ?: 0,
    episodeNumber = json.intOrNull("episodeNumber") ?: 0,
    releaseYear = json.intOrNull("releaseYear"),
    stillUrl = resolve(json.text("stillPath") ?: json.text("posterPath")),
    durationMs = json.longOrNull("durationMs"),
    watched = json.optBoolean("watched", false),
    positionMs = json.longOrNull("positionMs") ?: 0,
    progressPercent = json.intOrNull("progressPercent") ?: 0,
)

internal fun parseTrack(json: JSONObject): TvTrack = TvTrack(
    id = json.text("id") ?: "",
    label = json.text("label") ?: json.text("title") ?: json.text("language") ?: "Spor",
    language = json.text("language"),
    selected = json.optBoolean("selected", false),
)
