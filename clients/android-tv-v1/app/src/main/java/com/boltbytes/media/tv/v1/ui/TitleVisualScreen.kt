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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun TitleVisualScreen(
    onBack: () -> Unit,
    onPlay: () -> Unit,
    selectedEpisodeIndex: Int = 3,
    restoreEpisodeFocus: Boolean = false,
    onEpisodeFocused: (Int) -> Unit = {},
    onPlayEpisode: (Int) -> Unit = { onPlay() },
) {
    var season by remember { mutableIntStateOf(2) }
    val episodeTitles = listOf(
        "Part I · En ny sag",
        "Part II · Gamle spor",
        "Part III · Sandheden",
        "Part IV · Ingen vej tilbage",
        "Part V · Mønsteret",
        "Part VI · Efterspillet",
    )
    val episodeFocus = remember { List(episodeTitles.size) { FocusRequester() } }
    var inWatchlist by remember { androidx.compose.runtime.mutableStateOf(false) }

    LaunchedEffect(restoreEpisodeFocus, season) {
        if (restoreEpisodeFocus) {
            episodeFocus[selectedEpisodeIndex.coerceIn(0, episodeTitles.lastIndex)].requestFocus()
        }
    }

    V1AmbientBackground(accent = Color(0xFF173E4A)) {
        V1Glow(Color(0xFF7A3040), 390.dp, Modifier.align(Alignment.TopEnd))
        Column(modifier = Modifier.fillMaxSize()) {
            V1ScreenHeader(
                section = "SERIE",
                title = "THE SINNER",
                onBack = onBack,
                trailing = { V1StatusDot("4K · HDR · ATMOS", V1Colors.Green) },
            )

            LazyColumn(modifier = Modifier.fillMaxSize()) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(208.dp)
                            .background(
                                Brush.horizontalGradient(
                                    listOf(
                                        Color(0xFA080B0F),
                                        Color(0xEA0D151B),
                                        Color(0xB7311722),
                                    ),
                                ),
                            ),
                    ) {
                        V1Artwork(
                            title = "The Sinner",
                            colors = listOf(Color(0xFF113C49), Color(0xFF762E3D), Color(0xFF0C1319)),
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .fillMaxHeight()
                                .fillMaxWidth(0.46f),
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(0.7f)
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(Color(0xFF080B0F), Color(0xF2080B0F), Color.Transparent),
                                    ),
                                ),
                        )
                        Column(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(0.62f)
                                .padding(start = 34.dp, top = 18.dp, bottom = 17.dp),
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                V1Pill("KRIMI", color = V1Colors.Gold, emphasized = true)
                                V1Pill("2024")
                                V1Pill("16+")
                                V1Pill("4 SÆSONER")
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "The Sinner",
                                color = V1Colors.Text,
                                fontSize = 31.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = (-0.7).sp,
                            )
                            Spacer(Modifier.height(5.dp))
                            Text(
                                "En hjemsøgt efterforsker afdækker forbrydelsernes skjulte årsager og de hemmeligheder, som ingen ønsker frem i lyset.",
                                color = V1Colors.Muted,
                                fontSize = 9.sp,
                                lineHeight = 13.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Spacer(Modifier.height(11.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                V1Button(
                                    "Fortsæt · S$season A${selectedEpisodeIndex + 1}",
                                    onClick = { onPlayEpisode(selectedEpisodeIndex) },
                                    primary = true,
                                    icon = Icons.Rounded.PlayArrow,
                                )
                                V1Button("Start forfra", onClick = onPlay, icon = Icons.Rounded.RestartAlt)
                                V1Button(
                                    if (inWatchlist) "På Min liste" else "Min liste",
                                    onClick = { inWatchlist = !inWatchlist },
                                    icon = if (inWatchlist) Icons.Rounded.Check else Icons.Rounded.Add,
                                )
                            }
                        }
                    }
                }

                item {
                    Column(
                        modifier = Modifier.padding(start = 34.dp, end = 30.dp, top = 16.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            V1SectionTitle(
                                "Sæsoner og afsnit",
                                modifier = Modifier.weight(1f),
                                subtitle = "Din position gemmes automatisk",
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                                (1..4).forEach { value ->
                                    V1FocusSurface(
                                        onClick = { season = value },
                                        modifier = Modifier.height(34.dp),
                                        radius = 50.dp,
                                        background = if (season == value) {
                                            Brush.horizontalGradient(listOf(V1Colors.Gold, Color(0xFFFFE17B)))
                                        } else {
                                            Brush.horizontalGradient(listOf(V1Colors.SurfaceSolid, V1Colors.Elevated))
                                        },
                                    ) {
                                        Text(
                                            "Sæson $value",
                                            color = if (season == value) V1Colors.Background else V1Colors.Text,
                                            fontSize = 8.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp),
                                        )
                                    }
                                }
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }

                item {
                    LazyRow(
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 34.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        itemsIndexed(episodeTitles) { index, title ->
                            Column(modifier = Modifier.width(174.dp)) {
                                V1FocusSurface(
                                    onClick = { onPlayEpisode(index) },
                                    modifier = Modifier
                                        .width(174.dp)
                                        .height(96.dp)
                                        .focusRequester(episodeFocus[index]),
                                    radius = 13.dp,
                                    onFocused = { onEpisodeFocused(index) },
                                ) { focused ->
                                    V1Artwork(
                                        title = title,
                                        colors = listOf(
                                            Color(0xFF183B47 + index * 0x00040302),
                                            Color(0xFF5D2936),
                                            Color(0xFF0C1117),
                                        ),
                                        progress = if (index == selectedEpisodeIndex) 0.38f else if (index < selectedEpisodeIndex) 1f else null,
                                        focused = focused,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                    if (index < selectedEpisodeIndex) {
                                        Box(
                                            Modifier
                                                .align(Alignment.TopEnd)
                                                .padding(7.dp)
                                                .background(V1Colors.Green, CircleShape)
                                                .padding(4.dp),
                                        ) {
                                            Icon(
                                                Icons.Rounded.Check,
                                                contentDescription = null,
                                                tint = V1Colors.Background,
                                                modifier = Modifier.width(9.dp),
                                            )
                                        }
                                    }
                                }
                                Spacer(Modifier.height(6.dp))
                                V1MediaCaption(
                                    title = title,
                                    metadata = when {
                                        index == selectedEpisodeIndex -> "38% set · 31 min. tilbage"
                                        index < selectedEpisodeIndex -> "52 min. · Set"
                                        else -> "52 min. · Ikke set"
                                    },
                                )
                            }
                        }
                    }
                }

                item {
                    Column(Modifier.padding(horizontal = 34.dp, vertical = 18.dp)) {
                        V1SectionTitle("Medvirkende", subtitle = "Skuespillere og crew")
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            listOf("Bill Pullman", "Jessica Hecht", "Matt Bomer", "Carrie Coon").forEachIndexed { index, name ->
                                Row(
                                    modifier = Modifier
                                        .width(142.dp)
                                        .background(V1Colors.Surface.copy(alpha = 0.74f), RoundedCornerShape(50.dp))
                                        .padding(7.dp),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        Modifier
                                            .width(28.dp)
                                            .height(28.dp)
                                            .background(
                                                if (index % 2 == 0) Color(0xFF36566A) else Color(0xFF6B3B45),
                                                CircleShape,
                                            ),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Text(name.take(1), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                    }
                                    Column {
                                        Text(name, color = V1Colors.Text, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                                        Text(if (index == 0) "Harry Ambrose" else "Medvirkende", color = V1Colors.MutedSoft, fontSize = 7.sp)
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Column(Modifier.padding(horizontal = 34.dp, vertical = 4.dp)) {
                        V1SectionTitle("Lignende serier", subtitle = "Fordi du ser The Sinner", action = "SE ALLE  →")
                        Spacer(Modifier.height(10.dp))
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            itemsIndexed(listOf("Reacher", "DNA", "The Veil", "Unit 9", "Harbour")) { index, title ->
                                Column(modifier = Modifier.width(132.dp)) {
                                    V1FocusSurface(
                                        onClick = {},
                                        modifier = Modifier.width(132.dp).height(150.dp),
                                        radius = 14.dp,
                                    ) { focused ->
                                        V1Artwork(
                                            title = title,
                                            colors = listOf(Color(0xFF173A49 + index * 0x00050302), Color(0xFF6A3040), Color(0xFF0B1117)),
                                            focused = focused,
                                            modifier = Modifier.fillMaxSize(),
                                        )
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    V1MediaCaption(title, "SERIE · ANBEFALET")
                                }
                            }
                        }
                        Spacer(Modifier.height(20.dp))
                    }
                }
            }
        }
    }
}
