package com.boltbytes.media.tv.v1.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class V1CatalogMode { Movies, Series }

private data class CatalogPreviewItem(
    val title: String,
    val metadata: String,
    val description: String,
    val badge: String?,
    val colors: List<Color>,
)

@Composable
fun CatalogVisualScreen(
    mode: V1CatalogMode,
    onBack: () -> Unit,
    onOpenTitle: () -> Unit,
    onPlay: () -> Unit,
) {
    val items = if (mode == V1CatalogMode.Movies) {
        listOf(
            CatalogPreviewItem("The Veil", "2024 · THRILLER · 1T 42M", "En kompromisløs agent trækkes ind i et internationalt mysterium.", "4K", listOf(Color(0xFF10243E), Color(0xFF285F91), Color(0xFF080D16))),
            CatalogPreviewItem("Helt Sort", "2025 · DOKUMENTAR · 1T 31M", "Et nærværende portræt fortalt med kant, humor og stærke billeder.", "NY", listOf(Color(0xFF8E1E2F), Color(0xFFE15B2B), Color(0xFF21100D))),
            CatalogPreviewItem("Hill Song", "2024 · DRAMA · 1T 54M", "En familiehistorie om tilhørsforhold og de valg, der former os.", null, listOf(Color(0xFF70431B), Color(0xFFD69A32), Color(0xFF20140B))),
            CatalogPreviewItem("The Mob", "2023 · KRIMI · 2T 08M", "Magt, loyalitet og bedrag kolliderer i byens underverden.", "HDR", listOf(Color(0xFF26384D), Color(0xFF718399), Color(0xFF0B1118))),
            CatalogPreviewItem("The Making", "2024 · DOKUMENTAR · 1T 19M", "Historien bag en af tidens mest ambitiøse produktioner.", null, listOf(Color(0xFF4C3D2E), Color(0xFF97734D), Color(0xFF15100C))),
            CatalogPreviewItem("The Idol", "2023 · DRAMA · 1T 47M", "Berømmelse og begær får konsekvenser under rampelyset.", "16+", listOf(Color(0xFF4B151D), Color(0xFFB5364A), Color(0xFF16090B))),
            CatalogPreviewItem("Northbound", "2025 · EVENTYR · 2T 01M", "En rejse mod nord bliver til en kamp mod naturen.", "NY", listOf(Color(0xFF254A59), Color(0xFF80A7AF), Color(0xFF0A1418))),
            CatalogPreviewItem("After Dark", "2024 · MYSTERIE · 1T 38M", "Da lyset slukkes, begynder sandheden at vise sig.", null, listOf(Color(0xFF30234F), Color(0xFF6F4B91), Color(0xFF0E0A16))),
            CatalogPreviewItem("Last Signal", "2025 · SCI-FI · 1T 56M", "Et signal fra rummet ændrer alt, vi troede, vi vidste.", "4K", listOf(Color(0xFF164652), Color(0xFF31A1A7), Color(0xFF071315))),
            CatalogPreviewItem("Quiet Water", "2022 · DRAMA · 1T 44M", "Fortiden vender tilbage til en lille by ved havet.", null, listOf(Color(0xFF284259), Color(0xFF567A94), Color(0xFF0B1118))),
            CatalogPreviewItem("Red Line", "2024 · ACTION · 1T 49M", "En enkelt nat. Ét tog. Ingen vej tilbage.", "ATMOS", listOf(Color(0xFF632029), Color(0xFFD54A39), Color(0xFF1A090A))),
            CatalogPreviewItem("Open Country", "2023 · DRAMA · 2T 06M", "Et moderne western-drama om familie og frihed.", null, listOf(Color(0xFF5E482D), Color(0xFFB88A52), Color(0xFF181109))),
        )
    } else {
        listOf(
            CatalogPreviewItem("The Sinner", "4 SÆSONER · KRIMI", "En hjemsøgt efterforsker afdækker forbrydelsernes skjulte årsager.", "FORTSÆT", listOf(Color(0xFF123C49), Color(0xFF6A2935), Color(0xFF10161D))),
            CatalogPreviewItem("DNA", "2 SÆSONER · KRIMI", "En sag om et forsvundet barn åbner gamle sår og nye spor.", "7 NYE", listOf(Color(0xFF45535A), Color(0xFF202A32), Color(0xFF0B1015))),
            CatalogPreviewItem("Reacher", "3 SÆSONER · ACTION", "En tidligere militærbetjent rammer en by fyldt med hemmeligheder.", "4K", listOf(Color(0xFF6A5527), Color(0xFF29343E), Color(0xFF0B1116))),
            CatalogPreviewItem("Sommer", "2 SÆSONER · DRAMA", "Tre generationer forsøger at holde sammen gennem livets skift.", null, listOf(Color(0xFF693A26), Color(0xFFB56A3C), Color(0xFF15100D))),
            CatalogPreviewItem("Helt Sort", "1 SÆSON · DOKUMENTAR", "Et skarpt og personligt blik på historier fra hele landet.", "NY", listOf(Color(0xFF8E1F30), Color(0xFFE05A2B), Color(0xFF20100D))),
            CatalogPreviewItem("The Veil", "MINISERIE · THRILLER", "To kvinder vikles ind i et dødeligt spil af sandhed og løgne.", null, listOf(Color(0xFF12243D), Color(0xFF2A6091), Color(0xFF080D16))),
            CatalogPreviewItem("The Mob", "2 SÆSONER · KRIMI", "Magtens pris bliver tydelig i byens mørkeste hjørner.", null, listOf(Color(0xFF26394E), Color(0xFF77859A), Color(0xFF0C1118))),
            CatalogPreviewItem("The Idol", "1 SÆSON · DRAMA", "Musikindustrien bliver rammen om ambition, kontrol og begær.", "16+", listOf(Color(0xFF4B151D), Color(0xFFB3354A), Color(0xFF16090B))),
            CatalogPreviewItem("Harbour", "3 SÆSONER · MYSTERIE", "En havneby gemmer på mere, end overfladen afslører.", null, listOf(Color(0xFF244755), Color(0xFF4B8594), Color(0xFF091317))),
            CatalogPreviewItem("The Divide", "2 SÆSONER · DRAMA", "To familier mødes på hver sin side af en konflikt.", "NY", listOf(Color(0xFF5A3540), Color(0xFFA7606D), Color(0xFF160C10))),
            CatalogPreviewItem("Unit 9", "5 SÆSONER · KRIMI", "Et specialhold tager sig af sager, ingen andre kan løse.", null, listOf(Color(0xFF344551), Color(0xFF647985), Color(0xFF0D1317))),
            CatalogPreviewItem("Northern Lights", "1 SÆSON · DRAMA", "Et nyt liv under nordlyset viser sig sværere end forventet.", "HDR", listOf(Color(0xFF174E49), Color(0xFF3D9A80), Color(0xFF081512))),
        )
    }
    var selected by remember { mutableStateOf(items.first()) }
    var contextItem by remember { mutableStateOf<CatalogPreviewItem?>(null) }
    var selectedFilter by remember { mutableStateOf("Alle") }
    var watchlist by remember { mutableStateOf(setOf<String>()) }
    var watched by remember { mutableStateOf(setOf<String>()) }
    var message by remember { mutableStateOf<String?>(null) }
    val filters = listOf("Alle", "Senest tilføjet", "Mest sete", "A–Å", "Genre", "Udgivelsesår")
    val visibleItems = when (selectedFilter) {
        "Senest tilføjet" -> items.reversed()
        "A–Å" -> items.sortedBy { it.title }
        "Genre" -> items.sortedBy { it.metadata.substringAfter("·", it.metadata) }
        "Udgivelsesår" -> items.sortedByDescending { it.metadata.filter(Char::isDigit).take(4) }
        else -> items
    }
    val title = if (mode == V1CatalogMode.Movies) "FILM" else "SERIER"

    BackHandler(enabled = contextItem != null) {
        contextItem = null
    }

    V1AmbientBackground(accent = selected.colors.first()) {
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "BIBLIOTEK",
                title = title,
                onBack = onBack,
                trailing = { V1StatusDot("${items.size} TITLER", V1Colors.Cyan) },
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(126.dp)
                    .padding(horizontal = 25.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        V1Pill(selected.badge ?: "UDVALGT", color = V1Colors.Gold, emphasized = true)
                        V1Pill(selected.metadata.substringBefore("·").trim())
                    }
                    Spacer(Modifier.height(7.dp))
                    Text(
                        selected.title,
                        color = V1Colors.Text,
                        fontSize = 25.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = (-0.5).sp,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        selected.description,
                        color = V1Colors.Muted,
                        fontSize = 9.sp,
                        lineHeight = 13.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(8.dp))
                    V1Button("Se detaljer", onClick = onOpenTitle, primary = true, icon = Icons.Rounded.PlayArrow)
                }
                V1Artwork(
                    title = selected.title,
                    colors = selected.colors,
                    badge = selected.badge,
                    modifier = Modifier
                        .width(265.dp)
                        .fillMaxHeight(),
                )
            }

            Row(
                modifier = Modifier.padding(horizontal = 25.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                filters.forEach { filter ->
                    V1FocusSurface(
                        onClick = { selectedFilter = filter },
                        radius = 50.dp,
                        background = if (selectedFilter == filter) {
                            Brush.horizontalGradient(listOf(V1Colors.Gold, Color(0xFFFFE27E)))
                        } else {
                            Brush.horizontalGradient(listOf(V1Colors.SurfaceSolid, V1Colors.Elevated))
                        },
                    ) {
                        Text(
                            filter,
                            color = if (selectedFilter == filter) V1Colors.Background else V1Colors.Text,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                        )
                    }
                }
            }

            LazyVerticalGrid(
                columns = GridCells.Fixed(6),
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    start = 25.dp,
                    end = 25.dp,
                    top = 4.dp,
                    bottom = 20.dp,
                ),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                items(visibleItems) { item ->
                    Column {
                        V1FocusSurface(
                            onClick = onOpenTitle,
                            onLongClick = { contextItem = item },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(142.dp),
                            radius = 14.dp,
                            onFocused = { selected = item },
                        ) { focused ->
                            V1Artwork(
                                title = item.title,
                                colors = item.colors,
                                badge = item.badge,
                                focused = focused,
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        V1MediaCaption(item.title, item.metadata)
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
                    message = "Starter ${item.title} forfra"
                    onPlay()
                },
                onOpenTitle = {
                    contextItem = null
                    onOpenTitle()
                },
                inWatchlist = item.title in watchlist,
                watched = item.title in watched,
                onToggleWatchlist = {
                    watchlist = if (item.title in watchlist) watchlist - item.title else watchlist + item.title
                    message = if (item.title in watchlist) "Føjet til Min liste" else "Fjernet fra Min liste"
                },
                onToggleWatched = {
                    watched = if (item.title in watched) watched - item.title else watched + item.title
                    message = if (item.title in watched) "Markeret som set" else "Markeret som uset"
                },
                onDismiss = { contextItem = null },
            )
        }
        message?.let {
            V1Toast(it, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp))
        }
    }
}
