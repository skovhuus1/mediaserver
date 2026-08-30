package com.boltbytes.media.tv.v1.production

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductionPlaybackRuntimeTest {
    @Test
    fun `state machine has deterministic play pause recovery and release`() {
        var now = 1L
        val machine = ProductionPlaybackStateMachine { now++ }

        assertEquals(ProductionPlaybackPhase.Authorizing, machine.transition(ProductionPlaybackEvent.Authorize).phase)
        assertEquals(ProductionPlaybackPhase.Preparing, machine.transition(ProductionPlaybackEvent.Prepare).phase)
        assertEquals(ProductionPlaybackPhase.Buffering, machine.transition(ProductionPlaybackEvent.Buffer).phase)
        assertEquals(ProductionPlaybackPhase.Playing, machine.transition(ProductionPlaybackEvent.Ready).phase)
        assertEquals(ProductionPlaybackPhase.Paused, machine.transition(ProductionPlaybackEvent.Pause).phase)
        assertFalse(machine.state.playWhenReady)
        assertEquals(ProductionPlaybackPhase.Recovering, machine.transition(ProductionPlaybackEvent.Recover(2)).phase)
        assertEquals(2, machine.state.retryAttempt)
        assertEquals(ProductionPlaybackPhase.Released, machine.transition(ProductionPlaybackEvent.Release).phase)
        assertEquals(ProductionPlaybackPhase.Released, machine.transition(ProductionPlaybackEvent.Play).phase)
    }

    @Test
    fun `retry policy only retries safe transient calls`() {
        assertTrue(ProductionNetworkRetryPolicy.isSafeMethod("GET"))
        assertFalse(ProductionNetworkRetryPolicy.isSafeMethod("POST"))
        assertTrue(ProductionNetworkRetryPolicy.isTransientStatus(503))
        assertFalse(ProductionNetworkRetryPolicy.isTransientStatus(400))
        assertTrue(isRecoverablePlaybackError("ERROR_CODE_IO_BAD_HTTP_STATUS"))
        assertFalse(isRecoverablePlaybackError("ERROR_CODE_DECODING_FAILED"))
    }
}
