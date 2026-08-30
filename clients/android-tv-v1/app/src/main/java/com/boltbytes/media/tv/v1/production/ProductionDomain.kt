package com.boltbytes.media.tv.v1.production

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

data class ProductionTokens(val accessToken: String, val refreshToken: String)

data class ProductionProfile(
    val id: String,
    val name: String,
    val avatarUrl: String?,
    val hasPin: Boolean,
    val isKids: Boolean,
)

data class ProductionCard(
    val id: String,
    val title: String,
    val subtitle: String,
    val type: String,
    val posterUrl: String?,
    val backdropUrl: String?,
    val progress: Float,
    val durationMs: Long,
    val badge: String?,
    val year: String?,
    val genres: List<String>,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val startPositionMs: Long,
    val seriesId: String? = null,
    val seriesTitle: String? = null,
    val releasedAt: String? = null,
    val addedAt: String? = null,
)

data class ProductionRow(
    val id: String,
    val title: String,
    val cards: List<ProductionCard>,
    val cursor: String?,
)

data class ProductionHome(
    val hero: ProductionCard?,
    val rows: List<ProductionRow>,
)

data class ProductionEpisode(
    val id: String,
    val title: String,
    val summary: String,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val durationMs: Long,
    val progress: Float,
    val startPositionMs: Long,
    val artworkUrl: String?,
    val watched: Boolean,
)

data class ProductionSeason(val number: Int, val episodes: List<ProductionEpisode>)
data class ProductionPerson(val name: String, val role: String, val imageUrl: String?)

data class ProductionTitle(
    val id: String,
    val title: String,
    val summary: String,
    val type: String,
    val year: String?,
    val contentRating: String?,
    val durationMs: Long,
    val posterUrl: String?,
    val backdropUrl: String?,
    val genres: List<String>,
    val seasons: List<ProductionSeason>,
    val resumeEpisode: ProductionEpisode?,
    val nextEpisode: ProductionEpisode?,
    val related: List<ProductionCard>,
    val people: List<ProductionPerson>,
    val inWatchlist: Boolean,
    val startPositionMs: Long,
)

data class ProductionTrack(
    val id: String,
    val label: String,
    val language: String?,
    val sourceUrl: String? = null,
    val contentType: String? = null,
    val delivery: String = "native",
    val forced: Boolean = false,
)
data class ProductionMarker(val type: String, val startMs: Long, val endMs: Long)

data class ProductionAuthorization(
    val sessionId: String,
    val streamUrl: String,
    val streamToken: String?,
    val contentType: String?,
    val audioTracks: List<ProductionTrack>,
    val subtitleTracks: List<ProductionTrack>,
    val markers: List<ProductionMarker>,
    val preparationStatusUrl: String? = null,
    val streamTimelineOffsetMs: Long = 0L,
)

data class ProductionPreparationStatus(
    val state: String,
    val message: String,
    val readySegments: Int,
    val requiredSegments: Int,
    val readyVariants: Int,
    val variantCount: Int,
    val allVariantsReady: Boolean,
)

data class ProductionProgram(
    val id: String,
    val title: String,
    val description: String,
    val startsAt: Instant?,
    val endsAt: Instant?,
    val isLive: Boolean,
)

data class ProductionChannel(
    val id: String,
    val number: String,
    val name: String,
    val logoUrl: String?,
    val favorite: Boolean,
    val programs: List<ProductionProgram>,
)

data class ProductionNotification(
    val id: String,
    val title: String,
    val message: String,
    val createdAt: String,
    val read: Boolean,
)

data class ProductionDownload(
    val id: String,
    val mediaId: String,
    val title: String,
    val status: String,
    val progress: Float,
    val quality: String,
    val sizeBytes: Long,
    val playable: Boolean,
    val error: String?,
)

data class ProductionPreferences(
    val qualityMode: String = "auto",
    val maxHeight: Int? = null,
    val allowUpscale: Boolean = true,
    val upscaleMode: String = "device",
    val dataSaver: Boolean = false,
    val hdr: Boolean = true,
    val audioLanguage: String = "da",
    val subtitleLanguage: String = "da",
    val subtitleMode: String = "auto",
    val autoplay: Boolean = true,
    val recommendations: Boolean = true,
    val playbackRate: Float = 1f,
)

internal fun JSONObject.payload(): JSONObject = optJSONObject("data") ?: optJSONObject("result") ?: this

internal fun JSONObject.firstString(vararg names: String): String? {
    for (name in names) {
        val value = optString(name).trim()
        if (value.isNotEmpty() && value != "null") return value
    }
    return null
}

internal fun JSONObject.firstLong(vararg names: String): Long {
    for (name in names) if (has(name) && !isNull(name)) return optLong(name)
    return 0L
}

internal fun JSONObject.firstBoolean(vararg names: String): Boolean {
    for (name in names) if (has(name) && !isNull(name)) return optBoolean(name)
    return false
}

internal fun JSONObject.firstArray(vararg names: String): JSONArray? {
    for (name in names) optJSONArray(name)?.let { return it }
    return null
}

internal fun JSONArray.objects(): List<JSONObject> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let(::add)
}

internal fun JSONArray.strings(): List<String> = buildList {
    for (index in 0 until length()) {
        val value = optString(index).trim()
        if (value.isNotEmpty()) add(value)
    }
}

internal fun parseTokens(json: JSONObject): ProductionTokens? {
    val payload = json.payload()
    val source = payload.optJSONObject("tokens") ?: payload
    val access = source.firstString("accessToken", "access_token") ?: return null
    val refresh = source.firstString("refreshToken", "refresh_token") ?: return null
    return ProductionTokens(access, refresh)
}

internal fun parseProfiles(json: JSONObject): List<ProductionProfile> {
    val payload = json.payload()
    val user = payload.optJSONObject("user") ?: payload
    return user.firstArray("profiles", "items")?.objects().orEmpty().mapNotNull { item ->
        val id = item.firstString("id", "profileId") ?: return@mapNotNull null
        ProductionProfile(
            id = id,
            name = item.firstString("name", "displayName") ?: "Profil",
            avatarUrl = artwork(item, "avatarUrl", "avatar", "imageUrl"),
            hasPin = item.firstBoolean("hasPin", "pinProtected"),
            isKids = item.firstBoolean("isKids", "kids"),
        )
    }
}

internal fun parseHome(json: JSONObject): ProductionHome {
    val payload = json.payload()
    val rows = payload.firstArray("rows", "sections")?.objects().orEmpty().mapIndexed { index, row ->
        ProductionRow(
            id = row.firstString("id", "key", "rowId") ?: "row-$index",
            title = row.firstString("title", "label", "name") ?: "Udvalgt",
            cards = collapseEpisodeCards(
                row.firstArray("items", "cards", "media")?.objects().orEmpty().mapNotNull(::parseCard),
                groupByAdded = row.firstString("title", "label", "name").orEmpty().contains("tilføjet", true),
                enabled = row.firstString("title", "label", "name").orEmpty().let {
                    it.contains("episode", true) || it.contains("afsnit", true) || it.contains("tilføjet", true)
                },
            ),
            cursor = row.firstString("cursor", "nextCursor"),
        )
    }.filter { it.cards.isNotEmpty() }
    val hero = payload.optJSONObject("hero")?.let(::parseCard) ?: rows.firstOrNull()?.cards?.firstOrNull()
    return ProductionHome(hero, rows)
}

internal fun ProductionRow.startsPlaybackDirectly(): Boolean =
    id.equals("continue", ignoreCase = true) ||
        title.contains("fortsæt", ignoreCase = true) ||
        title.contains("continue", ignoreCase = true)

internal fun parseSearch(json: JSONObject): List<ProductionCard> {
    val payload = json.payload()
    val direct = payload.firstArray("items", "results", "titles", "media")?.objects().orEmpty()
    if (direct.isNotEmpty()) return direct.mapNotNull(::parseCard)
    val groups = payload.optJSONObject("groups") ?: return emptyList()
    return buildList {
        addAll(groups.firstArray("titles")?.objects().orEmpty().mapNotNull(::parseCard))
        addAll(groups.firstArray("episodes")?.objects().orEmpty().mapNotNull(::parseCard))
    }.distinctBy { it.id }
}

internal fun parseCard(item: JSONObject): ProductionCard? {
    val target = item.optJSONObject("target")
    val playback = item.optJSONObject("playback")
    val playbackMedia = playback?.optJSONObject("media")
    val id = item.firstString("mediaId", "id", "targetKey")
        ?: target?.firstString("key", "id", "mediaId")
        ?: playbackMedia?.firstString("id", "mediaId")
        ?: return null
    val duration = item.firstPresentLong("durationMs", "runtimeMs", "duration")
        ?: playbackMedia?.optJSONObject("file")?.firstPresentLong("durationMs")
        ?: 0L
    val progressObject = item.optJSONObject("progress")
        ?: item.optJSONObject("playback")?.optJSONObject("progress")
        ?: item.optJSONObject("playback")
    val position = item.firstLong("positionMs", "progressMs", "resumePositionMs", "startPositionMs")
        .takeIf { it > 0L }
        ?: progressObject?.firstLong("positionMs", "progressMs", "resumePositionMs", "startPositionMs")
        ?: 0L
    val raw = progressObject
        ?.optDouble("percent", Double.NaN)
        ?.takeUnless(Double::isNaN)
        ?.toFloat()
        ?: item.optDouble("progress", item.optDouble("progressPercent", 0.0)).toFloat()
    val progress = when {
        raw > 1f -> raw / 100f
        raw > 0f -> raw
        duration > 0 -> position.toFloat() / duration
        else -> 0f
    }.coerceIn(0f, 1f)
    val season = item.optInt("seasonNumber").takeIf { it > 0 }
    val episode = item.optInt("episodeNumber").takeIf { it > 0 }
    val seriesTitle = item.firstString("seriesTitle", "seriesDisplayTitle", "showTitle")
    val subtitle = item.firstString("subtitle", "tagline", "matchReason") ?: listOfNotNull(
        seriesTitle,
        season?.let { "Sæson $it" },
        episode?.let { "Afsnit $it" },
        item.firstString("year", "releaseYear"),
    ).joinToString(" · ")
    val genres = item.firstArray("genres")?.strings()
        ?: item.optString("genre").split(',').map(String::trim).filter(String::isNotEmpty)
    return ProductionCard(
        id = id,
        title = item.firstString("title", "name", "displayTitle") ?: "Uden titel",
        subtitle = subtitle,
        type = item.firstString("mediaType", "type", "targetType")
            ?: target?.firstString("type")
            ?: playbackMedia?.firstString("type")
            ?: if (season != null || episode != null) "episode" else "media",
        posterUrl = artwork(
            item,
            "posterUrl",
            "posterPath",
            "seasonPosterPath",
            "poster",
            "thumbUrl",
            "thumbnailUrl",
            "imagePath",
            "episodeStillPath",
            "stillPath",
        ),
        backdropUrl = artwork(
            item,
            "backdropUrl",
            "backdropPath",
            "episodeStillPath",
            "stillPath",
            "imagePath",
            "backdrop",
            "heroUrl",
            "fanartUrl",
        ),
        progress = progress,
        durationMs = duration,
        badge = item.firstString("badge", "badgeCount", "countLabel", "statusLabel"),
        year = item.firstString("year", "releaseYear"),
        genres = genres,
        seasonNumber = season,
        episodeNumber = episode,
        startPositionMs = position,
        seriesId = item.firstString("seriesId", "parentId", "showId"),
        seriesTitle = seriesTitle,
        releasedAt = item.firstString("releasedAt", "releaseDate", "airDate"),
        addedAt = item.firstString("addedAt", "createdAt", "importedAt"),
    )
}

private fun collapseEpisodeCards(
    cards: List<ProductionCard>,
    groupByAdded: Boolean,
    enabled: Boolean,
): List<ProductionCard> {
    if (!enabled) return cards
    val grouped = cards.groupBy { it.seriesId ?: it.id }
    return grouped.values.map { episodes ->
        val sorted = episodes.sortedByDescending { if (groupByAdded) it.addedAt else it.releasedAt }
        val newest = sorted.first()
        if (episodes.size == 1 || newest.seriesId == null) newest else newest.copy(
            id = newest.seriesId,
            title = newest.seriesTitle ?: newest.title,
            subtitle = if (groupByAdded) "${episodes.size} senest tilføjede afsnit" else "${episodes.size} nye afsnit",
            type = "series",
            badge = episodes.size.toString(),
            progress = 0f,
            startPositionMs = 0L,
        )
    }.sortedByDescending { if (groupByAdded) it.addedAt else it.releasedAt }
}

internal fun parseTitle(json: JSONObject): ProductionTitle {
    val payload = json.payload()
    val item = payload.optJSONObject("title") ?: payload
    val playback = payload.optJSONObject("playback")
    val playbackMedia = playback?.optJSONObject("media")
    val viewerState = payload.optJSONObject("viewerState")
    val series = payload.optJSONObject("series")
    val discovery = payload.optJSONObject("discovery")
    val id = item.firstString("id", "mediaId")
        ?: playbackMedia?.firstString("id", "mediaId")
        ?: error("Titel mangler id")
    val topEpisodes = (series?.firstArray("episodes") ?: payload.firstArray("episodes") ?: item.firstArray("episodes"))
        ?.objects().orEmpty().mapNotNull(::parseEpisode)
    val seasons = (series?.firstArray("seasons") ?: payload.firstArray("seasons") ?: item.firstArray("seasons"))
        ?.objects().orEmpty().mapNotNull { season ->
        val number = season.optInt("seasonNumber", season.optInt("number")).takeIf { it > 0 }
            ?: return@mapNotNull null
        val episodes = season.firstArray("episodes", "items")?.objects().orEmpty().mapNotNull(::parseEpisode)
        ProductionSeason(number, episodes.ifEmpty { topEpisodes.filter { it.seasonNumber == number } })
    }.ifEmpty {
        topEpisodes.groupBy { it.seasonNumber }.toSortedMap().map { ProductionSeason(it.key, it.value) }
    }
    val people = (discovery?.firstArray("people") ?: item.firstArray("cast", "people", "crew"))
        ?.objects().orEmpty().map { person ->
        ProductionPerson(
            name = person.firstString("name", "title") ?: "Ukendt",
            role = person.firstString("role", "character", "job", "department") ?: "Medvirkende",
            imageUrl = artwork(person, "imageUrl", "profileUrl", "profilePath", "photoUrl", "imagePath"),
        )
    }
    val mode = payload.firstString("mode")
    val startPositionMs = viewerState?.firstPresentLong("positionMs", "resumePositionMs", "progressMs")
        ?: playback?.firstPresentLong("positionMs", "resumePositionMs", "progressMs")
        ?: item.firstLong("positionMs", "resumePositionMs", "progressMs")
    return ProductionTitle(
        id = id,
        title = item.firstString("title", "name", "displayTitle") ?: "Uden titel",
        summary = item.firstString("summary", "description", "overview") ?: "",
        type = if (mode == "series") "series" else item.firstString("mediaType", "type") ?: "movie",
        year = item.firstString("year", "releaseYear"),
        contentRating = item.firstString("contentRating", "certification"),
        durationMs = item.firstLong("durationMs", "runtimeMs", "duration"),
        posterUrl = artwork(item, "posterUrl", "posterPath", "seasonPosterPath", "poster", "thumbUrl"),
        backdropUrl = artwork(item, "backdropUrl", "backdropPath", "episodeStillPath", "backdrop", "heroUrl", "fanartUrl"),
        genres = item.firstArray("genres")?.strings().orEmpty(),
        seasons = seasons,
        resumeEpisode = (series?.optJSONObject("resumeEpisode") ?: payload.optJSONObject("resumeEpisode") ?: item.optJSONObject("resumeEpisode"))?.let(::parseEpisode),
        nextEpisode = (series?.optJSONObject("nextEpisode") ?: payload.optJSONObject("nextEpisode") ?: item.optJSONObject("nextEpisode"))?.let(::parseEpisode),
        related = (payload.firstArray("related", "similar", "recommendations") ?: item.firstArray("related", "similar", "recommendations"))
            ?.objects().orEmpty().mapNotNull(::parseCard),
        people = people,
        inWatchlist = viewerState?.firstBoolean("inWatchlist", "watchlisted")
            ?: item.firstBoolean("inWatchlist", "watchlisted"),
        startPositionMs = startPositionMs,
    )
}

internal fun parseEpisode(item: JSONObject): ProductionEpisode? {
    val playbackMedia = item.optJSONObject("playback")?.optJSONObject("media")
    val id = item.firstString("id", "mediaId") ?: playbackMedia?.firstString("id", "mediaId") ?: return null
    val duration = item.firstPresentLong("durationMs", "runtimeMs", "duration")
        ?: playbackMedia?.optJSONObject("file")?.firstPresentLong("durationMs")
        ?: 0L
    val position = item.firstLong("positionMs", "progressMs", "resumePositionMs")
    val raw = item.optDouble("progress", item.optDouble("progressPercent", 0.0)).toFloat()
    val progress = when {
        raw > 1f -> raw / 100f
        raw > 0f -> raw
        duration > 0 -> position.toFloat() / duration
        else -> 0f
    }.coerceIn(0f, 1f)
    return ProductionEpisode(
        id = id,
        title = item.firstString("title", "name") ?: "Afsnit",
        summary = item.firstString("summary", "description", "overview") ?: "",
        seasonNumber = item.optInt("seasonNumber", 1).coerceAtLeast(1),
        episodeNumber = item.optInt("episodeNumber", 1).coerceAtLeast(1),
        durationMs = duration,
        progress = progress,
        startPositionMs = position,
        artworkUrl = artwork(
            item,
            "stillUrl",
            "stillPath",
            "episodeStillPath",
            "backdropUrl",
            "backdropPath",
            "imagePath",
            "thumbnailUrl",
            "thumbUrl",
            "posterUrl",
            "posterPath",
        ),
        watched = item.firstBoolean("watched", "isWatched"),
    )
}

internal fun parseAuthorization(json: JSONObject, resolver: (String) -> String): ProductionAuthorization {
    val item = json.payload()
    val lease = item.optJSONObject("lease")
    val stream = item.optJSONObject("stream") ?: item.optJSONObject("playback") ?: item
    val rawUrl = stream.firstString("streamUrl", "url", "manifestUrl")
        ?: item.firstString("streamUrl", "url", "manifestUrl")
        ?: error("Serveren returnerede ingen stream-URL")
    return ProductionAuthorization(
        sessionId = item.firstString("sessionId", "leaseId", "id")
            ?: lease?.firstString("sessionId", "leaseId", "id")
            ?: stream.firstString("sessionId", "leaseId")
            ?: error("Session mangler id"),
        streamUrl = resolver(rawUrl),
        streamToken = item.firstString("streamToken", "token")
            ?: lease?.firstString("streamToken", "token")
            ?: stream.firstString("streamToken", "token"),
        contentType = stream.firstString("contentType", "mimeType") ?: item.firstString("contentType", "mimeType"),
        audioTracks = parseTracks(item.firstArray("audioTracks") ?: stream.firstArray("audioTracks"), resolver),
        subtitleTracks = parseTracks(item.firstArray("subtitleTracks", "subtitles") ?: stream.firstArray("subtitleTracks", "subtitles"), resolver),
        markers = (item.firstArray("markers", "skipMarkers") ?: stream.firstArray("markers", "skipMarkers"))
            ?.objects().orEmpty().mapNotNull { marker ->
                val start = marker.firstLong("startMs", "startTimeMs", "start")
                val end = marker.firstLong("endMs", "endTimeMs", "end")
                if (end <= start) null else ProductionMarker(
                    type = marker.firstString("type", "kind", "markerType") ?: "intro",
                    startMs = start,
                    endMs = end,
                )
            },
        preparationStatusUrl = (
            item.firstString("transcodeStatusUrl", "preparationStatusUrl", "statusUrl")
                ?: stream.firstString("transcodeStatusUrl", "preparationStatusUrl", "statusUrl")
            )?.let(resolver),
        streamTimelineOffsetMs = item.firstLong("streamTimelineOffsetMs", "timelineOffsetMs")
            .takeIf { it > 0L }
            ?: stream.firstLong("streamTimelineOffsetMs", "timelineOffsetMs"),
    )
}

internal fun parsePreparationStatus(json: JSONObject): ProductionPreparationStatus {
    val item = json.payload()
    val readyVariants = item.optInt("readyVariants", 0).coerceAtLeast(0)
    val variantCount = item.optInt("variantCount", 0).coerceAtLeast(0)
    return ProductionPreparationStatus(
        state = item.firstString("state", "status") ?: "queued",
        message = item.firstString("message", "detail") ?: "Forbereder afspilning",
        readySegments = item.optInt("readySegments", 0).coerceAtLeast(0),
        requiredSegments = item.optInt("requiredSegments", 0).coerceAtLeast(0),
        readyVariants = readyVariants,
        variantCount = variantCount,
        allVariantsReady = item.optBoolean(
            "allVariantsReady",
            variantCount > 0 && readyVariants >= variantCount,
        ),
    )
}

private fun parseTracks(
    array: JSONArray?,
    resolver: (String) -> String,
): List<ProductionTrack> = array?.objects().orEmpty().mapIndexed { index, track ->
    val id = track.firstString("id", "trackId", "index") ?: index.toString()
    val sourceUrl = track.firstString("src", "sourceUrl", "url")?.let(resolver)
    ProductionTrack(
        id = id,
        label = track.firstString("label", "title", "name", "language") ?: "Spor ${index + 1}",
        language = track.firstString("language", "languageCode", "lang"),
        sourceUrl = sourceUrl,
        contentType = track.firstString("contentType", "mimeType"),
        delivery = track.firstString("delivery") ?: when {
            id.startsWith("burnin-", ignoreCase = true) -> "burn_in"
            !sourceUrl.isNullOrBlank() -> "webvtt"
            else -> "native"
        },
        forced = track.firstBoolean("forced", "isForced"),
    )
}

internal fun parseGuide(json: JSONObject): List<ProductionChannel> {
    val payload = json.payload()
    return payload.firstArray("channels", "items")?.objects().orEmpty().mapNotNull { channel ->
        val id = channel.firstString("id", "channelId") ?: return@mapNotNull null
        ProductionChannel(
            id = id,
            number = channel.firstString("number", "channelNumber", "logicalNumber") ?: "",
            name = channel.firstString("name", "title", "channelName") ?: "Kanal",
            logoUrl = artwork(channel, "logoUrl", "logo", "imageUrl"),
            favorite = channel.firstBoolean("favorite", "isFavorite"),
            programs = channel.firstArray("programs", "guide", "entries")?.objects().orEmpty().mapIndexed { index, program ->
                val start = parseInstant(program.firstString("startsAt", "startTime", "start"))
                val end = parseInstant(program.firstString("endsAt", "endTime", "end"))
                val now = Instant.now()
                ProductionProgram(
                    id = program.firstString("id", "programId") ?: "$id-$index",
                    title = program.firstString("title", "name") ?: "Intet program",
                    description = program.firstString("description", "summary", "overview") ?: "",
                    startsAt = start,
                    endsAt = end,
                    isLive = start != null && end != null && !now.isBefore(start) && now.isBefore(end),
                )
            },
        )
    }
}

internal fun parseNotifications(json: JSONObject): List<ProductionNotification> {
    val payload = json.payload()
    return payload.firstArray("notifications", "items")?.objects().orEmpty().mapNotNull { item ->
        val id = item.firstString("id", "notificationId") ?: return@mapNotNull null
        ProductionNotification(
            id = id,
            title = item.firstString("title", "subject") ?: "Notifikation",
            message = item.firstString("message", "body", "description") ?: "",
            createdAt = item.firstString("createdAt", "timestamp") ?: "",
            read = item.firstBoolean("read", "isRead") || item.firstString("readAt") != null,
        )
    }
}

internal fun parseDownloads(json: JSONObject): List<ProductionDownload> {
    val payload = json.payload()
    return payload.firstArray("downloads", "items")?.objects().orEmpty().mapNotNull { item ->
        val id = item.firstString("id", "downloadId") ?: return@mapNotNull null
        val raw = item.optDouble("progress", item.optDouble("progressPercent", 0.0)).toFloat()
        ProductionDownload(
            id = id,
            mediaId = item.firstString("mediaId") ?: "",
            title = item.firstString("title", "mediaTitle", "name") ?: "Download",
            status = item.firstString("status", "state") ?: "ukendt",
            progress = (if (raw > 1f) raw / 100f else raw).coerceIn(0f, 1f),
            quality = item.firstString("quality", "qualityLabel", "resolution") ?: "Auto",
            sizeBytes = item.firstLong("sizeBytes", "fileSize", "bytes"),
            playable = item.firstBoolean("playable", "isPlayable") || item.firstString("status", "state") in listOf("ready", "completed"),
            error = item.firstString("error", "errorMessage", "licenseError"),
        )
    }
}

internal fun parsePreferences(json: JSONObject): ProductionPreferences {
    val item = json.payload()
    return ProductionPreferences(
        qualityMode = item.firstString("qualityMode", "quality") ?: "auto",
        maxHeight = item.optInt("maxHeight").takeIf { it > 0 },
        allowUpscale = if (item.has("allowUpscale")) item.optBoolean("allowUpscale") else true,
        upscaleMode = item.firstString("upscaleMode") ?: "device",
        dataSaver = item.optBoolean("dataSaver", false),
        hdr = if (item.has("hdr")) item.optBoolean("hdr") else true,
        audioLanguage = item.firstString("audioLanguage") ?: "da",
        subtitleLanguage = item.firstString("subtitleLanguage") ?: "da",
        subtitleMode = item.firstString("subtitleMode") ?: "auto",
        autoplay = if (item.has("autoplay")) item.optBoolean("autoplay") else true,
        recommendations = if (item.has("recommendations")) item.optBoolean("recommendations") else true,
        playbackRate = item.optDouble("playbackRate", 1.0).toFloat(),
    )
}

private fun JSONObject.firstPresentLong(vararg names: String): Long? {
    for (name in names) if (has(name) && !isNull(name)) return optLong(name)
    return null
}

private fun artwork(item: JSONObject, vararg names: String): String? {
    for (name in names) imageValue(item, name)?.let { return it }
    val art = item.optJSONObject("artwork") ?: item.optJSONObject("images") ?: return null
    for (name in names) imageValue(art, name)?.let { return it }
    return listOf("url", "path", "src", "poster", "backdrop", "primary")
        .firstNotNullOfOrNull { name -> imageValue(art, name) }
}

private fun imageValue(item: JSONObject, name: String): String? = when (val value = item.opt(name)) {
    is String -> value.trim().takeIf { it.isNotEmpty() && it != "null" }
    is JSONObject -> value.firstString("url", "path", "src")
    else -> null
}

private fun parseInstant(value: String?): Instant? = try {
    value?.let(Instant::parse)
} catch (_: Exception) {
    null
}
