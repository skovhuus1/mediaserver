package com.boltbytes.media.tv.v1.production

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProductionWebVttTest {
    @Test
    fun parsesIdentifiersSettingsMultilineTextAndMarkup() {
        val cues = parseProductionWebVtt(
            """
            WEBVTT

            cue-1
            00:01.000 --> 00:03.500 align:center
            <v Speaker>Hej &amp; velkommen</v>
            Anden linje

            01:02:03.100 --> 01:02:05.000
            Slut
            """.trimIndent(),
        )
        assertEquals(2, cues.size)
        assertEquals(1_000L, cues[0].startMs)
        assertEquals(3_500L, cues[0].endMs)
        assertEquals("Hej & velkommen\nAnden linje", cues[0].text)
        assertEquals(3_723_100L, cues[1].startMs)
    }

    @Test
    fun timingOffsetMovesCuesEarlierAndLaterWithoutTouchingVideo() {
        val cues = listOf(ProductionSubtitleCue(10_000L, 12_000L, "Tekst"))
        assertEquals("Tekst", activeProductionSubtitleText(cues, 10_000L, 0))
        assertNull(activeProductionSubtitleText(cues, 9_899L, -100))
        assertEquals("Tekst", activeProductionSubtitleText(cues, 9_900L, -100))
        assertNull(activeProductionSubtitleText(cues, 10_099L, 100))
        assertEquals("Tekst", activeProductionSubtitleText(cues, 10_100L, 100))
    }
}
