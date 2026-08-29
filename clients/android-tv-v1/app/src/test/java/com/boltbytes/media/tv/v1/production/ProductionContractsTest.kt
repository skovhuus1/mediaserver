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
