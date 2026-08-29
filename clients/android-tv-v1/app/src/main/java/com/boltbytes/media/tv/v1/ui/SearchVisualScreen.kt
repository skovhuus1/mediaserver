package com.boltbytes.media.tv.v1.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class SearchPreviewItem(
    val title: String,
    val metadata: String,
    val colors: List<Color>,
)

@Composable
fun SearchVisualScreen(
    onBack: () -> Unit,
    onOpenTitle: () -> Unit,
    onPlay: () -> Unit,
) {
    val results = listOf(
        SearchPreviewItem("The Sinner", "SERIE · 4 SÆSONER", listOf(Color(0xFF123C49), Color(0xFF6A2935), Color(0xFF10161D))),
        SearchPreviewItem("DNA", "SERIE · 2 SÆSONER", listOf(Color(0xFF45535A), Color(0xFF202A32), Color(0xFF0B1015))),
        SearchPreviewItem("Reacher", "SERIE · 2025", listOf(Color(0xFF6A5527), Color(0xFF29343E), Color(0xFF0B1116))),
        SearchPreviewItem("The Veil", "MINISERIE · 2024", listOf(Color(0xFF12243D), Color(0xFF2A6091), Color(0xFF080D16))),
        SearchPreviewItem("Helt Sort", "SERIE · NY SÆSON", listOf(Color(0xFF8E1F30), Color(0xFFE05A2B), Color(0xFF20100D))),
    )
    var contextItem by remember { mutableStateOf<SearchPreviewItem?>(null) }
    var query by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("Alt") }
    var watchlist by remember { mutableStateOf(setOf<String>()) }
    var message by remember { mutableStateOf<String?>(null) }
    val filters = listOf("Alt", "Film", "Serier", "Personer", "Genrer")
    val visibleResults = results.filter { item ->
        (query.isBlank() || item.title.contains(query, ignoreCase = true) || item.metadata.contains(query, ignoreCase = true)) &&
            (selectedFilter == "Alt" || selectedFilter != "Film" && item.metadata.contains("SERIE"))
    }

    BackHandler(enabled = contextItem != null) {
        contextItem = null
    }

    V1AmbientBackground(accent = Color(0xFF263D4B)) {
        V1Glow(V1Colors.Cyan, 290.dp, Modifier.align(Alignment.TopEnd))
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "DISCOVERY",
                title = "SØG",
                onBack = onBack,
                trailing = { V1StatusDot("STEMMESØGNING KLAR", V1Colors.Cyan) },
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 35.dp),
            ) {
                Spacer(Modifier.height(13.dp))
                V1GlassPanel(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp),
                    radius = 17.dp,
                ) {
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        textStyle = androidx.compose.ui.text.TextStyle(
                            color = V1Colors.Text,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                        ),
                        cursorBrush = SolidColor(V1Colors.Gold),
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 20.dp),
                        decorationBox = { innerField ->
                            Row(
                                modifier = Modifier.fillMaxSize(),
                                horizontalArrangement = Arrangement.spacedBy(13.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                            Icon(
                                Icons.Rounded.Search,
                                contentDescription = null,
                                    tint = V1Colors.Gold,
                            )
                                Box(modifier = Modifier.weight(1f)) {
                                    if (query.isBlank()) {
                                        Column {
                                            Text("Søg efter film, serier, personer eller genrer", color = V1Colors.Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                            Text("Skriv med fjernbetjeningen eller brug stemmen", color = V1Colors.MutedSoft, fontSize = 8.sp)
                                        }
                                    }
                                    innerField()
                            }
                            Icon(Icons.Rounded.Mic, contentDescription = null, tint = V1Colors.Cyan)
                            }
                        }
                    )
                }

                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    filters.forEach { label ->
                        V1FocusSurface(
                            onClick = { selectedFilter = label },
                            radius = 50.dp,
                            background = if (selectedFilter == label) {
                                Brush.horizontalGradient(listOf(V1Colors.Gold, Color(0xFFFFE487)))
                            } else {
                                Brush.horizontalGradient(listOf(V1Colors.SurfaceSolid, V1Colors.Elevated))
                            },
                        ) {
                            Text(
                                label,
                                color = if (selectedFilter == label) V1Colors.Background else V1Colors.Text,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 15.dp, vertical = 7.dp),
                            )
                        }
                    }
                }

                Spacer(Modifier.height(24.dp))
                if (query.isBlank()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("SENESTE", color = V1Colors.MutedSoft, fontSize = 7.sp, fontWeight = FontWeight.Bold)
                        listOf("The Sinner", "DNA", "Krimi", "Danske serier").forEach { suggestion ->
                            V1FocusSurface(onClick = { query = suggestion }, radius = 50.dp) {
                                Text(suggestion, color = V1Colors.Text, fontSize = 8.sp, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                            }
                        }
                    }
                    Spacer(Modifier.height(15.dp))
                }
                V1SectionTitle(
                    title = if (query.isBlank()) "Populært lige nu" else "${visibleResults.size} resultater",
                    subtitle = if (query.isBlank()) "Titler valgt ud fra dit bibliotek" else "Matcher ‘$query’",
                    action = "SE ALLE  →",
                )
                Spacer(Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(13.dp)) {
                    items(visibleResults) { item ->
                        Column(modifier = Modifier.width(128.dp)) {
                            V1FocusSurface(
                                onClick = onOpenTitle,
                                onLongClick = { contextItem = item },
                                modifier = Modifier
                                    .width(128.dp)
                                    .height(176.dp),
                                radius = 15.dp,
                            ) { focused ->
                                V1Artwork(
                                    title = item.title,
                                    colors = item.colors,
                                    focused = focused,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            }
                            Spacer(Modifier.height(7.dp))
                            V1MediaCaption(item.title, item.metadata)
                        }
                    }
                }
            }
        }

        contextItem?.let { item ->
            V1ContextMenuOverlay(
                title = item.title,
                subtitle = item.metadata,
                colors = item.colors,
                onContinue = {
                    contextItem = null
                    onPlay()
                },
                onRestart = {
                    contextItem = null
                    onPlay()
                },
                onOpenTitle = {
                    contextItem = null
                    onOpenTitle()
                },
                inWatchlist = item.title in watchlist,
                onToggleWatchlist = {
                    watchlist = if (item.title in watchlist) watchlist - item.title else watchlist + item.title
                    message = if (item.title in watchlist) "Føjet til Min liste" else "Fjernet fra Min liste"
                },
                onDismiss = { contextItem = null },
            )
        }
        message?.let {
            V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
        }
    }
}
