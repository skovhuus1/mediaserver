package com.boltbytes.media.tv.v1.production

object ProductionFocusMemory {
    private val focusedKeys = mutableMapOf<String, String>()

    fun remember(scope: String, key: String) {
        focusedKeys[scope] = key
    }

    fun restore(scope: String): String? = focusedKeys[scope]

    fun clear(scope: String) {
        focusedKeys.remove(scope)
    }

    fun clearAll() {
        focusedKeys.clear()
    }
}
