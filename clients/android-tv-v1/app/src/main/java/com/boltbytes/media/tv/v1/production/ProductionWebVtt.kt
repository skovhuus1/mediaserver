package com.boltbytes.media.tv.v1.production

data class ProductionSubtitleCue(
    val startMs: Long,
    val endMs: Long,
    val text: String,
)

private val WEB_VTT_TIMESTAMP = Regex("^(?:(\\d+):)?(\\d{2}):(\\d{2})[.,](\\d{3})$")
private val WEB_VTT_TAG = Regex("<[^>]+>")
private val WEB_VTT_BREAK = Regex("<br\\s*/?>", RegexOption.IGNORE_CASE)

internal fun parseProductionWebVtt(raw: String): List<ProductionSubtitleCue> {
    val lines = raw.removePrefix("\uFEFF").replace("\r\n", "\n").replace('\r', '\n').split('\n')
    val cues = mutableListOf<ProductionSubtitleCue>()
    var index = 0
    while (index < lines.size) {
        val current = lines[index].trim()
        if (current.isBlank() || current.startsWith("WEBVTT")) {
            index += 1
            continue
        }
        if (current == "STYLE" || current == "REGION" || current.startsWith("NOTE")) {
            index += 1
            while (index < lines.size && lines[index].isNotBlank()) index += 1
            continue
        }
        val timingLine = when {
            current.contains("-->") -> current
            index + 1 < lines.size && lines[index + 1].contains("-->") -> lines[++index].trim()
            else -> {
                index += 1
                continue
            }
        }
        val timing = timingLine.split("-->", limit = 2)
        val startMs = parseWebVttTimestamp(timing.firstOrNull()?.trim().orEmpty())
        val endMs = parseWebVttTimestamp(timing.getOrNull(1)?.trim()?.substringBefore(' ').orEmpty())
        index += 1
        val textLines = mutableListOf<String>()
        while (index < lines.size && lines[index].isNotBlank()) {
            textLines += sanitizeWebVttText(lines[index])
            index += 1
        }
        val text = textLines.joinToString("\n").trim()
        if (startMs != null && endMs != null && endMs > startMs && text.isNotBlank()) {
            cues += ProductionSubtitleCue(startMs, endMs, text)
        }
    }
    return cues.sortedBy(ProductionSubtitleCue::startMs)
}

internal fun activeProductionSubtitleText(
    cues: List<ProductionSubtitleCue>,
    positionMs: Long,
    timingOffsetMs: Int,
): String? {
    val subtitleClockMs = positionMs - timingOffsetMs.toLong()
    return cues.asSequence()
        .filter { subtitleClockMs >= it.startMs && subtitleClockMs < it.endMs }
        .map(ProductionSubtitleCue::text)
        .toList()
        .takeIf { it.isNotEmpty() }
        ?.joinToString("\n")
}

private fun parseWebVttTimestamp(value: String): Long? {
    val match = WEB_VTT_TIMESTAMP.matchEntire(value) ?: return null
    val hours = match.groupValues[1].toLongOrNull() ?: 0L
    val minutes = match.groupValues[2].toLongOrNull() ?: return null
    val seconds = match.groupValues[3].toLongOrNull() ?: return null
    val millis = match.groupValues[4].toLongOrNull() ?: return null
    if (minutes > 59L || seconds > 59L) return null
    return hours * 3_600_000L + minutes * 60_000L + seconds * 1_000L + millis
}

private fun sanitizeWebVttText(value: String): String = WEB_VTT_BREAK
    .replace(value, "\n")
    .let { WEB_VTT_TAG.replace(it, "") }
    .replace("&nbsp;", " ")
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&lrm;", "")
    .replace("&rlm;", "")
