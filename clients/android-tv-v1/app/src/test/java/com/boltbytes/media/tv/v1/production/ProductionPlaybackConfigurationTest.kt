package com.boltbytes.media.tv.v1.production

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductionPlaybackConfigurationTest {
    @Test
    fun parsesWebVttAndBurnInSubtitleDeliveryWithoutLosingUrls() {
        val authorization = parseAuthorization(
            JSONObject()
                .put("sessionId", "session-1")
                .put("streamUrl", "/stream.m3u8")
                .put(
                    "subtitleTracks",
                    JSONArray()
                        .put(JSONObject().put("id", "sidecar-0").put("label", "Dansk").put("language", "da").put("src", "/da.vtt").put("contentType", "text/vtt").put("delivery", "webvtt"))
                        .put(JSONObject().put("id", "burnin-4").put("label", "Dansk PGS").put("language", "da").put("delivery", "burn_in")),
                ),
        ) { value -> "https://media.boltbytes.com$value" }

        assertEquals("https://media.boltbytes.com/da.vtt", authorization.subtitleTracks[0].sourceUrl)
        assertEquals("webvtt", authorization.subtitleTracks[0].delivery)
        assertEquals("burn_in", authorization.subtitleTracks[1].delivery)
    }

    @Test
    fun fixedQualityAndBurnInUseTheAuthoritativeConfigurationPayload() {
        val payload = productionPlaybackConfigurationPayload(
            streamToken = "s".repeat(48),
            startPositionMs = 42_000,
            qualityMode = "fixed",
            fixedQualityHeight = 1080,
            audioTrackId = "audio-2",
            subtitleTrackId = "burnin-4",
            burnIn = true,
            allowUpscale = true,
            upscaleMode = "device",
            capabilities = JSONObject().put("screenHeight", 2160),
        )

        assertEquals("fixed", payload.getString("qualityMode"))
        assertEquals(1080, payload.getInt("fixedQualityHeight"))
        assertEquals(42_000L, payload.getLong("startPositionMs"))
        assertEquals("server", payload.getString("upscaleMode"))
        assertEquals("audio-2", payload.getString("audioTrackId"))
        assertEquals("burnin-4", payload.getString("subtitleTrackId"))
        assertTrue(payload.getBoolean("burnIn"))
    }

    @Test
    fun autoQualityDoesNotLeakAnObsoleteFixedHeight() {
        val payload = productionPlaybackConfigurationPayload(
            streamToken = "s".repeat(48),
            startPositionMs = 0,
            qualityMode = "auto",
            fixedQualityHeight = 1080,
            audioTrackId = null,
            subtitleTrackId = null,
            burnIn = false,
            allowUpscale = false,
            upscaleMode = "server",
            capabilities = JSONObject(),
        )

        assertFalse(payload.has("fixedQualityHeight"))
        assertFalse(payload.has("audioTrackId"))
        assertFalse(payload.has("subtitleTrackId"))
        assertEquals("off", payload.getString("upscaleMode"))
    }

    @Test
    fun parsesSubtitlePreparationWithoutTreatingUnavailableTracksAsReady() {
        val status = parseSubtitlePreparationStatus(
            JSONObject()
                .put("state", "ready")
                .put("message", "Unavailable tracks omitted")
                .put("unavailableTrackIds", JSONArray().put("embedded-4")),
        )

        assertEquals("ready", status.state)
        assertTrue(status.unavailableTrackIds.contains("embedded-4"))
        assertFalse(status.unavailableTrackIds.contains("embedded-5"))
    }
}
