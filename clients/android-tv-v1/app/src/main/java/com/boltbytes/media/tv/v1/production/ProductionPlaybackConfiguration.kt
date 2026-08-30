package com.boltbytes.media.tv.v1.production

import org.json.JSONObject

internal fun productionPlaybackConfigurationPayload(
    streamToken: String,
    startPositionMs: Long,
    qualityMode: String,
    fixedQualityHeight: Int?,
    audioTrackId: String?,
    subtitleTrackId: String?,
    burnIn: Boolean,
    allowUpscale: Boolean,
    upscaleMode: String,
    capabilities: JSONObject,
): JSONObject = JSONObject()
    .put("streamToken", streamToken)
    .put("startPositionMs", startPositionMs.coerceAtLeast(0L))
    .put("qualityMode", qualityMode)
    .put("burnIn", burnIn)
    .put("allowUpscale", allowUpscale)
    .put("upscaleMode", if (allowUpscale && upscaleMode != "off") "server" else "off")
    .put("capabilities", capabilities)
    .apply {
        fixedQualityHeight?.takeIf { qualityMode == "fixed" }?.let { put("fixedQualityHeight", it) }
        audioTrackId?.takeIf(String::isNotBlank)?.let { put("audioTrackId", it) }
        subtitleTrackId?.takeIf(String::isNotBlank)?.let { put("subtitleTrackId", it) }
    }
