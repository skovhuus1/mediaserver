package com.boltbytes.media.tv.v1.production

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductionContractsTest {
    @Test
    fun tokensParseFromNestedLoginPayload() {
        val tokens = parseTokens(
            JSONObject().put(
                "tokens",
                JSONObject().put("accessToken", "access").put("refreshToken", "refresh"),
            ),
        )
        assertEquals("access", tokens?.accessToken)
        assertEquals("refresh", tokens?.refreshToken)
    }

    @Test
    fun qrPairingPreservesAuthoritativeServerContract() {
        val challenge = parseProductionQrChallenge(
            JSONObject()
                .put("pairingId", "pairing-1")
                .put("pollToken", "secret-poll-token")
                .put("userCode", "ABCD-EFGH")
                .put("approvePath", "/login/tv?token=approve")
                .put("pollIntervalSeconds", 3)
                .put("expiresAt", "2026-08-29T22:00:00Z"),
        ) { value -> "https://media.boltbytes.com$value" }

        assertEquals("pairing-1", challenge.pairingId)
        assertEquals("secret-poll-token", challenge.pollToken)
        assertEquals("https://media.boltbytes.com/login/tv?token=approve", challenge.approvalUrl)
        assertEquals("ABCD-EFGH", challenge.userCode)
        assertEquals(3L, challenge.pollIntervalSeconds)

        val pollPayload = qrPollPayload(challenge)
        assertEquals("pairing-1", pollPayload.getString("pairingId"))
        assertEquals("secret-poll-token", pollPayload.getString("pollToken"))
        assertEquals(2, pollPayload.length())
    }

    @Test
    fun recentlyAddedEpisodesCollapseToOneSeriesCard() {
        val items = JSONArray()
            .put(episode("episode-1", "series-dna", "DNA", "2026-08-27T12:00:00Z"))
            .put(episode("episode-2", "series-dna", "DNA", "2026-08-28T12:00:00Z"))
            .put(episode("episode-3", "series-dna", "DNA", "2026-08-29T12:00:00Z"))
        val home = parseHome(
            JSONObject().put(
                "rows",
                JSONArray().put(JSONObject().put("id", "recent").put("title", "Senest tilføjet").put("items", items)),
            ),
        )
        val cards = home.rows.single().cards
        assertEquals(1, cards.size)
        assertEquals("series-dna", cards.single().id)
        assertEquals("DNA", cards.single().title)
        assertEquals("3", cards.single().badge)
    }

    @Test
    fun titleEpisodesAreGroupedIntoSeasons() {
        val title = parseTitle(
            JSONObject()
                .put("id", "series-1")
                .put("title", "Serie")
                .put("type", "series")
                .put(
                    "episodes",
                    JSONArray()
                        .put(JSONObject().put("id", "s1e1").put("title", "Et").put("seasonNumber", 1).put("episodeNumber", 1))
                        .put(JSONObject().put("id", "s2e1").put("title", "To").put("seasonNumber", 2).put("episodeNumber", 1)),
                ),
        )
        assertEquals(listOf(1, 2), title.seasons.map { it.number })
        assertEquals("s2e1", title.seasons.last().episodes.single().id)
    }

    @Test
    fun productionTitleWrapperPreservesIdArtworkSeriesAndViewerState() {
        val resume = JSONObject()
            .put("id", "episode-1")
            .put("title", "Første afsnit")
            .put("seasonNumber", 1)
            .put("episodeNumber", 1)
            .put("durationMs", 2_400_000)
            .put("positionMs", 600_000)
            .put("progressPercent", 25)
            .put("stillPath", "/artwork/episode-1.jpg")
        val title = parseTitle(
            JSONObject()
                .put("mode", "series")
                .put(
                    "title",
                    JSONObject()
                        .put("id", "episode-1")
                        .put("displayTitle", "DNA")
                        .put("type", "episode")
                        .put("overview", "En dansk serie")
                        .put("posterPath", "/artwork/dna-poster.jpg")
                        .put("backdropPath", "/artwork/dna-backdrop.jpg")
                        .put("genres", JSONArray().put("Drama")),
                )
                .put(
                    "series",
                    JSONObject()
                        .put("seasons", JSONArray().put(JSONObject().put("number", 1).put("episodes", JSONArray().put(resume))))
                        .put("resumeEpisode", resume),
                )
                .put("viewerState", JSONObject().put("inWatchlist", true).put("positionMs", 600_000))
                .put(
                    "discovery",
                    JSONObject().put(
                        "people",
                        JSONArray().put(JSONObject().put("name", "Skuespiller").put("role", "Hovedrolle").put("profilePath", "/people/one.jpg")),
                    ),
                )
                .put(
                    "related",
                    JSONArray().put(JSONObject().put("mediaId", "related-1").put("title", "Lignende").put("posterPath", "/artwork/related.jpg")),
                ),
        )

        assertEquals("episode-1", title.id)
        assertEquals("DNA", title.title)
        assertEquals("series", title.type)
        assertEquals("/artwork/dna-poster.jpg", title.posterUrl)
        assertEquals("/artwork/dna-backdrop.jpg", title.backdropUrl)
        assertEquals(600_000L, title.startPositionMs)
        assertTrue(title.inWatchlist)
        assertEquals("/artwork/episode-1.jpg", title.seasons.single().episodes.single().artworkUrl)
        assertEquals(0.25f, title.seasons.single().episodes.single().progress)
        assertEquals("/people/one.jpg", title.people.single().imageUrl)
        assertEquals("related-1", title.related.single().id)
    }

    @Test
    fun homeAndGroupedSearchUseProductionIdsAndArtworkPaths() {
        val card = JSONObject()
            .put("mediaId", "media-1")
            .put("targetKey", "title:media-1")
            .put("title", "Filmen")
            .put("type", "movie")
            .put("posterPath", "/artwork/poster.jpg")
            .put("backdropPath", "/artwork/backdrop.jpg")
            .put("badgeCount", 7)
        val parsedCard = parseHome(
            JSONObject().put("rows", JSONArray().put(JSONObject().put("id", "new_movies").put("title", "Nye film").put("items", JSONArray().put(card)))),
        ).rows.single().cards.single()
        assertEquals("media-1", parsedCard.id)
        assertEquals("/artwork/poster.jpg", parsedCard.posterUrl)
        assertEquals("/artwork/backdrop.jpg", parsedCard.backdropUrl)
        assertEquals("7", parsedCard.badge)

        val results = parseSearch(
            JSONObject().put(
                "groups",
                JSONObject()
                    .put("titles", JSONArray().put(card))
                    .put(
                        "episodes",
                        JSONArray().put(
                            JSONObject()
                                .put("mediaId", "episode-2")
                                .put("title", "Afsnit")
                                .put("seriesTitle", "DNA")
                                .put("seasonNumber", 1)
                                .put("episodeNumber", 2)
                                .put("imagePath", "/artwork/episode.jpg"),
                        ),
                    ),
            ),
        )
        assertEquals(listOf("media-1", "episode-2"), results.map { it.id })
        assertEquals("/artwork/episode.jpg", results.last().posterUrl)
        assertEquals("episode", results.last().type)
    }

    @Test
    fun playbackMarkersRemainTypedAndBounded() {
        val authorization = parseAuthorization(
            JSONObject()
                .put("sessionId", "session")
                .put("streamUrl", "/api/v1/playback/stream.m3u8")
                .put(
                    "markers",
                    JSONArray()
                        .put(JSONObject().put("type", "intro").put("startMs", 10_000).put("endMs", 70_000))
                        .put(JSONObject().put("type", "broken").put("startMs", 50_000).put("endMs", 40_000)),
                ),
        ) { "https://media.boltbytes.com$it" }
        assertEquals(1, authorization.markers.size)
        assertEquals("intro", authorization.markers.single().type)
        assertEquals(70_000L, authorization.markers.single().endMs)
        assertTrue(authorization.streamUrl.startsWith("https://"))
    }

    @Test
    fun updaterUsesMonotonicSemanticVersions() {
        assertTrue(compareSemanticVersions("1.0.1", "1.0.0") > 0)
        assertTrue(compareSemanticVersions("1.10.0", "1.9.99") > 0)
        assertTrue(compareSemanticVersions("2.0.0", "1.99.99") > 0)
        assertEquals(0, compareSemanticVersions("1.0.0", "1.0.0"))
        assertTrue(compareSemanticVersions("0.9.9", "1.0.0") < 0)
    }

    private fun episode(id: String, seriesId: String, seriesTitle: String, addedAt: String): JSONObject =
        JSONObject()
            .put("mediaId", id)
            .put("title", "Afsnit")
            .put("mediaType", "episode")
            .put("seriesId", seriesId)
            .put("seriesTitle", seriesTitle)
            .put("addedAt", addedAt)
}
