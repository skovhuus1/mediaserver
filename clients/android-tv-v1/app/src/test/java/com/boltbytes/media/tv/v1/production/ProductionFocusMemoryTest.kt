package com.boltbytes.media.tv.v1.production

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProductionFocusMemoryTest {
    @Test
    fun `focus is restored independently per route`() {
        ProductionFocusMemory.clearAll()
        ProductionFocusMemory.remember("hub", "continue:episode-2")
        ProductionFocusMemory.remember("genre", "drama")

        assertEquals("continue:episode-2", ProductionFocusMemory.restore("hub"))
        assertEquals("drama", ProductionFocusMemory.restore("genre"))
        ProductionFocusMemory.clear("hub")
        assertNull(ProductionFocusMemory.restore("hub"))
    }
}
