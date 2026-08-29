package com.boltbytes.media.tv.v1.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class DownloadPreview(
    val title: String,
    val episode: String,
    val quality: String,
    val size: String,
    val progress: Float,
    val license: String,
    val colors: List<Color>,
)

@Composable
fun DownloadsVisualScreen(
    onBack: () -> Unit,
    onPlay: () -> Unit,
) {
    var downloads by remember {
        mutableStateOf(
            listOf(
                DownloadPreview("The Sinner", "S2 · A4 · Part IV", "1080p · Dansk 5.1", "2,4 GB", 0.38f, "Gyldig i 29 dage", listOf(Color(0xFF143D49), Color(0xFF6E2D3B), Color(0xFF0B1117))),
                DownloadPreview("DNA", "S2 · A1 · Den nye sag", "1080p · Dansk", "1,8 GB", 0f, "Gyldig i 27 dage", listOf(Color(0xFF45535A), Color(0xFF202A32), Color(0xFF0B1015))),
                DownloadPreview("Helt Sort", "S1 · A3 · Hjemme igen", "720p · Dansk", "924 MB", 0.74f, "Gyldig i 12 dage", listOf(Color(0xFF8E1F30), Color(0xFFE05A2B), Color(0xFF20100D))),
            ),
        )
    }
    var selectedIndex by remember { mutableIntStateOf(0) }
    var message by remember { mutableStateOf<String?>(null) }
    val selected = downloads.getOrNull(selectedIndex)

    V1AmbientBackground(accent = selected?.colors?.firstOrNull() ?: V1Colors.Cyan) {
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "OFFLINE",
                title = "DOWNLOADS",
                onBack = onBack,
                trailing = {
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        V1StatusDot("18,4 GB LEDIG", V1Colors.Cyan)
                        V1StatusDot("LICENSER GYLDIGE", V1Colors.Green)
                    }
                },
            )

            if (selected == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    V1StatePanel(
                        title = "Ingen downloads",
                        message = "Dine offline-titler vises her, når de er hentet.",
                        icon = Icons.Rounded.DownloadDone,
                        actionLabel = "Opdatér",
                        onAction = { message = "Offlinebiblioteket er opdateret" },
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxSize().padding(start = 25.dp, end = 25.dp, bottom = 22.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Column(
                        modifier = Modifier.width(380.dp).fillMaxHeight().padding(top = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            V1SectionTitle("På denne enhed", subtitle = "Krypteret og klar offline")
                            V1Button("Opdatér", onClick = { message = "Downloads er opdateret" }, icon = Icons.Rounded.Refresh)
                        }
                        downloads.forEachIndexed { index, item ->
                            V1FocusSurface(
                                onClick = { selectedIndex = index },
                                modifier = Modifier.fillMaxWidth().height(82.dp),
                                radius = 14.dp,
                                onFocused = { selectedIndex = index },
                                background = Brush.horizontalGradient(listOf(item.colors.first().copy(alpha = 0.36f), Color(0xED11171D))),
                            ) { focused ->
                                Row(Modifier.fillMaxSize().padding(11.dp), horizontalArrangement = Arrangement.spacedBy(11.dp), verticalAlignment = Alignment.CenterVertically) {
                                    V1Artwork(item.title, item.colors, progress = item.progress, focused = focused, modifier = Modifier.width(94.dp).fillMaxHeight())
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(item.title, color = if (focused) V1Colors.Gold else V1Colors.Text, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                        Text(item.episode, color = V1Colors.Muted, fontSize = 7.sp)
                                        Spacer(Modifier.height(5.dp))
                                        Text("${item.quality} · ${item.size}", color = V1Colors.MutedSoft, fontSize = 7.sp)
                                    }
                                    Icon(Icons.Rounded.DownloadDone, contentDescription = null, tint = V1Colors.Green, modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }

                    V1GlassPanel(modifier = Modifier.weight(1f).fillMaxHeight().padding(top = 8.dp), radius = 20.dp) {
                        Column(Modifier.fillMaxSize().padding(25.dp)) {
                            V1Artwork(selected.title, selected.colors, progress = selected.progress, modifier = Modifier.fillMaxWidth().height(190.dp))
                            Spacer(Modifier.height(17.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Column {
                                    Text(selected.title, color = V1Colors.Text, fontSize = 23.sp, fontWeight = FontWeight.Black)
                                    Text(selected.episode, color = V1Colors.Muted, fontSize = 9.sp)
                                }
                                V1StatusDot(selected.license.uppercase(), V1Colors.Green)
                            }
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                V1Pill(selected.quality, color = V1Colors.Cyan, emphasized = true)
                                V1Pill(selected.size)
                                V1Pill("OFFLINE KLAR", color = V1Colors.Green, emphasized = true)
                            }
                            Spacer(Modifier.weight(1f))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                V1Button("Afspil offline", onClick = onPlay, primary = true, icon = Icons.Rounded.PlayArrow)
                                V1Button(
                                    "Slet download",
                                    onClick = {
                                        val removed = selected.title
                                        downloads = downloads.filterIndexed { index, _ -> index != selectedIndex }
                                        selectedIndex = selectedIndex.coerceAtMost((downloads.size - 1).coerceAtLeast(0))
                                        message = "$removed er slettet fra enheden"
                                    },
                                    icon = Icons.Rounded.Delete,
                                )
                            }
                        }
                    }
                }
            }
        }
        message?.let { V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 17.dp)) }
    }
}
