package com.boltbytes.media.tv.v1.production

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductionNextEpisodeCountdownTest {
    @Test
    fun countdownUsesTenSeconds() {
        assertEquals(10, PRODUCTION_NEXT_EPISODE_COUNTDOWN_SECONDS)
    }

    @Test
    fun countdownStartsAtCreditsMarkerWhenAvailable() {
        assertFalse(shouldStartNextEpisodeCountdown(419_999L, 600_000L, 420_000L, false, true, "episode-2"))
        assertTrue(shouldStartNextEpisodeCountdown(420_000L, 600_000L, 420_000L, false, true, "episode-2"))
    }

    @Test
    fun countdownFallsBackToTenSecondsBeforeEnd() {
        assertFalse(shouldStartNextEpisodeCountdown(589_999L, 600_000L, null, false, true, "episode-2"))
        assertTrue(shouldStartNextEpisodeCountdown(590_000L, 600_000L, null, false, true, "episode-2"))
    }

    @Test
    fun countdownRequiresAutoplayNextEpisodeAndAnUnhandledPlayback() {
        assertFalse(shouldStartNextEpisodeCountdown(590_000L, 600_000L, null, true, true, "episode-2"))
        assertFalse(shouldStartNextEpisodeCountdown(590_000L, 600_000L, null, false, false, "episode-2"))
        assertFalse(shouldStartNextEpisodeCountdown(590_000L, 600_000L, null, false, true, null))
        assertFalse(shouldStartNextEpisodeCountdown(590_000L, 600_000L, null, false, true, "  "))
        assertFalse(shouldStartNextEpisodeCountdown(590_000L, 0L, null, false, true, "episode-2"))
    }

    @Test
    fun onlyCreditsMarkerTypesCanDriveTheEarlyTrigger() {
        assertTrue(isCreditsMarkerType("credits"))
        assertTrue(isCreditsMarkerType("END_CREDITS"))
        assertTrue(isCreditsMarkerType("rulletekst"))
        assertFalse(isCreditsMarkerType("intro"))
        assertFalse(isCreditsMarkerType("recap"))
        assertFalse(isCreditsMarkerType("subtitle"))
    }
}
